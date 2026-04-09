/*
 * Design: "Warm Craft" + Neuro-Ventas completo + i18n ES/EN.
 * V6.0 Cirugía Láser: Sistema de 4 colores nativos (bg, surface, text, accent).
 * Theming dinámico, scroll spy, platillo de la semana,
 * social proof toasts, upsell condicionado con delay,
 * carrito flotante con checkout SINPE/WhatsApp.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'wouter';
import { motion } from 'framer-motion';
import { MapPin, Loader2, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTenantData } from '@/hooks/useTenantData';
import { useMenuTranslation } from '@/hooks/useMenuTranslation';
import { CartProvider } from '@/contexts/CartContext';
import { I18nProvider, useI18n } from '@/contexts/I18nContext';
import { TENANT_HERO_IMAGES, getFontFamily, getPlanFeatures } from '@/lib/types';
import { getContrastColor } from '@/lib/utils';
import type { MenuItem } from '@/lib/types';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/imageUtils';
import type { PlanTier } from '@/lib/plans';
import MenuItemCard from '@/components/MenuItemCard';
import FeaturedDish from '@/components/FeaturedDish';
import FloatingCart from '@/components/FloatingCart';
import CartDrawer from '@/components/CartDrawer';
import SocialProofToast from '@/components/SocialProofToast';
import PoweredByFooter from '@/components/PoweredByFooter';
import ActiveOrderFAB from '@/components/ActiveOrderFAB';
import ProductDetailModal from '@/components/ProductDetailModal';
import { useAnimationConfig } from '@/contexts/AnimationContext';
import { applyRestaurantTheme } from '@/lib/themes';
import BottomNav, { type BottomNavTab } from '@/components/BottomNav';
import { useMenuConfig } from '@/hooks/useMenuConfig';
import { useCustomerProfile, CustomerProfileProvider } from '@/contexts/CustomerProfileContext';
import CategoryFullScreen from '@/components/CategoryFullScreen';
import ProfileScreen from '@/components/ProfileScreen';
import PhoneLoginSheet from '@/components/PhoneLoginSheet';
import PromosScreen from '@/components/PromosScreen';
import HistoryScreen from '@/components/HistoryScreen';
import { useFavorites } from '@/hooks/useFavorites';

function MenuContent() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { data, loading, error } = useTenantData(slug);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // V12.0 Master Toggle: Macro-Categorías Comidas vs Bebidas
  const [masterTab, setMasterTab] = useState<'food' | 'drinks'>('food');
  // V19.0 Franjas Horarias
  const [menuSections, setMenuSections] = useState<{ id: string; name: string; icon: string; sort_order: number; is_active: boolean; itemIds: string[] }[]>([]);
  const [activeSection, setActiveSection] = useState<string | 'all'>('all');
  const [bottomNavTab, setBottomNavTab] = useState<BottomNavTab>('menu');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [fullScreenCatId, setFullScreenCatId] = useState<string | null>(null);
  // Fix 3: pedido activo para tab 'order'
  const [activeOrderData, setActiveOrderData] = useState<{ orderId: string; orderNumber: number; status: string } | null>(null);
  const [showLoginSheet, setShowLoginSheet] = useState(false);
  const [pendingPromo, setPendingPromo] = useState<{ id: string; name: string; type: string; value: number } | null>(null);
  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem('active_order');
        setActiveOrderData(raw ? JSON.parse(raw) : null);
      } catch { setActiveOrderData(null); }
    };
    check();
    const iv = setInterval(check, 3000);
    return () => clearInterval(iv);
  }, []);
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabsRef = useRef<HTMLDivElement>(null);
  const { lang, toggleLang, t } = useI18n();
  const { config: menuConfig } = useMenuConfig(data?.tenant.id);
  // CustomerProfile — solo se usa si enable_profiles está activo
  // NOTE: useCustomerProfile() is available here because CustomerProfileProvider
  // is rendered below wrapping the actual content (see return statement)
  const { profile: customerProfile } = useCustomerProfile();

  // Favoritos del cliente
  const { isFavorite, toggleFavorite } = useFavorites({
    customerId: customerProfile?.id ?? null,
    tenantId: data?.tenant?.id ?? '',
  });

  // Dynamic translation of ALL DB content
  const { translatedData, isTranslating } = useMenuTranslation(
    data ? { name: data.tenant.name, description: data.tenant.description, address: data.tenant.address } : { name: '' },
    data?.categories || [],
    data?.menuItems || [],
    lang
  );

  // Feature flags based on plan tier (usando nuevo sistema de capabilities)
  const features = useMemo(() => {
    const tier = (data?.tenant.plan_tier || 'premium') as PlanTier;
    return getPlanFeatures(tier);
  }, [data]);

  // Save tenant slug for OrderStatus navigation
  useEffect(() => {
    if (slug) localStorage.setItem('last_tenant_slug', slug);
  }, [slug]);

  // V18.0: Inyectar colores del restaurante desde Supabase como CSS vars (fix: ya no usa localStorage)
  useEffect(() => {
    if (!data) return;
    applyRestaurantTheme({
      background: data.theme.background_color || '#0a0a0a',
      surface:    data.theme.surface_color    || '#161616',
      text:       data.theme.text_color       || '#f5f5f5',
      primary:    data.theme.primary_color    || '#c6a75e',
      badge:      (data.theme as any).badge_color || data.theme.primary_color || '#c6a75e',
    });
  }, [data]);

  // Push animation config to global context
  const { setAnimationConfig } = useAnimationConfig();
  useEffect(() => {
    if (data) {
      setAnimationConfig({
        animation: data.theme.theme_animation,
        primaryColor: data.theme.primary_color,
        secondaryColor: data.theme.secondary_color,
        backgroundColor: data.theme.background_color,
      });
    }
  }, [data, setAnimationConfig]);

  // Set first category as active
  useEffect(() => {
    if (data?.categories.length && !activeCategory) {
      setActiveCategory(data.categories[0].id);
    }
  }, [data, activeCategory]);

  // Featured item (is_featured = true)
  const featuredItem = useMemo(() => {
    return data?.menuItems.find(item => item.is_featured) || null;
  }, [data]);

  // Items grouped by category
  const itemsByCategory = useMemo(() => {
    if (!data) return {};
    const grouped: Record<string, MenuItem[]> = {};
    const cats = translatedData.categories.length ? translatedData.categories : data.categories;
    const items = translatedData.menuItems.length ? translatedData.menuItems : data.menuItems;
    cats.forEach(cat => {
      grouped[cat.id] = items.filter(item => item.category_id === cat.id);
    });
    return grouped;
  }, [data, translatedData]);

  const handleCategoryClick = (categoryId: string) => {
    setActiveCategory(categoryId);
    const el = categoryRefs.current[categoryId];
    if (el) {
      const offset = 140;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const handleOpenDetail = (item: MenuItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  // Scroll spy for categories
  useEffect(() => {
    if (!data) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveCategory(entry.target.getAttribute('data-category-id'));
          }
        });
      },
      { rootMargin: '-150px 0px -60% 0px', threshold: 0 }
    );
    Object.values(categoryRefs.current).forEach(el => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [data]);

  // V19.0 Franjas Horarias: cargar secciones del admin (DEBE estar antes de cualquier return condicional)
  useEffect(() => {
    if (!data?.tenant.id) return;
    const loadSections = async () => {
      const { data: sData } = await supabase.from('menu_sections').select('*').eq('tenant_id', data.tenant.id).eq('is_active', true).order('sort_order');
      if (!sData || sData.length === 0) { setMenuSections([]); return; }
      const { data: siData } = await supabase.from('menu_section_items').select('*').in('section_id', sData.map((s: any) => s.id));
      const sections = sData.map((s: any) => ({
        ...s,
        itemIds: (siData || []).filter((si: any) => si.section_id === s.id).map((si: any) => si.item_id)
      }));
      setMenuSections(sections);
    };
    loadSections();
  }, [data?.tenant.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--menu-bg)' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <Loader2 size={32} style={{ color: 'var(--menu-accent)' }} />
        </motion.div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--menu-bg)' }}>
        <div className="text-center">
          <p className="text-5xl mb-4">🍴</p>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--menu-text)', fontFamily: "'Lora', serif" }}>
            {t('menu.closed')}
          </h1>
          <p style={{ color: 'var(--menu-text)', opacity: 0.7 }}>
            {lang === 'es' ? 'Verifica el enlace e intenta de nuevo.' : 'Check the link and try again.'}
          </p>
        </div>
      </div>
    );
  }

  const { tenant: rawTenant, theme } = data;
  const tenant = lang === 'en' ? { ...rawTenant, ...translatedData.tenant } : rawTenant;
  const categories = translatedData.categories.length ? translatedData.categories : data.categories;
  const translatedMenuItems = translatedData.menuItems.length ? translatedData.menuItems : data.menuItems;

  // V12.1 Macro-Categorías: usar is_drink del campo BD (no por nombre, funciona en cualquier idioma)
  // Categorías solo-sección: inactivas pero con items asignados a franjas horarias
  // Se excluyen del modo "Todo el menú" pero se muestran al seleccionar una franja
  const hasDrinks = categories.some(cat => cat.is_drink && !(cat as any)._sectionOnly);
  const hasFood = categories.some(cat => !cat.is_drink && !(cat as any)._sectionOnly);
  // Filtrar categorías según el tab activo (excluir _sectionOnly en modo "all")
  const masterFilteredCategories = (hasDrinks && hasFood)
    ? categories.filter(cat =>
        !(cat as any)._sectionOnly &&
        (masterTab === 'drinks' ? cat.is_drink : !cat.is_drink)
      )
    : categories.filter(cat => !(cat as any)._sectionOnly);

  // Filtrar por sección activa (basado en platillos individuales)
  const activeSectionItemIds: string[] | null = (activeSection !== 'all' && menuSections.length > 0)
    ? (menuSections.find(s => s.id === activeSection)?.itemIds || [])
    : null;
  // visibleCategories: en modo sección, incluir también categorías _sectionOnly que tengan items en la sección
  const visibleCategories = activeSectionItemIds === null
    ? masterFilteredCategories
    : categories.filter(cat =>
        translatedMenuItems.some(item => item.category_id === cat.id && activeSectionItemIds.includes(item.id))
      );
  const heroImage = theme.hero_image_url || TENANT_HERO_IMAGES[tenant.slug] || '';
  const bodyFont = getFontFamily(theme.font_family);
  // Detecta tema Clean White para aplicar estilos minimalistas
  const cleanWhiteTheme = theme.theme_preset_key === 'clean_white' ||
    (theme.background_color === '#FFFFFF' && theme.text_color === '#0A0A0A' && theme.primary_color === '#0A0A0A');

  // Check if restaurant is closed
  if (!tenant.is_open) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'var(--menu-bg)', fontFamily: bodyFont }}
      >
        <div className="text-center">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--menu-text)', fontFamily: "'Lora', serif" }}>
            {tenant.name}
          </h1>
          <p style={{ color: 'var(--menu-text)', opacity: 0.7 }}>
            {t('menu.closed')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-24 relative z-[1]"
      style={{
        background: cleanWhiteTheme
          ? '#FFFFFF'
          : 'radial-gradient(ellipse at top center, var(--menu-surface) 0%, var(--menu-bg) 40%, var(--menu-bg) 100%)',
        color: 'var(--menu-text)',
        fontFamily: bodyFont,
        transition: 'background 0.3s ease',
      }}
    >
      {/* Social Proof Toast (Neuro-Ventas) — only for pro/premium */}
      {features.socialProof && <SocialProofToast tenantId={tenant.id} theme={theme} />}

      {/* Hero Section — aspect-ratio responsivo: 16:7 en móvil, comprime automáticamente */}
      <div
        className="relative overflow-hidden w-full"
        style={{
          /* aspect-ratio: en móvil ~16:7, en pantallas anchas se limita a 280px de alto máximo */
          aspectRatio: '16 / 7',
          maxHeight: '280px',
          minHeight: '160px',
        }}
      >
        {heroImage && (
          <img
            src={getOptimizedImageUrl(heroImage, IMAGE_SIZES.hero.width, IMAGE_SIZES.hero.quality)}
            alt={tenant.name}
            className="w-full h-full object-cover scale-105"
            style={{ filter: cleanWhiteTheme ? 'brightness(0.9)' : 'brightness(0.85)' }}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        )}
        {!heroImage && (
          <div className="w-full h-full" style={{ background: cleanWhiteTheme
            ? `linear-gradient(135deg, ${theme.primary_color || '#0A0A0A'}22 0%, ${theme.background_color || '#FFFFFF'} 100%)`
            : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }} />
        )}
        {/* Overlay automático: oscuro en temas oscuros, claro/transparente en temas claros */}
        <div
          className="absolute inset-0"
          style={{
            background: cleanWhiteTheme
              ? 'linear-gradient(to top, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.1) 60%, rgba(0,0,0,0.0) 100%)'
              : 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 55%, rgba(0,0,0,0.15) 100%)',
          }}
        />

        {/* i18n Toggle */}
        {features.i18n && (
          <button
            onClick={toggleLang}
            disabled={isTranslating}
            className="absolute top-4 right-4 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md transition-all active:scale-95 disabled:opacity-60"
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
          >
            {isTranslating ? (
              <><Loader2 size={13} className="animate-spin" /><span>{lang === 'es' ? 'EN' : 'ES'}</span></>
            ) : (
              <><Globe size={13} /><span>{lang === 'es' ? 'EN' : 'ES'}</span></>
            )}
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-5 pb-6">
          {/* Logo solo se muestra si no hay wordmark */}
          {tenant.logo_url && !theme.wordmark_url && (
            <img
              src={tenant.logo_url}
              alt={`${tenant.name} logo`}
              className="w-16 h-16 object-cover mb-3 shadow-2xl"
              style={{
                border: cleanWhiteTheme ? '2.5px solid rgba(0,0,0,0.15)' : '2.5px solid rgba(255,255,255,0.35)',
                borderRadius: (rawTenant.logo_shape === 'circle') ? '50%' : (rawTenant.logo_shape === 'square') ? '6px' : '16px',
              }}
            />
          )}
          {theme.wordmark_url ? (
            <motion.img
              src={theme.wordmark_url}
              alt={tenant.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                /* El slider (wordmark_max_width) controla la altura del wordmark.
                   El ancho se adapta automáticamente para mantener proporciones.
                   Esto funciona bien tanto para logos portrait como landscape. */
                height: `${Math.min(theme.wordmark_max_width || 80, 120)}px`,
                maxWidth: 'calc(100vw - 40px)',
                width: 'auto',
                objectFit: 'contain',
                display: 'block',
                marginBottom: '8px',
                filter: 'drop-shadow(0 2px 16px rgba(0,0,0,0.7))',
                marginLeft: theme.wordmark_align === 'center' ? 'auto' : theme.wordmark_align === 'right' ? 'auto' : '0',
                marginRight: theme.wordmark_align === 'center' ? 'auto' : theme.wordmark_align === 'right' ? '0' : 'auto',
                borderRadius: (theme as any).wordmark_shape === 'circle' ? '50%' : (theme as any).wordmark_shape === 'square' ? '6px' : (theme as any).wordmark_shape === 'rounded' ? '12px' : undefined,
              }}
            />
          ) : (
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-black leading-tight mb-1.5"
              style={{
                fontFamily: "'Lora', serif",
                letterSpacing: '-0.02em',
                color: cleanWhiteTheme ? '#0A0A0A' : '#ffffff',
                textShadow: cleanWhiteTheme ? 'none' : '0 2px 12px rgba(0,0,0,0.6)'
              }}
            >
              {tenant.name}
            </motion.h1>
          )}
          {tenant.description && (
            <p className="text-sm leading-relaxed line-clamp-2"
              style={{
                color: cleanWhiteTheme ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.75)',
                textShadow: cleanWhiteTheme ? 'none' : '0 1px 6px rgba(0,0,0,0.5)'
              }}>
              {tenant.description}
            </p>
          )}
          {tenant.address && (
            <div className="flex items-center gap-1.5 mt-2 text-xs"
              style={{ color: cleanWhiteTheme ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)' }}>
              <MapPin size={11} />
              <span>{tenant.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* V19.0 Selector de Franjas Horarias */}
      {menuSections.length > 0 && (
        <div style={{ padding: '10px 16px 0', display: 'flex', gap: '8px', overflowX: 'auto' }}>
          <button
            onClick={() => { setActiveSection('all'); setActiveCategory(null); }}
            style={{
              flexShrink: 0,
              padding: '8px 16px',
              borderRadius: '20px',
              fontWeight: activeSection === 'all' ? 700 : 500,
              fontSize: '13px',
              backgroundColor: activeSection === 'all' ? ((theme as any).badge_color || theme.primary_color) : 'rgba(255,255,255,0.08)',
              color: activeSection === 'all' ? '#fff' : theme.text_color,
              border: activeSection === 'all' ? 'none' : '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            🕐 Todo el menú
          </button>
          {menuSections.map(section => (
            <button
              key={section.id}
              onClick={() => { setActiveSection(section.id); setActiveCategory(null); }}
              style={{
                flexShrink: 0,
                padding: '8px 16px',
                borderRadius: '20px',
                fontWeight: activeSection === section.id ? 700 : 500,
                fontSize: '13px',
                backgroundColor: activeSection === section.id ? ((theme as any).badge_color || theme.primary_color) : 'rgba(255,255,255,0.08)',
                color: activeSection === section.id ? '#fff' : theme.text_color,
                border: activeSection === section.id ? 'none' : '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {section.icon} {section.name}
            </button>
          ))}
        </div>
      )}

      {/* V12.0 Master Toggle: Macro-Categorías Comidas vs Bebidas */}
      {hasDrinks && hasFood && (
        <div
          style={{ display: 'flex', gap: '8px', padding: '12px 16px' }}
        >
          <button
            onClick={() => { setMasterTab('food'); setActiveCategory(null); }}
            style={masterTab === 'food' ? {
              flex: 1,
              padding: '12px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '16px',
              backgroundColor: (theme as any).badge_color || theme.primary_color,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            } : {
              flex: 1,
              padding: '12px',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '16px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: theme.text_color,
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
            }}
          >
            Comidas
          </button>
          <button
            onClick={() => { setMasterTab('drinks'); setActiveCategory(null); }}
            style={masterTab === 'drinks' ? {
              flex: 1,
              padding: '12px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '16px',
              backgroundColor: (theme as any).badge_color || theme.primary_color,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            } : {
              flex: 1,
              padding: '12px',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '16px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: theme.text_color,
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer',
            }}
          >
            🍹 Bebidas
          </button>
        </div>
      )}

      {/* Category Tabs — Sticky V11.0: usa el color del tema del restaurante */}
      <div
        ref={tabsRef}
        className="sticky top-0 z-40 overflow-x-auto scrollbar-hide"
        style={{
          backgroundColor: cleanWhiteTheme ? '#FFFFFF' : 'var(--menu-bg)',
          borderBottom: cleanWhiteTheme ? '1px solid #E5E5E5' : '1px solid var(--menu-border)',
          boxShadow: cleanWhiteTheme ? 'none' : '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div className="flex gap-2 px-4 py-3 min-w-max">
          {visibleCategories.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-200"
                style={cleanWhiteTheme ? {
                  backgroundColor: isActive ? '#0A0A0A' : '#F5F5F5',
                  color: isActive ? '#FFFFFF' : '#0A0A0A',
                  fontWeight: isActive ? 700 : 500,
                  boxShadow: 'none',
                  border: 'none',
                  letterSpacing: '0',
                } : {
                  backgroundColor: isActive ? 'var(--menu-badge)' : 'var(--menu-surface)',
                  color: isActive ? '#ffffff' : 'var(--menu-text)',
                  fontWeight: isActive ? 800 : 500,
                  boxShadow: isActive ? '0 4px 14px rgba(0,0,0,0.2)' : 'none',
                  border: isActive ? 'none' : '1px solid var(--menu-border)',
                  letterSpacing: isActive ? '-0.01em' : '0',
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Featured Dish (Platillo de la Semana) */}
      {features.featuredDish && featuredItem && (
        <div className="mt-4">
          <FeaturedDish
            item={translatedMenuItems.find(i => i.id === featuredItem.id) || featuredItem}
            theme={theme}
          />
        </div>
      )}

      {/* ── BLOQUES DE CATEGORÍA: preview horizontal + CTA "Ver todo" ── */}
      <div className="px-4 sm:px-6 md:px-8 mt-2 pb-4">
        {visibleCategories.map(cat => {
          const allCatItems = itemsByCategory[cat.id] || [];
          const catItems = activeSectionItemIds !== null
            ? allCatItems.filter(item => activeSectionItemIds.includes(item.id))
            : allCatItems;
          if (catItems.length === 0) return null;

          // Modo preview horizontal (configurable)
          const useHorizontalPreview = menuConfig.category_preview_horizontal;
          const previewCount = menuConfig.category_preview_count;
          const previewItems = catItems.slice(0, previewCount);
          const hasMore = catItems.length > previewCount;

          return (
            <div
              key={cat.id}
              ref={el => { categoryRefs.current[cat.id] = el; }}
              data-category-id={cat.id}
              className="mb-8"
            >
              {/* Category header */}
              <div className="flex items-end justify-between mb-3 mt-2">
                <div>
                  <h2
                    className="text-2xl font-black leading-tight"
                    style={cleanWhiteTheme
                      ? { fontFamily: 'system-ui, sans-serif', color: '#0A0A0A', letterSpacing: '-0.02em', fontWeight: 700, fontSize: '18px' }
                      : { fontFamily: "'Lora', serif", color: 'var(--menu-text)', letterSpacing: '-0.02em' }}
                  >
                    {cat.name}
                  </h2>
                  {cat.description && menuConfig.show_product_description && (
                    <p className="text-xs mt-0.5 leading-snug" style={{ color: cleanWhiteTheme ? '#666666' : 'var(--menu-text)', opacity: cleanWhiteTheme ? 1 : 0.55 }}>
                      {cat.description}
                    </p>
                  )}
                </div>
                {/* CTA Ver toda la categoría */}
                {menuConfig.show_view_all_cta && hasMore && (
                  <button
                    onClick={() => setFullScreenCatId(cat.id)}
                    className="text-xs font-bold flex-shrink-0 ml-3 px-3 py-1.5 rounded-full transition-all active:scale-95"
                    style={cleanWhiteTheme ? {
                      backgroundColor: 'transparent',
                      color: '#0A0A0A',
                      border: '1px solid #0A0A0A',
                      opacity: 0.8,
                    } : {
                      backgroundColor: 'var(--menu-accent)',
                      color: '#fff',
                      opacity: 0.9,
                    }}
                  >
                    {`Ver todo (${catItems.length})`}
                  </button>
                )}
              </div>

              {/* Organic divider - solo en temas oscuros */}
              {!cleanWhiteTheme && (
                <svg viewBox="0 0 200 8" className="w-16 mb-3 opacity-25" style={{ color: 'var(--menu-accent)' }}>
                  <path d="M0 4 Q25 0, 50 4 T100 4 T150 4 T200 4" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}

              {/* Items: preview horizontal o grid completo */}
              {useHorizontalPreview && expandedCategory !== cat.id ? (
                // Preview horizontal con scroll (móvil) o grid responsivo (tablet+)
                <>
                <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {previewItems.map(item => (
                    <div key={item.id}>
                      <MenuItemCard
                        item={item}
                        theme={theme}
                        viewMode="grid"
                        allItems={data.menuItems}
                        showBadges={features.neuroBadges}
                        onOpenDetail={handleOpenDetail}
                        isFavorite={isFavorite(item.id)}
                        onToggleFavorite={toggleFavorite}
                      />
                    </div>
                  ))}
                  {hasMore && menuConfig.show_view_all_cta && (
                    <div
                      className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer active:scale-95 transition-all"
                      style={{ borderColor: 'var(--menu-accent)', opacity: 0.6, minHeight: '140px' }}
                      onClick={() => setFullScreenCatId(cat.id)}
                    >
                      <span className="text-2xl mb-1">→</span>
                      <span className="text-[10px] font-bold text-center px-2" style={{ color: 'var(--menu-text)' }}>
                        {catItems.length - previewCount} más
                      </span>
                    </div>
                  )}
                </div>
                <div className="sm:hidden flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                  {previewItems.map(item => (
                    <div key={item.id} className="flex-shrink-0" style={{ width: '160px' }}>
                      <MenuItemCard
                        item={item}
                        theme={theme}
                        viewMode="grid"
                        allItems={data.menuItems}
                        showBadges={features.neuroBadges}
                        onOpenDetail={handleOpenDetail}
                        isFavorite={isFavorite(item.id)}
                        onToggleFavorite={toggleFavorite}
                      />
                    </div>
                  ))}
                  {/* Tarjeta "Ver más" al final del scroll */}
                  {hasMore && menuConfig.show_view_all_cta && (
                    <div
                      className="flex-shrink-0 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed cursor-pointer active:scale-95 transition-all"
                      style={{ width: '100px', minHeight: '140px', borderColor: 'var(--menu-accent)', opacity: 0.6 }}
                      onClick={() => setFullScreenCatId(cat.id)}
                    >
                      <span className="text-2xl mb-1">→</span>
                      <span className="text-[10px] font-bold text-center px-2" style={{ color: 'var(--menu-text)' }}>
                        {catItems.length - previewCount} más
                      </span>
                    </div>
                  )}
                </div>
                </>
              ) : (
                // Vista completa: grid responsivo o lista según config
                <div className={
                  menuConfig.category_view_mode === 'grid' || theme.view_mode === 'grid'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'
                    : cleanWhiteTheme
                      ? 'flex flex-col'
                      : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'
                }>
                  {catItems.map(item => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      theme={theme}
                      viewMode={theme.view_mode}
                      allItems={data.menuItems}
                      showBadges={features.neuroBadges}
                      onOpenDetail={handleOpenDetail}
                      isFavorite={isFavorite(item.id)}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Cart — desactivado: el acceso al carrito vive en BottomNav tab 'order' */}

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => { setCartOpen(false); setPendingPromo(null); }}
        theme={theme}
        tenant={tenant}
        allMenuItems={data.menuItems}
        allCategories={data.categories}
        pendingPromo={pendingPromo}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal
        item={detailItem}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        theme={theme}
        tenant={tenant}
      />

      {/* Active Order FAB — mini banner solo cuando el usuario está en tab menu */}
      {bottomNavTab === 'menu' && <ActiveOrderFAB />}

      {/* Powered By Footer — V16.6: adaptado al tema del restaurante */}
      <PoweredByFooter
        bgColor={theme.background_color}
        textColor={theme.text_color}
      />

      {/* ── PANTALLA MI PERFIL ── */}
      <ProfileScreen
        isOpen={bottomNavTab === 'profile'}
        onClose={() => setBottomNavTab('menu')}
        theme={theme}
        tenant={tenant}
        onOpenLogin={() => setShowLoginSheet(true)}
      />

      {/* ── PANTALLA PROMOS ── */}
      <PromosScreen
        isOpen={bottomNavTab === 'promos'}
        onClose={() => setBottomNavTab('menu')}
        theme={theme}
        tenant={tenant}
        onPromoSelect={(promo) => {
          setPendingPromo(promo);
          setBottomNavTab('menu');
          setCartOpen(true);
        }}
      />

      {/* ── PANTALLA HISTORIAL ── */}
      <HistoryScreen
        isOpen={bottomNavTab === 'history'}
        onClose={() => setBottomNavTab('menu')}
        theme={theme}
        tenant={tenant}
        onOpenLogin={() => setShowLoginSheet(true)}
      />

      {/* ── SHEET DE LOGIN OTP ── */}
      <PhoneLoginSheet
        isOpen={showLoginSheet}
        onClose={() => setShowLoginSheet(false)}
        tenantId={tenant.id}
        accentColor={theme.primary_color || '#F59E0B'}
        bgColor={theme.background_color || '#0a0a0a'}
        textColor={theme.text_color || '#f0f0f0'}
      />

      {/* ── PANTALLA COMPLETA DE CATEGORÍA ── */}
      {fullScreenCatId && (() => {
        const fsCat = visibleCategories.find(c => c.id === fullScreenCatId);
        const fsCatItems = fsCat ? (activeSectionItemIds !== null
          ? (itemsByCategory[fsCat.id] || []).filter(i => activeSectionItemIds.includes(i.id))
          : (itemsByCategory[fsCat.id] || [])) : [];
        return fsCat ? (
          <CategoryFullScreen
            category={fsCat}
            items={fsCatItems}
            theme={theme}
            tenant={tenant}
            allItems={data.menuItems}
            showBadges={features.neuroBadges}
            onClose={() => setFullScreenCatId(null)}
          />
        ) : null;
      })()}

      {/* ── BOTTOM NAV ── */}
      <BottomNav
        activeTab={bottomNavTab}
        onTabChange={(tab) => {
          if (tab === 'order') {
            // Si hay pedido activo y carrito vacío, navegar al tracking
            // Si hay items en carrito, abrir carrito
            setCartOpen(true);
            setBottomNavTab('order');
          } else {
            setBottomNavTab(tab);
          }
        }}
        onCartOpen={() => setCartOpen(true)}
        accentColor={theme.primary_color || '#F59E0B'}
        bgColor={theme.background_color}
        textColor={theme.text_color}
        activeOrderData={activeOrderData}
      />
    </div>
  );
}

// Inner wrapper that has access to tenant data and passes tenantId to the profile provider
function MenuContentWithProfile() {
  const params = useParams<{ slug: string }>();
  const { data } = useTenantData(params.slug);
  const tenantId = data?.tenant.id;
  return (
    <CustomerProfileProvider tenantId={tenantId}>
      <MenuContent />
    </CustomerProfileProvider>
  );
}

// Helper: detectar si un color hex es claro
function isLightColor(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return false;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

export default function MenuPage() {
  return (
    <I18nProvider>
      <CartProvider>
        <MenuContentWithProfile />
      </CartProvider>
    </I18nProvider>
  );
}
