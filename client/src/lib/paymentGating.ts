/**
 * paymentGating.ts — V1.0
 *
 * Helpers de gating de pagos por modalidad de pedido.
 *
 * DECISIÓN DE PRODUCTO (2026-03):
 *   En dine-in y takeout, el cobro ocurre fuera de SmartMenu (datáfono / POS externo).
 *   La lógica de pago se mantiene intacta en backend; solo se oculta la UI al cliente.
 *   Delivery mantiene el flujo completo de pago (SINPE, comprobante, validación).
 *
 * IMPORTANTE: NO eliminar esta lógica. Cuando se integre POS/datáfono real,
 *   se activará por canal cambiando los valores de retorno aquí.
 */

export type OrderChannel = 'dine_in' | 'takeout' | 'delivery';

/**
 * ¿Debe mostrarse la pantalla de selección de método de pago al cliente?
 * Solo delivery tiene flujo de pago visible por ahora.
 */
export function shouldShowPaymentUI(channel: OrderChannel): boolean {
  return channel === 'delivery';
}

/**
 * ¿Está habilitado el flujo completo de pago (SINPE, comprobante, validación) para este canal?
 */
export function isPaymentFlowEnabledForChannel(channel: OrderChannel): boolean {
  return channel === 'delivery';
}

/**
 * ¿Puede el cliente solicitar la cuenta como flujo real de cobro?
 * En dine-in/takeout, "pedir cuenta" es solo una notificación al mesero.
 */
export function canRequestBill(channel: OrderChannel): boolean {
  // Siempre se puede pedir cuenta, pero en dine-in es solo notificación al mesero
  return true;
}

/**
 * ¿La solicitud de cuenta es solo una notificación (sin cobro real)?
 */
export function isBillRequestNotificationOnly(channel: OrderChannel): boolean {
  return channel !== 'delivery';
}

/**
 * Retorna el método de pago por defecto para pedidos dine-in/takeout.
 * Se guarda en DB para mantener trazabilidad, pero no se muestra al cliente.
 */
export function getDefaultPaymentMethodForChannel(channel: OrderChannel): string {
  if (channel === 'dine_in') return 'pos_externo';
  if (channel === 'takeout') return 'pos_externo';
  return ''; // delivery: el cliente selecciona
}

/**
 * Retorna los CTAs disponibles para el cliente según el tipo de pedido.
 */
export function getCustomerCTAsByOrderType(channel: OrderChannel): {
  showPaymentSelection: boolean;
  showSinpeUpload: boolean;
  showBillRequest: boolean;
  billRequestLabel: { es: string; en: string };
} {
  const isDineIn = channel === 'dine_in' || channel === 'takeout';
  return {
    showPaymentSelection: !isDineIn,
    showSinpeUpload: channel === 'delivery',
    showBillRequest: true, // siempre visible
    billRequestLabel: isDineIn
      ? { es: 'Pedir la cuenta', en: 'Request bill' }
      : { es: 'Pagar', en: 'Pay' },
  };
}
