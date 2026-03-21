/**
 * plans.ts — Metadata de planes: nombres, precios, colores y descripción comercial
 *
 * Los identifiers internos (basic | pro | premium) se mantienen por compatibilidad con la BD.
 * Los nombres visibles son: Esencial | Operación | Growth
 * El add-on Delivery OS es separable de todos los planes.
 */

import type { Capability } from './capabilities';

// ── Tipo de plan ──────────────────────────────────────────────────────────────

export type PlanTier = 'basic' | 'pro' | 'premium';

// ── Metadata de plan ──────────────────────────────────────────────────────────

export interface PlanMeta {
  tier: PlanTier;
  /** Nombre visible al cliente */
  displayName: string;
  /** Nombre corto para badges y etiquetas */
  shortName: string;
  /** Descripción comercial */
  description: string;
  /** Precio mensual en colones */
  monthlyPrice: number;
  /** Precio anual en colones (total) */
  annualPrice: number;
  /** Ahorro anual en colones */
  annualSavings: number;
  /** Color primario del plan */
  color: string;
  /** Color de fondo para badges */
  bgColor: string;
  /** Si este plan es el recomendado */
  highlighted: boolean;
  /** Badge especial (ej: "MÁS POPULAR") */
  badge?: string;
}

export const PLAN_META: Record<PlanTier, PlanMeta> = {
  basic: {
    tier: 'basic',
    displayName: 'Esencial',
    shortName: 'Esencial',
    description: 'Ideal para empezar a digitalizar tu menú y recibir pedidos directamente desde la mesa.',
    monthlyPrice: 19900,
    annualPrice: 191040,
    annualSavings: 47760,
    color: '#92400E',
    bgColor: '#FEF3C7',
    highlighted: false,
  },
  pro: {
    tier: 'pro',
    displayName: 'Operación',
    shortName: 'Operación',
    description: 'Para restaurantes que quieren operar con equipo, KDS y control total de pedidos.',
    monthlyPrice: 29900,
    annualPrice: 287040,
    annualSavings: 71760,
    color: '#D97706',
    bgColor: '#FEF3C7',
    highlighted: true,
    badge: 'MÁS POPULAR',
  },
  premium: {
    tier: 'premium',
    displayName: 'Growth',
    shortName: 'Growth',
    description: 'Control total con IA, analítica avanzada, rendimiento del equipo y herramientas de decisión.',
    monthlyPrice: 44900,
    annualPrice: 431040,
    annualSavings: 107760,
    color: '#7C3AED',
    bgColor: '#EDE9FE',
    highlighted: false,
  },
};

// ── Metadata del add-on Delivery OS ──────────────────────────────────────────

export interface AddOnMeta {
  key: 'delivery_os';
  displayName: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  annualSavings: number;
  color: string;
  bgColor: string;
  capabilities: Capability[];
}

export const DELIVERY_OS_META: AddOnMeta = {
  key: 'delivery_os',
  displayName: 'Delivery OS',
  description: 'Módulo completo de delivery: checkout, riders, dispatch, tracking y zonas. Compatible con cualquier plan.',
  monthlyPrice: 19900,
  annualPrice: 191040,
  annualSavings: 47760,
  color: '#0EA5E9',
  bgColor: '#E0F2FE',
  capabilities: [
    'delivery_checkout',
    'delivery_coverage',
    'delivery_eta',
    'delivery_rider_app',
    'delivery_dispatch',
    'delivery_tracking',
    'delivery_zones',
    'delivery_analytics',
    'delivery_history',
  ],
};

// ── Helpers de metadata ───────────────────────────────────────────────────────

export function getPlanMeta(tier: PlanTier): PlanMeta {
  return PLAN_META[tier] ?? PLAN_META['basic'];
}

export function formatPlanPrice(price: number): string {
  return `₡${price.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Etiquetas legacy para compatibilidad con código existente */
export const PLAN_LABELS: Record<PlanTier, { label: string; color: string; bgColor: string }> = {
  basic:   { label: 'Esencial',  color: '#92400E', bgColor: '#FEF3C7' },
  pro:     { label: 'Operación', color: '#D97706', bgColor: '#FEF3C7' },
  premium: { label: 'Growth',    color: '#7C3AED', bgColor: '#EDE9FE' },
};
