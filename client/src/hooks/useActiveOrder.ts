/**
 * useActiveOrder — Hook de fuente de verdad compartida para pedidos activos
 * F8: Active Orders unificados
 *
 * Proporciona una vista normalizada del pedido activo que es consistente
 * entre cliente, admin y rider. Todos leen del mismo modelo de datos.
 *
 * Campos clave:
 * - logistic_status: estado logístico (motor de orquestación F7)
 * - delivery_status: estado del rider (asignación, recogida, entrega)
 * - orders.status: estado de cocina (pendiente, en_cocina, listo, entregado)
 * - phase: fase derivada unificada para UI (pre_dispatch | in_dispatch | delivered | cancelled)
 *
 * Suscripción realtime: escucha cambios en la fila del pedido y actualiza
 * automáticamente sin polling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { LogisticStatus } from '@/lib/DeliveryCommitEngine';
import { LOGISTIC_STATUS_LABELS } from '@/lib/DeliveryCommitEngine';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type OrderPhase =
  | 'pre_dispatch'   // waitlist | soft_reserve | kitchen_commit | preparing | ready_for_pickup
  | 'in_dispatch'    // assigned | picked_up | delivering
  | 'delivered'      // delivered (terminal)
  | 'cancelled'      // cancelled (terminal)
  | 'unknown';       // sin delivery_type=delivery o sin logistic_status

export interface ActiveOrderData {
  // Identidad
  id: string;
  order_number: number;
  tenant_id: string;
  delivery_type: string | null;

  // Estado de cocina
  status: string;                      // orders.status

  // Estado logístico (F7)
  logistic_status: LogisticStatus | null;
  kitchen_committed_at: string | null;
  waitlisted_at: string | null;

  // Estado del rider
  delivery_status: string | null;
  rider_id: string | null;

  // Datos del cliente
  customer_name: string;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_formatted_address: string | null;
  delivery_lat: number | null;
  delivery_lon: number | null;
  delivery_eta_minutes: number | null;
  delivery_distance_km: number | null;

  // Financiero
  total: number;
  payment_method: string;
  payment_status: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Datos del rider (join)
  rider?: {
    id: string;
    name: string;
    phone: string | null;
    vehicle_type: string | null;
    current_lat: number | null;
    current_lon: number | null;
    last_location_at: string | null;
  } | null;

  // Derivados calculados por el hook
  phase: OrderPhase;
  phaseLabel: string;
  phaseColor: string;
  isDelivery: boolean;
  isPreDispatch: boolean;
  isInDispatch: boolean;
  isTerminal: boolean;
  logisticLabel: string;
  logisticColor: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRE_DISPATCH_STATUSES: LogisticStatus[] = [
  'quote', 'waitlist', 'soft_reserve', 'kitchen_commit', 'preparing', 'ready_for_pickup',
];

const IN_DISPATCH_STATUSES: LogisticStatus[] = [
  'assigned', 'picked_up', 'delivering',
];

function derivePhase(logisticStatus: LogisticStatus | null, deliveryType: string | null): OrderPhase {
  if (deliveryType !== 'delivery') return 'unknown';
  if (!logisticStatus) return 'unknown';
  if (logisticStatus === 'delivered') return 'delivered';
  if (logisticStatus === 'cancelled') return 'cancelled';
  if (IN_DISPATCH_STATUSES.includes(logisticStatus)) return 'in_dispatch';
  if (PRE_DISPATCH_STATUSES.includes(logisticStatus)) return 'pre_dispatch';
  return 'unknown';
}

const PHASE_LABELS: Record<OrderPhase, string> = {
  pre_dispatch: 'En preparación',
  in_dispatch:  'En camino',
  delivered:    'Entregado',
  cancelled:    'Cancelado',
  unknown:      'Desconocido',
};

const PHASE_COLORS: Record<OrderPhase, string> = {
  pre_dispatch: '#8B5CF6',
  in_dispatch:  '#F97316',
  delivered:    '#22C55E',
  cancelled:    '#EF4444',
  unknown:      '#94A3B8',
};

function normalizeOrder(raw: any): ActiveOrderData {
  const logisticStatus = raw.logistic_status as LogisticStatus | null;
  const deliveryType = raw.delivery_type as string | null;
  const phase = derivePhase(logisticStatus, deliveryType);

  const logisticInfo = logisticStatus
    ? LOGISTIC_STATUS_LABELS[logisticStatus]
    : { label: 'Sin estado', color: '#94A3B8' };

  return {
    id: raw.id,
    order_number: raw.order_number,
    tenant_id: raw.tenant_id,
    delivery_type: deliveryType,
    status: raw.status,
    logistic_status: logisticStatus,
    kitchen_committed_at: raw.kitchen_committed_at ?? null,
    waitlisted_at: raw.waitlisted_at ?? null,
    delivery_status: raw.delivery_status ?? null,
    rider_id: raw.rider_id ?? null,
    customer_name: raw.customer_name ?? '',
    customer_phone: raw.customer_phone ?? null,
    delivery_address: raw.delivery_address ?? null,
    delivery_formatted_address: raw.delivery_formatted_address ?? null,
    delivery_lat: raw.delivery_lat ?? null,
    delivery_lon: raw.delivery_lon ?? null,
    delivery_eta_minutes: raw.delivery_eta_minutes ?? null,
    delivery_distance_km: raw.delivery_distance_km ?? null,
    total: raw.total ?? 0,
    payment_method: raw.payment_method ?? '',
    payment_status: raw.payment_status ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    rider: raw.rider_profiles
      ? {
          id: raw.rider_profiles.id,
          name: raw.rider_profiles.name,
          phone: raw.rider_profiles.phone ?? null,
          vehicle_type: raw.rider_profiles.vehicle_type ?? null,
          current_lat: raw.rider_profiles.current_lat ?? null,
          current_lon: raw.rider_profiles.current_lon ?? null,
          last_location_at: raw.rider_profiles.last_location_at ?? null,
        }
      : null,
    // Derivados
    phase,
    phaseLabel: PHASE_LABELS[phase],
    phaseColor: PHASE_COLORS[phase],
    isDelivery: deliveryType === 'delivery',
    isPreDispatch: phase === 'pre_dispatch',
    isInDispatch: phase === 'in_dispatch',
    isTerminal: phase === 'delivered' || phase === 'cancelled',
    logisticLabel: logisticInfo.label,
    logisticColor: logisticInfo.color,
  };
}

// ─── SELECT query compartido ──────────────────────────────────────────────────

const ORDER_SELECT = `
  id, order_number, tenant_id, delivery_type, status,
  logistic_status, kitchen_committed_at, waitlisted_at,
  delivery_status, rider_id,
  customer_name, customer_phone,
  delivery_address, delivery_formatted_address,
  delivery_lat, delivery_lon,
  delivery_eta_minutes, delivery_distance_km,
  total, payment_method, payment_status,
  created_at, updated_at,
  rider_profiles(id, name, phone, vehicle_type, current_lat, current_lon, last_location_at)
`;

// ─── Hook: useActiveOrder (por ID de pedido) ──────────────────────────────────
/**
 * Para la vista del CLIENTE: sigue un pedido específico por ID.
 * Suscripción realtime en la fila del pedido.
 */
