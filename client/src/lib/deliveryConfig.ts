/**
 * deliveryConfig.ts — Tipos, helpers y lógica de negocio para Delivery Operable
 *
 * Épica: Delivery Operable sin quitar domicilio
 * Versión: 1.0.0
 */

// ─── Tipos base ────────────────────────────────────────────────────────────────

/** Rango de distancia con tarifa asociada */
export interface DeliveryDistanceRange {
  id: string;
  min_km: number;
  max_km: number;
  fee: number;
}

/** Métodos de pago disponibles para delivery */
export interface DeliveryPaymentConfig {
  sinpe_enabled: boolean;
  efectivo_enabled: boolean;
  tarjeta_enabled: boolean;
}

/** Reglas operativas del flujo de delivery */
export interface DeliveryOperationalRules {
  /** ¿Requiere validación de pago antes de pasar a cocina? */
  requires_payment_before_kitchen: boolean;
  /** ¿Requiere aprobación manual del admin antes de cocina? */
  requires_manual_approval: boolean;
  /** ¿Cuándo entra el pedido al flujo del rider? */
  rider_dispatch_trigger: 'kitchen_ready' | 'manual' | 'x_minutes_before';
  /** Minutos antes de que termine la preparación para asignar rider (solo si trigger = x_minutes_before) */
  rider_dispatch_minutes_before: number;
  /** ¿Cuándo se considera completado el pedido? */
  completion_mode: 'on_pickup' | 'on_delivery';
}

/** Configuración de tiempos */
export interface DeliveryTimesConfig {
  base_prep_minutes: number;
  extra_prep_minutes: number;
  min_pickup_minutes: number;
}

/** Disponibilidad y switches de cocina */
export interface DeliveryAvailabilityConfig {
  delivery_enabled: boolean;
  /** Switch global: ¿acepta pedidos desde el menú cliente? */
  orders_enabled: boolean;
  /** Switches por canal */
  dine_in_orders_enabled: boolean;
  takeout_orders_enabled: boolean;
  delivery_orders_enabled: boolean;
  /** Mensaje personalizado cuando está cerrado */
  closed_message: string;
}

/** Configuración completa de delivery (refleja delivery_settings en Supabase) */
export interface DeliveryConfig {
  tenant_id: string;
  // Disponibilidad
  delivery_enabled: boolean;
  orders_enabled: boolean;
  dine_in_orders_enabled: boolean;
  takeout_orders_enabled: boolean;
  delivery_orders_enabled: boolean;
  closed_message: string;
  // Cobertura
  restaurant_lat: number | null;
  restaurant_lon: number | null;
  coverage_radius_km: number;
  // Tarifas
  delivery_fee: number;
  base_km: number;
  distance_ranges: DeliveryDistanceRange[];
  allow_manual_fee: boolean;
  manual_fee_message: string;
  fee_variability_msg: string;
  fee_presets: number[];
  // Pagos
  sinpe_enabled: boolean;
  efectivo_enabled: boolean;
  tarjeta_enabled: boolean;
  // Reglas operativas
  requires_payment_before_kitchen: boolean;
  requires_manual_approval: boolean;
  rider_dispatch_trigger: 'kitchen_ready' | 'manual' | 'x_minutes_before';
  rider_dispatch_minutes_before: number;
  completion_mode: 'on_pickup' | 'on_delivery';
  // Tiempos
  base_eta_minutes: number;
  base_prep_minutes: number;
  extra_prep_minutes: number;
  min_pickup_minutes: number;
  // Políticas de orquestación (F9)
  commit_buffer_pct: number;
  max_wait_minutes: number;
  min_order_amount: number;
}

