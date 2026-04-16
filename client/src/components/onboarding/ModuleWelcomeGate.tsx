/**
 * ModuleWelcomeGate.tsx
 * Wrapper que muestra automáticamente el WelcomeModal la primera vez
 * que el usuario entra a un módulo. Completamente opcional y no invasivo.
 *
 * Uso:
 *   <ModuleWelcomeGate module="orders">
 *     <OrdersTab ... />
 *   </ModuleWelcomeGate>
 */

import { useState, useEffect, type ReactNode } from 'react';
import { useOnboardingSafe, type TourModuleKey } from '@/lib/onboarding';
import WelcomeModal from './WelcomeModal';

interface ModuleWelcomeGateProps {
  module: TourModuleKey;
  children: ReactNode;
  /** Delay en ms antes de mostrar el modal (default 600ms para que el tab cargue) */
  delay?: number;
}

export default function ModuleWelcomeGate({
  module,
  children,
  delay = 600,
}: ModuleWelcomeGateProps) {
  const onboarding = useOnboardingSafe();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!onboarding) return;
    if (!onboarding.shouldShowWelcome(module)) return;

    const timer = setTimeout(() => {
      // Re-check after delay (user might have navigated away)
      if (onboarding.shouldShowWelcome(module)) {
        setShowModal(true);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [module, onboarding, delay]);

  return (
    <>
      {children}
      {showModal && (
        <WelcomeModal
          module={module}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
