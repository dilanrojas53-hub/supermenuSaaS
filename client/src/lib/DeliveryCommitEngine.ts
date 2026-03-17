/**
 * DeliveryCommitEngine.ts — Motor de orquestación de delivery
 * Fase 7: Orquestación real (waitlist, commit, disponibilidad)
 *
 * Responsabilidades:
 * - Evaluar disponibilidad logística antes de comprometer un pedido
 * - Decidir si un pedido entra en soft_reserve, waitlist, o va directo a kitchen_commit
 * - Ejecutar el commit a cocina (escribe kitchen_committed_at)
 * - Gestionar la cola de waitlist (promover pedidos cuando hay disponibilidad)
 *
 * Principios de diseño:
 * - delivery_status: intocable — flujo rider/dispatch ya construido
 * - logistic_status: nueva capa de orquestación previa y transversal
 * - orders.status: intocable — flujo pago/cocina dine_in/takeout
 * - kitchen_committed_at: único campo para el commit a cocina (ya existía en BD)
 * - Modo híbrido: sistema evalúa y sugiere, admin puede hacer commit manual
 *
 * Máquina de estados de logistic_status:
 *
 *   quote → soft_reserve → kitchen_commit → preparing → ready_for_pickup
 *                ↓                                              ↓
 *            waitlist ──────────────────────────────────→ (promoted)
 *
 *   kitchen_commit → assigned → picked_up → delivering → delivered
 *   (cualquier estado) → cancelled
 *
 * Transiciones válidas:
 *   quote         → soft_reserve | waitlist | cancelled
 *   waitlist      → soft_reserve | cancelled
 *   soft_reserve  → kitchen_commit | waitlist | cancelled
 *   kitchen_commit→ preparing | cancelled
 *   preparing     → ready_for_pickup | cancelled
 *   ready_for_pickup → assigned | cancelled
 *   assigned      → picked_up | cancelled
 *   picked_up     → delivering | cancelled
 *   delivering    → delivered | cancelled
 *   delivered     → (terminal)
 *   cancelled     → (terminal)
 */

import { supabase } from '@/lib/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type LogisticStatus =
  | 'quote'
  | 'waitlist'
  | 'soft_reserve'
  | 'kitchen_commit'
  | 'preparing'
  | 'ready_for_pickup'
  | 'assigned'
  | 'picked_up'
  | 'delivering'
  | 'delivered'
  | 'cancelled';

export interface AvailabilityResult {
  canCommit: boolean;
  recommendation: 'soft_reserve' | 'waitlist';
  reason: string;
  availableRiders: number;
  busyRiders: number;
  totalActiveDeliveries: number;
  maxConcurrentDeliveries: number;
  capacityUsedPct: number;
  waitlistLength: number;
}

export interface CommitResult {
  success: boolean;
  orderId: string;
  newLogisticStatus: LogisticStatus;
  error?: string;
}

// ─── Transiciones válidas ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<LogisticStatus, LogisticStatus[]> = {
  quote:            ['soft_reserve', 'waitlist', 'cancelled'],
  waitlist:         ['soft_reserve', 'cancelled'],
  soft_reserve:     ['kitchen_commit', 'waitlist', 'cancelled'],
  kitchen_commit:   ['preparing', 'cancelled'],
  preparing:        ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['assigned', 'cancelled'],
  assigned:         ['picked_up', 'cancelled'],
  picked_up:        ['delivering', 'cancelled'],
  delivering:       ['delivered', 'cancelled'],
  delivered:        [],
  cancelled:        [],
};

