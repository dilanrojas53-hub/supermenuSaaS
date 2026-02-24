/**
 * PoweredByFooter — Branding obligatorio "Powered by Digital Atlas"
 * Aparece en TODOS los menús públicos y en la Landing Page.
 * Usa dos versiones del logo con fondo transparente:
 *   - Versión oscura (navy) para fondos claros
 *   - Versión blanca para fondos oscuros
 * Es un enlace clickeable que lleva a la Landing Page (/).
 */
import { Link } from "wouter";

const LOGO_DARK = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/ofjAIdphsUtYXacD.png";
const LOGO_WHITE = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/OmbbPNnVFlwOoZKI.png";

interface PoweredByFooterProps {
  variant?: "light" | "dark";
}

export default function PoweredByFooter({ variant = "light" }: PoweredByFooterProps) {
  const isDark = variant === "dark";

  const bgClass = isDark
    ? "bg-gray-900 border-t border-gray-800"
    : "bg-white/80 backdrop-blur-sm border-t border-gray-200";

  const textClass = isDark
    ? "text-gray-400"
    : "text-gray-500";

  const logoSrc = isDark ? LOGO_WHITE : LOGO_DARK;

  return (
    <footer className={`w-full py-10 px-4 ${bgClass}`}>
      <Link href="/">
        <div className="flex flex-col items-center gap-4 cursor-pointer group">
          <span
            className={`text-xs font-semibold tracking-[0.2em] uppercase ${textClass}`}
            style={{ fontFamily: "'Nunito', sans-serif" }}
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
