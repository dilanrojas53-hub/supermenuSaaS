/**
 * UIThemeContext — Motor de Theming B2B V4.0
 *
 * Gestiona el tema visual de la interfaz (NO confundir con ThemeSettings del restaurante).
 * - Lee el tema guardado en localStorage al montar
 * - Inyecta las CSS vars en document.documentElement
 * - Expone `uiTheme` y `setUiTheme` para el panel de apariencia del Admin
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  type ThemeKey,
  getStoredTheme,
  saveAndApplyTheme,
  applyTheme,
} from '@/lib/themes';

interface UIThemeContextType {
  uiTheme: ThemeKey;
  setUiTheme: (key: ThemeKey) => void;
}

const UIThemeContext = createContext<UIThemeContextType | undefined>(undefined);

export function UIThemeProvider({ children }: { children: React.ReactNode }) {
  const [uiTheme, setUiThemeState] = useState<ThemeKey>(getStoredTheme);

  // Aplicar el tema al montar (y cuando cambie)
  useEffect(() => {
    applyTheme(uiTheme);
  }, [uiTheme]);

  const setUiTheme = (key: ThemeKey) => {
    setUiThemeState(key);
    saveAndApplyTheme(key);
  };

  return (
    <UIThemeContext.Provider value={{ uiTheme, setUiTheme }}>
      {children}
    </UIThemeContext.Provider>
  );
}

export function useUITheme(): UIThemeContextType {
  const ctx = useContext(UIThemeContext);
  if (!ctx) throw new Error('useUITheme must be used inside UIThemeProvider');
  return ctx;
}
