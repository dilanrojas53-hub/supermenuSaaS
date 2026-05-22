/**
 * RestaurantLanding — Página pública del restaurante
 * Ruta: /:slug/restaurante
 * Carga la configuración de restaurant_landing_settings y muestra una landing
 * mobile-first con los colores del branding del restaurante.
 * v1.0 — SuperMenu SaaS
 */
import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import {
  MapPin, Clock, Phone, Instagram, Facebook, MessageCircle,
  FileText, ArrowLeft, ExternalLink, ChevronLeft, ChevronRight,
  UtensilsCrossed, Tag, Loader2,
} from 'lucide-react';

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface LandingData {
  settings: LandingSettings | null;
  gallery: GalleryImage[];
  tenant: TenantBasic | null;
  theme: ThemeBasic | null;
}

interface LandingSettings {
  enabled: boolean;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_description: string | null;
  hero_image_url: string | null;
  menu_pdf_url: string | null;
  about_title: string | null;
  about_description: string | null;
  concept: string | null;
  highlight_text: string | null;
  address: string | null;
  google_maps_url: string | null;
  google_maps_embed_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  business_hours: BusinessHour[] | null;
  section_visibility: SectionVisibility;
  cta_whatsapp_message: string | null;
}

interface BusinessHour { day: string; open: string; close: string; closed: boolean; }
interface SectionVisibility {
  hero: boolean; pdf: boolean; gallery: boolean; about: boolean;
  location: boolean; hours: boolean; social: boolean; cta: boolean;
}

interface GalleryImage {
  id: string; image_url: string; title: string | null; alt_text: string | null;
  sort_order: number; is_active: boolean;
}

interface TenantBasic {
  id: string; slug: string; name: string; logo_url: string | null;
  whatsapp_number: string | null; address: string | null;
}

