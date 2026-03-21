/**
 * DeliveryCommitEngine.ts — Motor de orquestación de delivery
 *
 * F7: Infraestructura base (logistic_status, waitlist, kitchen_commit, sync)
 * F9: Políticas de commit v1
 *   - P1: Buffer de capacidad — no commitear si capacityUsedPct >= commit_buffer_pct
 *   - P2: Priorización por wait time + distancia como desempate
 *   - P3: Rider realmente utilizable — verificar last_location_at reciente
 *   - P4: Auto-promoción por tiempo — promover si wait > max_wait_minutes
 *
 * Comportamiento aprobado:
 *   canCommit = true  → kitchen_commit directo (sin pasar por soft_reserve)
 *   canCommit = false → waitlist
 *   Fallback de error → CONSERVADOR: canCommit = false → waitlist
 *
 * Separación de capas (NO tocar):
 *   logistic_status → motor de orquestación (este archivo)
 *   delivery_status → rider (RiderApp)
 *   orders.status   → cocina (KDS)
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
  recommendation: 'kitchen_commit' | 'waitlist';
  reason: string;
  // Métricas de capacidad
  availableRiders: number;
  busyRiders: number;
  totalActiveDeliveries: number;
  maxConcurrent: number;
  capacityUsedPct: number;
  waitlistLength: number;
  // F9: detalles de política aplicada
  blockedBy: 'buffer' | 'no_riders' | 'no_capacity' | 'no_real_riders' | null;
  commitBufferPct: number;
  maxWaitMinutes: number;
}

export interface CommitResult {
  success: boolean;
  orderId: string;
  newLogisticStatus: LogisticStatus;
  error?: string;
}

// ─── Labels para UI ───────────────────────────────────────────────────────────

export const LOGISTIC_STATUS_LABELS: Record<LogisticStatus, { label: string; color: string }> = {
  quote:            { label: 'Cotización',           color: '#94A3B8' },
  waitlist:         { label: 'En espera',            color: '#F59E0B' },
  soft_reserve:     { label: 'Pre-reservado',        color: '#3B82F6' },
  kitchen_commit:   { label: 'Comprometido',         color: '#8B5CF6' },
  preparing:        { label: 'En preparación',       color: '#F97316' },
  ready_for_pickup: { label: 'Listo para recoger',   color: '#EAB308' },
  assigned:         { label: 'Rider asignado',       color: '#3B82F6' },
  picked_up:        { label: 'Pedido recogido',      color: '#F97316' },
  delivering:       { label: 'En camino',            color: '#F97316' },
  delivered:        { label: 'Entregado',            color: '#22C55E' },
  cancelled:        { label: 'Cancelado',            color: '#EF4444' },
};

// ─── Transiciones válidas ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Partial<Record<LogisticStatus, LogisticStatus[]>> = {
  quote:            ['waitlist', 'soft_reserve', 'kitchen_commit', 'cancelled'],
  waitlist:         ['kitchen_commit', 'soft_reserve', 'cancelled'],
  soft_reserve:     ['kitchen_commit', 'waitlist', 'cancelled'],
  kitchen_commit:   ['preparing', 'ready_for_pickup', 'assigned', 'delivered', 'cancelled'],
  preparing:        ['ready_for_pickup', 'assigned', 'delivered', 'cancelled'],
  ready_for_pickup: ['assigned', 'delivered', 'cancelled'],
  assigned:         ['picked_up', 'delivered', 'cancelled'],
  picked_up:        ['delivering', 'delivered', 'cancelled'],
  delivering:       ['delivered', 'cancelled'],
  delivered:        [],
  cancelled:        [],
};

// ─── setLogisticStatus ────────────────────────────────────────────────────────

async function setLogisticStatus(
  orderId: string,
  targetStatus: LogisticStatus,
  tenantId: string,
  metadata: Record<string, unknown> = {}
): Promise<{ success: boolean; error?: string }> {
  // Leer estado actual
  const { data: current } = await supabase
    .from('orders')
    .select('logistic_status')
    .eq('id', orderId)
    .single();

  const currentStatus = current?.logistic_status as LogisticStatus | null;

  // Validar transición
  if (currentStatus) {
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      console.warn(`[Engine] Transición inválida: ${currentStatus} → ${targetStatus} (pedido ${orderId})`);
      return { success: false, error: `Transición inválida: ${currentStatus} → ${targetStatus}` };
    }
  }

  // Construir el update
  const update: Record<string, unknown> = {
    logistic_status: targetStatus,
    updated_at: new Date().toISOString(),
  };

  if (targetStatus === 'waitlist') {
    update.waitlisted_at = new Date().toISOString();
  }

  if (targetStatus === 'kitchen_commit') {
    update.kitchen_committed_at = new Date().toISOString();
  }

  // Sincronizar status general del pedido con el estado logístico
  if (targetStatus === 'delivered') {
    update.status = 'entregado';
  } else if (targetStatus === 'cancelled') {
    update.status = 'cancelado';
  } else if (targetStatus === 'kitchen_commit' || targetStatus === 'preparing') {
    update.status = 'en_cocina';
  } else if (targetStatus === 'ready_for_pickup') {
    update.status = 'listo';
  }

  // Log en delivery_ops_log
  try {
    await supabase.from('delivery_ops_log').insert({
      tenant_id: tenantId,
      order_id: orderId,
      event_type: `logistic_${targetStatus}`,
      metadata: {
        from_status: currentStatus,
        to_status: targetStatus,
        ...metadata,
      },
    });
  } catch {
    // No bloquear si el log falla
  }

  const { error } = await supabase
    .from('orders')
    .update(update)
    .eq('id', orderId);

  if (error) {
    console.error(`[Engine] Error al actualizar logistic_status:`, error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ─── evaluateAvailability ─────────────────────────────────────────────────────
/**
 * Evalúa si hay disponibilidad real para comprometer un pedido a cocina.
 *
 * F9 — Políticas aplicadas:
 *   P1: Buffer de capacidad — no commitear si capacityUsedPct >= commit_buffer_pct
 *   P3: Rider realmente utilizable — verificar last_location_at < 10 min
 *
 * FALLBACK CONSERVADOR: si hay error de red/BD → canCommit = false → waitlist
 */
