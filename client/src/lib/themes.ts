/**
 * Motor de Theming B2B — Digital Atlas Smart Menu
 * V4.0: 4 temas predefinidos con CSS Custom Properties
 * V6.0: Sistema de presets multi-tenant (ThemePreset)
 *
 * Uso V4.0:
 *   import { applyTheme, getStoredTheme } from '@/lib/themes';
 *   applyTheme('luxury_black_gold');
 *
 * Uso V6.0:
 *   import { getPreset, PRESET_LIST } from '@/lib/themes';
 *   const preset = getPreset(theme?.settings?.theme_preset);
 */

// ─── V4.0: Motor B2B (no modificar) ───────────────────────────────────────────

export type ThemeKey = 'modern_tech' | 'classic_restaurant' | 'minimal_light' | 'luxury_black_gold';

export interface ThemeVars {
  '--bg-page': string;
  '--bg-surface': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--accent': string;
  '--accent-contrast': string;
  '--border': string;
  '--muted': string;
  '--shadow': string;
}

export interface ThemeDefinition {
  name: string;
  description: string;
  emoji: string;
  vars: ThemeVars;
}

export const themes: Record<ThemeKey, ThemeDefinition> = {
  modern_tech: {
    name: 'Modern Tech',
    description: 'Azul profundo, estilo SaaS',
    emoji: '💙',
    vars: {
      '--bg-page':          '#0b1220',
      '--bg-surface':       '#0f1724',
      '--text-primary':     '#e6eef8',
      '--text-secondary':   '#b6c4d6',
      '--accent':           '#2563eb',
      '--accent-contrast':  '#ffffff',
      '--border':           'rgba(255,255,255,0.06)',
      '--muted':            '#93a6c2',
      '--shadow':           '0 8px 24px rgba(2,6,23,0.6)',
    },
  },
  classic_restaurant: {
    name: 'Classic Restaurant',
    description: 'Cálido, elegante, tradicional',
    emoji: '🍷',
    vars: {
      '--bg-page':          '#f5f1e8',
      '--bg-surface':       '#ffffff',
      '--text-primary':     '#0f1724',
      '--text-secondary':   '#6b6b57',
      '--accent':           '#8b2e2e',
      '--accent-contrast':  '#ffffff',
      '--border':           '#e6dfd6',
      '--muted':            '#9b8f82',
      '--shadow':           '0 6px 18px rgba(11,12,13,0.06)',
    },
  },
  minimal_light: {
    name: 'Minimal Light',
    description: 'Limpio, blanco, moderno',
    emoji: '⬜',
    vars: {
      '--bg-page':          '#f8fafc',
      '--bg-surface':       '#ffffff',
      '--text-primary':     '#0b1220',
      '--text-secondary':   '#4b5563',
      '--accent':           '#2563eb',
      '--accent-contrast':  '#ffffff',
      '--border':           '#e6eef8',
      '--muted':            '#94a3b8',
      '--shadow':           '0 6px 16px rgba(11,12,13,0.04)',
    },
  },
  luxury_black_gold: {
    name: 'Luxury',
    description: 'Negro profundo con dorado',
    emoji: '✨',
    vars: {
      '--bg-page':          '#0a0a0a',
      '--bg-surface':       '#101010',
      '--text-primary':     '#f5f3ee',
      '--text-secondary':   '#bfb9aa',
      '--accent':           '#c6a75e',
      '--accent-contrast':  '#0b0b0b',
      '--border':           'rgba(255,255,255,0.06)',
      '--muted':            '#9b8f82',
      '--shadow':           '0 12px 40px rgba(2,2,2,0.7)',
    },
  },
};

// V4.0: key alineada al brief (era 'da_ui_theme')
export const THEME_STORAGE_KEY = 'restaurant_theme';
export const DEFAULT_THEME: ThemeKey = 'luxury_black_gold';

/**
 * Inyecta las CSS vars del tema en document.documentElement
 */
export function applyTheme(key: ThemeKey): void {
  const theme = themes[key];
  if (!theme) return;
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
}

/**
 * Lee el tema guardado en localStorage (o devuelve el default)
 */
export function getStoredTheme(): ThemeKey {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeKey | null;
    if (stored && themes[stored]) return stored;
  } catch {
    // localStorage no disponible
  }
  return DEFAULT_THEME;
}

/**
 * Guarda el tema en localStorage y lo aplica
 */
export function saveAndApplyTheme(key: ThemeKey): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, key);
  } catch {
    // ignore
  }
  applyTheme(key);
}

// ─── V6.0: Sistema de Presets Multi-Tenant ────────────────────────────────────

export interface ThemePreset {
  id: string;
  name: string;
  label: string;
  emoji: string;
  fontFamily: string;
  googleFontUrl: string;
  bgGradient: string;
  cardBackground: string;
  cardBorder: string;
  cardShadow: string;
  categoryBarBg: string;
  heroOverlay: string;
  buttonStyle: 'rounded-full' | 'rounded-lg' | 'rounded-none';
  priceColor: string;
}

