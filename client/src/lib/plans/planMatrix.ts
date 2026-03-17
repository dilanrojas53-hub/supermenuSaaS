/**
 * planMatrix.ts — Mapping plan → capabilities y helpers tipados
 *
 * PLANES:
 *   basic   → Esencial    (menú digital + pedidos básicos)
 *   pro     → Operación   (todo lo anterior + KDS, staff, modificadores, analítica base)
 *   premium → Growth      (todo lo anterior + IA, analítica avanzada, corte inteligente)
 *
 * ADD-ON:
 *   delivery_os → Delivery OS (separable, se activa con has_delivery_os = true en tenant)
 *
 * COMPATIBILIDAD: Los identifiers basic | pro | premium se mantienen en la BD.
 * Solo cambia el nombre visible y las capabilities detrás.
 */

import type { Capability } from './capabilities';
import type { PlanTier } from './plans';

// ── Capabilities por plan ─────────────────────────────────────────────────────

const CORE_CAPABILITIES: Capability[] = [
  'core_menu',
  'core_qr',
  'core_branding',
  'direct_ordering',
  'checkout',
  'payments_basic',
  'order_history',
];

const OPERATIONS_CAPABILITIES: Capability[] = [
  'orders_panel',
  'staff_panel',
  'quick_add',
  'quick_requests',
  'kds',
  'team_management',
  'modifiers',
  'advanced_branding',
  'i18n',
  'analytics_basic',
];

const GROWTH_CAPABILITIES: Capability[] = [
  'neuro_badges',
  'featured_dish',
  'upsell_static',
  'upsell_ai',
  'social_proof',
  'analytics_advanced',
  'team_performance',
  'smart_closing',
];

export const DELIVERY_OS_CAPABILITIES: Capability[] = [
  'delivery_checkout',
  'delivery_coverage',
  'delivery_eta',
  'delivery_rider_app',
  'delivery_dispatch',
  'delivery_tracking',
  'delivery_zones',
  'delivery_analytics',
  'delivery_history',
];

// ── Plan → Capability matrix ──────────────────────────────────────────────────

export const PLAN_CAPABILITIES: Record<PlanTier, Capability[]> = {
  basic: [
    ...CORE_CAPABILITIES,
  ],
  pro: [
    ...CORE_CAPABILITIES,
    ...OPERATIONS_CAPABILITIES,
  ],
  premium: [
    ...CORE_CAPABILITIES,
    ...OPERATIONS_CAPABILITIES,
    ...GROWTH_CAPABILITIES,
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Devuelve todas las capabilities de un plan.
 * Si hasDeliveryOs = true, agrega las capabilities del add-on Delivery OS.
 */
export function getPlanCapabilities(
  tier: PlanTier,
  hasDeliveryOs = false
): Capability[] {
  const base = PLAN_CAPABILITIES[tier] ?? PLAN_CAPABILITIES['basic'];
  return hasDeliveryOs ? [...base, ...DELIVERY_OS_CAPABILITIES] : base;
}

/**
 * Verifica si un plan tiene una capability específica.
 */
export function hasCapability(
  tier: PlanTier,
  capability: Capability,
  hasDeliveryOs = false
): boolean {
  return getPlanCapabilities(tier, hasDeliveryOs).includes(capability);
}

/**
 * Verifica si un plan tiene al menos una de las capabilities dadas.
 */
export function hasAnyCapability(
  tier: PlanTier,
  capabilities: Capability[],
  hasDeliveryOs = false
): boolean {
  const planCaps = getPlanCapabilities(tier, hasDeliveryOs);
  return capabilities.some(c => planCaps.includes(c));
}

/**
 * Verifica si un plan tiene todas las capabilities dadas.
 */
export function hasAllCapabilities(
  tier: PlanTier,
  capabilities: Capability[],
  hasDeliveryOs = false
): boolean {
  const planCaps = getPlanCapabilities(tier, hasDeliveryOs);
  return capabilities.every(c => planCaps.includes(c));
}

/**
 * Retorna un objeto de feature flags compatible con el código legacy.
 * Mantiene compatibilidad con el sistema anterior sin romper nada.
 *
 * @deprecated Usar hasCapability() directamente en código nuevo.
 */
export function getPlanFeatures(tier: PlanTier, hasDeliveryOs = false) {
  const caps = getPlanCapabilities(tier, hasDeliveryOs);
  const has = (c: Capability) => caps.includes(c);
  return {
    // Legacy flags (compatibilidad)
    kds:          has('kds'),
    analytics:    has('analytics_basic'),
    neuroBadges:  has('neuro_badges'),
    i18n:         has('i18n'),
    featuredDish: has('featured_dish'),
    socialProof:  has('social_proof'),
    upsell:       has('upsell_static') || has('upsell_ai'),
    // Nuevos flags
    upsellAi:           has('upsell_ai'),
    upsellStatic:       has('upsell_static'),
    analyticsAdvanced:  has('analytics_advanced'),
    teamPerformance:    has('team_performance'),
    smartClosing:       has('smart_closing'),
    modifiers:          has('modifiers'),
    staffPanel:         has('staff_panel'),
    teamManagement:     has('team_management'),
    ordersPanel:        has('orders_panel'),
    quickAdd:           has('quick_add'),
    quickRequests:      has('quick_requests'),
    advancedBranding:   has('advanced_branding'),
    // Delivery OS
    deliveryOs:         has('delivery_checkout'),
    deliveryDispatch:   has('delivery_dispatch'),
    deliveryTracking:   has('delivery_tracking'),
    deliveryZones:      has('delivery_zones'),
    deliveryAnalytics:  has('delivery_analytics'),
  };
}