export async function evaluateAvailability(tenantId: string): Promise<AvailabilityResult> {
  try {
    // 1. Obtener configuración del tenant (incluye las nuevas políticas F9)
    const { data: settings } = await supabase
      .from('delivery_settings')
      .select('max_concurrent_deliveries, commit_buffer_pct, max_wait_minutes')
      .eq('tenant_id', tenantId)
      .single();

    const maxConcurrent = settings?.max_concurrent_deliveries ?? 3;
    const commitBufferPct = settings?.commit_buffer_pct ?? 80;
    const maxWaitMinutes = settings?.max_wait_minutes ?? 20;

    // 2. Contar riders activos y su estado
    const { data: riders } = await supabase
      .from('rider_profiles')
      .select('id, rider_status, is_active, last_location_at')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const allActiveRiders = riders ?? [];

    // P3: Rider realmente utilizable — last_location_at < 10 minutos
    // Un rider con last_location_at muy viejo no es confiable como disponible real
    const RIDER_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutos
    const now = Date.now();

    const isRiderFresh = (r: any): boolean => {
      if (!r.last_location_at) return false; // Sin ubicación conocida → no utilizable
      return now - new Date(r.last_location_at).getTime() < RIDER_STALE_THRESHOLD_MS;
    };

    // Riders con rider_status explícito
    const ridersWithStatus = allActiveRiders.filter(r => r.rider_status && r.rider_status !== 'offline');

    let availableRiders: number;
    let busyRiders: number;

    if (ridersWithStatus.length > 0) {
      // Usar rider_status explícito + filtro de frescura (P3)
      availableRiders = allActiveRiders.filter(
        r => r.rider_status === 'available' && isRiderFresh(r)
      ).length;
      busyRiders = allActiveRiders.filter(r => r.rider_status === 'busy').length;
    } else {
      // Fallback: inferir de assignments activos
      const { data: activeAssignments } = await supabase
        .from('orders')
        .select('rider_id')
        .eq('tenant_id', tenantId)
        .eq('delivery_type', 'delivery')
        .not('delivery_status', 'in', '(delivered,cancelled)')
        .not('rider_id', 'is', null);

      const busyRiderIds = new Set((activeAssignments ?? []).map((a: any) => a.rider_id));
      busyRiders = busyRiderIds.size;

      // En el fallback, aplicar P3 solo a los riders no ocupados
      const nonBusyRiders = allActiveRiders.filter(r => !busyRiderIds.has(r.id));
      availableRiders = nonBusyRiders.filter(isRiderFresh).length;

      // Si ningún rider tiene ubicación reciente, usar el conteo sin filtro P3
      // (evitar falso negativo cuando el sistema de GPS no está activo aún)
      if (availableRiders === 0 && nonBusyRiders.length > 0) {
        availableRiders = nonBusyRiders.length;
      }
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

    // 6. Decisión de disponibilidad con políticas F9
    const hasCapacity = totalActiveDeliveries < maxConcurrent;
    const hasRiders = availableRiders > 0;

    // P1: Buffer de capacidad — no commitear si capacityUsedPct >= commit_buffer_pct
    const withinBuffer = capacityUsedPct < commitBufferPct;

    const canCommit = hasCapacity && hasRiders && withinBuffer;

    // Determinar qué política bloqueó (para UI explicable)
    let blockedBy: AvailabilityResult['blockedBy'] = null;
    if (!canCommit) {
      if (!hasRiders) {
        blockedBy = 'no_real_riders'; // P3: riders fantasma filtrados
      } else if (!withinBuffer) {
        blockedBy = 'buffer'; // P1: buffer de capacidad
      } else if (!hasCapacity) {
        blockedBy = 'no_capacity';
      }
    }

    // 7. Razón legible para UI
    let reason = '';
    if (blockedBy === 'no_real_riders') {
      reason = `Sin riders con ubicación reciente (${allActiveRiders.length} activos, ${busyRiders} ocupados)`;
    } else if (blockedBy === 'buffer') {
      reason = `Capacidad al ${capacityUsedPct}% — buffer de seguridad activo (límite: ${commitBufferPct}%)`;
    } else if (blockedBy === 'no_capacity') {
      reason = `Capacidad saturada: ${totalActiveDeliveries}/${maxConcurrent} entregas activas`;
    } else {
      reason = `${availableRiders} rider(s) disponible(s), capacidad al ${capacityUsedPct}%`;
    }

    return {
      canCommit,
      recommendation: canCommit ? 'kitchen_commit' : 'waitlist',
      reason,
      availableRiders,
      busyRiders,
      totalActiveDeliveries,
      maxConcurrent,
      capacityUsedPct,
      waitlistLength,
      blockedBy,
      commitBufferPct,
      maxWaitMinutes,
    };

  } catch (err) {
    // FALLBACK CONSERVADOR: error de red/BD → no sobrecomprometer
    console.error('[Engine] Error en evaluateAvailability:', err);
    return {
      canCommit: false,
      recommendation: 'waitlist',
      reason: 'Error al evaluar disponibilidad — pedido en espera por seguridad',
      availableRiders: 0,
      busyRiders: 0,
      totalActiveDeliveries: 0,
      maxConcurrent: 0,
      capacityUsedPct: 100,
      waitlistLength: 0,
      blockedBy: null,
      commitBufferPct: 80,
      maxWaitMinutes: 20,
    };
  }
}

// ─── initOrderLogistics ───────────────────────────────────────────────────────
/**
 * Punto de entrada al crear un pedido delivery.
 * Evalúa disponibilidad y decide el estado inicial:
 *   canCommit = true  → kitchen_commit directo
 *   canCommit = false → waitlist
 */
export async function initOrderLogistics(
  orderId: string,
  tenantId: string
): Promise<{ logisticStatus: LogisticStatus; availability: AvailabilityResult }> {
  const availability = await evaluateAvailability(tenantId);
  const targetStatus: LogisticStatus = availability.canCommit ? 'kitchen_commit' : 'waitlist';

  await setLogisticStatus(orderId, targetStatus, tenantId, {
    init_reason: availability.reason,
    auto_committed: availability.canCommit,
    blocked_by: availability.blockedBy,
  });

  return { logisticStatus: targetStatus, availability };
}

// ─── commitToKitchen ──────────────────────────────────────────────────────────
/**
 * Hace el commit a cocina: escribe kitchen_committed_at y pasa a kitchen_commit.
 * Puede ser llamado:
 * - Manualmente por el admin desde el dispatch panel (override operativo)
 * - Automáticamente cuando un pedido en waitlist puede ser promovido
 *
 * El admin puede hacer override aunque no haya disponibilidad.
 * Los auto-commits respetan las políticas de F9.
 */
export async function commitToKitchen(
  orderId: string,
  tenantId: string,
  triggeredBy: 'admin' | 'auto' = 'admin'
): Promise<CommitResult> {
  // Re-evaluar disponibilidad antes de commitear
  const availability = await evaluateAvailability(tenantId);

  // Solo bloquear auto-commits si no hay disponibilidad
  // El admin puede hacer override manual siempre
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
    blocked_by: availability.blockedBy,
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

// ─── WaitlistEntry: pedido en cola con datos para priorización ────────────────

interface WaitlistEntry {
  id: string;
  order_number: number;
  waitlisted_at: string;
  delivery_distance_km: number | null;
  // Calculados
  waitMinutes: number;
  priorityScore: number; // mayor = más prioritario
  priorityReason: string;
}

function buildWaitlistPriority(entries: any[]): WaitlistEntry[] {
  const now = Date.now();

  return entries
    .map((o): WaitlistEntry => {
      const waitMs = now - new Date(o.waitlisted_at).getTime();
      const waitMinutes = Math.floor(waitMs / 60000);
      const distanceKm = o.delivery_distance_km ?? 999; // sin distancia = penalizar

      // P2: Priorización por wait time (principal) + distancia como desempate
      // Score: wait_minutes (principal) — distancia (desempate, menor es mejor)
      // Usamos un score compuesto donde el tiempo domina claramente:
      // score = waitMinutes * 1000 - distanceKm
      // Esto garantiza que 1 minuto más de espera siempre supera cualquier diferencia de distancia
      const priorityScore = waitMinutes * 1000 - distanceKm;

      const priorityReason = distanceKm < 999
        ? `${waitMinutes}min en espera · ${distanceKm.toFixed(1)}km`
        : `${waitMinutes}min en espera`;

      return {
        id: o.id,
        order_number: o.order_number,
        waitlisted_at: o.waitlisted_at,
        delivery_distance_km: o.delivery_distance_km,
        waitMinutes,
        priorityScore,
        priorityReason,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore); // mayor score primero
}

// ─── promoteFromWaitlist ──────────────────────────────────────────────────────
/**
 * Promueve el pedido con mayor prioridad desde waitlist a kitchen_commit.
 *
 * F9 — Políticas aplicadas:
 *   P2: Priorización por wait time + distancia como desempate
 *   P4: Auto-promoción por tiempo — promover si wait > max_wait_minutes
 *
 * Llamar cuando:
 * - Un delivery se completa (syncLogisticFromDeliveryStatus → 'delivered')
 * - Un rider queda disponible
 * - Periódicamente para P4 (auto-promoción por tiempo)
 *
 * triggeredBy:
 *   'delivery_complete' → se liberó capacidad por entrega
 *   'time_threshold'    → P4: pedido superó max_wait_minutes
 *   'manual'            → admin forzó la promoción
 */
export async function promoteFromWaitlist(
  tenantId: string,
  triggeredBy: 'delivery_complete' | 'time_threshold' | 'manual' = 'delivery_complete'
): Promise<{
  promoted: boolean;
  orderId?: string;
  orderNumber?: number;
  waitMinutes?: number;
  reason?: string;
}> {
  const availability = await evaluateAvailability(tenantId);

  // Para auto-promoción por tiempo (P4), permitir aunque no haya disponibilidad perfecta
  // Solo bloquear si realmente no hay capacidad ni riders
  if (!availability.canCommit && triggeredBy !== 'manual') {
    // P4 excepción: si hay capacidad pero el buffer lo bloquea, igual promover si es urgente
    const hasBasicCapacity = availability.totalActiveDeliveries < availability.maxConcurrent;
    const hasRiders = availability.availableRiders > 0;

    if (!hasBasicCapacity || !hasRiders) {
      return { promoted: false, reason: availability.reason };
    }
    // Si solo está bloqueado por buffer pero hay capacidad real y riders → continuar para P4
  }

  // Obtener todos los pedidos en waitlist con datos para priorización
  const { data: waitlistRaw } = await supabase
    .from('orders')
    .select('id, order_number, waitlisted_at, delivery_distance_km')
    .eq('tenant_id', tenantId)
    .eq('logistic_status', 'waitlist')
    .order('waitlisted_at', { ascending: true }); // pre-ordenar por tiempo

  if (!waitlistRaw || waitlistRaw.length === 0) {
    return { promoted: false, reason: 'Cola de espera vacía' };
  }

  // Aplicar priorización F9 (P2)
  const prioritized = buildWaitlistPriority(waitlistRaw);
  const candidate = prioritized[0];

  // P4: Si el trigger es 'time_threshold', solo promover si el candidato superó max_wait_minutes
  if (triggeredBy === 'time_threshold') {
    if (candidate.waitMinutes < availability.maxWaitMinutes) {
      return {
        promoted: false,
        reason: `Candidato lleva ${candidate.waitMinutes}min (umbral: ${availability.maxWaitMinutes}min)`,
      };
    }
  }

  // Promover directo a kitchen_commit
  const result = await setLogisticStatus(candidate.id, 'kitchen_commit', tenantId, {
    promoted_from_waitlist: true,
    promoted_at: new Date().toISOString(),
    triggered_by: triggeredBy,
    wait_minutes: candidate.waitMinutes,
    priority_score: candidate.priorityScore,
    priority_reason: candidate.priorityReason,
  });

  if (result.success) {
    return {
      promoted: true,
      orderId: candidate.id,
      orderNumber: candidate.order_number,
      waitMinutes: candidate.waitMinutes,
    };
  }

  return { promoted: false, reason: result.error };
}

// ─── checkAndAutoPromote ──────────────────────────────────────────────────────
/**
 * P4: Verificar si hay pedidos en waitlist que superaron max_wait_minutes.
 * Llamar periódicamente (ej: cada 5 minutos desde el Dispatch panel).
 * Promueve todos los pedidos que superaron el umbral, uno por uno,
 * respetando la capacidad disponible.
 */
export async function checkAndAutoPromote(tenantId: string): Promise<{
  promoted: number;
  details: Array<{ orderId: string; orderNumber: number; waitMinutes: number }>;
}> {
  const promoted: Array<{ orderId: string; orderNumber: number; waitMinutes: number }> = [];

  // Intentar promover hasta que no haya más candidatos o no haya capacidad
  let attempts = 0;
  const MAX_ATTEMPTS = 10; // Límite de seguridad

  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    const result = await promoteFromWaitlist(tenantId, 'time_threshold');

    if (!result.promoted || !result.orderId) break;

    promoted.push({
      orderId: result.orderId,
      orderNumber: result.orderNumber ?? 0,
      waitMinutes: result.waitMinutes ?? 0,
    });
  }

  return { promoted: promoted.length, details: promoted };
}

// ─── getWaitlistWithPriority ──────────────────────────────────────────────────
/**
 * Obtiene la cola de waitlist ordenada por prioridad F9.
 * Para mostrar en el Dispatch panel con razón de prioridad.
 */
export async function getWaitlistWithPriority(tenantId: string): Promise<WaitlistEntry[]> {
  const { data } = await supabase
    .from('orders')
    .select('id, order_number, waitlisted_at, delivery_distance_km')
    .eq('tenant_id', tenantId)
    .eq('logistic_status', 'waitlist')
    .order('waitlisted_at', { ascending: true });

  if (!data || data.length === 0) return [];
  return buildWaitlistPriority(data);
}

// ─── syncLogisticFromDeliveryStatus ──────────────────────────────────────────
/**
 * Sincroniza logistic_status con delivery_status cuando el rider actualiza.
 * Mantiene coherencia entre ambas capas sin mezclarlas.
 *
 * Mapa de sincronización:
 *   delivery_status: assigned    → logistic_status: assigned
 *   delivery_status: picked_up   → logistic_status: picked_up
 *   delivery_status: delivered   → logistic_status: delivered + auto-promueve waitlist
 *   delivery_status: cancelled   → logistic_status: cancelled + auto-promueve waitlist
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
  if (!logisticTarget) return;

  await setLogisticStatus(orderId, logisticTarget, tenantId, {
    synced_from_delivery_status: newDeliveryStatus,
  });

  // Si se liberó capacidad, intentar promover el siguiente en waitlist
  if (logisticTarget === 'delivered' || logisticTarget === 'cancelled') {
    await promoteFromWaitlist(tenantId, 'delivery_complete');
  }
}
