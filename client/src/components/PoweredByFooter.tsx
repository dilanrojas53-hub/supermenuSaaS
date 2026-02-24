/**
 * PoweredByFooter — Branding obligatorio "Powered by Digital Atlas"
 * Aparece en TODOS los menús públicos y en la Landing Page.
 * El logo se adapta al tema del restaurante (fondo claro/oscuro).
 * Es un enlace clickeable que lleva a la Landing Page (/).
 */
import { Link } from "wouter";

const DIGITAL_ATLAS_LOGO = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663241686300/JpWMbxFFjqBmTDvA.webp";

interface PoweredByFooterProps {
  variant?: "light" | "dark";
}

export default function PoweredByFooter({ variant = "light" }: PoweredByFooterProps) {
  const bgClass = variant === "dark"
    ? "bg-gray-900 border-t border-gray-800"
    : "bg-white/80 backdrop-blur-sm border-t border-gray-200";

  const textClass = variant === "dark"
    ? "text-gray-400"
    : "text-gray-500";

  return (
    <footer className={`w-full py-6 px-4 ${bgClass}`}>
      <Link href="/">
        <div className="flex flex-col items-center gap-3 cursor-pointer group">
          <span className={`text-sm font-medium tracking-wide uppercase ${textClass}`}>
            Powered by
          </span>
          <img
            src={DIGITAL_ATLAS_LOGO}
            alt="Digital Atlas"
            className="h-10 w-auto object-contain group-hover:scale-105 transition-transform duration-300"
            style={variant === "dark" ? { filter: "brightness(0) invert(1)" } : {}}
          />
        </div>
      </Link>
    </footer>
  );
}
