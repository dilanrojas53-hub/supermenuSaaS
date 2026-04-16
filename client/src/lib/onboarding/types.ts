/**
 * onboarding/types.ts
 * Tipos centrales del sistema de onboarding de SuperMenu.
 * Diseñado para ser reusable, tipado y sin hardcodeo.
 */

// ─── Tour step ────────────────────────────────────────────────────────────────

export interface TourStep {
  /** Selector CSS o data-help-anchor del elemento a resaltar. Null = paso sin highlight. */
  target?: string;
  /** Título corto del paso (máx ~40 chars) */
  title: string;
  /** Explicación simple y humana (máx ~120 chars) */
  body: string;
  /** Posición del card relativa al elemento destacado */
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Si el elemento puede no estar visible (ej. tab no activo), lo ignoramos */
  optional?: boolean;
}

// ─── Tour definition ──────────────────────────────────────────────────────────

export type TourModuleKey =
  | 'orders'
  | 'history'
  | 'staff'
  | 'delivery'
  | 'tables'
  | 'menu'
  | 'categories'
  | 'modifiers'
  | 'customers'
  | 'promotions'
  | 'performance'
  | 'analytics'
  | 'experience'
  | 'qr'
  | 'theme'
  | 'settings';

export interface TourDefinition {
  module: TourModuleKey;
  /** Nombre legible para el Help Center */
  label: string;
  /** Descripción breve para el Help Center */
  description: string;
  /** Icono emoji para el Help Center */
  icon: string;
  steps: TourStep[];
}

// ─── Per-module state ─────────────────────────────────────────────────────────

export interface ModuleOnboardingState {
  /** El usuario ya vio el modal de bienvenida del módulo */
  promptSeen: boolean;
  /** Completó el tour completo */
  completed: boolean;
  /** Cerró el modal sin iniciar el tour */
  dismissed: boolean;
  /** Eligió "No volver a mostrar" */
  neverShowAgain: boolean;
  /** Timestamp de la última vez que completó el tour */
  completedAt?: number;
}

// ─── Global onboarding state ──────────────────────────────────────────────────

export interface OnboardingState {
  /** ID del admin (slug del tenant) para aislar estado por usuario */
  userId: string;
  /** Si el sistema de guías está habilitado globalmente */
  guidesEnabled: boolean;
  /** Si las ayudas contextuales (tooltips, microtexto) están habilitadas */
  contextualHelpEnabled: boolean;
  /** Estado por módulo */
  moduleStates: Partial<Record<TourModuleKey, ModuleOnboardingState>>;
}

// ─── Context value ────────────────────────────────────────────────────────────

export interface OnboardingContextValue {
  /** Estado global persistido */
  state: OnboardingState;
  /** Si el tour está activo ahora mismo */
  isTourActive: boolean;
  /** Módulo del tour activo */
  activeTourModule: TourModuleKey | null;
  /** Paso actual del tour activo (0-indexed) */
  currentStepIndex: number;
  /** Pasos del tour activo */
  activeSteps: TourStep[];

  // ── Acciones ──
  /** Iniciar el tour de un módulo */
  startTour: (module: TourModuleKey) => void;
  /** Avanzar al siguiente paso */
  nextStep: () => void;
  /** Retroceder al paso anterior */
  prevStep: () => void;
  /** Cerrar el tour en cualquier momento */
  closeTour: () => void;
  /** Saltar todo el tour */
  skipTour: () => void;

  /** Marcar que el usuario ya vio el prompt de bienvenida de un módulo */
  markPromptSeen: (module: TourModuleKey) => void;
  /** Marcar que el usuario descartó el prompt */
  markDismissed: (module: TourModuleKey) => void;
  /** Marcar "no volver a mostrar" */
  markNeverShow: (module: TourModuleKey) => void;

  /** Activar/desactivar guías globalmente */
  setGuidesEnabled: (enabled: boolean) => void;
  /** Activar/desactivar ayuda contextual */
  setContextualHelpEnabled: (enabled: boolean) => void;
  /** Resetear el progreso de un módulo */
  resetModule: (module: TourModuleKey) => void;
  /** Resetear todo el onboarding */
  resetAll: () => void;

  /** Si debe mostrar el modal de bienvenida para un módulo */
  shouldShowWelcome: (module: TourModuleKey) => boolean;
}
