/**
 * onboarding/OnboardingContext.tsx
 * Proveedor global del sistema de onboarding de SuperMenu.
 * Persistencia via localStorage, aislado por userId (slug del tenant).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import type {
  OnboardingState,
  OnboardingContextValue,
  TourModuleKey,
  ModuleOnboardingState,
  TourStep,
} from './types';
import { tourRegistry } from './tourRegistry';

// ─── Storage key ──────────────────────────────────────────────────────────────

const storageKey = (userId: string) => `supermenu_onboarding_${userId}`;

// ─── Default state factory ────────────────────────────────────────────────────

function defaultState(userId: string): OnboardingState {
  return {
    userId,
    guidesEnabled: true,
    contextualHelpEnabled: true,
    moduleStates: {},
  };
}

function defaultModuleState(): ModuleOnboardingState {
  return {
    promptSeen: false,
    completed: false,
    dismissed: false,
    neverShowAgain: false,
  };
}

// ─── Load / save ──────────────────────────────────────────────────────────────

function loadState(userId: string): OnboardingState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaultState(userId);
    return { ...defaultState(userId), ...JSON.parse(raw) };
  } catch {
    return defaultState(userId);
  }
}

function saveState(state: OnboardingState): void {
  try {
    localStorage.setItem(storageKey(state.userId), JSON.stringify(state));
  } catch {
    // Silently ignore storage errors (private mode, quota exceeded)
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface OnboardingProviderProps {
  children: ReactNode;
  /** Slug del tenant — usado como userId para aislar el estado */
  userId: string;
}

export function OnboardingProvider({ children, userId }: OnboardingProviderProps) {
  const [state, setState] = useState<OnboardingState>(() => loadState(userId));

  // Re-load when userId changes (different admin session)
  useEffect(() => {
    setState(loadState(userId));
  }, [userId]);

  // Persist on every change
  useEffect(() => {
    saveState(state);
  }, [state]);

  // ── Tour runtime state ──
  const [activeTourModule, setActiveTourModule] = useState<TourModuleKey | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [activeSteps, setActiveSteps] = useState<TourStep[]>([]);

  // ── Helpers ──

  const getModuleState = useCallback(
    (module: TourModuleKey): ModuleOnboardingState =>
      state.moduleStates[module] ?? defaultModuleState(),
    [state.moduleStates]
  );

  const updateModuleState = useCallback(
    (module: TourModuleKey, patch: Partial<ModuleOnboardingState>) => {
      setState(prev => ({
        ...prev,
        moduleStates: {
          ...prev.moduleStates,
          [module]: { ...(prev.moduleStates[module] ?? defaultModuleState()), ...patch },
        },
      }));
    },
    []
  );

  // ── Tour actions ──

  const startTour = useCallback((module: TourModuleKey) => {
    const def = tourRegistry[module];
    if (!def || def.steps.length === 0) return;
    setActiveSteps(def.steps);
    setActiveTourModule(module);
    setCurrentStepIndex(0);
    updateModuleState(module, { promptSeen: true });
  }, [updateModuleState]);

  const closeTour = useCallback(() => {
    setActiveTourModule(null);
    setCurrentStepIndex(0);
    setActiveSteps([]);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStepIndex(prev => {
      const next = prev + 1;
      if (next >= activeSteps.length) {
        // Tour completed
        if (activeTourModule) {
          updateModuleState(activeTourModule, { completed: true, completedAt: Date.now() });
        }
        setActiveTourModule(null);
        setActiveSteps([]);
        return 0;
      }
      return next;
    });
  }, [activeSteps.length, activeTourModule, updateModuleState]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex(prev => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    if (activeTourModule) {
      updateModuleState(activeTourModule, { dismissed: true });
    }
    closeTour();
  }, [activeTourModule, updateModuleState, closeTour]);

  // ── Prompt actions ──

  const markPromptSeen = useCallback(
    (module: TourModuleKey) => updateModuleState(module, { promptSeen: true }),
    [updateModuleState]
  );

  const markDismissed = useCallback(
    (module: TourModuleKey) => updateModuleState(module, { promptSeen: true, dismissed: true }),
    [updateModuleState]
  );

  const markNeverShow = useCallback(
    (module: TourModuleKey) =>
      updateModuleState(module, { promptSeen: true, dismissed: true, neverShowAgain: true }),
    [updateModuleState]
  );

  // ── Global settings ──

  const setGuidesEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, guidesEnabled: enabled }));
  }, []);

  const setContextualHelpEnabled = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, contextualHelpEnabled: enabled }));
  }, []);

  const resetModule = useCallback((module: TourModuleKey) => {
    setState(prev => {
      const next = { ...prev.moduleStates };
      delete next[module];
      return { ...prev, moduleStates: next };
    });
  }, []);

  const resetAll = useCallback(() => {
    setState(prev => ({ ...prev, moduleStates: {} }));
  }, []);

  // ── Should show welcome ──

  const shouldShowWelcome = useCallback(
    (module: TourModuleKey): boolean => {
      if (!state.guidesEnabled) return false;
      const ms = getModuleState(module);
      return !ms.promptSeen && !ms.neverShowAgain;
    },
    [state.guidesEnabled, getModuleState]
  );

  const value: OnboardingContextValue = {
    state,
    isTourActive: activeTourModule !== null,
    activeTourModule,
    currentStepIndex,
    activeSteps,
    startTour,
    nextStep,
    prevStep,
    closeTour,
    skipTour,
    markPromptSeen,
    markDismissed,
    markNeverShow,
    setGuidesEnabled,
    setContextualHelpEnabled,
    resetModule,
    resetAll,
    shouldShowWelcome,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

/** Hook seguro — retorna null si no hay provider (para componentes opcionales) */
export function useOnboardingSafe(): OnboardingContextValue | null {
  return useContext(OnboardingContext);
}
