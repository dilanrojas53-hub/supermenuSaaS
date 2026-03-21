/**
 * orderFlowEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fuente de verdad de la máquina de estados del flujo de pedidos.
 *
 * JERARQUÍA DE ESTADOS:
 *
 * payment_status:  pending → submitted → verified → rejected
 * kitchen_stage:   waiting_payment → queued → preparing → ready
 * delivery_stage:  waiting_kitchen → ready_for_dispatch → assigned → picked_up → en_route → delivered
 * status (visible): pendiente → pago_en_revision → en_cocina → listo → entregado | cancelado
 *
 * REGLA CRÍTICA (SINPE + delivery):
 *   Primero se valida el pago → después cocina trabaja → después rider entra.
 */

export type PaymentStatus = 'pending' | 'submitted' | 'verified' | 'rejected';
export type OrderStatus = 'pendiente' | 'pago_en_revision' | 'en_cocina' | 'listo' | 'entregado' | 'cancelado';
export type DeliveryType = 'dine_in' | 'takeout' | 'delivery';
export type PaymentMethod = 'sinpe' | 'efectivo' | 'tarjeta';

export interface OrderFlowData {
  status: string;
  payment_method?: string;
  payment_status?: string;
  payment_verified?: boolean;
  pago_en_revision?: boolean;
  sinpe_receipt_url?: string;
  delivery_type?: string;
  logistic_status?: string;
  delivery_status?: string;
}

/**
 * ¿El pago bloquea el flujo operativo?
 * Solo bloquea si es SINPE y el pago NO ha sido verificado aún.
 */
export function isPaymentBlocking(order: OrderFlowData): boolean {
  if (order.payment_method !== 'sinpe') return false;
  // Si ya está verificado, no bloquea
  if (order.payment_verified === true) return false;
  // Si payment_status es 'verified', no bloquea
  if (order.payment_status === 'verified') return false;
  // Si payment_status es 'paid', no bloquea (compatibilidad)
  if (order.payment_status === 'paid') return false;
  // En cualquier otro caso con SINPE, bloquea
  return true;
}

/**
 * ¿El pedido debe aparecer en cocina?
 * - Para delivery+SINPE: solo si el pago fue verificado
 * - Para delivery+efectivo/tarjeta: sí (el pago se cobra al entregar)
 * - Para dine_in/takeout: siempre (ya lo acepta el admin)
 */
export function shouldShowInKitchen(order: OrderFlowData): boolean {
  const isDelivery = order.delivery_type === 'delivery';
  const isSinpe = order.payment_method === 'sinpe';

  if (isDelivery && isSinpe) {
    // Solo si pago verificado
    return !isPaymentBlocking(order);
  }
  // Para todos los demás casos, si el status es en_cocina o listo, sí
  return order.status === 'en_cocina' || order.status === 'listo';
}

/**
 * ¿Se puede despachar al rider?
 * Requiere:
 * 1. Pago no bloqueante (verificado si es SINPE)
 * 2. Cocina marcó el pedido como listo (status === 'listo' o logistic_status === 'ready_for_pickup')
 */
export function canDispatchRider(order: OrderFlowData): boolean {
  if (isPaymentBlocking(order)) return false;
  const isReady = order.status === 'listo'
    || order.logistic_status === 'ready_for_pickup'
    || order.logistic_status === 'assigned'
    || order.logistic_status === 'picked_up'
    || order.logistic_status === 'en_route';
  return isReady;
}

/**
 * ¿El pedido puede entrar a cocina?
 * Alias semántico de shouldShowInKitchen para uso en AdminDashboard.
 */
export function canEnterKitchen(order: OrderFlowData): boolean {
  return shouldShowInKitchen(order);
}

/**
 * Derivar el stage operativo actual del pedido para UI interna.
 */
export type OperationalStage =
  | 'awaiting_payment'      // SINPE pendiente de comprobante
  | 'payment_submitted'     // Comprobante enviado, esperando validación
  | 'payment_verified'      // Pago validado
  | 'in_kitchen'            // Cocina preparando
  | 'kitchen_ready'         // Cocina marcó listo
  | 'dispatching'           // Asignando/buscando rider
  | 'rider_assigned'        // Rider asignado
  | 'picked_up'             // Rider recogió
  | 'en_route'              // En camino
  | 'delivered'             // Entregado
  | 'cancelled';            // Cancelado

export function deriveOperationalStage(order: OrderFlowData): OperationalStage {
  if (order.status === 'cancelado') return 'cancelled';
  if (order.status === 'entregado' || order.logistic_status === 'delivered') return 'delivered';

  const isSinpe = order.payment_method === 'sinpe';
  const isDelivery = order.delivery_type === 'delivery';

  // Estados de delivery logístico
  if (order.logistic_status === 'en_route' || order.delivery_status === 'en_route') return 'en_route';
  if (order.logistic_status === 'picked_up' || order.delivery_status === 'picked_up') return 'picked_up';
  if (order.logistic_status === 'assigned' || order.delivery_status === 'assigned') return 'rider_assigned';
  if (order.logistic_status === 'ready_for_pickup') return 'dispatching';

  // Cocina
  if (order.status === 'listo') return 'kitchen_ready';
  if (order.status === 'en_cocina') return 'in_kitchen';

  // Pago
  if (isSinpe && isDelivery) {
    if (order.payment_verified || order.payment_status === 'verified' || order.payment_status === 'paid') {
      return 'payment_verified';
    }
    if (order.pago_en_revision || order.payment_status === 'submitted' || (order.sinpe_receipt_url && order.sinpe_receipt_url.length > 0)) {
      return 'payment_submitted';
    }
    return 'awaiting_payment';
  }

  return 'awaiting_payment';
}

