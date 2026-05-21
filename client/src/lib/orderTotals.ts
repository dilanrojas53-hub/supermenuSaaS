/**
 * orderTotals.ts — Motor centralizado de IVA, servicio de mesa y empaque.
 *
 * ── Lógica de servicio (10%) ──────────────────────────────────────────────────
 *
 * Los precios del menú pueden estar en dos modos:
 *
 * A) prices_include_service = true  (caso Costa Rica típico)
 *    Los precios YA incluyen el 10% de servicio.
 *    → Mesa/local:    mantener precio tal como está.
 *    → Para llevar:   quitar el servicio: precio_neto = precio / 1.10
 *    → Delivery:      quitar el servicio: precio_neto = precio / 1.10
 *
 * B) prices_include_service = false  (precios sin servicio)
 *    → Mesa/local:    sumar 10% de servicio (si service_enabled = true)
 *    → Para llevar:   NO sumar servicio
 *    → Delivery:      NO sumar servicio
 *
 * ── Empaque ──────────────────────────────────────────────────────────────────
 * Cargo separado, nunca confundido con el servicio.
 * Se aplica a para llevar, delivery o ambos según configuración.
 * Puede ser por pedido o por ítem.
 *
 * ── IVA ──────────────────────────────────────────────────────────────────────
 * Independiente del servicio. Si prices_include_tax = true, el IVA ya está
 * incluido en el precio (solo se desglosa informativamente).
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TaxSettings {
  tax_enabled: boolean;
  tax_rate: number;
  prices_include_tax: boolean;
  /** true = los precios del menú ya incluyen el 10% de servicio */
  prices_include_service: boolean;
  service_enabled: boolean;
  service_rate: number;
  service_applies_to: 'dine_in_only' | 'all_orders' | 'disabled';
  service_calculation_base: 'subtotal_before_tax' | 'subtotal_after_tax';
  packaging_enabled: boolean;
  packaging_amount: number;
  packaging_per: 'order' | 'item';
  packaging_applies_to: 'takeout' | 'delivery' | 'both';
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  tax_enabled: true,
  tax_rate: 13,
  prices_include_tax: true,
  prices_include_service: false,
  service_enabled: false,
  service_rate: 10,
  service_applies_to: 'disabled',
  service_calculation_base: 'subtotal_before_tax',
  packaging_enabled: false,
  packaging_amount: 0,
  packaging_per: 'order',
  packaging_applies_to: 'both',
};

export interface OrderTotalsInput {
  itemsSubtotal: number;
  orderType: 'dine_in' | 'takeout' | 'delivery' | string;
  hasTable?: boolean;
  taxSettings: TaxSettings | null | undefined;
  discountAmount?: number;
  itemCount?: number;
}

export interface OrderTotalsResult {
  itemsSubtotal: number;
  adjustedSubtotal: number;
  serviceStripped: number;
  serviceWasStripped: boolean;
  taxableBase: number;
  taxAmount: number;
  taxIncluded: boolean;
  taxRate: number;
  serviceApplied: boolean;
  serviceRate: number;
  serviceAmount: number;
  packagingAmount: number;
  discountAmount: number;
  totalAmount: number;
  orderType: string;
  isDineIn: boolean;
  breakdown: {
    label: string;
    amount: number;
    type: 'subtotal' | 'service_stripped' | 'tax_included' | 'tax_added' | 'service' | 'packaging' | 'discount' | 'total';
    negative?: boolean;
    informative?: boolean;
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
    itemCount = 1,
  } = input;

  const cfg: TaxSettings = taxSettings
    ? { ...DEFAULT_TAX_SETTINGS, ...taxSettings }
    : DEFAULT_TAX_SETTINGS;

  const taxRate = cfg.tax_enabled ? cfg.tax_rate : 0;
  const serviceRate = cfg.service_rate;

  // ─── Tipo de pedido ───
  const isDineIn = orderType === 'dine_in' || orderType === 'table' || orderType === 'mesa' || hasTable;
  const isTakeout = orderType === 'takeout' || orderType === 'para_llevar' || orderType === 'pickup';
  const isDelivery = orderType === 'delivery';
  const isOffPremise = isTakeout || isDelivery;

  // ─── Servicio incluido en precios ───
  let serviceStripped = 0;
  let serviceWasStripped = false;
  let adjustedSubtotal = itemsSubtotal;

  if (cfg.prices_include_service && cfg.service_enabled && isOffPremise) {
    const divisor = 1 + serviceRate / 100;
    adjustedSubtotal = Math.round(itemsSubtotal / divisor);
    serviceStripped = itemsSubtotal - adjustedSubtotal;
    serviceWasStripped = true;
  }

  // ─── Servicio adicional (solo si precios NO incluyen servicio) ───
  let serviceApplied = false;
  let serviceAmount = 0;

  if (!cfg.prices_include_service && cfg.service_enabled && cfg.service_applies_to !== 'disabled') {
    if (cfg.service_applies_to === 'all_orders') {
      serviceApplied = true;
    } else if (cfg.service_applies_to === 'dine_in_only') {
      serviceApplied = isDineIn;
    }
  }