/** Valores por defecto para una configuración nueva */
export const DEFAULT_DELIVERY_CONFIG: Omit<DeliveryConfig, 'tenant_id'> = {
  delivery_enabled: false,
  orders_enabled: true,
  dine_in_orders_enabled: true,
  takeout_orders_enabled: true,
  delivery_orders_enabled: true,
  closed_message: 'Por el momento no estamos recibiendo pedidos desde el menú.',
  restaurant_lat: null,
  restaurant_lon: null,
  coverage_radius_km: 5,
  delivery_fee: 1000,
  base_km: 3,
  distance_ranges: [],
  allow_manual_fee: true,
  manual_fee_message: 'El costo de envío será confirmado por el restaurante.',
  fee_variability_msg: 'El costo de envío puede variar según la distancia exacta.',
  fee_presets: [1000, 1500, 2000, 2500, 3000],
  sinpe_enabled: true,
  efectivo_enabled: true,
  tarjeta_enabled: false,
  requires_payment_before_kitchen: false,
  requires_manual_approval: false,
  rider_dispatch_trigger: 'kitchen_ready',
  rider_dispatch_minutes_before: 5,
  completion_mode: 'on_delivery',
  base_eta_minutes: 30,
  base_prep_minutes: 20,
  extra_prep_minutes: 0,
  min_pickup_minutes: 15,
  commit_buffer_pct: 80,
  max_wait_minutes: 20,
  min_order_amount: 0,
};

// ─── Helpers de lógica de negocio ─────────────────────────────────────────────

/**
 * Calcula la tarifa de envío para una distancia dada.
 * - Si hay rangos configurados, usa el rango que corresponde.
 * - Si no hay rangos o la distancia cae fuera, retorna null (costo por confirmar).
 * - Si no hay rangos configurados, usa la tarifa base.
 */
export function getDeliveryFeeForDistance(
  distanceKm: number,
  config: Pick<DeliveryConfig, 'distance_ranges' | 'delivery_fee' | 'allow_manual_fee'>
): { fee: number | null; mode: 'range' | 'base' | 'manual' | 'out_of_range' } {
  const { distance_ranges, delivery_fee, allow_manual_fee } = config;

  // Si hay rangos configurados, buscar el rango que aplica
  if (distance_ranges && distance_ranges.length > 0) {
    const range = distance_ranges.find(
      r => distanceKm >= r.min_km && distanceKm < r.max_km
    );
    if (range) {
      return { fee: range.fee, mode: 'range' };
    }
    // Fuera de todos los rangos
    if (allow_manual_fee) {
      return { fee: null, mode: 'manual' };
    }
    return { fee: null, mode: 'out_of_range' };
  }

  // Sin rangos: usar tarifa base
  return { fee: delivery_fee, mode: 'base' };
}

/**
 * Retorna los métodos de pago disponibles para el cliente según la configuración del admin.
 * Siempre retorna al menos un método (si todos están desactivados, retorna efectivo como fallback).
 */
export function getAvailablePaymentMethods(
  config: Pick<DeliveryConfig, 'sinpe_enabled' | 'efectivo_enabled' | 'tarjeta_enabled'>
): Array<'sinpe' | 'efectivo' | 'tarjeta'> {
  const methods: Array<'sinpe' | 'efectivo' | 'tarjeta'> = [];
  if (config.sinpe_enabled) methods.push('sinpe');
  if (config.efectivo_enabled) methods.push('efectivo');
  if (config.tarjeta_enabled) methods.push('tarjeta');
  // Fallback: si el admin desactivó todo, mostrar efectivo
  if (methods.length === 0) methods.push('efectivo');
  return methods;
}

/**
 * Determina si el restaurante puede aceptar pedidos ahora.
 * Considera el switch global y el switch por canal.
 */
export function canAcceptOrdersNow(
  config: Pick<DeliveryConfig, 'orders_enabled' | 'dine_in_orders_enabled' | 'takeout_orders_enabled' | 'delivery_orders_enabled'>,
  channel: 'dine_in' | 'takeout' | 'delivery'
): boolean {
  if (!config.orders_enabled) return false;
  if (channel === 'dine_in') return config.dine_in_orders_enabled;
  if (channel === 'takeout') return config.takeout_orders_enabled;
  if (channel === 'delivery') return config.delivery_orders_enabled;
  return false;
}

