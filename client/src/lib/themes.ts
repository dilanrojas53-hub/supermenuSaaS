/**
 * Digital Atlas — Sistema de Temas V18.0
 * Temas por tipo de restaurante con paletas recomendadas.
 * El menú público SIEMPRE lee los colores desde Supabase, nunca localStorage.
 */

// ─── ADMIN PANEL THEMES (sin cambios, para compatibilidad) ───────────────────
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
    name: 'Modern Tech', description: 'Azul profundo, estilo SaaS', emoji: '💙',
    vars: { '--bg-page': '#0b1220', '--bg-surface': '#0f1724', '--text-primary': '#e6eef8',
      '--text-secondary': '#b6c4d6', '--accent': '#2563eb', '--accent-contrast': '#ffffff',
      '--border': 'rgba(255,255,255,0.06)', '--muted': '#93a6c2', '--shadow': '0 8px 24px rgba(2,6,23,0.6)' },
  },
  classic_restaurant: {
    name: 'Classic Restaurant', description: 'Cálido, elegante, tradicional', emoji: '🍷',
    vars: { '--bg-page': '#f5f1e8', '--bg-surface': '#ffffff', '--text-primary': '#0f1724',
      '--text-secondary': '#6b6b57', '--accent': '#8b2e2e', '--accent-contrast': '#ffffff',
      '--border': '#e6dfd6', '--muted': '#9b8f82', '--shadow': '0 6px 18px rgba(11,12,13,0.06)' },
  },
  minimal_light: {
    name: 'Minimal Light', description: 'Limpio, blanco, moderno', emoji: '⬜',
    vars: { '--bg-page': '#f8fafc', '--bg-surface': '#ffffff', '--text-primary': '#0b1220',
      '--text-secondary': '#4b5563', '--accent': '#2563eb', '--accent-contrast': '#ffffff',
      '--border': '#e6eef8', '--muted': '#94a3b8', '--shadow': '0 6px 16px rgba(11,12,13,0.04)' },
  },
  luxury_black_gold: {
    name: 'Luxury', description: 'Negro profundo con dorado', emoji: '✨',
    vars: { '--bg-page': '#0a0a0a', '--bg-surface': '#101010', '--text-primary': '#f5f3ee',
      '--text-secondary': '#bfb9aa', '--accent': '#c6a75e', '--accent-contrast': '#0b0b0b',
      '--border': 'rgba(255,255,255,0.06)', '--muted': '#9b8f82', '--shadow': '0 12px 40px rgba(2,2,2,0.7)' },
  },
};

export const THEME_STORAGE_KEY = 'restaurant_theme';
export const DEFAULT_THEME: ThemeKey = 'luxury_black_gold';

export function applyTheme(key: ThemeKey): void {
  const theme = themes[key];
  if (!theme) return;
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([prop, value]) => root.style.setProperty(prop, value));
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

// ─── V18.0: TEMAS POR TIPO DE RESTAURANTE ────────────────────────────────────
export interface RestaurantThemePreset {
  key: string;
  name: string;
  emoji: string;
  description: string;
  category: string;
  isDark: boolean;
  recommended: {
    background: string;
    surface: string;
    text: string;
    primary: string;
    badge: string;
  };
  paletteNote: string;
}

