/**
 * paymentGating.ts — V1.1
 *
 * Helpers de gating de pagos por modalidad de pedido.
 *
 * DECISIÓN DE PRODUCTO (2026-05):
 *   - dine-in: cobro fuera de SmartMenu (datáfono / POS externo). Sin selector de pago.
 *   - takeout: el cliente selecciona método de pago (SINPE, Efectivo, Tarjeta) al pedir.
 *   - delivery: flujo completo de pago (SINPE, comprobante, validación).
 */

export type OrderChannel = 'dine_in' | 'takeout' | 'delivery';

/**
 * ¿Debe mostrarse la pantalla de selección de método de pago al cliente?
 * Takeout y delivery muestran el selector de pago.
 */
export function shouldShowPaymentUI(channel: OrderChannel): boolean {
  return channel === 'delivery' || channel === 'takeout';
}

/**
 * ¿Está habilitado el flujo completo de pago (SINPE, comprobante, validación) para este canal?
 */
export function isPaymentFlowEnabledForChannel(channel: OrderChannel): boolean {
  return channel === 'delivery' || channel === 'takeout';
}

/**
 * ¿Puede el cliente solicitar la cuenta como flujo real de cobro?
 * En dine-in, "pedir cuenta" es solo una notificación al mesero.
 */
export function canRequestBill(channel: OrderChannel): boolean {
  return true;
}

/**
 * ¿La solicitud de cuenta es solo una notificación (sin cobro real)?
 */
export function isBillRequestNotificationOnly(channel: OrderChannel): boolean {
  return channel === 'dine_in';
}

/**
 * Retorna el método de pago por defecto para pedidos dine-in.
 * Para takeout y delivery, el cliente selecciona.
 */
export function getDefaultPaymentMethodForChannel(channel: OrderChannel): string {
  if (channel === 'dine_in') return 'pos_externo';
  return ''; // takeout y delivery: el cliente selecciona
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
  const isDineIn = channel === 'dine_in';
  return {
    showPaymentSelection: !isDineIn,
    showSinpeUpload: channel === 'delivery' || channel === 'takeout',
    showBillRequest: true,
    billRequestLabel: isDineIn
      ? { es: 'Pedir la cuenta', en: 'Request bill' }
      : { es: 'Pagar', en: 'Pay' },
  };
}
