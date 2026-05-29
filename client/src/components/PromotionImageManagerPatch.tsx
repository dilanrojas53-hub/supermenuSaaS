import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Save, X, CalendarDays } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface PromotionRecord {
  id: string;
  name: string;
  promo_price: number | null;
  is_active: boolean;
  image_url: string | null;
  active_until: string | null;
}

function getSlugFromAdminPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('admin');
  return idx >= 0 ? parts[idx + 1] : undefined;
}

function isPromotionScreenVisible() {
  const text = (document.body.textContent || '').toLowerCase();
  return text.includes('motor de promociones') && text.includes('nueva promoción');
}

function toDatetimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
      if (!ctx) {
        reject(new Error('Canvas no disponible'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen')),
        'image/webp',
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = objectUrl;
  });
}

export default function PromotionImageManagerPatch() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<PromotionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});
  const [draftUntil, setDraftUntil] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const check = () => setVisible(isPromotionScreenVisible());
    check();
    const interval = window.setInterval(check, 800);
    return () => window.clearInterval(interval);
  }, []);

  const slug = useMemo(() => getSlugFromAdminPath(), []);

  async function loadPromotions() {
    if (!slug) return;
    setLoading(true);

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!tenant?.id) {
      setLoading(false);
      return;
    }

    setTenantId(tenant.id);
    const { data, error } = await supabase
      .from('promotions')
      .select('id,name,promo_price,is_active,image_url,active_until')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('No se pudieron cargar promociones');
      setLoading(false);
      return;
    }

    const rows = (data || []) as PromotionRecord[];
    setPromotions(rows);
    setDraftUrls(Object.fromEntries(rows.map(p => [p.id, p.image_url || ''])));
    setDraftUntil(Object.fromEntries(rows.map(p => [p.id, toDatetimeLocal(p.active_until)])));
    setLoading(false);
  }

  useEffect(() => {
    if (visible && open) loadPromotions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, open]);

  async function uploadImage(promo: PromotionRecord, file: File) {
    setSavingId(promo.id);
    try {
      const blob = await compressToWebP(file, 1200, 0.84);
      const fileName = `${tenantId || slug}/${promo.id}-${Date.now()}.webp`;

      let publicUrl = '';
      const upload = await supabase.storage
        .from('menu-images')
        .upload(fileName, blob, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: true,
        });

      if (!upload.error) {
        const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
        publicUrl = urlData.publicUrl;
      } else {
        // Fallback seguro si el bucket no existe o no tiene permisos: guarda data URL.
        publicUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('No se pudo leer imagen'));
          reader.readAsDataURL(blob);
        });
      }

      setDraftUrls(prev => ({ ...prev, [promo.id]: publicUrl }));
      await savePromotion(promo.id, publicUrl, draftUntil[promo.id] || '');
      toast.success('Imagen de promoción guardada');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Error subiendo imagen');
    } finally {
      setSavingId(null);
    }
  }

  async function savePromotion(id: string, imageUrl = draftUrls[id] || '', until = draftUntil[id] || '') {
    setSavingId(id);
    const payload: Record<string, any> = {
      image_url: imageUrl || null,
      active_until: until ? new Date(until).toISOString() : null,
    };

    const { error } = await supabase.from('promotions').update(payload).eq('id', id);
    if (error) {
      toast.error('No se pudo guardar la promoción');
      setSavingId(null);
      return;
    }

    setPromotions(prev => prev.map(p => p.id === id ? { ...p, image_url: payload.image_url, active_until: payload.active_until } : p));
    toast.success('Promoción actualizada');
    setSavingId(null);
  }

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-5 z-[9998] flex items-center gap-2 rounded-full px-4 py-3 text-sm font-black shadow-2xl active:scale-95"
        style={{ background: '#F59E0B', color: '#000', boxShadow: '0 12px 36px rgba(245,158,11,0.35)' }}
      >
        <ImageIcon size={16} /> Imágenes promos
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={() => setOpen(false)}>
          <div
            className="w-full md:max-w-2xl max-h-[86vh] overflow-hidden rounded-t-3xl md:rounded-3xl border border-white/10 bg-slate-950 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <h3 className="text-white font-black text-base">Imágenes y vencimiento de promociones</h3>
                <p className="text-slate-400 text-xs">Sube una imagen, pega una URL o define fecha de vencimiento.</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-slate-300">
                <X size={17} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[72vh] space-y-3">
              {loading ? (
                <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-amber-400" /></div>
              ) : promotions.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No hay promociones todavía.</p>
              ) : promotions.map(promo => {
                const img = draftUrls[promo.id] || '';
                const saving = savingId === promo.id;
                return (
                  <div key={promo.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
                    <div className="flex gap-3">
                      <div className="w-24 h-20 rounded-xl bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {img ? <img src={img} alt={promo.name} className="w-full h-full object-cover" /> : <ImageIcon className="text-slate-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-white text-sm font-bold leading-tight">{promo.name}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {promo.promo_price ? `Precio promo: ₡${promo.promo_price.toLocaleString()}` : 'Sin precio promo'}
                          {promo.is_active ? ' · activa' : ' · apagada'}
                        </div>
                        <button
                          type="button"
                          onClick={() => fileInputs.current[promo.id]?.click()}
                          className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-black"
                          disabled={saving}
                        >
                          {saving ? 'Guardando...' : 'Subir imagen'}
                        </button>
                        <input
                          ref={el => { fileInputs.current[promo.id] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) uploadImage(promo, file);
                            e.currentTarget.value = '';
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">URL de imagen</label>
                      <input
                        value={draftUrls[promo.id] || ''}
                        onChange={e => setDraftUrls(prev => ({ ...prev, [promo.id]: e.target.value }))}
                        placeholder="https://... o /promos/..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 mb-1 flex items-center gap-1"><CalendarDays size={12} /> Vence el</label>
                      <input
                        type="datetime-local"
                        value={draftUntil[promo.id] || ''}
                        onChange={e => setDraftUntil(prev => ({ ...prev, [promo.id]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/10 text-white text-xs outline-none focus:border-amber-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => savePromotion(promo.id)}
                      disabled={saving}
                      className="w-full py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: '#F59E0B', color: '#000' }}
                    >
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar cambios
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