interface ThemeBasic {
  primary_color: string | null; background_color: string | null;
  text_color: string | null; surface_color: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildWaUrl(number: string, message: string) {
  const clean = number.replace(/\D/g, '');
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

function formatTime(t: string) {
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// ─── Gallery Carousel ─────────────────────────────────────────────────────────
function GalleryCarousel({ images, accent }: { images: GalleryImage[]; accent: string }) {
  const [idx, setIdx] = useState(0);
  const active = images.filter(i => i.is_active);
  if (!active.length) return null;

  const prev = () => setIdx(i => (i - 1 + active.length) % active.length);
  const next = () => setIdx(i => (i + 1) % active.length);

  return (
    <div className="relative">
      {/* Grid para 1-3 imágenes, carrusel para más */}
      {active.length <= 3 ? (
        <div className={`grid gap-2 ${active.length === 1 ? 'grid-cols-1' : active.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {active.map((img, i) => (
            <div key={img.id} className="relative aspect-square overflow-hidden rounded-2xl">
              <img src={img.image_url} alt={img.alt_text || img.title || ''} className="w-full h-full object-cover" />
              {img.title && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                  <p className="text-white text-xs truncate">{img.title}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl aspect-[4/3]">
          <img src={active[idx].image_url} alt={active[idx].alt_text || active[idx].title || ''} className="w-full h-full object-cover transition-all duration-300" />
          {active[idx].title && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-4 py-2">
              <p className="text-white text-sm">{active[idx].title}</p>
            </div>
          )}
          <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white">
            <ChevronLeft size={18} />
          </button>
          <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center text-white">
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-1">
            {active.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{ backgroundColor: i === idx ? accent : 'rgba(255,255,255,0.5)' }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function RestaurantLanding() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [, navigate] = useLocation();
  const [data, setData] = useState<LandingData>({ settings: null, gallery: [], tenant: null, theme: null });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      // 1. Cargar tenant
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, slug, name, logo_url, whatsapp_number, address')
        .eq('slug', slug)
        .maybeSingle();

      if (!tenant) { setNotFound(true); setLoading(false); return; }

      // 2. Cargar en paralelo: settings, gallery, theme
      const [{ data: settings }, { data: gallery }, { data: theme }] = await Promise.all([
        supabase.from('restaurant_landing_settings').select('*').eq('tenant_id', tenant.id).maybeSingle(),
        supabase.from('restaurant_landing_gallery').select('*').eq('tenant_id', tenant.id).order('sort_order'),
        supabase.from('theme_settings').select('primary_color,background_color,text_color,surface_color').eq('tenant_id', tenant.id).maybeSingle(),
      ]);

      setData({ settings, gallery: gallery || [], tenant, theme });
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 size={32} className="animate-spin text-amber-400" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white gap-4">
        <p className="text-lg font-semibold">Restaurante no encontrado</p>
        <button onClick={() => navigate('/')} className="text-amber-400 underline text-sm">Volver al inicio</button>
      </div>
    );
  }

  const { settings, gallery, tenant, theme } = data;

  // Colores del branding
  const accent = theme?.primary_color || '#F59E0B';
  const bg = theme?.background_color || '#0a0a0a';
  const textColor = theme?.text_color || '#f0f0f0';
  const surface = theme?.surface_color || '#1a1a1a';

  const vis = settings?.section_visibility || {
    hero: true, pdf: true, gallery: true, about: true,
    location: true, hours: true, social: true, cta: true,
  };

  // WhatsApp
  const waNumber = settings?.whatsapp || tenant?.whatsapp_number || '';
  const waMessage = settings?.cta_whatsapp_message || `Hola, vi la página de ${tenant?.name} y quiero hacer una consulta.`;
  const waUrl = waNumber ? buildWaUrl(waNumber, waMessage) : null;

  // Nombre y hero
  const heroTitle = settings?.hero_title || tenant?.name || '';
  const heroSubtitle = settings?.hero_subtitle || '';
  const heroDesc = settings?.hero_description || '';
  const heroImg = settings?.hero_image_url || '';

  const menuUrl = `/${slug}`;

  return (
    <div className="min-h-screen" style={{ backgroundColor: bg, color: textColor }}>
      {/* ── Barra superior de navegación ── */}
      <div
        className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: bg, borderColor: `${accent}22` }}
      >
        <button
          onClick={() => navigate(menuUrl)}
          className="flex items-center gap-2 text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
          style={{ color: textColor }}
        >
          <ArrowLeft size={16} /> Menú
        </button>
        <span className="text-sm font-bold" style={{ color: accent }}>{tenant?.name}</span>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-24 space-y-8 pt-6">

        {/* ── 1. HERO ── */}
        {vis.hero && (
          <section className="space-y-5">
            {/* Imagen hero */}
            {heroImg && (
              <div className="relative w-full aspect-[16/9] overflow-hidden rounded-3xl">
                <img src={heroImg} alt={heroTitle} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                {/* Logo + nombre sobre la imagen */}
                <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end gap-3">
                  {tenant?.logo_url && (
                    <img src={tenant.logo_url} alt={tenant.name} className="w-14 h-14 object-cover rounded-2xl border-2 border-white/20 flex-shrink-0" />
                  )}
                  <div>
                    <h1 className="text-2xl font-black text-white leading-tight">{heroTitle}</h1>
                    {heroSubtitle && <p className="text-sm text-white/80 mt-0.5">{heroSubtitle}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Sin imagen hero */}
            {!heroImg && (
              <div className="text-center py-8 space-y-3">
                {tenant?.logo_url && (
                  <img src={tenant.logo_url} alt={tenant.name} className="w-20 h-20 object-cover rounded-2xl mx-auto" />
                )}
                <h1 className="text-3xl font-black" style={{ color: textColor }}>{heroTitle}</h1>
                {heroSubtitle && <p className="text-base opacity-70">{heroSubtitle}</p>}
              </div>
            )}

            {/* Descripción */}
            {heroDesc && (
              <p className="text-sm leading-relaxed opacity-80 text-center">{heroDesc}</p>
            )}

            {/* Botones de acción */}
            <div className="flex flex-wrap gap-3 justify-center">
              <a href={menuUrl}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{ backgroundColor: accent, color: '#000' }}
              >
                <UtensilsCrossed size={15} /> Ver menú
              </a>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold border transition-all active:scale-95"
                  style={{ borderColor: accent, color: accent }}
                >
                  <MessageCircle size={15} /> Pedir por WhatsApp
                </a>
              )}
              {(settings?.google_maps_url || tenant?.address) && (
                <a href={settings?.google_maps_url || `https://maps.google.com/?q=${encodeURIComponent(settings?.address || tenant?.address || '')}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold border transition-all active:scale-95"
                  style={{ borderColor: `${textColor}33`, color: textColor, opacity: 0.8 }}
                >
                  <MapPin size={15} /> Cómo llegar
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── 2. MENÚ PDF ── */}
        {vis.pdf && settings?.menu_pdf_url && (
          <section className="rounded-3xl p-5 space-y-3" style={{ backgroundColor: surface }}>
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: textColor }}>
              <FileText size={16} style={{ color: accent }} /> Menú completo en PDF
            </h2>
            <p className="text-sm opacity-70">Consultá nuestro menú completo, precios y opciones disponibles.</p>
            <div className="flex gap-3">
              <a href={settings.menu_pdf_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: `${accent}22`, color: accent }}
              >
                <ExternalLink size={14} /> Ver menú PDF
              </a>
              <a href={settings.menu_pdf_url} download
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border"
                style={{ borderColor: `${textColor}22`, color: textColor, opacity: 0.7 }}
              >
                Descargar
              </a>
            </div>
          </section>
        )}

        {/* ── 3. GALERÍA ── */}
        {vis.gallery && gallery.filter(i => i.is_active).length > 0 && (
          <section className="space-y-4">
            <h2 className="font-bold text-base" style={{ color: textColor }}>Fotos</h2>
            <GalleryCarousel images={gallery} accent={accent} />
          </section>
        )}

        {/* ── 4. SOBRE NOSOTROS ── */}
        {vis.about && (settings?.about_description || settings?.concept || settings?.highlight_text) && (
          <section className="rounded-3xl p-5 space-y-3" style={{ backgroundColor: surface }}>
            <h2 className="font-bold text-base" style={{ color: textColor }}>
              {settings?.about_title || 'Sobre nosotros'}
            </h2>
            {settings?.about_description && (
              <p className="text-sm leading-relaxed opacity-80">{settings.about_description}</p>
            )}
            {settings?.concept && (
              <div className="flex items-center gap-2">
                <span className="text-xs px-3 py-1 rounded-full font-semibold"
                  style={{ backgroundColor: `${accent}22`, color: accent }}>
                  {settings.concept}
                </span>
              </div>
            )}
            {settings?.highlight_text && (
              <blockquote className="border-l-2 pl-3 text-sm italic opacity-70" style={{ borderColor: accent }}>
                {settings.highlight_text}
              </blockquote>
            )}
          </section>
        )}

        {/* ── 5. HORARIOS ── */}
        {vis.hours && settings?.business_hours && settings.business_hours.length > 0 && (
          <section className="rounded-3xl p-5 space-y-3" style={{ backgroundColor: surface }}>
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: textColor }}>
              <Clock size={16} style={{ color: accent }} /> Horarios
            </h2>
            <div className="space-y-1.5">
              {settings.business_hours.map(h => (
                <div key={h.day} className="flex justify-between text-sm">
                  <span className="font-medium" style={{ color: textColor }}>{h.day}</span>
                  {h.closed ? (
                    <span className="text-red-400 text-xs font-medium">Cerrado</span>
                  ) : (
                    <span className="opacity-70">{formatTime(h.open)} – {formatTime(h.close)}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 6. UBICACIÓN ── */}
        {vis.location && (settings?.address || settings?.google_maps_embed_url || settings?.google_maps_url) && (
          <section className="space-y-3">
            <h2 className="font-bold text-base flex items-center gap-2" style={{ color: textColor }}>
              <MapPin size={16} style={{ color: accent }} /> Ubicación
            </h2>
            {settings?.address && (
              <p className="text-sm opacity-80">{settings.address}</p>
            )}
            {settings?.google_maps_embed_url && (
              <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden">
                <iframe
                  src={settings.google_maps_embed_url}
                  width="100%" height="100%"
                  style={{ border: 0 }}
                  allowFullScreen loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Ubicación del restaurante"
                />
              </div>
            )}
            {settings?.google_maps_url && (
              <a href={settings.google_maps_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: accent }}
              >
                <ExternalLink size={14} /> Abrir en Google Maps
              </a>
            )}
          </section>
        )}

        {/* ── 7. CONTACTO Y REDES ── */}
        {vis.social && (settings?.phone || settings?.whatsapp || settings?.instagram_url || settings?.facebook_url || settings?.tiktok_url) && (
          <section className="rounded-3xl p-5 space-y-3" style={{ backgroundColor: surface }}>
            <h2 className="font-bold text-base" style={{ color: textColor }}>Contacto</h2>
            <div className="flex flex-wrap gap-3">
              {settings?.phone && (
                <a href={`tel:${settings.phone}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border"
                  style={{ borderColor: `${textColor}22`, color: textColor }}
                >
                  <Phone size={14} /> {settings.phone}
                </a>
              )}
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: '#25D366', color: '#fff' }}
                >
                  <MessageCircle size={14} /> WhatsApp
                </a>
              )}
              {settings?.instagram_url && (
                <a href={settings.instagram_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: '#E1306C22', color: '#E1306C' }}
                >
                  <Instagram size={14} /> Instagram
                </a>
              )}
              {settings?.facebook_url && (
                <a href={settings.facebook_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ backgroundColor: '#1877F222', color: '#1877F2' }}
                >
                  <Facebook size={14} /> Facebook
                </a>
              )}
              {settings?.tiktok_url && (
                <a href={settings.tiktok_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border"
                  style={{ borderColor: `${textColor}22`, color: textColor }}
                >
                  TikTok
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── 8. CTA FINAL ── */}
        {vis.cta && (
          <section className="rounded-3xl p-6 text-center space-y-4" style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}33` }}>
            <h2 className="text-xl font-black" style={{ color: textColor }}>¿Listo para pedir?</h2>
            <p className="text-sm opacity-70">Explora el menú completo y haz tu pedido ahora.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a href={menuUrl}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{ backgroundColor: accent, color: '#000' }}
              >
                <UtensilsCrossed size={15} /> Ver menú
              </a>
              {waUrl && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold border transition-all active:scale-95"
                  style={{ borderColor: accent, color: accent }}
                >
                  <MessageCircle size={15} /> Pedir por WhatsApp
                </a>
              )}
              <a href={`${menuUrl}?tab=promos`}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold border transition-all active:scale-95"
                style={{ borderColor: `${textColor}33`, color: textColor, opacity: 0.8 }}
              >
                <Tag size={15} /> Ver promociones
              </a>
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs opacity-30">Powered by SuperMenu</p>
        </div>
      </div>
    </div>
  );
}
