/*
 * ImageUpload: Componente reutilizable para subir imágenes a Supabase Storage.
 * OPTIMIZACIÓN: Comprime y convierte a WebP (max 1200px, calidad 82%) antes de subir.
 * Esto reduce imágenes de 2MB PNG a ~80-150KB WebP — 10-20x más rápido en carga.
 */
import { useState, useRef, useCallback } from 'react';
import { X, Loader2, ImageIcon, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ImageUploadProps {
  bucket: string;
  currentUrl: string;
  onUpload: (url: string) => void;
  label?: string;
  className?: string;
  previewSize?: 'sm' | 'md' | 'lg';
  /** Ancho máximo en px al que se redimensiona (default: 1200) */
  maxWidth?: number;
  /** Calidad WebP 0-1 (default: 0.82) */
  quality?: number;
}

/**
 * Comprime una imagen usando Canvas y la convierte a WebP.
 * Redimensiona si supera maxWidth manteniendo aspect ratio.
 */
async function compressToWebP(file: File, maxWidth = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas no disponible')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Error al comprimir imagen'));
        },
        'image/webp',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Error al leer imagen')); };
    img.src = objectUrl;
  });
}

export default function ImageUpload({
  bucket,
  currentUrl,
  onUpload,
  label = 'Subir imagen',
  className = '',
  previewSize = 'md',
  maxWidth = 1200,
  quality = 0.82,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>(currentUrl || '');
  const [dragOver, setDragOver] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const sizeClasses = {
    sm: 'w-20 h-20',
    md: 'w-full h-32',
    lg: 'w-full h-44',
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error('El archivo no debe superar 15MB');
      return;
    }

    setUploading(true);
    setCompressionInfo('');

    try {
      // Comprimir a WebP antes de subir
      const originalSizeKB = Math.round(file.size / 1024);
      const compressed = await compressToWebP(file, maxWidth, quality);
      const compressedSizeKB = Math.round(compressed.size / 1024);
      const reduction = Math.round((1 - compressed.size / file.size) * 100);

      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

      const { error } = await supabase.storage
        .from(bucket)
        .upload(fileName, compressed, {
          cacheControl: '31536000', // 1 año — las imágenes no cambian una vez subidas
          upsert: false,
          contentType: 'image/webp',
        });

      if (error) {
        console.error('Error al subir:', error);
        toast.error('Error al subir la imagen');
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      setPreview(publicUrl);
      onUpload(publicUrl);
      setCompressionInfo(`${originalSizeKB}KB → ${compressedSizeKB}KB (−${reduction}%)`);
      toast.success(`Imagen optimizada y subida (−${reduction}% tamaño)`);
    } catch (err) {
      console.error('Error al comprimir:', err);
      // Fallback: subir sin comprimir si el canvas falla
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { cacheControl: '31536000', upsert: false });
      if (!error) {
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        setPreview(urlData.publicUrl);
        onUpload(urlData.publicUrl);
        toast.success('Imagen subida correctamente');
      } else {
        toast.error('Error al subir la imagen');
      }
    }

    setUploading(false);
  }, [bucket, onUpload, maxWidth, quality]);

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

  const handleRemove = () => {
    setPreview('');
    setCompressionInfo('');
    onUpload('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={className}>
      {label && <label className="block text-xs text-slate-400 mb-1.5">{label}</label>}

      <div
        className={`${sizeClasses[previewSize]} rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden relative cursor-pointer transition-all ${
          dragOver
            ? 'border-amber-500 bg-amber-500/10'
            : preview
              ? 'border-slate-600 bg-slate-800'
              : 'border-slate-600 bg-slate-800 hover:border-slate-500 hover:bg-slate-700/50'
        }`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={24} className="text-amber-500 animate-spin" />
            <span className="text-[10px] text-slate-400">Optimizando...</span>
          </div>
        ) : preview ? (
          <>
            <img src={preview} alt="Vista previa" className="w-full h-full object-cover" />
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(); }}
              className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
            >
              <X size={12} className="text-white" />
            </button>
            {compressionInfo && (
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/70 rounded-full px-2 py-0.5">
                <CheckCircle2 size={10} className="text-emerald-400" />
                <span className="text-[9px] text-emerald-400 font-bold">{compressionInfo}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-center p-3">
            <ImageIcon size={previewSize === 'sm' ? 18 : 28} className="text-slate-500 mx-auto mb-1.5" />
            <p className="text-xs text-slate-400 leading-tight">
              {previewSize === 'sm' ? 'Subir' : 'Arrastra una imagen o haz clic para seleccionar'}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Se optimiza automáticamente a WebP</p>
          </div>
        )}
      </div>

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