export const THEME_PRESETS: Record<string, ThemePreset> = {
  default: {
    id: 'default',
    name: 'Classic Dark',
    label: 'Clásico',
    emoji: '⬛',
    fontFamily: "'Inter', sans-serif",
    googleFontUrl: '',
    bgGradient: 'linear-gradient(180deg, #0a0a0a 0%, #111111 100%)',
    cardBackground: 'rgba(255,255,255,0.05)',
    cardBorder: '1px solid rgba(255,255,255,0.08)',
    cardShadow: '0 2px 16px rgba(0,0,0,0.4)',
    categoryBarBg: 'rgba(10,10,10,0.9)',
    heroOverlay: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.75))',
    buttonStyle: 'rounded-full',
    priceColor: 'inherit',
  },
  luxury: {
    id: 'luxury',
    name: 'Luxury & Elegance',
    label: 'Lujo',
    emoji: '🥂',
    fontFamily: "'Cormorant Garamond', serif",
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&display=swap',
    bgGradient: 'linear-gradient(135deg, #0d0d0d 0%, #1a1208 40%, #0d0b08 100%)',
    cardBackground: 'linear-gradient(135deg, rgba(255,215,100,0.07) 0%, rgba(255,255,255,0.03) 100%)',
    cardBorder: '1px solid rgba(255,215,100,0.18)',
    cardShadow: '0 4px 28px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,215,100,0.08)',
    categoryBarBg: 'rgba(13,11,8,0.92)',
    heroOverlay: 'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(13,8,0,0.88))',
    buttonStyle: 'rounded-none',
    priceColor: '#d4af37',
  },
  zen: {
    id: 'zen',
    name: 'Zen & Nature',
    label: 'Zen',
    emoji: '🍃',
    fontFamily: "'Noto Serif JP', serif",
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;700&display=swap',
    bgGradient: 'linear-gradient(160deg, #0a1a0f 0%, #0f2318 40%, #0a1a0f 100%)',
    cardBackground: 'rgba(255,255,255,0.04)',
    cardBorder: '1px solid rgba(255,255,255,0.07)',
    cardShadow: '0 2px 20px rgba(0,0,0,0.35)',
    categoryBarBg: 'rgba(10,26,15,0.88)',
    heroOverlay: 'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(10,26,15,0.82))',
    buttonStyle: 'rounded-lg',
    priceColor: 'inherit',
  },
  caribbean: {
    id: 'caribbean',
    name: 'Caribbean Vibes',
    label: 'Caribeño',
    emoji: '🌴',
    fontFamily: "'Nunito', sans-serif",
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap',
    bgGradient: 'linear-gradient(160deg, #0a1628 0%, #0d2440 50%, #071220 100%)',
    cardBackground: 'rgba(255,255,255,0.07)',
    cardBorder: '1px solid rgba(255,255,255,0.12)',
    cardShadow: '0 4px 24px rgba(0,0,0,0.4)',
    categoryBarBg: 'rgba(10,22,40,0.9)',
    heroOverlay: 'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(7,18,32,0.88))',
    buttonStyle: 'rounded-full',
    priceColor: 'inherit',
  },
  industrial: {
    id: 'industrial',
    name: 'Industrial Modern',
    label: 'Industrial',
    emoji: '⚡',
    fontFamily: "'Barlow Condensed', sans-serif",
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&display=swap',
    bgGradient: 'linear-gradient(180deg, #080808 0%, #0f0f0f 100%)',
    cardBackground: 'rgba(255,255,255,0.04)',
    cardBorder: '1px solid rgba(255,255,255,0.06)',
    cardShadow: '0 2px 12px rgba(0,0,0,0.6)',
    categoryBarBg: 'rgba(0,0,0,0.95)',
    heroOverlay: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.92))',
    buttonStyle: 'rounded-none',
    priceColor: 'inherit',
  },
  fresh: {
    id: 'fresh',
    name: 'Fresh & Light',
    label: 'Fresco',
    emoji: '☀️',
    fontFamily: "'Poppins', sans-serif",
    googleFontUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
    bgGradient: 'linear-gradient(160deg, #f8fafc 0%, #f0f4f8 100%)',
    cardBackground: 'rgba(255,255,255,0.92)',
    cardBorder: '1px solid rgba(0,0,0,0.07)',
    cardShadow: '0 2px 16px rgba(0,0,0,0.08)',
    categoryBarBg: 'rgba(248,250,252,0.94)',
    heroOverlay: 'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.55))',
    buttonStyle: 'rounded-full',
    priceColor: 'inherit',
  },
};

export function getPreset(presetId?: string | null): ThemePreset {
  if (!presetId) return THEME_PRESETS.default;
  return THEME_PRESETS[presetId] ?? THEME_PRESETS.default;
}

export const PRESET_LIST = Object.values(THEME_PRESETS);
