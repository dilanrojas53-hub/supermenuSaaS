/**
 * LandingTab — Configuración de la Página del Restaurante
 * Panel admin para gestionar la landing pública configurable por tenant.
 * v1.0 — SuperMenu SaaS
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { Tenant } from '@/lib/types';
import ImageUpload from '@/components/ImageUpload';
import {
  Globe, Save, Eye, EyeOff, Image, FileText, MapPin, Clock,
  Phone, Instagram, Facebook, MessageCircle, Trash2, Plus,
  GripVertical, ExternalLink, Info, ChevronDown, ChevronUp,
  Video, Loader2, Check,
} from 'lucide-react';

// ─── Estilos reutilizables ────────────────────────────────────────────────────
const CARD = 'bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 space-y-5';
const SECTION_TITLE = 'text-sm font-bold text-[var(--text-primary)] uppercase tracking-wide flex items-center gap-2';
const LABEL = 'block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide';
const INPUT = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none';
const TEXTAREA = 'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none resize-none';
const BTN_PRIMARY = 'flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl text-sm transition-all';
const BTN_GHOST = 'flex items-center gap-2 px-3 py-2 border border-[var(--border)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-xl text-sm transition-all';
const BTN_DANGER = 'flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm transition-all';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface LandingSettings {
  id?: string;
  tenant_id: string;
  enabled: boolean;
  hero_title: string;
  hero_subtitle: string;
  hero_description: string;
  hero_image_url: string;
  menu_pdf_url: string;
  about_title: string;
  about_description: string;
  concept: string;
  highlight_text: string;
  address: string;
  google_maps_url: string;
  google_maps_embed_url: string;
  phone: string;
  whatsapp: string;
  instagram_url: string;
  facebook_url: string;
  tiktok_url: string;
  business_hours: BusinessHour[];
  section_visibility: SectionVisibility;
  cta_whatsapp_message: string;
}

interface BusinessHour {
  day: string;
  open: string;
  close: string;
  closed: boolean;
}

interface SectionVisibility {
  hero: boolean;
  pdf: boolean;
  gallery: boolean;
  about: boolean;
  location: boolean;
  hours: boolean;
  social: boolean;
  cta: boolean;
}

interface GalleryImage {
  id?: string;
  tenant_id: string;
  image_url: string;
  title: string;
  alt_text: string;
  sort_order: number;
  is_active: boolean;
}

const DEFAULT_HOURS: BusinessHour[] = [
  { day: 'Lunes',     open: '08:00', close: '22:00', closed: false },
  { day: 'Martes',    open: '08:00', close: '22:00', closed: false },
  { day: 'Miércoles', open: '08:00', close: '22:00', closed: false },
  { day: 'Jueves',    open: '08:00', close: '22:00', closed: false },
  { day: 'Viernes',   open: '08:00', close: '22:00', closed: false },
  { day: 'Sábado',    open: '09:00', close: '23:00', closed: false },
  { day: 'Domingo',   open: '10:00', close: '20:00', closed: false },
];

const DEFAULT_VISIBILITY: SectionVisibility = {
  hero: true, pdf: true, gallery: true, about: true,
  location: true, hours: true, social: true, cta: true,
};

const DEFAULT_SETTINGS = (tenantId: string): LandingSettings => ({
  tenant_id: tenantId,
  enabled: false,
  hero_title: '',
  hero_subtitle: '',
  hero_description: '',
  hero_image_url: '',
  menu_pdf_url: '',
  about_title: '',
  about_description: '',
  concept: '',
  highlight_text: '',
  address: '',
  google_maps_url: '',
  google_maps_embed_url: '',
  phone: '',
  whatsapp: '',
  instagram_url: '',
  facebook_url: '',
  tiktok_url: '',
  business_hours: DEFAULT_HOURS,
  section_visibility: DEFAULT_VISIBILITY,
  cta_whatsapp_message: '',
});

// ─── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-amber-500' : 'bg-[var(--border)]'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ─── Collapsible Section ───────────────────────────────────────────────────────
function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={CARD}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between"
      >
        <span className={SECTION_TITLE}>{icon}{title}</span>
        {open ? <ChevronUp size={16} className="text-[var(--text-secondary)]" /> : <ChevronDown size={16} className="text-[var(--text-secondary)]" />}
      </button>
      {open && <div className="space-y-4 pt-2">{children}</div>}
    </div>
  );
}

// ─── PDF Uploader ──────────────────────────────────────────────────────────────
function PdfUpload({ currentUrl, onUpload }: { currentUrl: string; onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast.error('Solo se permiten archivos PDF'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('El PDF no puede superar 10 MB'); return; }
    setUploading(true);
    try {
      const ext = 'pdf';
      const fileName = `${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('menu-pdfs').upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('menu-pdfs').getPublicUrl(fileName);
      onUpload(data.publicUrl);
      toast.success('PDF subido correctamente');
    } catch (err: any) {
      toast.error('Error al subir el PDF: ' + (err.message || 'Error desconocido'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className={LABEL}>Menú PDF</label>
      <div className="flex gap-2 items-center">
        <label className={`${BTN_GHOST} cursor-pointer`}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          {uploading ? 'Subiendo...' : 'Subir PDF'}
          <input type="file" accept=".pdf" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
        {currentUrl && (
          <a href={currentUrl} target="_blank" rel="noopener noreferrer" className={BTN_GHOST}>
            <ExternalLink size={14} /> Ver PDF
          </a>
        )}
      </div>
      <div className="space-y-1">
        <label className={LABEL}>O pegar URL del PDF</label>
        <input
          type="url"
          value={currentUrl}
          onChange={e => onUpload(e.target.value)}
          placeholder="https://..."
          className={INPUT}
        />
      </div>
    </div>
  );
}

// ─── Gallery Manager ───────────────────────────────────────────────────────────
function GalleryManager({ tenantId, gallery, onRefresh }: {
  tenantId: string;
  gallery: GalleryImage[];
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  const addImage = async (url: string) => {
    const newItem: Omit<GalleryImage, 'id'> = {
      tenant_id: tenantId,
      image_url: url,
      title: '',
      alt_text: '',
      sort_order: gallery.length,
      is_active: true,
    };
    const { error } = await supabase.from('restaurant_landing_gallery').insert(newItem);
    if (error) { toast.error('Error al agregar imagen'); return; }
    toast.success('Imagen agregada');
    onRefresh();
  };

  const updateImage = async (id: string, field: keyof GalleryImage, value: any) => {
    setSaving(id);
    const { error } = await supabase.from('restaurant_landing_gallery').update({ [field]: value }).eq('id', id);
    setSaving(null);
    if (error) toast.error('Error al actualizar');
    else onRefresh();
  };

  const deleteImage = async (id: string) => {
    if (!confirm('¿Eliminar esta imagen de la galería?')) return;
    const { error } = await supabase.from('restaurant_landing_gallery').delete().eq('id', id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Imagen eliminada');
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-secondary)]">{gallery.length} imagen{gallery.length !== 1 ? 's' : ''}</span>
      </div>
      {/* Subir nueva imagen */}
      <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-4">
        <ImageUpload
          bucket="landing-images"
          currentUrl=""
          onUpload={addImage}
          label="Agregar foto a la galería"
          previewSize="sm"
        />
      </div>
      {/* Lista de imágenes */}
      <div className="space-y-3">
        {gallery.map((img) => (
          <div key={img.id} className="flex gap-3 items-start bg-[var(--bg-base)] rounded-xl p-3 border border-[var(--border)]">
            <img src={img.image_url} alt={img.alt_text || img.title} className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <input
                type="text"
                value={img.title}
                onChange={e => updateImage(img.id!, 'title', e.target.value)}
                placeholder="Título (opcional)"
                className={INPUT}
              />
              <div className="flex items-center gap-2">
                <Toggle checked={img.is_active} onChange={v => updateImage(img.id!, 'is_active', v)} />
                <span className="text-xs text-[var(--text-secondary)]">{img.is_active ? 'Visible' : 'Oculta'}</span>
                {saving === img.id && <Loader2 size={12} className="animate-spin text-amber-400" />}
              </div>
            </div>
            <button type="button" onClick={() => deleteImage(img.id!)} className={BTN_DANGER}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {gallery.length === 0 && (
          <p className="text-xs text-[var(--text-secondary)] text-center py-4">No hay fotos en la galería todavía.</p>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
interface LandingTabProps { tenant: Tenant; }

export default function LandingTab({ tenant }: LandingTabProps) {
  const [settings, setSettings] = useState<LandingSettings>(DEFAULT_SETTINGS(tenant.id));
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const publicUrl = `${window.location.origin}/${tenant.slug}/restaurante`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: ls }, { data: gal }] = await Promise.all([
      supabase.from('restaurant_landing_settings').select('*').eq('tenant_id', tenant.id).maybeSingle(),
      supabase.from('restaurant_landing_gallery').select('*').eq('tenant_id', tenant.id).order('sort_order'),
    ]);
    if (ls) {
      setSettings({
        ...ls,
        business_hours: Array.isArray(ls.business_hours) ? ls.business_hours : DEFAULT_HOURS,
        section_visibility: ls.section_visibility || DEFAULT_VISIBILITY,
      });
    }
    setGallery(gal || []);
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (field: keyof LandingSettings, value: any) =>
    setSettings(prev => ({ ...prev, [field]: value }));

  const setVisibility = (key: keyof SectionVisibility, value: boolean) =>
    setSettings(prev => ({
      ...prev,
      section_visibility: { ...prev.section_visibility, [key]: value },
    }));

  const setHour = (idx: number, field: keyof BusinessHour, value: any) =>
    setSettings(prev => {
      const hours = [...prev.business_hours];
      hours[idx] = { ...hours[idx], [field]: value };
      return { ...prev, business_hours: hours };
    });

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...settings,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (settings.id) {
      ({ error } = await supabase.from('restaurant_landing_settings').update(payload).eq('id', settings.id));
    } else {
      const { data, error: e } = await supabase.from('restaurant_landing_settings').insert(payload).select().single();
      error = e;
      if (data) setSettings(prev => ({ ...prev, id: data.id }));
    }
    setSaving(false);
    if (error) { toast.error('Error al guardar: ' + error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    toast.success('Página del restaurante guardada');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Globe size={20} className="text-amber-400" /> Página del Restaurante
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Configura la landing pública de tu restaurante. URL: <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline">{publicUrl}</a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Toggle checked={settings.enabled} onChange={v => set('enabled', v)} />
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {settings.enabled ? 'Página activa' : 'Página inactiva'}
            </span>
          </div>
          <button type="button" onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Aviso si está desactivada */}
      {!settings.enabled && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-300">
          <Info size={14} />
          La página está desactivada. Actívala arriba para que sea visible al público.
        </div>
      )}

      {/* Visibilidad de secciones */}
      <Section title="Secciones visibles" icon={<Eye size={16} className="text-amber-400" />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(DEFAULT_VISIBILITY) as (keyof SectionVisibility)[]).map(key => {
            const labels: Record<keyof SectionVisibility, string> = {
              hero: 'Hero', pdf: 'Menú PDF', gallery: 'Galería', about: 'Sobre nosotros',
              location: 'Ubicación', hours: 'Horarios', social: 'Redes', cta: 'CTA final',
            };
            return (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <Toggle checked={settings.section_visibility[key]} onChange={v => setVisibility(key, v)} />
                <span className="text-xs text-[var(--text-primary)]">{labels[key]}</span>
              </label>
            );
          })}
        </div>
      </Section>

      {/* Hero */}
      {settings.section_visibility.hero && (
        <Section title="Hero principal" icon={<Image size={16} className="text-amber-400" />}>
          <div className="space-y-3">
            <div>
              <label className={LABEL}>Título principal</label>
              <input type="text" value={settings.hero_title} onChange={e => set('hero_title', e.target.value)}
                placeholder={tenant.name} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Subtítulo / Tagline</label>
              <input type="text" value={settings.hero_subtitle} onChange={e => set('hero_subtitle', e.target.value)}
                placeholder="Tu frase memorable..." className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Descripción corta</label>
              <textarea rows={3} value={settings.hero_description} onChange={e => set('hero_description', e.target.value)}
                placeholder="Describe tu restaurante en pocas palabras..." className={TEXTAREA} />
            </div>
            <ImageUpload
              bucket="landing-images"
              currentUrl={settings.hero_image_url}
              onUpload={url => set('hero_image_url', url)}
              label="Imagen hero (banner principal)"
              previewSize="lg"
            />
          </div>
        </Section>
      )}

      {/* Menú PDF */}
      {settings.section_visibility.pdf && (
        <Section title="Menú PDF" icon={<FileText size={16} className="text-amber-400" />} defaultOpen={false}>
          <PdfUpload currentUrl={settings.menu_pdf_url} onUpload={url => set('menu_pdf_url', url)} />
        </Section>
      )}

      {/* Galería */}
      {settings.section_visibility.gallery && (
        <Section title="Galería de fotos" icon={<Image size={16} className="text-amber-400" />} defaultOpen={false}>
          <GalleryManager tenantId={tenant.id} gallery={gallery} onRefresh={fetchData} />
        </Section>
      )}

      {/* Sobre nosotros */}
      {settings.section_visibility.about && (
        <Section title="Sobre el restaurante" icon={<Info size={16} className="text-amber-400" />} defaultOpen={false}>
          <div className="space-y-3">
            <div>
              <label className={LABEL}>Título de la sección</label>
              <input type="text" value={settings.about_title} onChange={e => set('about_title', e.target.value)}
                placeholder="Sobre nosotros" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Descripción / Historia</label>
              <textarea rows={4} value={settings.about_description} onChange={e => set('about_description', e.target.value)}
                placeholder="Cuéntanos sobre tu restaurante..." className={TEXTAREA} />
            </div>
            <div>
              <label className={LABEL}>Concepto / Tipo de cocina</label>
              <input type="text" value={settings.concept} onChange={e => set('concept', e.target.value)}
                placeholder="Ej: Comida casera costarricense, Sushi fusión..." className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Frase destacada</label>
              <input type="text" value={settings.highlight_text} onChange={e => set('highlight_text', e.target.value)}
                placeholder="Ej: Desde 1985 cocinando con amor..." className={INPUT} />
            </div>
          </div>
        </Section>
      )}

      {/* Ubicación */}
      {settings.section_visibility.location && (
        <Section title="Ubicación" icon={<MapPin size={16} className="text-amber-400" />} defaultOpen={false}>
          <div className="space-y-3">
            <div>
              <label className={LABEL}>Dirección</label>
              <input type="text" value={settings.address} onChange={e => set('address', e.target.value)}
                placeholder="Ej: San José, frente al parque central" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Link de Google Maps</label>
              <input type="url" value={settings.google_maps_url} onChange={e => set('google_maps_url', e.target.value)}
                placeholder="https://maps.google.com/..." className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>URL de mapa embebido (iframe src)</label>
              <input type="url" value={settings.google_maps_embed_url} onChange={e => set('google_maps_embed_url', e.target.value)}
                placeholder="https://www.google.com/maps/embed?pb=..." className={INPUT} />
              <p className="text-xs text-[var(--text-secondary)] mt-1">En Google Maps → Compartir → Incorporar mapa → copiar solo el src del iframe.</p>
            </div>
          </div>
        </Section>
      )}

      {/* Horarios */}
      {settings.section_visibility.hours && (
        <Section title="Horarios" icon={<Clock size={16} className="text-amber-400" />} defaultOpen={false}>
          <div className="space-y-2">
            {settings.business_hours.map((h, i) => (
              <div key={h.day} className="flex items-center gap-3">
                <span className="w-24 text-xs font-medium text-[var(--text-primary)]">{h.day}</span>
                <Toggle checked={!h.closed} onChange={v => setHour(i, 'closed', !v)} />
                {!h.closed ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input type="time" value={h.open} onChange={e => setHour(i, 'open', e.target.value)}
                      className="flex-1 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-xs" />
                    <span className="text-xs text-[var(--text-secondary)]">–</span>
                    <input type="time" value={h.close} onChange={e => setHour(i, 'close', e.target.value)}
                      className="flex-1 px-2 py-1 bg-[var(--bg-base)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-xs" />
                  </div>
                ) : (
                  <span className="text-xs text-red-400 font-medium">Cerrado</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Contacto y redes */}
      {settings.section_visibility.social && (
        <Section title="Contacto y redes sociales" icon={<Phone size={16} className="text-amber-400" />} defaultOpen={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Teléfono</label>
              <input type="tel" value={settings.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+506 2222-3333" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>WhatsApp (solo números)</label>
              <input type="tel" value={settings.whatsapp} onChange={e => set('whatsapp', e.target.value)}
                placeholder="50688887777" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Instagram</label>
              <input type="url" value={settings.instagram_url} onChange={e => set('instagram_url', e.target.value)}
                placeholder="https://instagram.com/..." className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Facebook</label>
              <input type="url" value={settings.facebook_url} onChange={e => set('facebook_url', e.target.value)}
                placeholder="https://facebook.com/..." className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>TikTok</label>
              <input type="url" value={settings.tiktok_url} onChange={e => set('tiktok_url', e.target.value)}
                placeholder="https://tiktok.com/@..." className={INPUT} />
            </div>
          </div>
        </Section>
      )}

      {/* CTA WhatsApp */}
      {settings.section_visibility.cta && (
        <Section title="Llamado a la acción (CTA)" icon={<MessageCircle size={16} className="text-amber-400" />} defaultOpen={false}>
          <div>
            <label className={LABEL}>Mensaje de WhatsApp personalizado</label>
            <textarea rows={2} value={settings.cta_whatsapp_message} onChange={e => set('cta_whatsapp_message', e.target.value)}
              placeholder={`Hola, vi la página de ${tenant.name} y quiero hacer una consulta.`}
              className={TEXTAREA} />
            <p className="text-xs text-[var(--text-secondary)] mt-1">Si está vacío, se usa el mensaje por defecto.</p>
          </div>
        </Section>
      )}

      {/* Botón guardar final */}
      <div className="flex justify-end">
        <button type="button" onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}
