/*
 * ImageUpload: Componente reutilizable para subir imágenes a Supabase Storage.
 * Solo permite carga directa de archivos (drag & drop o clic). Sin campo de URL.
 */
import { useState, useRef, useCallback } from 'react';
import { X, Loader2, ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ImageUploadProps {
  bucket: string;
  currentUrl: string;
  onUpload: (url: string) => void;
  label?: string;
  className?: string;
  previewSize?: 'sm' | 'md' | 'lg';
}

export default function ImageUpload({
  bucket,
  currentUrl,
  onUpload,
  label = 'Subir imagen',
  className = '',
  previewSize = 'md',
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string>(currentUrl || '');
  const [dragOver, setDragOver] = useState(false);
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
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no debe superar 5MB');
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

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
    setUploading(false);
    toast.success('Imagen subida correctamente');
  }, [bucket, onUpload]);

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
            <span className="text-[10px] text-slate-400">Subiendo...</span>
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
          </>
        ) : (
          <div className="text-center p-3">
            <ImageIcon size={previewSize === 'sm' ? 18 : 28} className="text-slate-500 mx-auto mb-1.5" />
            <p className="text-xs text-slate-400 leading-tight">
              {previewSize === 'sm' ? 'Subir' : 'Arrastra una imagen o haz clic para seleccionar'}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Máximo 5MB</p>
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