/**
 * Determina si un pedido debe entrar a cocina automáticamente.
 * Considera las reglas de validación de pago y aprobación manual.
 */
export function shouldEnterKitchen(
  order: { payment_method: string; payment_verified?: boolean },
  config: Pick<DeliveryConfig, 'requires_payment_before_kitchen' | 'requires_manual_approval'>
): boolean {
  if (config.requires_manual_approval) return false;
  if (config.requires_payment_before_kitchen) {
    // Solo entra si el pago está verificado o el método no es SINPE
    if (order.payment_method === 'sinpe' && !order.payment_verified) return false;
  }
  return true;
}

/**
 * Determina si se debe asignar rider para un pedido.
 */
export function shouldDispatchRider(
  order: { status: string; kitchen_committed_at?: string | null },
  config: Pick<DeliveryConfig, 'rider_dispatch_trigger'>
): boolean {
  if (config.rider_dispatch_trigger === 'kitchen_ready') {
    return order.status === 'listo';
  }
  if (config.rider_dispatch_trigger === 'manual') {
    return false; // El admin lo asigna manualmente
  }
  // x_minutes_before: se maneja por el motor de orquestación
  return false;
}

/**
 * Determina si un pedido delivery está completado según la configuración.
 */
export function isOrderCompleted(
  order: { status: string; logistic_status?: string; delivery_status?: string },
  config: Pick<DeliveryConfig, 'completion_mode'>
): boolean {
  if (config.completion_mode === 'on_pickup') {
    // Completado cuando el rider recoge el pedido
    return order.logistic_status === 'picked_up' || order.delivery_status === 'picked_up';
  }
  // on_delivery: completado cuando el rider marca entregado
  return order.status === 'entregado' || order.delivery_status === 'delivered';
}

/**
 * Valida que la configuración de pagos tenga al menos un método activo.
 */
export function validatePaymentConfig(
  config: Pick<DeliveryConfig, 'sinpe_enabled' | 'efectivo_enabled' | 'tarjeta_enabled'>
): { valid: boolean; error?: string } {
  const hasAny = config.sinpe_enabled || config.efectivo_enabled || config.tarjeta_enabled;
  if (!hasAny) {
    return { valid: false, error: 'Debes activar al menos un método de pago para delivery.' };
  }
  return { valid: true };
}

/**
 * Genera un ID único para un rango de distancia.
 */
export function generateRangeId(): string {
  return `range_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Valida que los rangos de distancia no se solapan y están bien ordenados.
 */
export function validateDistanceRanges(
  ranges: DeliveryDistanceRange[]
): { valid: boolean; error?: string } {
  if (ranges.length === 0) return { valid: true };

  // Ordenar por min_km
  const sorted = [...ranges].sort((a, b) => a.min_km - b.min_km);

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.min_km >= r.max_km) {
      return { valid: false, error: `Rango inválido: el mínimo (${r.min_km}) debe ser menor al máximo (${r.max_km}).` };
    }
    if (r.fee < 0) {
      return { valid: false, error: `La tarifa no puede ser negativa.` };
    }
    if (i > 0 && sorted[i - 1].max_km !== r.min_km) {
      // Advertencia: hay un gap entre rangos (no es error, pero sí advertencia)
      // Se permite para que el admin defina zonas no cubiertas
    }
  }

  return { valid: true };
}

/** Etiquetas legibles para los modos de completado */
export const COMPLETION_MODE_LABELS: Record<DeliveryConfig['completion_mode'], string> = {
  on_pickup: 'Cuando el rider recoge el pedido',
  on_delivery: 'Cuando el rider marca entregado',
};

/** Etiquetas legibles para los triggers de despacho */
export const DISPATCH_TRIGGER_LABELS: Record<DeliveryConfig['rider_dispatch_trigger'], string> = {
  kitchen_ready: 'Cuando cocina lo marca listo',
  manual: 'Manualmente por el admin',
  x_minutes_before: 'X minutos antes de terminar preparación',
};
