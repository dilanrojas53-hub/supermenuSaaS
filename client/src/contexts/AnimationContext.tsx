/**
 * AnimationContext — Shares the restaurant's theme animation config globally.
 * MenuPage sets the config when tenant data loads; App.tsx renders AnimatedBackground.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { ThemeAnimation } from '@/lib/types';

interface AnimationConfig {
  animation: ThemeAnimation | null;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}

interface AnimationContextType {
  config: AnimationConfig | null;
  setAnimationConfig: (config: AnimationConfig) => void;
  clearAnimationConfig: () => void;
}

const AnimationContext = createContext<AnimationContextType>({
  config: null,
  setAnimationConfig: () => {},
  clearAnimationConfig: () => {},
});

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AnimationConfig | null>(null);

  const setAnimationConfig = useCallback((c: AnimationConfig) => {
    setConfig(c);
  }, []);

  const clearAnimationConfig = useCallback(() => {
    setConfig(null);
  }, []);

  return (
    <AnimationContext.Provider value={{ config, setAnimationConfig, clearAnimationConfig }}>
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimationConfig() {
  return useContext(AnimationContext);
}
