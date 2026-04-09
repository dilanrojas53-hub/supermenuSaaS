/**
 * heroImageProcessor.ts — Sistema inteligente de procesamiento de imágenes hero
 *
 * Al subir una imagen de portada, este módulo:
 * 1. Detecta las dimensiones y calcula el aspect ratio
 * 2. Clasifica el tipo de imagen (banner-horizontal, landscape, portrait, square)
 * 3. Analiza el focal point (centro de masa visual) usando Canvas
 * 4. Genera versiones optimizadas para mobile, tablet y desktop
 * 5. Retorna metadatos para guardar en Supabase
 */

export type HeroImageType = 'banner-horizontal' | 'landscape' | 'square' | 'portrait';

export interface HeroImageMetadata {
  /** Tipo de imagen detectado */
  type: HeroImageType;
  /** Ancho original en px */
  originalWidth: number;
  /** Alto original en px */
  originalHeight: number;
  /** Aspect ratio (ancho/alto) */
  aspectRatio: number;
  /** Focal point X: 0.0 (izquierda) a 1.0 (derecha) */
  focalX: number;
  /** Focal point Y: 0.0 (arriba) a 1.0 (abajo) */
  focalY: number;
  /** CSS object-position óptimo para este tipo de imagen */
  objectPosition: string;
  /** CSS object-fit recomendado */
  objectFit: 'cover' | 'contain';
  /** Altura recomendada del hero en px para mobile */
  heroHeightMobile: number;
  /** Altura recomendada del hero en px para desktop */
  heroHeightDesktop: number;
}

export interface HeroImageVersions {
  /** URL de la versión mobile (800px de ancho) */
  mobile: string;
  /** URL de la versión tablet (1200px de ancho) */
  tablet: string;
  /** URL de la versión desktop (1600px de ancho) */
  desktop: string;
  /** Metadatos de la imagen */
  metadata: HeroImageMetadata;
}

/**
 * Analiza el focal point de una imagen usando Canvas.
 * Divide la imagen en una grilla de 9x9 celdas y calcula
 * la "densidad visual" de cada celda (píxeles no-negros/transparentes).
 * El focal point es el centroide ponderado de las densidades.
 */
async function analyzeFocalPoint(
  img: HTMLImageElement,
): Promise<{ focalX: number; focalY: number }> {
  const GRID = 9;
  const canvas = document.createElement('canvas');
  // Usar resolución reducida para análisis rápido
  const analysisWidth = Math.min(img.naturalWidth, 360);
  const analysisHeight = Math.round((img.naturalHeight * analysisWidth) / img.naturalWidth);
  canvas.width = analysisWidth;
  canvas.height = analysisHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return { focalX: 0.5, focalY: 0.5 };

  ctx.drawImage(img, 0, 0, analysisWidth, analysisHeight);

  const cellW = Math.floor(analysisWidth / GRID);
  const cellH = Math.floor(analysisHeight / GRID);

  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const x = col * cellW;
      const y = row * cellH;
      const data = ctx.getImageData(x, y, cellW, cellH).data;

      let brightness = 0;
      let saturation = 0;
      let pixelCount = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 20) continue; // Skip transparent pixels

        // Luminosidad (0-255)
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Saturación aproximada
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;

        brightness += lum;
        saturation += sat;
        pixelCount++;
      }

      if (pixelCount === 0) continue;

      const avgBrightness = brightness / pixelCount / 255;
      const avgSaturation = saturation / pixelCount;

      // Peso: combina saturación (colores vivos = contenido importante)
      // y contraste con el fondo (áreas muy oscuras o muy claras tienen menos peso)
      const contrastScore = Math.abs(avgBrightness - 0.5) * 2; // 0 = gris medio, 1 = blanco/negro
      const weight = avgSaturation * 0.7 + contrastScore * 0.3;

      const cellCenterX = (col + 0.5) / GRID;
      const cellCenterY = (row + 0.5) / GRID;

      weightedX += cellCenterX * weight;
      weightedY += cellCenterY * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return { focalX: 0.5, focalY: 0.5 };

  return {
    focalX: Math.min(Math.max(weightedX / totalWeight, 0.1), 0.9),
    focalY: Math.min(Math.max(weightedY / totalWeight, 0.1), 0.9),
  };
}

/**
 * Clasifica el tipo de imagen según su aspect ratio.
 */
function classifyImageType(aspectRatio: number): HeroImageType {
  if (aspectRatio >= 2.2) return 'banner-horizontal'; // Muy ancho (banners, panorámicas)
  if (aspectRatio >= 1.2) return 'landscape';          // Horizontal normal (fotos de comida, etc.)
  if (aspectRatio >= 0.85) return 'square';            // Casi cuadrado
  return 'portrait';                                    // Vertical (logos, retratos)
}

/**
 * Calcula la altura recomendada del hero según el tipo de imagen.
 */
