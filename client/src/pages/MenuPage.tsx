/*
 * Design: "Warm Craft" + Neuro-Ventas completo + i18n ES/EN.
 * Theming dinámico, scroll spy, platillo de la semana,
 * social proof toasts, upsell condicionado con delay,
 * carrito flotante con checkout SINPE/WhatsApp.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'wouter';
import { motion } from 'framer-motion';
import { MapPin, Loader2, Globe } from 'lucide-react';
import { useTenantData } from '@/hooks/useTenantData';
import { useMenuTranslation } from '@/hooks/useMenuTranslation';
import { CartProvider } from '@/contexts/CartContext';
import { I18nProvider, useI18n } from '@/contexts/I18nContext';
import { TENANT_HERO_IMAGES, getFontFamily, getPlanFeatures } from '@/lib/types';
import type { MenuItem, PlanFeatures } from '@/lib/types';
import MenuItemCard from '@/components/MenuItemCard';
import FeaturedDish from '@/components/FeaturedDish';
// UpsellModal removed — all upselling now happens at checkout via CartDrawer
import FloatingCart from '@/components/FloatingCart';
import CartDrawer from '@/components/CartDrawer';
import SocialProofToast from '@/components/SocialProofToast';
import PoweredByFooter from '@/components/PoweredByFooter';
import ActiveOrderFAB from '@/components/ActiveOrderFAB';
import ProductDetailModal from '@/components/ProductDetailModal';
import { useAnimationConfig } from '@/contexts/AnimationContext';
import { applyTheme, getStoredTheme } from '@/lib/themes';

function MenuContent() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { data, loading, error } = useTenantData(slug);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Upsell state removed — all upselling now happens at checkout
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tabsRef = useRef<HTMLDivElement>(null);
  const { lang, toggleLang, t } = useI18n();

  // Dynamic translation of ALL DB content (tenant info, categories, dish names/descriptions)
  const { translatedData, isTranslating } = useMenuTranslation(
    data ? { name: data.tenant.name, description: data.tenant.description, address: data.tenant.address } : { name: '' },
    data?.categories || [],
    data?.menuItems || [],
    lang
  );

  // Feature flags based on plan tier
  const features: PlanFeatures = useMemo(() => {
    return data ? getPlanFeatures(data.tenant.plan_tier || 'premium') : getPlanFeatures('premium');
  }, [data]);

  // Save tenant slug for OrderStatus navigation
  useEffect(() => {
    if (slug) localStorage.setItem('last_tenant_slug', slug);
  }, [slug]);

  // FASE 3 V4.0: Aplicar tema B2B desde localStorage al cargar el menú público
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  // Push animation config to global context so App.tsx renders it
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

  // Items grouped by category — uses translated items when EN is active
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

  // Open ProductDetailModal when user taps on photo/text area of a card
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'transparent' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <Loader2 size={32} className="text-amber-700" />
        </motion.div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'transparent' }}>
        <div className="text-center">
          <p className="text-5xl mb-4">🍽️</p>
          <h1 className="text-2xl font-bold text-amber-900 mb-2" style={{ fontFamily: "'Lora', serif" }}>
            {t('menu.closed')}
          </h1>
          <p className="text-amber-700 opacity-70">
            {lang === 'es' ? 'Verifica el enlace e intenta de nuevo.' : 'Check the link and try again.'}
          </p>
        </div>
      </div>
    );
  }

  const { tenant: rawTenant, theme } = data;
  // Use translated content when EN is active, fallback to original
  const tenant = lang === 'en' ? { ...rawTenant, ...translatedData.tenant } : rawTenant;
  const categories = translatedData.categories.length ? translatedData.categories : data.categories;
  const translatedMenuItems = translatedData.menuItems.length ? translatedData.menuItems : data.menuItems;
  const heroImage = theme.hero_image_url || TENANT_HERO_IMAGES[tenant.slug] || '';
  const bodyFont = getFontFamily(theme.font_family);

  // Check if restaurant is closed
  if (!tenant.is_open) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ backgroundColor: 'transparent', fontFamily: bodyFont }}
      >
        <div className="text-center">
          <p className="text-5xl mb-4">🔒</p>
          <h1 className="text-2xl font-bold mb-2" style={{ color: theme.text_color, fontFamily: "'Lora', serif" }}>
            {tenant.name}
          </h1>
          <p className="opacity-70" style={{ color: theme.text_color }}>
            {t('menu.closed')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen pb-28 relative z-[1]"
      style={{
        backgroundColor: 'transparent',
        fontFamily: bodyFont,
        color: theme.text_color,
      }}
    >
      {/* Social Proof Toast (Neuro-Ventas) — only for pro/premium */}
      {features.socialProof && <SocialProofToast tenantId={tenant.id} theme={theme} />}

      {/* Hero Section */}
      <div className="relative h-56 overflow-hidden">
        {heroImage && (
          <img
            src={heroImage}
            alt={tenant.name}
            className="w-full h-full object-cover"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.1) 100%)',
          }}
        />

        {/* i18n Toggle — only for pro/premium */}
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
              <><Loader2 size={13} className="animate-spin" /> {lang === 'es' ? 'EN' : 'ES'}</>
            ) : (
              <><Globe size={13} /> {lang === 'es' ? 'EN' : 'ES'}</>
            )}
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-5">
          {/* Restaurant Logo */}
          {tenant.logo_url && (
            <img
              src={tenant.logo_url}
              alt={`${tenant.name} logo`}
              className="w-14 h-14 rounded-xl object-cover mb-2 border-2 border-white/30 shadow-lg bg-white/10"
            />
          )}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-bold text-white leading-tight mb-1"
            style={{ fontFamily: "'Lora', serif" }}
          >
            {tenant.name}
          </motion.h1>
          {tenant.description && (
            <p className="text-white/80 text-sm leading-relaxed line-clamp-2">
              {tenant.description}
            </p>
          )}
          {tenant.address && (
            <div className="flex items-center gap-1.5 mt-2 text-white/60 text-xs">
              <MapPin size={12} />
              <span>{tenant.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Category Tabs - Sticky */}
      <div
        ref={tabsRef}
        className="sticky top-0 z-30 overflow-x-auto scrollbar-hide border-b"
        style={{
          backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderColor: `${theme.text_color}10`,
        }}
      >
        <div className="flex gap-1 px-4 py-3 min-w-max">
          {categories.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all"
                style={{
                  backgroundColor: isActive ? theme.primary_color : `${theme.primary_color}08`,
                  color: isActive ? '#fff' : theme.text_color,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Featured Dish (Platillo de la Semana) — only for pro/premium */}
      {features.featuredDish && featuredItem && (
        <div className="mt-4">
          <FeaturedDish
            item={translatedMenuItems.find(i => i.id === featuredItem.id) || featuredItem}
            theme={theme}
          />
        </div>
      )}

      {/* Menu Items by Category */}
      <div className="px-4 mt-2">
        {categories.map(cat => {
          const catItems = itemsByCategory[cat.id] || [];
          if (catItems.length === 0) return null;

          return (
            <div
              key={cat.id}
              ref={el => { categoryRefs.current[cat.id] = el; }}
              data-category-id={cat.id}
              className="mb-8"
            >
              {/* Category header */}
              <div className="mb-4 mt-2">
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                >
                  {cat.name}
                </h2>
                {cat.description && (
                  <p className="text-sm opacity-60 mt-0.5" style={{ color: theme.text_color }}>
                    {cat.description}
                  </p>
                )}
                {/* Organic divider */}
                <svg viewBox="0 0 200 8" className="w-20 mt-2 opacity-30" style={{ color: theme.primary_color }}>
                  <path
                    d="M0 4 Q25 0, 50 4 T100 4 T150 4 T200 4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>

              {/* Items */}
              <div className={
                theme.view_mode === 'grid'
                  ? 'grid grid-cols-2 gap-3'
                  : 'flex flex-col gap-3'
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
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Cart */}
      <FloatingCart theme={theme} onOpen={() => setCartOpen(true)} />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        theme={theme}
        tenant={tenant}
        allMenuItems={data.menuItems}
      />

      {/* Product Detail Modal — opens when user taps on item photo/text */}
      <ProductDetailModal
        item={detailItem}
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        theme={theme}
        tenant={tenant}
      />

      {/* Active Order FAB — shows when customer has an active order */}
      <ActiveOrderFAB />

      {/* Powered by Digital Atlas Footer */}
      <PoweredByFooter bgColor={theme.background_color} textColor={`${theme.text_color}70`} />
    </div>
  );
}

export default function MenuPage() {
  return (
    <I18nProvider>
      <CartProvider>
        <MenuContent />
      </CartProvider>
    </I18nProvider>
  );
}
