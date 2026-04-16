/**
 * onboarding/index.ts
 * Punto de entrada del sistema de onboarding de SuperMenu.
 */

export type {
  TourStep,
  TourDefinition,
  TourModuleKey,
  ModuleOnboardingState,
  OnboardingState,
  OnboardingContextValue,
} from './types';

export { tourRegistry, ALL_TOUR_MODULES } from './tourRegistry';
export { OnboardingProvider, useOnboarding, useOnboardingSafe } from './OnboardingContext';