export function isValidTransition(from: LogisticStatus | null, to: LogisticStatus): boolean {
  if (!from) return to === 'quote' || to === 'soft_reserve' || to === 'waitlist';
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Labels para UI ───────────────────────────────────────────────────────────

export const LOGISTIC_STATUS_LABELS: Record<LogisticStatus, { label: string; color: string; description: string }> = {
  quote:            { label: 'Cotización',       color: '#94A3B8', description: 'Pedido recibido, evaluando disponibilidad' },
  waitlist:         { label: 'En espera',         color: '#F59E0B', description: 'Sin disponibilidad inmediata, en cola' },
  soft_reserve:     { label: 'Pre-reservado',     color: '#3B82F6', description: 'Disponibilidad confirmada, pendiente de commit' },
  kitchen_commit:   { label: 'Comprometido',      color: '#8B5CF6', description: 'Cocina notificada, en preparación' },
  preparing:        { label: 'Preparando',        color: '#F97316', description: 'Cocina preparando el pedido' },
  ready_for_pickup: { label: 'Listo para rider',  color: '#EAB308', description: 'Pedido listo, esperando rider' },
  assigned:         { label: 'Rider asignado',    color: '#06B6D4', description: 'Rider en camino al restaurante' },
  picked_up:        { label: 'Recogido',          color: '#F97316', description: 'Rider recogió el pedido' },
  delivering:       { label: 'En entrega',        color: '#F97316', description: 'Rider en camino al cliente' },
  delivered:        { label: 'Entregado',         color: '#22C55E', description: 'Pedido entregado exitosamente' },
  cancelled:        { label: 'Cancelado',         color: '#EF4444', description: 'Pedido cancelado' },
};

// ─── evaluateAvailability ─────────────────────────────────────────────────────
/**
 * Evalúa la capacidad logística actual del tenant.
 *
 * Lógica de decisión:
 * 1. Contar riders disponibles (rider_status = 'available' Y active)
 *    Fallback: si no hay riders con rider_status seteado, inferir de rider_assignments activos
 * 2. Contar deliveries activos (logistic_status NOT IN terminal states)
 * 3. Comparar contra max_concurrent_deliveries del tenant
 * 4. canCommit = true si hay al menos 1 rider disponible Y capacidad no saturada
 *
 * Umbrales:
 * - capacityUsedPct < 80% → soft_reserve (hay holgura)
 * - capacityUsedPct >= 80% → waitlist (saturación)
 * - Sin riders disponibles → waitlist
 */
export async function evaluateAvailability(tenantId: string): Promise<AvailabilityResult> {
  try {
    // 1. Obtener configuración del tenant
    const { data: settings } = await supabase
      .from('delivery_settings')
      .select('max_concurrent_deliveries')
      .eq('tenant_id', tenantId)
      .single();

    const maxConcurrent = settings?.max_concurrent_deliveries ?? 3;

    // 2. Contar riders activos y su estado
    const { data: riders } = await supabase
      .from('rider_profiles')
      .select('id, rider_status, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const allActiveRiders = riders ?? [];

    // Riders con rider_status explícito
    const ridersWithStatus = allActiveRiders.filter(r => r.rider_status && r.rider_status !== 'offline');
    const availableByStatus = allActiveRiders.filter(r => r.rider_status === 'available').length;

    // Fallback: si ningún rider tiene rider_status seteado, inferir de assignments activos
    let availableRiders = availableByStatus;
    let busyRiders = allActiveRiders.filter(r => r.rider_status === 'busy').length;

    if (ridersWithStatus.length === 0 && allActiveRiders.length > 0) {
      // Inferir: riders sin assignment activo = disponibles
      const { data: activeAssignments } = await supabase
        .from('orders')
        .select('rider_id')
        .eq('tenant_id', tenantId)
        .eq('delivery_type', 'delivery')
        .not('delivery_status', 'in', '(delivered,cancelled)')
        .not('rider_id', 'is', null);

      const busyRiderIds = new Set((activeAssignments ?? []).map(a => a.rider_id));
      busyRiders = busyRiderIds.size;
      availableRiders = Math.max(0, allActiveRiders.length - busyRiders);
    }

    // 3. Contar deliveries activos (no terminales)
    const { count: activeDeliveries } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('delivery_type', 'delivery')
      .not('logistic_status', 'in', '(delivered,cancelled)')
      .not('logistic_status', 'is', null);

    const totalActiveDeliveries = activeDeliveries ?? 0;

    // 4. Contar pedidos en waitlist
    const { count: waitlistCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('logistic_status', 'waitlist');

    const waitlistLength = waitlistCount ?? 0;

    // 5. Calcular capacidad usada
    const capacityUsedPct = maxConcurrent > 0
      ? Math.round((totalActiveDeliveries / maxConcurrent) * 100)
      : 100;

    // 6. Decisión de disponibilidad
    const hasCapacity = totalActiveDeliveries < maxConcurrent;
    const hasRiders = availableRiders > 0;
    const notSaturated = capacityUsedPct < 80;

    const canCommit = hasCapacity && hasRiders;
    const recommendation: 'soft_reserve' | 'waitlist' = canCommit && notSaturated
      ? 'soft_reserve'
      : 'waitlist';

    // 7. Razón legible
    let reason = '';
    if (!hasRiders) {
      reason = `Sin riders disponibles (${allActiveRiders.length} activos, todos ocupados)`;
    } else if (!hasCapacity) {
      reason = `Capacidad saturada: ${totalActiveDeliveries}/${maxConcurrent} entregas activas`;
    } else if (!notSaturated) {
      reason = `Capacidad al ${capacityUsedPct}% — se recomienda lista de espera`;
    } else {
      reason = `${availableRiders} rider(s) disponible(s), capacidad al ${capacityUsedPct}%`;
    }

    return {
      canCommit,
      recommendation,
      reason,
      availableRiders,
      busyRiders,
      totalActiveDeliveries,
      maxConcurrentDeliveries: maxConcurrent,
      capacityUsedPct,
      waitlistLength,
    };
  } catch (err) {
    console.error('[DeliveryCommitEngine] evaluateAvailability error:', err);
    // En caso de error, ser conservador: permitir pero advertir
    return {
      canCommit: true,
      recommendation: 'soft_reserve',
      reason: 'No se pudo evaluar disponibilidad (error de red)',
      availableRiders: 0,
      busyRiders: 0,
      totalActiveDeliveries: 0,
      maxConcurrentDeliveries: 3,
      capacityUsedPct: 0,
      waitlistLength: 0,
    };
  }
}

// ─── setLogisticStatus ────────────────────────────────────────────────────────
/**
 * Transición segura de logistic_status con validación de máquina de estados.
 * Registra el cambio en delivery_ops_log.
 */
export async function setLogisticStatus(
  orderId: string,
  newStatus: LogisticStatus,
  tenantId: string,
  extra: Record<string, unknown> = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    // Leer estado actual
    const { data: order } = await supabase
      .from('orders')
      .select('logistic_status, order_number')
      .eq('id', orderId)
      .single();

    const currentStatus = order?.logistic_status as LogisticStatus | null;

    // Validar transición
    if (!isValidTransition(currentStatus, newStatus)) {
      const err = `Transición inválida: ${currentStatus ?? 'null'} → ${newStatus}`;
      console.warn(`[DeliveryCommitEngine] ${err}`);
      return { success: false, error: err };
    }

    // Construir update
    const updatePayload: Record<string, unknown> = {
      logistic_status: newStatus,
      ...extra,
    };

    // Timestamps especiales por estado
    if (newStatus === 'waitlist') {
      updatePayload.waitlisted_at = new Date().toISOString();
    }
    if (newStatus === 'kitchen_commit') {
      updatePayload.kitchen_committed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);

    if (updateError) throw updateError;

    // Registrar en delivery_ops_log
    await supabase.from('delivery_ops_log').insert({
      tenant_id: tenantId,
      order_id: orderId,
      event_type: `logistic_${newStatus}`,
      metadata: {
        from_status: currentStatus,
        to_status: newStatus,
        order_number: order?.order_number,
        ...extra,
      },
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[DeliveryCommitEngine] setLogisticStatus error:', msg);
    return { success: false, error: msg };
  }
}

// ─── initOrderLogistics ───────────────────────────────────────────────────────
/**
 * Inicializa la logística de un pedido delivery recién creado.
 * Evalúa disponibilidad y decide: soft_reserve o waitlist.
 * Llamar desde CartDrawer después del insert del pedido.
 *
 * Modo híbrido:
 * - soft_reserve: sistema reserva capacidad, admin puede hacer commit manual
 * - waitlist: sistema encola, admin puede promover manualmente o el sistema lo hace automático
 */
export async function initOrderLogistics(
  orderId: string,
  tenantId: string
): Promise<{ logisticStatus: LogisticStatus; availability: AvailabilityResult }> {
  const availability = await evaluateAvailability(tenantId);

  const targetStatus: LogisticStatus = availability.recommendation;

  await setLogisticStatus(orderId, targetStatus, tenantId, {
    init_reason: availability.reason,
  });

  return { logisticStatus: targetStatus, availability };
}

// ─── commitToKitchen ──────────────────────────────────────────────────────────
/**
 * Hace el commit a cocina: escribe kitchen_committed_at y pasa a kitchen_commit.
 * Puede ser llamado:
 * - Manualmente por el admin desde el dispatch panel
 * - Automáticamente cuando un pedido en waitlist puede ser promovido
 *
 * Precondición: logistic_status debe ser 'soft_reserve' o 'waitlist'
 */
export async function commitToKitchen(
  orderId: string,
  tenantId: string,
  triggeredBy: 'admin' | 'auto' = 'admin'
): Promise<CommitResult> {
  // Re-evaluar disponibilidad antes de commitear
  const availability = await evaluateAvailability(tenantId);

  if (!availability.canCommit && triggeredBy === 'auto') {
    return {
      success: false,
      orderId,
      newLogisticStatus: 'waitlist',
      error: `No hay disponibilidad para commit automático: ${availability.reason}`,
    };
  }

  const result = await setLogisticStatus(orderId, 'kitchen_commit', tenantId, {
    committed_by: triggeredBy,
    commit_reason: availability.reason,
  });

  if (!result.success) {
    return {
      success: false,
      orderId,
      newLogisticStatus: 'waitlist',
      error: result.error,
    };
  }

  return {
    success: true,
    orderId,
    newLogisticStatus: 'kitchen_commit',
  };
}

// ─── addToWaitlist ────────────────────────────────────────────────────────────
/**
 * Mueve un pedido a la cola de espera.
 * Puede ser llamado desde soft_reserve si la capacidad se satura después.
 */
export async function addToWaitlist(
  orderId: string,
  tenantId: string,
  reason: string = 'Sin disponibilidad'
): Promise<CommitResult> {
  const result = await setLogisticStatus(orderId, 'waitlist', tenantId, {
    waitlist_reason: reason,
  });

  return {
    success: result.success,
    orderId,
    newLogisticStatus: 'waitlist',
    error: result.error,
  };
}

// ─── promoteFromWaitlist ──────────────────────────────────────────────────────
/**
 * Promueve el siguiente pedido en waitlist a soft_reserve cuando hay disponibilidad.
 * Usa FIFO por waitlisted_at.
 * Llamar cuando un delivery se completa o un rider queda disponible.
 */
export async function promoteFromWaitlist(tenantId: string): Promise<{
  promoted: boolean;
  orderId?: string;
  reason?: string;
}> {
  const availability = await evaluateAvailability(tenantId);

  if (!availability.canCommit) {
    return { promoted: false, reason: availability.reason };
  }

  // Obtener el pedido más antiguo en waitlist
  const { data: nextInQueue } = await supabase
    .from('orders')
    .select('id, order_number, waitlisted_at')
    .eq('tenant_id', tenantId)
    .eq('logistic_status', 'waitlist')
    .order('waitlisted_at', { ascending: true })
    .limit(1)
    .single();

  if (!nextInQueue) {
    return { promoted: false, reason: 'Cola de espera vacía' };
  }

  const result = await setLogisticStatus(nextInQueue.id, 'soft_reserve', tenantId, {
    promoted_from_waitlist: true,
    promoted_at: new Date().toISOString(),
  });

  if (result.success) {
    return { promoted: true, orderId: nextInQueue.id };
  }

  return { promoted: false, reason: result.error };
}

// ─── syncLogisticFromDeliveryStatus ──────────────────────────────────────────
/**
 * Sincroniza logistic_status con delivery_status cuando el rider actualiza.
 * Mantiene coherencia entre ambas capas sin mezclarlas.
 *
 * Mapa de sincronización:
 *   delivery_status: assigned    → logistic_status: assigned
 *   delivery_status: picked_up   → logistic_status: picked_up
 *   delivery_status: delivered   → logistic_status: delivered
 *   delivery_status: cancelled   → logistic_status: cancelled
 */
const DELIVERY_TO_LOGISTIC: Partial<Record<string, LogisticStatus>> = {
  assigned:   'assigned',
  picked_up:  'picked_up',
  delivered:  'delivered',
  cancelled:  'cancelled',
};

export async function syncLogisticFromDeliveryStatus(
  orderId: string,
  tenantId: string,
  newDeliveryStatus: string
): Promise<void> {
  const logisticTarget = DELIVERY_TO_LOGISTIC[newDeliveryStatus];
  if (!logisticTarget) return; // No hay mapeo, no hacer nada

  await setLogisticStatus(orderId, logisticTarget, tenantId, {
    synced_from_delivery_status: newDeliveryStatus,
  });

  // Si se entregó, promover el siguiente en waitlist
  if (logisticTarget === 'delivered') {
    await promoteFromWaitlist(tenantId);
  }
}
