/**
 * orderTotals.ts — Motor centralizado de IVA y servicio de mesa.
 *
 * Regla principal de SuperMenu:
 * Los precios del menú son PRECIOS FINALES. Ya incluyen IVA y servicio.
 * Por defecto NO se suma ningún cargo adicional.
 *
 * La configuración de tax_settings permite al admin activar cargos adicionales
 * si su modelo de negocio lo requiere (ej: servicio no incluido).
 *
 * DEFAULT: prices_include_tax=true, service_enabled=false
 * → total = suma de item.price × cantidad (sin modificaciones)
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TaxSettings {
  /** Si false, no se muestra ni calcula IVA */
  tax_enabled: boolean;
  /** Porcentaje de IVA, default 13 */
  tax_rate: number;
  /** true = los precios del menú ya incluyen IVA (CR por defecto) */
  prices_include_tax: boolean;
  /** Si false, no se aplica cargo de servicio */
  service_enabled: boolean;
  /** Porcentaje de servicio, default 10 */
  service_rate: number;
  /** Cuándo aplica el servicio */
  service_applies_to: 'dine_in_only' | 'all_orders' | 'disabled';
  /** Base de cálculo del servicio */
  service_calculation_base: 'subtotal_before_tax' | 'subtotal_after_tax';
}

/**
 * Defaults seguros: precios finales, sin cargos adicionales.
 * Si no hay configuración en BD, el total = suma de item.price × cantidad.
 */
export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  tax_enabled: true,
  tax_rate: 13,
  prices_include_tax: true,   // Los precios ya incluyen IVA
  service_enabled: false,     // NO sumar servicio por defecto
  service_rate: 10,
  service_applies_to: 'disabled',
  service_calculation_base: 'subtotal_before_tax',
};

export interface OrderTotalsInput {
  /** Suma de precios de items × cantidades (ya con modificadores) */
  itemsSubtotal: number;
  /** Tipo de pedido: 'dine_in' | 'takeout' | 'delivery' */
  orderType: 'dine_in' | 'takeout' | 'delivery' | string;
  /** true si hay mesa seleccionada (fuerza servicio aunque orderType no sea dine_in) */
  hasTable?: boolean;
  /** Configuración fiscal del restaurante */
  taxSettings: TaxSettings | null | undefined;
  /** Descuento de promo/cupón ya calculado (se resta antes de aplicar servicio) */
  discountAmount?: number;
}

export interface OrderTotalsResult {
  /** Suma de items antes de cualquier impuesto */
  itemsSubtotal: number;
  /** Base imponible */
  taxableBase: number;
  /** Monto de IVA (incluido = solo informativo, no suma al total) */
  taxAmount: number;
  /** true si el IVA ya estaba incluido en los precios */
  taxIncluded: boolean;
  /** Porcentaje de IVA usado */
  taxRate: number;
  /** Si se aplicó cargo de servicio adicional */
  serviceApplied: boolean;
  /** Porcentaje de servicio usado */
  serviceRate: number;
  /** Monto de servicio adicional (0 si prices_include_tax) */
  serviceAmount: number;
  /** Descuento aplicado */
  discountAmount: number;
  /** Total final a cobrar */
  totalAmount: number;
  /** Desglose legible para UI */
  breakdown: {
    label: string;
    amount: number;
    type: 'subtotal' | 'tax_included' | 'tax_added' | 'service' | 'discount' | 'total';
    negative?: boolean;
    informative?: boolean; // true = solo texto, no altera el total
  }[];
}

// ─── Función principal ────────────────────────────────────────────────────────

