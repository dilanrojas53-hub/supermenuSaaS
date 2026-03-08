/**
 * Motor de Theming B2B — Digital Atlas Smart Menu
 * V15.0: Designer-in-a-Box
 *
 * Dos capas:
 *   1. BASE_PALETTES — 4 fondos pre-calculados para el menú público (cerrados, a prueba de tontos)
 *   2. themes        — Temas del panel Admin (sin cambios)
 *
 * Uso en Admin:
 *   import { BASE_PALETTES, applyBase, getStoredBase } from '@/lib/themes';
 *
 * Uso en menú público:
 *   applyBaseWithAccent(getStoredBase(), accentColor);
 */

// ─── ADMIN PANEL THEMES (sin cambios) ────────────────────────────────────────

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

// V4.0: key alineada al brief
export const THEME_STORAGE_KEY = 'restaurant_theme';
export const DEFAULT_THEME: ThemeKey = 'luxury_black_gold';

export function applyTheme(key: ThemeKey): void {
  const theme = themes[key];
  if (!theme) return;
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([prop, value]) => {
    root.style.setProperty(prop, value);
  });
}

export function getStoredTheme(): ThemeKey {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeKey | null;
    if (stored && themes[stored]) return stored;
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

export function saveAndApplyTheme(key: ThemeKey): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, key); } catch { /* ignore */ }
  applyTheme(key);
}

// ─── V15.0: BASE PALETTES (Menú Público) ─────────────────────────────────────

export type BaseKey = 'midnight' | 'ocean' | 'charcoal' | 'clean';

export interface BasePalette {
  key: BaseKey;
  name: string;
  emoji: string;
  description: string;
  bg: string;
  surface: string;
  text: string;
  /** Borde calculado automáticamente según si es dark o light */
  border: string;
  /** Sombra calculada para micro-bisel */
  shadow: string;
  isDark: boolean;
}

export const BASE_PALETTES: BasePalette[] = [
  {
    key: 'midnight',
    name: 'Midnight',
    emoji: '🌑',
    description: 'Oscuro Puro',
    bg:      '#09090b',
    surface: '#18181b',
    text:    '#fafafa',
    border:  'rgba(255,255,255,0.05)',
    shadow:  '0 8px 32px rgba(0,0,0,0.8)',
    isDark:  true,
  },
  {
    key: 'ocean',
    name: 'Ocean',
    emoji: '🌊',
    description: 'Azul Profundo',
    bg:      '#020617',
    surface: '#0f172a',
    text:    '#f8fafc',
    border:  'rgba(255,255,255,0.05)',
    shadow:  '0 8px 32px rgba(2,6,23,0.8)',
    isDark:  true,
  },
  {
    key: 'charcoal',
    name: 'Charcoal',
    emoji: '🪨',
    description: 'Gris Elegante',
    bg:      '#1c1917',
    surface: '#292524',
    text:    '#fafaf9',
    border:  'rgba(255,255,255,0.05)',
    shadow:  '0 8px 32px rgba(10,8,7,0.7)',
    isDark:  true,
  },
  {
    key: 'clean',
    name: 'Clean',
    emoji: '☁️',
    description: 'Claro Moderno',
    bg:      '#f8fafc',
    surface: '#ffffff',
    text:    '#0f172a',
    border:  'rgba(0,0,0,0.06)',
    shadow:  '0 4px 16px rgba(15,23,42,0.06)',
    isDark:  false,
  },
];

export const BASE_STORAGE_KEY = 'restaurant_base';
export const DEFAULT_BASE: BaseKey = 'midnight';

/**
 * Inyecta las CSS vars de la base + el acento en document.documentElement
 */
export function applyBaseWithAccent(baseKey: BaseKey, accentColor: string): void {
  const base = BASE_PALETTES.find(b => b.key === baseKey) ?? BASE_PALETTES[0];
  const root = document.documentElement;
  root.style.setProperty('--bg-page',        base.bg);
  root.style.setProperty('--bg-surface',     base.surface);
  root.style.setProperty('--text-primary',   base.text);
  root.style.setProperty('--text-secondary', base.isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)');
  root.style.setProperty('--border',         base.border);
  root.style.setProperty('--shadow',         base.shadow);
  root.style.setProperty('--muted',          base.isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.35)');
  root.style.setProperty('--accent',         accentColor);
  root.style.setProperty('--accent-contrast', base.isDark ? '#ffffff' : '#ffffff');
}

export function getStoredBase(): BaseKey {
  try {
    const stored = localStorage.getItem(BASE_STORAGE_KEY) as BaseKey | null;
    if (stored && BASE_PALETTES.find(b => b.key === stored)) return stored;
  } catch { /* ignore */ }
  return DEFAULT_BASE;
}

export function saveBase(key: BaseKey): void {
  try { localStorage.setItem(BASE_STORAGE_KEY, key); } catch { /* ignore */ }
}
