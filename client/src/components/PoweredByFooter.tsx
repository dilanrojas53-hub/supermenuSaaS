/**
 * PoweredByFooter — V13.0 Smart Footer Vectorizado
 * Logo vectorizado inline (sin imágenes externas), fondo transparente.
 * Texto adaptado al color del tema del restaurante.
 * Aparece en TODOS los menús públicos y en la Landing Page.
 */
import { Link } from "wouter";

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

  // Color del texto: usar textColor si se pasa, sino adaptar al fondo
  const resolvedTextColor = textColor
    ? textColor
    : isDark
      ? 'rgba(255,255,255,0.6)'
      : 'rgba(0,0,0,0.5)';

  return (
    <footer
      className="w-full"
      style={{ backgroundColor: 'transparent' }}
    >
      <Link href="/">
        <div
          className="flex flex-col items-center justify-center py-10 cursor-pointer"
          style={{ opacity: 0.5, transition: 'opacity 0.3s ease' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
        >
          {/* "Powered by" label */}
          <span
            className="text-[10px] tracking-[0.2em] uppercase mb-2 font-bold"
            style={{ color: resolvedTextColor }}
          >
            Powered by
          </span>

          {/* Logo vectorizado Digital Atlas — sin imágenes externas */}
          <div
            className="flex items-center gap-2"
            style={{ color: resolvedTextColor }}
          >
            {/* Ícono vectorizado: círculo con líneas (atlas/pin) */}
            <div
              className="w-7 h-7 rounded-full border-2 border-current flex items-center justify-center"
              style={{ flexShrink: 0 }}
            >
              <div className="flex flex-col items-center justify-center">
                <div className="h-0.5 w-3 bg-current rounded-full mb-0.5" />
                <div className="h-2.5 w-0.5 bg-current rounded-full" />
              </div>
            </div>

            {/* Wordmark */}
            <span
              className="font-extrabold tracking-tight text-xl"
              style={{ color: resolvedTextColor, fontFamily: "'Nunito', sans-serif" }}
            >
              Digital Atlas
            </span>
          </div>
        </div>
      </Link>
    </footer>
  );
}
