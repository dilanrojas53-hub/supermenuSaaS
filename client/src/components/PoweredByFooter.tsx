/**
 * PoweredByFooter — Branding obligatorio "Powered by Digital Atlas"
 * Aparece en TODOS los menús públicos y en la Landing Page.
 * Usa dos versiones del logo con fondo transparente:
 *   - Versión oscura (navy) para fondos claros
 *   - Versión blanca para fondos oscuros
 * Acepta un `bgColor` opcional para adaptarse al tema del restaurante.
 * Es un enlace clickeable que lleva a la Landing Page (/).
 */
import { Link } from "wouter";

const LOGO_DARK = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/ofjAIdphsUtYXacD.png";
const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/OmbbPNnVFlwOoZKI.png";

interface PoweredByFooterProps {
  /** "light" | "dark" — se puede pasar directamente o dejar que se auto-detecte via bgColor */
  variant?: "light" | "dark";
  /** Color de fondo del restaurante (hex). Si se pasa, se usa para auto-detectar variant y adaptar el footer. */
  bgColor?: string;
  /** Color de texto del restaurante (hex). Se usa para el texto "Powered by". */
  textColor?: string;
}

/**
 * Calcula la luminancia relativa de un color hex para determinar si es oscuro o claro.
 */
function isColorDark(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return true;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  // Luminancia perceptual (fórmula ITU-R BT.709)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

export default function PoweredByFooter({ variant, bgColor, textColor }: PoweredByFooterProps) {
  // Auto-detect variant from bgColor if not explicitly set
  const isDark = variant
    ? variant === "dark"
    : bgColor
      ? isColorDark(bgColor)
      : false;

  const logoSrc = isDark ? LOGO_WHITE : LOGO_DARK;

  // When bgColor is provided (restaurant menu), blend with the restaurant's theme
  // When not provided (landing/pricing), use the default styled backgrounds
  const footerStyle: React.CSSProperties = bgColor
    ? {
        backgroundColor: bgColor,
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      }
    : {};

  const defaultBgClass = bgColor
    ? ''
    : isDark
      ? 'bg-gray-900 border-t border-gray-800'
      : 'bg-white/80 backdrop-blur-sm border-t border-gray-200';

  const poweredByColor = textColor
    ? textColor
    : isDark
      ? 'rgba(255,255,255,0.45)'
      : 'rgba(0,0,0,0.4)';

  return (
    <footer
      className={`w-full py-10 px-4 ${defaultBgClass}`}
      style={footerStyle}
    >
      <Link href="/">
        <div className="flex flex-col items-center gap-4 cursor-pointer group">
          <span
            className="text-xs font-semibold tracking-[0.2em] uppercase"
            style={{ fontFamily: "'Nunito', sans-serif", color: poweredByColor }}
          >
            Powered by
          </span>
          <img
            src={logoSrc}
            alt="Digital Atlas"
            className="object-contain group-hover:scale-105 transition-transform duration-300"
            style={{ width: '180px', height: 'auto' }}
          />
        </div>
      </Link>
    </footer>
  );
}
