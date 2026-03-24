/**
 * imageUtils.ts — Utilidades de optimización de imágenes para SuperMenu
 *
 * Supabase Storage soporta transformación de imágenes en tiempo real mediante
 * el endpoint /render/image/. Esto permite servir imágenes redimensionadas y
 * comprimidas sin modificar el archivo original.
 *
 * Endpoint: /storage/v1/render/image/public/{bucket}/{filename}?width=N&quality=N
 *
 * Reducción típica:
 *  - JPEG 290KB → 75KB con width=400&quality=80 (−74%)
 *  - PNG 2MB → 700KB con width=400&quality=75 (−65%)
 *  - WebP nuevos: ya optimizados desde el upload (~80-150KB)
 */

const SUPABASE_URL = 'https://zddytyncmnivfbvehrth.supabase.co';
const STORAGE_PUBLIC = `${SUPABASE_URL}/storage/v1/object/public`;
const STORAGE_RENDER = `${SUPABASE_URL}/storage/v1/render/image/public`;

/**
 * Convierte una URL pública de Supabase Storage al endpoint de transformación.
 * Si la URL no es de Supabase, la devuelve sin modificar.
 *
 * @param url - URL original de la imagen
 * @param width - Ancho máximo en píxeles (default: 600 para cards de menú)
 * @param quality - Calidad 1-100 (default: 80)
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  width = 600,
  quality = 80,
): string {
  if (!url) return '';

  // Si ya es una URL de render (ya optimizada), actualizar parámetros
  if (url.includes('/render/image/public/')) {
    const base = url.split('?')[0];
    return `${base}?width=${width}&quality=${quality}`;
  }

  // Convertir URL pública estándar al endpoint de render
  if (url.startsWith(STORAGE_PUBLIC)) {
    const path = url.slice(STORAGE_PUBLIC.length); // e.g. /menu-images/filename.jpg
    return `${STORAGE_RENDER}${path}?width=${width}&quality=${quality}`;
  }

  // URL externa o de otro proveedor — devolver sin modificar
  return url;
}

/**
 * Tamaños predefinidos para distintos contextos de la UI.
 * Usar el más pequeño posible para cada caso.
 */
export const IMAGE_SIZES = {
  /** Thumbnail en lista de menú (104px visual) */
  thumbnail: { width: 200, quality: 80 },
  /** Card de menú en grid (variable, ~300px visual) */
  card: { width: 600, quality: 80 },
  /** Modal de detalle del producto (full width mobile ~390px) */
  detail: { width: 800, quality: 85 },
  /** Hero / banner del restaurante */
  hero: { width: 1200, quality: 85 },
  /** Ícono pequeño en carrito */
  cart: { width: 160, quality: 75 },
} as const;