function calcHeroHeight(type: HeroImageType, aspectRatio: number): { mobile: number; desktop: number } {
  switch (type) {
    case 'banner-horizontal':
      // Para banners muy anchos, la altura se calcula para mostrar el banner completo
      // En mobile (390px de ancho): altura = 390 / aspectRatio
      return {
        mobile: Math.round(Math.min(390 / aspectRatio, 280)),
        desktop: Math.round(Math.min(1200 / aspectRatio, 380)),
      };
    case 'landscape':
      return { mobile: 240, desktop: 340 };
    case 'square':
      return { mobile: 260, desktop: 360 };
    case 'portrait':
      return { mobile: 280, desktop: 380 };
  }
}

/**
 * Comprime una imagen a WebP con el ancho máximo especificado.
 */
async function compressToWebP(
  img: HTMLImageElement,
  maxWidth: number,
  quality: number,
): Promise<Blob> {
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Error al comprimir imagen'));
      },
      'image/webp',
      quality,
    );
  });
}

/**
 * Procesa una imagen hero completa:
 * 1. Detecta tipo y focal point
 * 2. Genera 3 versiones optimizadas
 * 3. Sube a Supabase Storage
 * 4. Retorna URLs y metadatos
 */
export async function processHeroImage(
  file: File,
  supabaseClient: any,
  bucket: string,
  onProgress?: (step: string) => void,
): Promise<HeroImageVersions> {
  onProgress?.('Analizando imagen...');

  // Cargar la imagen en memoria
  const objectUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Error al leer imagen'));
    i.src = objectUrl;
  });

  const { naturalWidth: w, naturalHeight: h } = img;
  const aspectRatio = w / h;
  const type = classifyImageType(aspectRatio);

  onProgress?.('Detectando punto focal...');
  const { focalX, focalY } = await analyzeFocalPoint(img);

  // Calcular object-position CSS óptimo
  const focalXPct = Math.round(focalX * 100);
  const focalYPct = Math.round(focalY * 100);

  // Para banners horizontales con texto, priorizar mostrar el centro
  // Para otros tipos, usar el focal point detectado
  const objectPosition = type === 'banner-horizontal'
    ? 'center center'
    : `${focalXPct}% ${focalYPct}%`;

  // object-fit: banners muy anchos usan contain+blur, el resto usa cover
  const objectFit: 'cover' | 'contain' = type === 'banner-horizontal' ? 'contain' : 'cover';

  const heroHeight = calcHeroHeight(type, aspectRatio);

  const metadata: HeroImageMetadata = {
    type,
    originalWidth: w,
    originalHeight: h,
    aspectRatio,
    focalX,
    focalY,
    objectPosition,
    objectFit,
    heroHeightMobile: heroHeight.mobile,
    heroHeightDesktop: heroHeight.desktop,
  };

  // Generar versiones optimizadas
  onProgress?.('Generando versión mobile...');
  const mobileBlob = await compressToWebP(img, 800, 0.82);

  onProgress?.('Generando versión tablet...');
  const tabletBlob = await compressToWebP(img, 1200, 0.85);

  onProgress?.('Generando versión desktop...');
  const desktopBlob = await compressToWebP(img, 1600, 0.88);

  URL.revokeObjectURL(objectUrl);

  // Subir las 3 versiones a Supabase
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 8);
  const baseFileName = `${timestamp}-${randomId}`;

  onProgress?.('Subiendo versión mobile...');
  const { error: mobileError } = await supabaseClient.storage
    .from(bucket)
    .upload(`${baseFileName}-mobile.webp`, mobileBlob, {
      cacheControl: '31536000',
      upsert: false,
      contentType: 'image/webp',
    });
  if (mobileError) throw new Error(`Error subiendo mobile: ${mobileError.message}`);

  onProgress?.('Subiendo versión tablet...');
  const { error: tabletError } = await supabaseClient.storage
    .from(bucket)
    .upload(`${baseFileName}-tablet.webp`, tabletBlob, {
      cacheControl: '31536000',
      upsert: false,
      contentType: 'image/webp',
    });
  if (tabletError) throw new Error(`Error subiendo tablet: ${tabletError.message}`);

  onProgress?.('Subiendo versión desktop...');
  const { error: desktopError } = await supabaseClient.storage
    .from(bucket)
    .upload(`${baseFileName}-desktop.webp`, desktopBlob, {
      cacheControl: '31536000',
      upsert: false,
      contentType: 'image/webp',
    });
  if (desktopError) throw new Error(`Error subiendo desktop: ${desktopError.message}`);

  // Obtener URLs públicas
  const { data: mobileUrl } = supabaseClient.storage.from(bucket).getPublicUrl(`${baseFileName}-mobile.webp`);
  const { data: tabletUrl } = supabaseClient.storage.from(bucket).getPublicUrl(`${baseFileName}-tablet.webp`);
  const { data: desktopUrl } = supabaseClient.storage.from(bucket).getPublicUrl(`${baseFileName}-desktop.webp`);

  onProgress?.('¡Listo!');

  return {
    mobile: mobileUrl.publicUrl,
    tablet: tabletUrl.publicUrl,
    desktop: desktopUrl.publicUrl,
    metadata,
  };
}