/**
 * Derivar el timeline visible al cliente según el tipo de pedido.
 */
export interface TimelineStep {
  key: string;
  label: string;
  sublabel?: string;
  icon: string;
  done: boolean;
  active: boolean;
}

export function deriveCustomerTimeline(order: OrderFlowData): TimelineStep[] {
  const stage = deriveOperationalStage(order);
  const isSinpe = order.payment_method === 'sinpe';
  const isDelivery = order.delivery_type === 'delivery';

  // Orden de stages para comparación
  const stageOrder: OperationalStage[] = [
    'awaiting_payment',
    'payment_submitted',
    'payment_verified',
    'in_kitchen',
    'kitchen_ready',
    'dispatching',
    'rider_assigned',
    'picked_up',
    'en_route',
    'delivered',
  ];
  const currentIdx = stageOrder.indexOf(stage);
  const isPast = (s: OperationalStage) => stageOrder.indexOf(s) < currentIdx;
  const isCurrent = (s: OperationalStage) => s === stage;
  const isDoneOrPast = (s: OperationalStage) => stageOrder.indexOf(s) <= currentIdx;

  if (isDelivery && isSinpe) {
    // Timeline completo: delivery + SINPE
    return [
      {
        key: 'received',
        label: 'Pedido recibido',
        icon: '✅',
        done: true,
        active: false,
      },
      {
        key: 'payment_submitted',
        label: 'Comprobante enviado',
        sublabel: isCurrent('payment_submitted') ? 'Verificando tu pago...' : undefined,
        icon: '📤',
        done: isDoneOrPast('payment_submitted') && !isCurrent('payment_submitted'),
        active: isCurrent('payment_submitted'),
      },
      {
        key: 'payment_verified',
        label: 'Pago confirmado',
        sublabel: isCurrent('payment_verified') ? '¡Pago aprobado! Entrando a cocina...' : undefined,
        icon: '💳',
        done: isDoneOrPast('payment_verified') && !isCurrent('payment_verified'),
        active: isCurrent('payment_verified'),
      },
      {
        key: 'in_kitchen',
        label: 'En preparación',
        sublabel: isCurrent('in_kitchen') ? '🔥 Tu pedido se está preparando ahora mismo' : undefined,
        icon: '👨‍🍳',
        done: isDoneOrPast('in_kitchen') && !isCurrent('in_kitchen'),
        active: isCurrent('in_kitchen'),
      },
      {
        key: 'rider_assigned',
        label: 'Rider asignado',
        sublabel: isCurrent('rider_assigned') || isCurrent('dispatching') ? 'Un repartidor viene a recoger tu pedido' : undefined,
        icon: '🛵',
        done: isDoneOrPast('rider_assigned') && !isCurrent('rider_assigned') && !isCurrent('dispatching'),
        active: isCurrent('rider_assigned') || isCurrent('dispatching') || isCurrent('kitchen_ready'),
      },
      {
        key: 'en_route',
        label: 'En camino',
        sublabel: isCurrent('en_route') || isCurrent('picked_up') ? '¡Tu pedido viene en camino!' : undefined,
        icon: '📍',
        done: isDoneOrPast('en_route') && !isCurrent('en_route') && !isCurrent('picked_up'),
        active: isCurrent('en_route') || isCurrent('picked_up'),
      },
      {
        key: 'delivered',
        label: 'Entregado',
        icon: '📦',
        done: stage === 'delivered',
        active: stage === 'delivered',
      },
    ];
  }

  if (isDelivery) {
    // Delivery sin SINPE (efectivo/tarjeta)
    return [
      { key: 'received', label: 'Pedido recibido', icon: '✅', done: true, active: false },
      {
        key: 'in_kitchen', label: 'En preparación',
        sublabel: isCurrent('in_kitchen') ? '🔥 Tu pedido se está preparando' : undefined,
        icon: '👨‍🍳',
        done: isDoneOrPast('in_kitchen') && !isCurrent('in_kitchen'),
        active: isCurrent('in_kitchen'),
      },
      {
        key: 'rider_assigned', label: 'Rider asignado',
        icon: '🛵',
        done: isDoneOrPast('rider_assigned') && !isCurrent('rider_assigned'),
        active: isCurrent('rider_assigned') || isCurrent('dispatching') || isCurrent('kitchen_ready'),
      },
      {
        key: 'en_route', label: 'En camino',
        sublabel: isCurrent('en_route') || isCurrent('picked_up') ? '¡Tu pedido viene en camino!' : undefined,
        icon: '📍',
        done: isDoneOrPast('en_route') && !isCurrent('en_route'),
        active: isCurrent('en_route') || isCurrent('picked_up'),
      },
      { key: 'delivered', label: 'Entregado', icon: '📦', done: stage === 'delivered', active: stage === 'delivered' },
    ];
  }

  // Dine-in / takeout
  return [
    { key: 'received', label: 'Pedido recibido', icon: '✅', done: true, active: false },
    {
      key: 'in_kitchen', label: 'En preparación',
      sublabel: isCurrent('in_kitchen') ? '🔥 Tu pedido se está preparando' : undefined,
      icon: '👨‍🍳',
      done: isPast('in_kitchen'),
      active: isCurrent('in_kitchen'),
    },
    {
      key: 'ready', label: '¡Listo para recoger!',
      icon: '✔️',
      done: isPast('kitchen_ready'),
      active: isCurrent('kitchen_ready'),
    },
    { key: 'delivered', label: 'Entregado', icon: '📦', done: stage === 'delivered', active: stage === 'delivered' },
  ];
}
