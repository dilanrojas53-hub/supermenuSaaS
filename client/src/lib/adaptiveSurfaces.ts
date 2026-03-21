/**
 * adaptiveSurfaces.ts — Sistema de tokens de superficie adaptativos
 *
 * Deriva automáticamente tokens visuales desde los colores del tema activo.
 * No hardcodea colores por restaurante ni por captura puntual.
 * Funciona tanto en temas oscuros como claros.
 *
 * USO:
 *   import { getAdaptiveSurfaces } from '@/lib/adaptiveSurfaces';
 *   const s = getAdaptiveSurfaces(theme); // theme = { '--bg-page', '--bg-surface', '--text-primary', '--accent', '--border', '--muted' }
 *   <div style={s.card}>...</div>
 */

// ─── Utilidades de color ──────────────────────────────────────────────────────

/** Parsea un color hex o rgb/rgba a [r,g,b] */
function parseColor(color: string): [number, number, number] | null {
  if (!color) return null;
  const hex = color.trim();
  // Hex #rrggbb o #rgb
  const hexMatch = hex.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3) {
      return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
    }
    if (h.length >= 6) {
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    }
  }
  // rgb(r,g,b) o rgba(r,g,b,a)
  const rgbMatch = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  return null;
}

/** Calcula luminancia relativa (0=negro, 1=blanco) */
function luminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Determina si un color es oscuro (luminancia < 0.35) */
export function isColorDark(color: string): boolean {
  const rgb = parseColor(color);
  if (!rgb) return true; // asumir oscuro por defecto
  return luminance(...rgb) < 0.35;
}

/** Mezcla dos colores hex con un ratio (0=color1, 1=color2) */
function mixColors(color1: string, color2: string, ratio: number): string {
  const c1 = parseColor(color1) || [15, 23, 36];
  const c2 = parseColor(color2) || [255, 255, 255];
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * ratio);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * ratio);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * ratio);
  return `rgb(${r},${g},${b})`;
}