  // ─── IVA ───
  let taxAmount = 0;
  let taxableBase = adjustedSubtotal;

  if (taxRate > 0) {
    if (cfg.prices_include_tax) {
      taxableBase = Math.round(adjustedSubtotal / (1 + taxRate / 100));
      taxAmount = adjustedSubtotal - taxableBase;
    } else {
      taxableBase = adjustedSubtotal;
      taxAmount = Math.round(adjustedSubtotal * taxRate / 100);
    }
  }

  // ─── Servicio adicional ───
  const serviceBase = cfg.service_calculation_base === 'subtotal_after_tax' && !cfg.prices_include_tax
    ? adjustedSubtotal + taxAmount
    : adjustedSubtotal;

  if (serviceApplied) {
    serviceAmount = Math.round(serviceBase * serviceRate / 100);
  }

  // ─── Empaque ───
  let packagingAmount = 0;
  if (cfg.packaging_enabled && cfg.packaging_amount > 0) {
    const packagingAppliesToThisOrder =
      cfg.packaging_applies_to === 'both' ||
      (cfg.packaging_applies_to === 'takeout' && isTakeout) ||
      (cfg.packaging_applies_to === 'delivery' && isDelivery);

    if (packagingAppliesToThisOrder) {
      packagingAmount = cfg.packaging_per === 'item'
        ? cfg.packaging_amount * Math.max(1, itemCount)
        : cfg.packaging_amount;
      packagingAmount = Math.round(packagingAmount);
    }
  }

  // ─── Total ───
  let rawTotal: number;
  if (cfg.prices_include_tax) {
    rawTotal = adjustedSubtotal + serviceAmount + packagingAmount - discountAmount;
  } else {
    rawTotal = adjustedSubtotal + taxAmount + serviceAmount + packagingAmount - discountAmount;
  }
  const totalAmount = Math.max(0, rawTotal);

  // ─── Desglose ───
  const breakdown: OrderTotalsResult['breakdown'] = [];

  const hasExtraLines = serviceWasStripped || serviceApplied || packagingAmount > 0 || discountAmount > 0 || (!cfg.prices_include_tax && taxAmount > 0);
  if (hasExtraLines) {
    breakdown.push({ label: 'Subtotal', amount: itemsSubtotal, type: 'subtotal' });
  }

  if (serviceWasStripped && serviceStripped > 0) {
    breakdown.push({
      label: `Servicio ${serviceRate}% (no aplica)`,
      amount: serviceStripped,
      type: 'service_stripped',
      negative: true,
    });
  }

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

  if (serviceApplied && serviceAmount > 0) {
    breakdown.push({ label: `Servicio ${serviceRate}%`, amount: serviceAmount, type: 'service' });
  }

  if (packagingAmount > 0) {
    const packLabel = cfg.packaging_per === 'item'
      ? `Empaque (${itemCount} ítem${itemCount > 1 ? 's' : ''})`
      : 'Empaque';
    breakdown.push({ label: packLabel, amount: packagingAmount, type: 'packaging' });
  }

  if (discountAmount > 0) {
    breakdown.push({ label: 'Descuento', amount: discountAmount, type: 'discount', negative: true });
  }

  breakdown.push({ label: 'Total', amount: totalAmount, type: 'total' });

  return {
    itemsSubtotal,
    adjustedSubtotal,
    serviceStripped,
    serviceWasStripped,
    taxableBase,
    taxAmount,
    taxIncluded: cfg.prices_include_tax,
    taxRate,
    serviceApplied,
    serviceRate,
    serviceAmount,
    packagingAmount,
    discountAmount,
    totalAmount,
    orderType: orderType || 'dine_in',
    isDineIn,
    breakdown,
  };
}

// ─── Cargar TaxSettings desde Supabase ───────────────────────────────────────

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
    prices_include_service: data.prices_include_service ?? DEFAULT_TAX_SETTINGS.prices_include_service,
    service_enabled: data.service_enabled ?? DEFAULT_TAX_SETTINGS.service_enabled,
    service_rate: data.service_rate ?? DEFAULT_TAX_SETTINGS.service_rate,
    service_applies_to: data.service_applies_to ?? DEFAULT_TAX_SETTINGS.service_applies_to,
    service_calculation_base: data.service_calculation_base ?? DEFAULT_TAX_SETTINGS.service_calculation_base,
    packaging_enabled: data.packaging_enabled ?? DEFAULT_TAX_SETTINGS.packaging_enabled,
    packaging_amount: data.packaging_amount ?? DEFAULT_TAX_SETTINGS.packaging_amount,
    packaging_per: data.packaging_per ?? DEFAULT_TAX_SETTINGS.packaging_per,
    packaging_applies_to: data.packaging_applies_to ?? DEFAULT_TAX_SETTINGS.packaging_applies_to,
  };
}
