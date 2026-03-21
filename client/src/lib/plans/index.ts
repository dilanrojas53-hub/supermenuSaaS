/**
 * lib/plans/index.ts — Re-exportación del módulo de planes
 *
 * Importar desde '@/lib/plans' para acceder a:
 *   - Tipos: PlanTier, Capability, PlanMeta, AddOnMeta
 *   - Helpers: getPlanCapabilities, hasCapability, hasAnyCapability, getPlanFeatures
 *   - Metadata: PLAN_META, DELIVERY_OS_META, PLAN_LABELS, CAPABILITY_META
 */

export type { Capability, CapabilityMeta } from './capabilities';
export { CAPABILITY_META } from './capabilities';

export type { PlanTier, PlanMeta, AddOnMeta } from './plans';
export {
  PLAN_META,
  DELIVERY_OS_META,
  PLAN_LABELS,
  getPlanMeta,
  formatPlanPrice,
} from './plans';

export {
  PLAN_CAPABILITIES,
  DELIVERY_OS_CAPABILITIES,
  getPlanCapabilities,
  hasCapability,
  hasAnyCapability,
  hasAllCapabilities,
  getPlanFeatures,
} from './planMatrix';