export function calculateOrderTotals(input: OrderTotalsInput): OrderTotalsResult {
  const {
    itemsSubtotal,
    orderType,
    hasTable = false,
    taxSettings,
    discountAmount = 0,
  } = input;

  // Usar defaults si no hay configuración
  const cfg: TaxSettings = taxSettings ?? DEFAULT_TAX_SETTINGS;

  const taxRate = cfg.tax_enabled ? cfg.tax_rate : 0;
  const serviceRate = cfg.service_enabled ? cfg.service_rate : 0;

  // ─── Determinar si aplica servicio ADICIONAL ───
  // Solo aplica si service_enabled=true Y service_applies_to != 'disabled'
  // Y los precios NO incluyen servicio (prices_include_tax=false implica que tampoco incluye servicio)
  const isDineIn = orderType === 'dine_in' || orderType === 'table' || orderType === 'mesa' || hasTable;
  let serviceApplied = false;

  // Si los precios ya incluyen IVA y servicio, NUNCA sumar servicio adicional
  if (cfg.service_enabled && cfg.service_applies_to !== 'disabled' && !cfg.prices_include_tax) {
    if (cfg.service_applies_to === 'all_orders') {
      serviceApplied = true;
    } else if (cfg.service_applies_to === 'dine_in_only') {
      serviceApplied = isDineIn;
    }
  }

  // ─── Cálculo de IVA ───
  let taxAmount = 0;
  let taxableBase = itemsSubtotal;

  if (taxRate > 0) {
    if (cfg.prices_include_tax) {
      // Desglosar IVA incluido: solo informativo, NO suma al total
      taxableBase = Math.round(itemsSubtotal / (1 + taxRate / 100));
      taxAmount = itemsSubtotal - taxableBase;
    } else {
      // Sumar IVA sobre el subtotal (precios sin IVA)
      taxableBase = itemsSubtotal;
      taxAmount = Math.round(itemsSubtotal * taxRate / 100);
    }
  }

  // ─── Base para el servicio ───
  const serviceBase = cfg.service_calculation_base === 'subtotal_after_tax' && !cfg.prices_include_tax
    ? itemsSubtotal + taxAmount
    : itemsSubtotal;

  // ─── Cálculo de servicio ───
  const serviceAmount = serviceApplied ? Math.round(serviceBase * serviceRate / 100) : 0;

  // ─── Total final ───
  // Si IVA incluido: total = subtotal - descuento (NO se suma IVA ni servicio)
  // Si IVA no incluido: total = subtotal + IVA + servicio - descuento
  const rawTotal = cfg.prices_include_tax
    ? itemsSubtotal - discountAmount          // precios finales: solo restar descuento
    : itemsSubtotal + taxAmount + serviceAmount - discountAmount;

  const totalAmount = Math.max(0, rawTotal);

  // ─── Desglose para UI ───
  const breakdown: OrderTotalsResult['breakdown'] = [];

  // Solo mostrar subtotal si hay descuento o cargos adicionales
  if (discountAmount > 0 || serviceApplied || !cfg.prices_include_tax) {
    breakdown.push({ label: 'Subtotal', amount: itemsSubtotal, type: 'subtotal' });
  }

  // IVA incluido: solo informativo (no suma al total)
  if (taxRate > 0 && cfg.prices_include_tax) {
    breakdown.push({
      label: `IVA incluido ${taxRate}%`,
      amount: taxAmount,
      type: 'tax_included',
      informative: true,
    });
  } else if (taxRate > 0 && !cfg.prices_include_tax) {
    breakdown.push({ label: `IVA ${taxRate}%`, amount: taxAmount, type: 'tax_added' });
  }

  // Servicio adicional (solo si realmente se suma)
  if (serviceApplied && serviceAmount > 0) {
    breakdown.push({ label: `Servicio ${serviceRate}%`, amount: serviceAmount, type: 'service' });
  }

  if (discountAmount > 0) {
    breakdown.push({ label: 'Descuento', amount: discountAmount, type: 'discount', negative: true });
  }

  breakdown.push({ label: 'Total', amount: totalAmount, type: 'total' });

  return {
    itemsSubtotal,
    taxableBase,
    taxAmount,
    taxIncluded: cfg.prices_include_tax,
    taxRate,
    serviceApplied,
    serviceRate,
    serviceAmount,
    discountAmount,
    totalAmount,
    breakdown,
  };
}

// ─── Hook para cargar TaxSettings desde Supabase ─────────────────────────────

import { supabase } from './supabase';

export async function loadTaxSettings(tenantId: string): Promise<TaxSettings | null> {
  const { data, error } = await supabase
    .from('tax_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    tax_enabled: data.tax_enabled ?? DEFAULT_TAX_SETTINGS.tax_enabled,
    tax_rate: data.tax_rate ?? DEFAULT_TAX_SETTINGS.tax_rate,
    prices_include_tax: data.prices_include_tax ?? DEFAULT_TAX_SETTINGS.prices_include_tax,
    service_enabled: data.service_enabled ?? DEFAULT_TAX_SETTINGS.service_enabled,
    service_rate: data.service_rate ?? DEFAULT_TAX_SETTINGS.service_rate,
    service_applies_to: data.service_applies_to ?? DEFAULT_TAX_SETTINGS.service_applies_to,
    service_calculation_base: data.service_calculation_base ?? DEFAULT_TAX_SETTINGS.service_calculation_base,
  };
}
