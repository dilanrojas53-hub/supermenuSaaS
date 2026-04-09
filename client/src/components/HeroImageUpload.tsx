/**
 * HeroImageUpload — Componente especializado para subir imágenes hero.
 *
 * Características:
 * - Procesamiento inteligente: detecta tipo, focal point, genera 3 versiones
 * - Preview multi-dispositivo: Mobile / Tablet / Desktop
 * - Muestra cómo se verá la imagen en cada dispositivo antes de guardar
 * - Guarda metadatos en el form para que el cliente los use
 */
import { useState, useRef, useCallback } from 'react';
import { X, Loader2, ImageIcon, Monitor, Tablet, Smartphone, CheckCircle2, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { processHeroImage, HeroImageMetadata } from '@/lib/heroImageProcessor';

interface HeroImageUploadProps {
  currentUrl: string;
  currentMetadata?: HeroImageMetadata | null;
  onUpload: (urls: { mobile: string; tablet: string; desktop: string; metadata: HeroImageMetadata }) => void;
  onRemove: () => void;
}

type DevicePreview = 'mobile' | 'tablet' | 'desktop';

const DEVICE_CONFIG = {
  mobile: {
    label: 'Mobile',
    icon: Smartphone,
    width: '100%',
    maxWidth: '320px',
    aspectRatio: '16/7',
  },
  tablet: {
    label: 'Tablet',
    icon: Tablet,
    width: '100%',
    maxWidth: '480px',
    aspectRatio: '16/6',
  },
  desktop: {
    label: 'Desktop',
    icon: Monitor,
    width: '100%',
    maxWidth: '640px',
    aspectRatio: '16/5',
  },
};

export default function HeroImageUpload({
  currentUrl,
  currentMetadata,
  onUpload,
  onRemove,
}: HeroImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [activeDevice, setActiveDevice] = useState<DevicePreview>('mobile');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('El archivo no debe superar 20MB');
      return;
    }

    setUploading(true);
    setUploadStep('Iniciando...');

    try {
      const result = await processHeroImage(
        file,
        supabase,
        'menu-images',
        (step) => setUploadStep(step),
      );

      onUpload(result);

      const typeLabels: Record<string, string> = {
        'banner-horizontal': 'Banner horizontal',
        'landscape': 'Imagen horizontal',
        'square': 'Imagen cuadrada',
        'portrait': 'Imagen vertical',
      };

      toast.success(
        `✓ ${typeLabels[result.metadata.type] || 'Imagen'} procesada — 3 versiones optimizadas`,
        { duration: 4000 }
      );
    } catch (err) {
      console.error('Error procesando imagen hero:', err);
      toast.error('Error al procesar la imagen. Intenta de nuevo.');
    }

    setUploading(false);
    setUploadStep('');
  }, [onUpload]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const getPreviewUrl = () => {
    if (!currentUrl) return '';
    // Si la URL termina en -mobile/-tablet/-desktop, usar la versión correcta
    // Si no, usar la URL tal cual (compatibilidad con imágenes antiguas)
    const base = currentUrl.replace(/-mobile\.webp$|-tablet\.webp$|-desktop\.webp$/, '');
    if (base !== currentUrl) {
      return `${base}-${activeDevice}.webp`;
    }
    return currentUrl;
  };

  const getObjectFit = () => {
    if (!currentMetadata) return 'cover';
    return currentMetadata.objectFit;
  };

  const getObjectPosition = () => {
    if (!currentMetadata) return 'center center';
    return currentMetadata.objectPosition;
  };

  const deviceConfig = DEVICE_CONFIG[activeDevice];

  return (
    <div className="space-y-3">
      {/* Upload area */}
      {!currentUrl && !uploading && (
        <div
          className={`w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all p-6 ${
            dragOver
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700/50'
          }`}
          style={{ minHeight: '140px' }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <ImageIcon size={32} className="text-slate-500 mb-2" />
          <p className="text-sm text-slate-400 text-center leading-tight">
            Arrastra una imagen o haz clic para seleccionar
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5 text-center">
            El sistema detecta el tipo de imagen y genera versiones optimizadas para mobile, tablet y desktop
          </p>
          <div className="flex items-center gap-3 mt-3">
            {(['mobile', 'tablet', 'desktop'] as const).map((d) => {
              const Icon = DEVICE_CONFIG[d].icon;
              return (
                <div key={d} className="flex items-center gap-1 text-slate-500">
                  <Icon size={12} />
                  <span className="text-[10px]">{DEVICE_CONFIG[d].label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Uploading state */}
      {uploading && (
        <div className="w-full rounded-xl border border-slate-700 bg-slate-800 flex flex-col items-center justify-center p-6" style={{ minHeight: '140px' }}>
          <Loader2 size={28} className="text-amber-500 animate-spin mb-3" />
          <p className="text-sm text-slate-300 font-medium">{uploadStep}</p>
          <p className="text-[11px] text-slate-500 mt-1">Generando versiones para todos los dispositivos...</p>
          <div className="flex items-center gap-2 mt-3">
            {(['mobile', 'tablet', 'desktop'] as const).map((d) => {
              const Icon = DEVICE_CONFIG[d].icon;
              return (
                <div key={d} className="flex items-center gap-1 text-amber-500/60">
                  <Icon size={12} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview multi-dispositivo */}
      {currentUrl && !uploading && (
        <div className="space-y-2">
          {/* Metadata badge */}
          {currentMetadata && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
              <span className="text-[11px] text-emerald-400">
                {currentMetadata.type === 'banner-horizontal' ? 'Banner horizontal' :
                 currentMetadata.type === 'landscape' ? 'Imagen horizontal' :
                 currentMetadata.type === 'square' ? 'Imagen cuadrada' : 'Imagen vertical'}
                {' · '}
                {currentMetadata.originalWidth}×{currentMetadata.originalHeight}px
                {' · '}
                Focal: {Math.round(currentMetadata.focalX * 100)}% {Math.round(currentMetadata.focalY * 100)}%
              </span>
            </div>
          )}

          {/* Device selector tabs */}
          <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
            {(['mobile', 'tablet', 'desktop'] as const).map((d) => {
              const Icon = DEVICE_CONFIG[d].icon;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setActiveDevice(d)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                    activeDevice === d
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Icon size={12} />
                  {DEVICE_CONFIG[d].label}
                </button>
              );
            })}
          </div>

          {/* Preview frame */}
          <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-700">
            {/* Device frame indicator */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5 backdrop-blur-sm">
              {(() => { const Icon = DEVICE_CONFIG[activeDevice].icon; return <Icon size={10} className="text-slate-300" />; })()}
              <span className="text-[9px] text-slate-300 font-medium">{DEVICE_CONFIG[activeDevice].label}</span>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={onRemove}
              className="absolute top-2 right-2 z-10 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
            >
              <X size={12} className="text-white" />
            </button>

            {/* Image preview */}
            <div
              className="relative w-full overflow-hidden"
              style={{
                aspectRatio: deviceConfig.aspectRatio,
                background: '#111',
              }}
            >
              {/* Blur background (para banners horizontales) */}
              {currentMetadata?.objectFit === 'contain' && (
                <img
                  src={getPreviewUrl()}
                  aria-hidden="true"
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center',
                    filter: 'blur(16px) brightness(0.4) saturate(1.2)',
                    transform: 'scale(1.1)',
                  }}
                />
              )}

              {/* Main image */}
              <img
                src={getPreviewUrl()}
                alt="Vista previa hero"
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: getObjectFit(),
                  objectPosition: getObjectPosition(),
                }}
              />

              {/* Overlay */}
              <div
                style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 45%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Focal point indicator */}
              {currentMetadata && currentMetadata.objectFit === 'cover' && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${currentMetadata.focalX * 100}%`,
                    top: `${currentMetadata.focalY * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.8)',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                />
              )}
            </div>
          </div>

          {/* Info sobre el tipo */}
          {currentMetadata && (
            <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-slate-800/50">
              <Info size={11} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {currentMetadata.type === 'banner-horizontal'
                  ? `Banner muy ancho (${currentMetadata.aspectRatio.toFixed(1)}:1). Se muestra completo con fondo blur en los bordes. Altura: ${currentMetadata.heroHeightMobile}px mobile / ${currentMetadata.heroHeightDesktop}px desktop.`
                  : currentMetadata.type === 'landscape'
                  ? `Imagen horizontal (${currentMetadata.aspectRatio.toFixed(1)}:1). Se recorta inteligentemente enfocando el punto focal detectado.`
                  : currentMetadata.type === 'square'
                  ? `Imagen cuadrada (${currentMetadata.aspectRatio.toFixed(1)}:1). Se adapta bien a todos los dispositivos.`
                  : `Imagen vertical (${currentMetadata.aspectRatio.toFixed(1)}:1). Se recorta desde el centro del contenido principal.`}
              </p>
            </div>
          )}

          {/* Re-upload button */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full py-2 rounded-xl text-xs font-medium border border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300 transition-all"
          >
            Cambiar imagen
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}
