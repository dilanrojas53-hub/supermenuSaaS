import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  fallback?: ReactNode;
  fallbackClassName?: string;
  fallbackLabel?: string;
}

// Centralized fallback prevents native broken-image indicators across the menu.
function isUsableSource(src?: string | null): src is string {
  if (!src) return false;
  const value = src.trim();
  return value.length > 0 && value !== 'null' && value !== 'undefined';
}

export default function SmartImage({
  src,
  alt = '',
  fallback,
  fallbackClassName = '',
  fallbackLabel = 'Imagen no disponible',
  onError,
  ...props
}: SmartImageProps) {
  const [failed, setFailed] = useState(!isUsableSource(src));

  useEffect(() => {
    setFailed(!isUsableSource(src));
  }, [src]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-black/5 text-current/40 ${fallbackClassName}`}
        role={alt ? 'img' : undefined}
        aria-label={alt ? `${alt}. ${fallbackLabel}` : undefined}
      >
        {fallback ?? <ImageOff size={24} strokeWidth={1.6} aria-hidden="true" />}
      </div>
    );
  }

  return (
    <img
      {...props}
      src={src!.trim()}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