export function useActiveOrder(orderId: string | null | undefined) {
  const [order, setOrder] = useState<ActiveOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!orderId) { setLoading(false); return; }
    const { data, error: err } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', orderId)
      .single();
    if (err || !data) {
      setError('No se encontró el pedido');
      setLoading(false);
      return;
    }
    setOrder(normalizeOrder(data));
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`active-order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => {
          setOrder(prev => prev ? normalizeOrder({ ...prev, ...payload.new }) : normalizeOrder(payload.new));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  return { order, loading, error, refetch: fetch };
}

// ─── Hook: useActiveTenantOrders (por tenant) ─────────────────────────────────
/**
 * Para la vista del ADMIN: todos los pedidos delivery activos del tenant.
 * Suscripción realtime en la tabla orders filtrada por tenant.
 * Incluye pedidos en waitlist, kitchen_commit, in_dispatch.
 * Excluye delivered y cancelled.
 */
export function useActiveTenantOrders(tenantId: string | null | undefined) {
  const [orders, setOrders] = useState<ActiveOrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetch = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    const { data, error: err } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('tenant_id', tenantId)
      .eq('delivery_type', 'delivery')
      .not('logistic_status', 'in', '(delivered,cancelled)')
      .order('created_at', { ascending: false });
    if (err || !data) { setLoading(false); return; }
    setOrders(data.map(normalizeOrder));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!tenantId) return;
    // Limpiar canal anterior
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`active-tenant-orders-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        () => { fetch(); } // Re-fetch en cualquier cambio del tenant
      )
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetch]);

  // Segmentos derivados para UI
  const waitlistOrders = orders.filter(o => o.logistic_status === 'waitlist');
  const committedOrders = orders.filter(o =>
    o.logistic_status && ['kitchen_commit', 'preparing', 'ready_for_pickup'].includes(o.logistic_status)
  );
  const inDispatchOrders = orders.filter(o => o.isInDispatch);
  const unassignedOrders = orders.filter(o =>
    o.logistic_status === 'ready_for_pickup' && !o.rider_id
  );

  return {
    orders,
    loading,
    waitlistOrders,
    committedOrders,
    inDispatchOrders,
    unassignedOrders,
    refetch: fetch,
  };
}

// ─── Hook: useRiderActiveOrders (por rider) ───────────────────────────────────
/**
 * Para la vista del RIDER: pedidos asignados al rider que no están terminados.
 * Suscripción realtime en los pedidos del rider.
 */
export function useRiderActiveOrders(riderId: string | null | undefined) {
  const [orders, setOrders] = useState<ActiveOrderData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!riderId) { setLoading(false); return; }
    const { data, error: err } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('rider_id', riderId)
      .eq('delivery_type', 'delivery')
      .not('delivery_status', 'in', '(delivered,cancelled)')
      .order('created_at', { ascending: false });
    if (err || !data) { setLoading(false); return; }
    setOrders(data.map(normalizeOrder));
    setLoading(false);
  }, [riderId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!riderId) return;
    const channel = supabase
      .channel(`rider-active-orders-${riderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `rider_id=eq.${riderId}` },
        () => { fetch(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [riderId, fetch]);

  const currentOrder = orders[0] ?? null; // El más reciente es el activo

  return { orders, currentOrder, loading, refetch: fetch };
}