/** Genera rgba con alpha desde un color hex */
function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return `rgba(128,128,128,${alpha})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ThemeInput {
  '--bg-page'?: string;
  '--bg-surface'?: string;
  '--text-primary'?: string;
  '--text-secondary'?: string;
  '--accent'?: string;
  '--accent-contrast'?: string;
  '--border'?: string;
  '--muted'?: string;
  '--shadow'?: string;
  [key: string]: string | undefined;
}

export interface AdaptiveSurfaces {
  /** Modo: 'dark' | 'light' */
  mode: 'dark' | 'light';

  // ─── Fondos ───────────────────────────────────────────────────────────────
  /** Fondo de página principal */
  pageBg: string;
  /** Superficie base (cards, paneles) */
  surfaceBase: string;
  /** Superficie elevada (modales, dropdowns) */
  surfaceElevated: string;
  /** Superficie muted (inputs, badges secundarios) */
  surfaceMuted: string;
  /** Superficie hover */
  surfaceHover: string;
  /** Superficie activa/seleccionada */
  surfaceActive: string;

  // ─── Bordes ───────────────────────────────────────────────────────────────
  /** Borde estándar */
  border: string;
  /** Borde sutil */
  borderSubtle: string;
  /** Borde de acento */
  borderAccent: string;

  // ─── Texto ────────────────────────────────────────────────────────────────
  /** Texto principal */
  textPrimary: string;
  /** Texto secundario */
  textSecondary: string;
  /** Texto muted / placeholder */
  textMuted: string;
  /** Texto sobre acento */
  textOnAccent: string;

  // ─── Acento ───────────────────────────────────────────────────────────────
  /** Color de acento sólido */
  accent: string;
  /** Acento suave (fondo de badges, highlights) */
  accentSoft: string;
  /** Acento hover */
  accentHover: string;

  // ─── Semánticos ───────────────────────────────────────────────────────────
  /** Fondo de alerta peligro */
  dangerSoft: string;
  /** Fondo de alerta éxito */
  successSoft: string;
  /** Fondo de alerta advertencia */
  warningSoft: string;
  /** Fondo de alerta info */
  infoSoft: string;

  // ─── Sombras ──────────────────────────────────────────────────────────────
  /** Sombra de card */
  shadowCard: string;
  /** Sombra de modal */
  shadowModal: string;

  // ─── Estilos inline preconstruidos ────────────────────────────────────────
  /** style object para una card base */
  card: React.CSSProperties;
  /** style object para una card elevada (modal, drawer) */
  cardElevated: React.CSSProperties;
  /** style object para un input */
  input: React.CSSProperties;
  /** style object para un select */
  select: React.CSSProperties;
  /** style object para un badge/pill neutro */
  badge: React.CSSProperties;
  /** style object para un badge de acento */
  badgeAccent: React.CSSProperties;
  /** style object para un tab inactivo */
  tabInactive: React.CSSProperties;
  /** style object para un tab activo */
  tabActive: React.CSSProperties;
  /** style object para un divider */
  divider: React.CSSProperties;
  /** style object para un overlay/backdrop */
  overlay: React.CSSProperties;
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Deriva tokens de superficie adaptativos desde el tema activo.
 * Acepta el objeto de variables CSS del tema (ThemeInput) o un objeto con
 * background_color, surface_color, primary_color, text_color (formato Supabase).
 */
export function getAdaptiveSurfaces(theme: ThemeInput | Record<string, string>): AdaptiveSurfaces {
  // Normalizar: soportar tanto variables CSS (--bg-page) como propiedades Supabase (background_color)
  const bg = (theme['--bg-page'] || theme['background_color'] || '#0b1220') as string;
  const surface = (theme['--bg-surface'] || theme['surface_color'] || '#0f1724') as string;
  const textPrimary = (theme['--text-primary'] || theme['text_color'] || '#e6eef8') as string;
  const textSecondary = (theme['--text-secondary'] || '#94a3b8') as string;
  const accent = (theme['--accent'] || theme['primary_color'] || '#2563eb') as string;
  const accentContrast = (theme['--accent-contrast'] || '#ffffff') as string;
  const borderRaw = (theme['--border'] || 'rgba(255,255,255,0.06)') as string;
  const muted = (theme['--muted'] || '#94a3b8') as string;
  const shadow = (theme['--shadow'] || '0 8px 24px rgba(2,6,23,0.6)') as string;

  const dark = isColorDark(bg);
  const mode: 'dark' | 'light' = dark ? 'dark' : 'light';

  // Derivar superficies según luminosidad del fondo
  const surfaceBase = dark
    ? mixColors(bg, '#ffffff', 0.06)   // ligeramente más claro que el fondo
    : mixColors(bg, '#000000', 0.03);  // ligeramente más oscuro

  const surfaceElevated = dark
    ? mixColors(bg, '#ffffff', 0.10)
    : '#ffffff';

  const surfaceMuted = dark
    ? mixColors(bg, '#ffffff', 0.04)
    : mixColors(bg, '#000000', 0.02);

  const surfaceHover = dark
    ? mixColors(bg, '#ffffff', 0.08)
    : mixColors(bg, '#000000', 0.04);

  const surfaceActive = withAlpha(accent, dark ? 0.15 : 0.10);

  // Bordes
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const borderSubtle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const borderAccent = withAlpha(accent, 0.40);

  // Texto
  const textMuted = dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.40)';
  const textSec = dark ? 'rgba(255,255,255,0.60)' : 'rgba(0,0,0,0.55)';

  // Acento
  const accentSoft = withAlpha(accent, dark ? 0.15 : 0.10);
  const accentHover = withAlpha(accent, dark ? 0.25 : 0.18);

  // Semánticos
  const dangerSoft = dark ? 'rgba(239,68,68,0.12)' : 'rgba(220,38,38,0.08)';
  const successSoft = dark ? 'rgba(34,197,94,0.12)' : 'rgba(22,163,74,0.08)';
  const warningSoft = dark ? 'rgba(245,158,11,0.12)' : 'rgba(217,119,6,0.08)';
  const infoSoft = dark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.08)';

  // Sombras
  const shadowCard = dark
    ? '0 4px 16px rgba(0,0,0,0.40)'
    : '0 2px 8px rgba(0,0,0,0.06)';
  const shadowModal = dark
    ? '0 16px 48px rgba(0,0,0,0.60)'
    : '0 8px 32px rgba(0,0,0,0.12)';

  // Estilos preconstruidos
  const card: React.CSSProperties = {
    backgroundColor: surfaceBase,
    border: `1px solid ${border}`,
    boxShadow: shadowCard,
    color: textPrimary,
  };

  const cardElevated: React.CSSProperties = {
    backgroundColor: surfaceElevated,
    border: `1px solid ${border}`,
    boxShadow: shadowModal,
    color: textPrimary,
  };

  const input: React.CSSProperties = {
    backgroundColor: surfaceMuted,
    border: `1.5px solid ${border}`,
    color: textPrimary,
    outline: 'none',
  };

  const select: React.CSSProperties = {
    backgroundColor: surfaceMuted,
    border: `1.5px solid ${border}`,
    color: textPrimary,
  };

  const badge: React.CSSProperties = {
    backgroundColor: surfaceMuted,
    border: `1px solid ${border}`,
    color: textSec,
  };

  const badgeAccent: React.CSSProperties = {
    backgroundColor: accentSoft,
    border: `1px solid ${borderAccent}`,
    color: accent,
  };

  const tabInactive: React.CSSProperties = {
    backgroundColor: 'transparent',
    color: textSec,
    border: 'none',
  };

  const tabActive: React.CSSProperties = {
    backgroundColor: accentSoft,
    color: accent,
    border: `1px solid ${borderAccent}`,
    fontWeight: 700,
  };

  const divider: React.CSSProperties = {
    borderColor: border,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
  };

  const overlay: React.CSSProperties = {
    backgroundColor: dark ? 'rgba(0,0,0,0.70)' : 'rgba(0,0,0,0.40)',
    backdropFilter: 'blur(4px)',
  };

  return {
    mode,
    pageBg: bg,
    surfaceBase,
    surfaceElevated,
    surfaceMuted,
    surfaceHover,
    surfaceActive,
    border,
    borderSubtle,
    borderAccent,
    textPrimary,
    textSecondary: textSec,
    textMuted,
    textOnAccent: accentContrast,
    accent,
    accentSoft,
    accentHover,
    dangerSoft,
    successSoft,
    warningSoft,
    infoSoft,
    shadowCard,
    shadowModal,
    card,
    cardElevated,
    input,
    select,
    badge,
    badgeAccent,
    tabInactive,
    tabActive,
    divider,
    overlay,
  };
}

/**
 * Inyecta las variables CSS de superficie en el elemento raíz (o en un elemento dado).
 * Útil para que Tailwind y CSS puedan usar var(--surface-base), var(--text-primary), etc.
 */
export function injectAdaptiveSurfaceVars(surfaces: AdaptiveSurfaces, el: HTMLElement = document.documentElement): void {
  const vars: Record<string, string> = {
    '--surface-base': surfaces.surfaceBase,
    '--surface-elevated': surfaces.surfaceElevated,
    '--surface-muted': surfaces.surfaceMuted,
    '--surface-hover': surfaces.surfaceHover,
    '--surface-active': surfaces.surfaceActive,
    '--surface-border': surfaces.border,
    '--surface-border-subtle': surfaces.borderSubtle,
    '--surface-border-accent': surfaces.borderAccent,
    '--surface-text-primary': surfaces.textPrimary,
    '--surface-text-secondary': surfaces.textSecondary,
    '--surface-text-muted': surfaces.textMuted,
    '--surface-accent': surfaces.accent,
    '--surface-accent-soft': surfaces.accentSoft,
    '--surface-accent-hover': surfaces.accentHover,
    '--surface-danger-soft': surfaces.dangerSoft,
    '--surface-success-soft': surfaces.successSoft,
    '--surface-warning-soft': surfaces.warningSoft,
    '--surface-info-soft': surfaces.infoSoft,
    '--surface-shadow-card': surfaces.shadowCard,
    '--surface-shadow-modal': surfaces.shadowModal,
    '--surface-page-bg': surfaces.pageBg,
  };
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
}