export const RESTAURANT_THEMES: RestaurantThemePreset[] = [
  // CARIBEÑO
  { key: 'caribbean_sunset', name: 'Caribbean Sunset', emoji: '🌴', description: 'Cálido, tropical, vibrante',
    category: 'Caribeño', isDark: false,
    recommended: { background: '#FFF8F0', surface: '#FFFFFF', text: '#1A0A00', primary: '#E8572A', badge: '#F4A261' },
    paletteNote: 'Naranja cálido sobre crema. Perfecto para marisquerías y cocina caribeña.' },
  { key: 'caribbean_night', name: 'Caribbean Night', emoji: '🌊', description: 'Tropical oscuro con turquesa',
    category: 'Caribeño', isDark: true,
    recommended: { background: '#0D1B2A', surface: '#1B2B3A', text: '#E8F4F8', primary: '#2EC4B6', badge: '#F4A261' },
    paletteNote: 'Turquesa caribeño sobre azul marino. Ideal para bares de playa.' },

  // MODERNO
  { key: 'modern_dark', name: 'Modern Dark', emoji: '⚫', description: 'Minimalista oscuro, urbano',
    category: 'Moderno', isDark: true,
    recommended: { background: '#0A0A0A', surface: '#161616', text: '#F5F5F5', primary: '#E63946', badge: '#FF6B6B' },
    paletteNote: 'Negro puro con rojo intenso. Para burgers, smash, fast-casual premium.' },
  { key: 'modern_light', name: 'Modern Light', emoji: '⬜', description: 'Blanco limpio, minimalista',
    category: 'Moderno', isDark: false,
    recommended: { background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', primary: '#2563EB', badge: '#3B82F6' },
    paletteNote: 'Blanco con azul eléctrico. Ideal para cocina fusión y restaurantes de autor.' },
  { key: 'modern_sage', name: 'Modern Sage', emoji: '🌿', description: 'Verde salvia, orgánico moderno',
    category: 'Moderno', isDark: false,
    recommended: { background: '#F4F7F4', surface: '#FFFFFF', text: '#1A2E1A', primary: '#4A7C59', badge: '#6B9E7A' },
    paletteNote: 'Verde natural sobre blanco. Para restaurantes orgánicos y veganos.' },

  // VINTAGE
  { key: 'vintage_sepia', name: 'Vintage Sepia', emoji: '📜', description: 'Sepia cálido, papel envejecido',
    category: 'Vintage', isDark: false,
    recommended: { background: '#F5ECD7', surface: '#FDF6E8', text: '#3D2B1F', primary: '#8B4513', badge: '#A0522D' },
    paletteNote: 'Tonos sepia y marrón sobre crema. Para cafeterías y cocina tradicional.' },
  { key: 'vintage_dark', name: 'Vintage Dark', emoji: '🕯️', description: 'Oscuro con dorado envejecido',
    category: 'Vintage', isDark: true,
    recommended: { background: '#1A1209', surface: '#2A1E10', text: '#E8D5A3', primary: '#C9A84C', badge: '#D4AF37' },
    paletteNote: 'Marrón oscuro con dorado antiguo. Para tabernas y bodegas.' },

  // RETRO
  { key: 'retro_diner', name: 'Retro Diner', emoji: '🍔', description: 'Rojo y crema estilo diner 50s',
    category: 'Retro', isDark: false,
    recommended: { background: '#FFF5E4', surface: '#FFFFFF', text: '#1A0A00', primary: '#D62828', badge: '#F77F00' },
    paletteNote: 'Rojo americano sobre crema. Perfecto para diners y comida americana.' },
  { key: 'retro_neon', name: 'Retro Neon', emoji: '🌈', description: 'Oscuro con neón retro 80s',
    category: 'Retro', isDark: true,
    recommended: { background: '#0D0D1A', surface: '#1A1A2E', text: '#E8E8FF', primary: '#FF6EC7', badge: '#00D4FF' },
    paletteNote: 'Morado oscuro con neón rosa y cyan. Para bares temáticos.' },

  // CLÁSICO
  { key: 'classic_bistro', name: 'Classic Bistro', emoji: '🍷', description: 'Elegante, rojo vino y crema',
    category: 'Clásico', isDark: false,
    recommended: { background: '#FAF7F2', surface: '#FFFFFF', text: '#2C1810', primary: '#8B1A1A', badge: '#A52A2A' },
    paletteNote: 'Rojo vino sobre marfil. Para restaurantes franceses e italianos.' },
  { key: 'classic_dark', name: 'Classic Dark', emoji: '🎩', description: 'Negro con dorado, alta cocina',
    category: 'Clásico', isDark: true,
    recommended: { background: '#0A0A0A', surface: '#141414', text: '#F5F3EE', primary: '#C6A75E', badge: '#D4AF37' },
    paletteNote: 'Negro profundo con dorado. Para restaurantes de alta cocina.' },

  // SPORTS BAR
  { key: 'sportsbar_dark', name: 'Sports Bar', emoji: '🏟️', description: 'Oscuro con verde cancha',
    category: 'Sports Bar', isDark: true,
    recommended: { background: '#0F1A0F', surface: '#1A2E1A', text: '#E8F5E8', primary: '#22C55E', badge: '#16A34A' },
    paletteNote: 'Verde cancha sobre negro. Para sports bars y cervecerías.' },
  { key: 'sportsbar_industrial', name: 'Industrial Bar', emoji: '🍺', description: 'Gris industrial con ámbar',
    category: 'Sports Bar', isDark: true,
    recommended: { background: '#1C1917', surface: '#292524', text: '#FAFAF9', primary: '#F59E0B', badge: '#D97706' },
    paletteNote: 'Gris carbón con ámbar cervecero. Para bares industriales y craft beer.' },

  // DE COSTA
  { key: 'coastal_light', name: 'Coastal Light', emoji: '🏖️', description: 'Arena y turquesa, playa diurna',
    category: 'De Costa', isDark: false,
    recommended: { background: '#F0F9FF', surface: '#FFFFFF', text: '#0C2340', primary: '#0EA5E9', badge: '#06B6D4' },
    paletteNote: 'Azul cielo y turquesa sobre blanco. Para restaurantes de playa.' },
  { key: 'coastal_sunset', name: 'Coastal Sunset', emoji: '🌅', description: 'Atardecer en la playa',
    category: 'De Costa', isDark: false,
    recommended: { background: '#FFF4E6', surface: '#FFFFFF', text: '#1A0A00', primary: '#F97316', badge: '#FB923C' },
    paletteNote: 'Naranja atardecer sobre arena. Para ranchos de playa y cocina del Pacífico.' },

  // DE LA GAM
  { key: 'gam_urban', name: 'GAM Urban', emoji: '🏙️', description: 'Urbano costarricense moderno',
    category: 'De la GAM', isDark: false,
    recommended: { background: '#F8F9FA', surface: '#FFFFFF', text: '#1A1A2E', primary: '#2D5016', badge: '#4A7C59' },
    paletteNote: 'Verde tico sobre blanco. Para restaurantes de San José, Escazú y Heredia.' },
  { key: 'gam_cozy', name: 'GAM Cozy', emoji: '☕', description: 'Cálido, café, acogedor',
    category: 'De la GAM', isDark: false,
    recommended: { background: '#FDF6EC', surface: '#FFFFFF', text: '#2C1810', primary: '#7B3F00', badge: '#A0522D' },
    paletteNote: 'Café y marrón cálido. Para sodas ticas y cocina casera costarricense.' },

  // LUJOSO
  { key: 'luxury_gold', name: 'Luxury Gold', emoji: '👑', description: 'Negro y dorado, máximo lujo',
    category: 'Lujoso', isDark: true,
    recommended: { background: '#080808', surface: '#111111', text: '#F5F3EE', primary: '#C6A75E', badge: '#D4AF37' },
    paletteNote: 'Negro profundo con dorado 24k. Para restaurantes de alta cocina.' },
  { key: 'luxury_emerald', name: 'Luxury Emerald', emoji: '💎', description: 'Negro con esmeralda, exclusivo',
    category: 'Lujoso', isDark: true,
    recommended: { background: '#050D0A', surface: '#0D1F18', text: '#E8F5F0', primary: '#10B981', badge: '#059669' },
    paletteNote: 'Negro esmeralda profundo. Para restaurantes de autor premium.' },
  { key: 'luxury_rose', name: 'Luxury Rosé', emoji: '🌹', description: 'Blanco perla con rosa dorado',
    category: 'Lujoso', isDark: false,
    recommended: { background: '#FDF8F8', surface: '#FFFFFF', text: '#1A0A0A', primary: '#C2185B', badge: '#E91E63' },
    paletteNote: 'Blanco perla con rosa. Para cocina francesa y brunch premium.' },

  // CASUAL
  { key: 'casual_fresh', name: 'Casual Fresh', emoji: '🥗', description: 'Fresco, verde, amigable',
    category: 'Casual', isDark: false,
    recommended: { background: '#F0FDF4', surface: '#FFFFFF', text: '#14532D', primary: '#16A34A', badge: '#22C55E' },
    paletteNote: 'Verde fresco sobre blanco. Para restaurantes saludables y ensaladeras.' },
  { key: 'casual_warm', name: 'Casual Warm', emoji: '🍕', description: 'Cálido, naranja, familiar',
    category: 'Casual', isDark: false,
    recommended: { background: '#FFFBF5', surface: '#FFFFFF', text: '#1C0A00', primary: '#EA580C', badge: '#F97316' },
    paletteNote: 'Naranja cálido sobre blanco. Para pizzerías y restaurantes familiares.' },
  { key: 'casual_purple', name: 'Casual Purple', emoji: '🫐', description: 'Morado vibrante, joven y fresco',
    category: 'Casual', isDark: false,
    recommended: { background: '#FAF5FF', surface: '#FFFFFF', text: '#1A0A2E', primary: '#7C3AED', badge: '#8B5CF6' },
    paletteNote: 'Morado sobre blanco. Para cafeterías jóvenes y smoothie bars.' },

  // ESPECIAL
  { key: 'japanese_minimal', name: 'Japanese Minimal', emoji: '🍣', description: 'Blanco y negro, estilo japonés',
    category: 'Especial', isDark: false,
    recommended: { background: '#FAFAFA', surface: '#FFFFFF', text: '#0A0A0A', primary: '#DC2626', badge: '#EF4444' },
    paletteNote: 'Blanco puro con rojo japonés. Para sushi, ramen y cocina asiática.' },
  { key: 'mediterranean', name: 'Mediterranean', emoji: '🫒', description: 'Azul mediterráneo y terracota',
    category: 'Especial', isDark: false,
    recommended: { background: '#F8F6F0', surface: '#FFFFFF', text: '#1A1410', primary: '#1D4ED8', badge: '#C2410C' },
    paletteNote: 'Azul mediterráneo con terracota. Para restaurantes griegos, españoles e italianos.' },
  { key: 'bbq_smokehouse', name: 'BBQ Smokehouse', emoji: '🔥', description: 'Oscuro con rojo fuego y ámbar',
    category: 'Especial', isDark: true,
    recommended: { background: '#1A0A00', surface: '#2A1200', text: '#FFE4C4', primary: '#DC2626', badge: '#F59E0B' },
    paletteNote: 'Marrón oscuro con rojo fuego. Para asadores, parrillas y BBQ.' },
  { key: 'floral_garden', name: 'Floral Garden', emoji: '🌸', description: 'Rosa y verde, jardín floral',
    category: 'Especial', isDark: false,
    recommended: { background: '#FFF5F7', surface: '#FFFFFF', text: '#1A0A10', primary: '#DB2777', badge: '#EC4899' },
    paletteNote: 'Rosa floral sobre blanco. Para cocina creativa con flores comestibles.' },

  // MEXICANO
  { key: 'fiesta_mexicana', name: 'Fiesta Mexicana', emoji: '🌮', description: 'Multicolor festivo, estilo taquería',
    category: 'Mexicano', isDark: true,
    recommended: { background: '#1A1A1A', surface: '#2A1A0A', text: '#FFFFFF', primary: '#F5A623', badge: '#E91E8C' },
    paletteNote: 'Negro festivo con dorado y magenta. Inspirado en la paleta vibrante del menú impreso: morado, amarillo, rojo, verde y rosa.' },
  { key: 'tacopedia_amarilla', name: 'Tacopedia Amarilla', emoji: '🌮', description: 'Amarillo intenso con negro, taquería urbana audaz',
    category: 'Mexicano', isDark: false,
    recommended: { background: '#E8D800', surface: '#F5E800', text: '#000000', primary: '#8B1A1A', badge: '#000000' },
    paletteNote: 'Amarillo vibrante #E8D800 con negro puro y acento rojo oscuro #8B1A1A. Identidad visual de La Tacopedia: llamativo, audaz y 100% mexicano.' },
];

export function getThemeCategories(): string[] {
  return [...new Set(RESTAURANT_THEMES.map(t => t.category))];
}

export function getThemesByCategory(category: string): RestaurantThemePreset[] {
  return RESTAURANT_THEMES.filter(t => t.category === category);
}

export function getThemePreset(key: string): RestaurantThemePreset | undefined {
  return RESTAURANT_THEMES.find(t => t.key === key);
}

// ─── V18.0: Inyectar colores del restaurante en CSS vars del menú público ─────
export function applyRestaurantTheme(params: {
  background: string;
  surface: string;
  text: string;
  primary: string;
  badge?: string;
}): void {
  const { background, surface, text, primary, badge } = params;
  const root = document.documentElement;
  const isDark = isColorDark(background);

  // Convertir hex a RGB para usar en rgba()
  const hexToRgb = (hex: string): string => {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return '230,99,26';
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `${r},${g},${b}`;
  };

  // CSS vars del menú público
  root.style.setProperty('--menu-bg',              background);
  root.style.setProperty('--menu-surface',         surface);
  root.style.setProperty('--menu-text',            text);
  root.style.setProperty('--menu-accent',          primary);
  root.style.setProperty('--menu-accent-rgb',      hexToRgb(primary));
  root.style.setProperty('--menu-accent-contrast', '#ffffff');
  root.style.setProperty('--menu-badge',           badge || primary);
  root.style.setProperty('--menu-muted',           isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)');
  root.style.setProperty('--menu-border',          isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)');

  // CSS vars del admin (para consistencia visual)
  root.style.setProperty('--bg-page',          background);
  root.style.setProperty('--bg-surface',       surface);
  root.style.setProperty('--text-primary',     text);
  root.style.setProperty('--text-secondary',   isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)');
  root.style.setProperty('--accent',           primary);
  root.style.setProperty('--accent-contrast',  '#ffffff');
  root.style.setProperty('--border',           isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)');
  root.style.setProperty('--muted',            isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)');
  root.style.setProperty('--shadow',           isDark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 4px 16px rgba(0,0,0,0.08)');
}

export function isColorDark(hex: string): boolean {
  try {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance < 0.4;
  } catch {
    return true;
  }
}

// ─── Compatibilidad con código legacy (V15.0) ─────────────────────────────────
export type BaseKey = 'midnight' | 'ocean' | 'charcoal' | 'clean';

export interface BasePalette {
  key: BaseKey;
  name: string;
  emoji: string;
  description: string;
  bg: string;
  surface: string;
  text: string;
  border: string;
  shadow: string;
  isDark: boolean;
}

export const BASE_PALETTES: BasePalette[] = [
  { key: 'midnight', name: 'Midnight', emoji: '🌑', description: 'Oscuro Puro',
    bg: '#09090b', surface: '#18181b', text: '#fafafa',
    border: 'rgba(255,255,255,0.05)', shadow: '0 8px 32px rgba(0,0,0,0.8)', isDark: true },
  { key: 'ocean', name: 'Ocean', emoji: '🌊', description: 'Azul Profundo',
    bg: '#020617', surface: '#0f172a', text: '#f8fafc',
    border: 'rgba(255,255,255,0.05)', shadow: '0 8px 32px rgba(2,6,23,0.8)', isDark: true },
  { key: 'charcoal', name: 'Charcoal', emoji: '🪨', description: 'Gris Elegante',
    bg: '#1c1917', surface: '#292524', text: '#fafaf9',
    border: 'rgba(255,255,255,0.05)', shadow: '0 8px 32px rgba(10,8,7,0.7)', isDark: true },
  { key: 'clean', name: 'Clean', emoji: '☁️', description: 'Claro Moderno',
    bg: '#f8fafc', surface: '#ffffff', text: '#0f172a',
    border: 'rgba(0,0,0,0.06)', shadow: '0 4px 16px rgba(15,23,42,0.06)', isDark: false },
];

export const BASE_STORAGE_KEY = 'restaurant_base';
export const DEFAULT_BASE: BaseKey = 'midnight';

/** @deprecated Usar applyRestaurantTheme() en su lugar */
export function applyBaseWithAccent(baseKey: BaseKey, accentColor: string): void {
  const base = BASE_PALETTES.find(b => b.key === baseKey) ?? BASE_PALETTES[0];
  applyRestaurantTheme({ background: base.bg, surface: base.surface, text: base.text, primary: accentColor });
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
