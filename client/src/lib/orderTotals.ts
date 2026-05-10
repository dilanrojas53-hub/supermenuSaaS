/**
 * orderTotals.ts — Motor centralizado de IVA y servicio de mesa.
 *
 * Reglas:
 * - Si prices_include_tax = true: NO se suma IVA adicional. Se desglosa el IVA incluido.
 * - Si prices_include_tax = false: se suma el IVA sobre el subtotal.
 * - Servicio 10% solo en dine_in (o según service_applies_to).
 * - Nunca cobrar IVA dos veces.
 *
 * Usar esta función en TODOS los lugares que calculen o muestren totales.
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

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  tax_enabled: true,
  tax_rate: 13,
  prices_include_tax: true,
  service_enabled: true,
  service_rate: 10,
  service_applies_to: 'dine_in_only',
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
  /** Base imponible (= itemsSubtotal si prices_include_tax, sino igual) */
  taxableBase: number;
  /** Monto de IVA (incluido o sumado según configuración) */
  taxAmount: number;
  /** true si el IVA ya estaba incluido en los precios */
  taxIncluded: boolean;
  /** Porcentaje de IVA usado */
  taxRate: number;
  /** Si se aplicó cargo de servicio */
  serviceApplied: boolean;
  /** Porcentaje de servicio usado */
  serviceRate: number;
  /** Monto de servicio */
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

  // ─── Determinar si aplica servicio ───
  const isDineIn = orderType === 'dine_in' || orderType === 'table' || orderType === 'mesa' || hasTable;
  let serviceApplied = false;
  if (cfg.service_enabled && cfg.service_applies_to !== 'disabled') {
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
      // Desglosar IVA incluido: base = total / (1 + rate/100)
      taxableBase = Math.round(itemsSubtotal / (1 + taxRate / 100));
      taxAmount = itemsSubtotal - taxableBase;
    } else {
      // Sumar IVA sobre el subtotal
      taxableBase = itemsSubtotal;
      taxAmount = Math.round(itemsSubtotal * taxRate / 100);
    }
  }

  // ─── Base para el servicio ───
  const serviceBase = cfg.service_calculation_base === 'subtotal_after_tax' && !cfg.prices_include_tax
    ? itemsSubtotal + taxAmount
    : itemsSubtotal; // si IVA incluido, la base es el subtotal bruto

  // ─── Cálculo de servicio ───
  const serviceAmount = serviceApplied ? Math.round(serviceBase * serviceRate / 100) : 0;

  // ─── Total final ───
  // Si IVA incluido: total = subtotal + servicio - descuento
  // Si IVA no incluido: total = subtotal + IVA + servicio - descuento
  const rawTotal = cfg.prices_include_tax
    ? itemsSubtotal + serviceAmount - discountAmount
    : itemsSubtotal + taxAmount + serviceAmount - discountAmount;

  const totalAmount = Math.max(0, rawTotal);

  // ─── Desglose para UI ───
  const breakdown: OrderTotalsResult['breakdown'] = [];

  breakdown.push({ label: 'Subtotal', amount: itemsSubtotal, type: 'subtotal' });

  if (taxRate > 0 && cfg.prices_include_tax) {
    breakdown.push({ label: `IVA incluido ${taxRate}%`, amount: taxAmount, type: 'tax_included' });
  } else if (taxRate > 0 && !cfg.prices_include_tax) {
    breakdown.push({ label: `IVA ${taxRate}%`, amount: taxAmount, type: 'tax_added' });
  }

  if (serviceApplied && serviceAmount > 0) {
    breakdown.push({ label: `Servicio de mesa ${serviceRate}%`, amount: serviceAmount, type: 'service' });
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
