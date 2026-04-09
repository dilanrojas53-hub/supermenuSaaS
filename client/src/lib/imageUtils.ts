/**
 * imageUtils.ts — Utilidades de optimización de imágenes para SuperMenu
 *
 * Supabase Storage soporta transformación de imágenes en tiempo real mediante
 * el endpoint /render/image/. Esto permite servir imágenes redimensionadas,
 * recortadas y comprimidas sin modificar el archivo original.
 *
 * Endpoint: /storage/v1/render/image/public/{bucket}/{filename}
 *   ?width=N&height=N&quality=N&resize=cover|contain|fill
 *
 * IMPORTANTE: Siempre usar width+height+resize=cover para imágenes cuadradas
 * (thumbnails, cards). Sin height, Supabase mantiene la proporción original y
 * el CSS object-fit:cover tiene que estirar la imagen, causando zoom feo.
 *
 * Reducción típica con width=200&height=200&resize=cover:
 *  - PNG 2MB → 72KB (−96%)
 *  - JPEG 290KB → 40KB (−86%)
 */

const SUPABASE_URL = 'https://zddytyncmnivfbvehrth.supabase.co';
const STORAGE_PUBLIC = `${SUPABASE_URL}/storage/v1/object/public`;
const STORAGE_RENDER = `${SUPABASE_URL}/storage/v1/render/image/public`;

/**
 * Convierte una URL pública de Supabase Storage al endpoint de transformación.
 * Si la URL no es de Supabase, la devuelve sin modificar.
 *
 * @param url     - URL original de la imagen
 * @param width   - Ancho en píxeles
 * @param quality - Calidad 1-100 (default: 80)
 * @param height  - Alto en píxeles. Si se especifica, se usa resize=cover para
 *                  recortar la imagen al tamaño exacto sin distorsión.
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  width = 600,
  quality = 80,
  height?: number,
): string {
  if (!url) return '';

  // Construir parámetros de transformación
  const buildParams = () => {
    let params = `width=${width}&quality=${quality}`;
    if (height) {
      params += `&height=${height}&resize=cover`;
    }
    return params;
  };

  // Si ya es una URL de render (ya optimizada), actualizar parámetros
  if (url.includes('/render/image/public/')) {
    const base = url.split('?')[0];
    return `${base}?${buildParams()}`;
  }

  // Convertir URL pública estándar al endpoint de render
  if (url.startsWith(STORAGE_PUBLIC)) {
    const path = url.slice(STORAGE_PUBLIC.length); // e.g. /menu-images/filename.jpg
    return `${STORAGE_RENDER}${path}?${buildParams()}`;
  }

  // URL externa o de otro proveedor — devolver sin modificar
  return url;
}

/**
 * Tamaños predefinidos para distintos contextos de la UI.
 *
 * Para thumbnails y cards (contenedores cuadrados): siempre incluir height
 * para que Supabase haga el recorte cuadrado y evitar zoom feo en el CSS.
 *
 * Para hero/banner (contenedor rectangular): solo width, sin height.
 */
export const IMAGE_SIZES = {
  /** Thumbnail cuadrado en lista de menú (104px visual en móvil) */
  thumbnail: { width: 200, quality: 80, height: 200 },
  /** Card cuadrada en grid (variable, ~300px visual) */
  card: { width: 400, quality: 80, height: 400 },
  /** Modal de detalle del producto (full width mobile ~390px, rectangular) */
  detail: { width: 800, quality: 85 },
  /** Hero / banner del restaurante (rectangular, aspect-ratio 16:7) */
  hero: { width: 800, quality: 85 },
  /** Ícono pequeño cuadrado en carrito (56px visual) */
  cart: { width: 160, quality: 75, height: 160 },
} as const;
