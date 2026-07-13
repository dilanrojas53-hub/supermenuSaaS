import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'wouter';
import { ArrowLeft, ArrowRight, Coffee, GlassWater, Plus, Sparkles, Wine } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MenuItem, Tenant, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/imageUtils';
import SmartImage from './SmartImage';
import ProductDetailModal from './ProductDetailModal';
import '@/styles/menu-sales-enhancements.css';

interface DrinkCategory {
  id: string;
  name: string;
  sort_order: number;
}

const PORTAL_ID = 'atlas-beverage-discovery';
const BACK_PORTAL_ID = 'atlas-beverage-back';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, select, textarea'));
}

function findProductModalRoot(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('div.fixed'));
  return candidates.find(element => {
    const classes = element.classList;
    return classes.contains('bottom-0')
      && classes.contains('left-0')
      && classes.contains('right-0')
      && classes.contains('z-[9999]');
  }) || null;
}

function decorateUpsellPanel(): void {
  const modal = findProductModalRoot();
  if (!modal) return;
  modal.classList.add('atlas-product-detail-modal');

  const textNodes = Array.from(modal.querySelectorAll<HTMLElement>('span, p, div'));
  const marker = textNodes.find(element => {
    const value = element.textContent?.trim().toLowerCase() || '';
    return value === 'recomendado para ti'
      || value.includes('buscando el complemento perfecto')
      || value === 'recommended for you'
      || value.includes('finding the perfect pairing');
  });

  if (!marker) return;
  const panel = marker.closest<HTMLElement>('.mb-5') || marker.parentElement?.parentElement;
  if (!panel) return;

  panel.classList.add('atlas-upsell-panel');
  const cards = panel.querySelectorAll<HTMLElement>('.flex.flex-col.gap-3 > div');
  cards.forEach(card => card.classList.add('atlas-upsell-card'));
}

function findMasterButton(label: 'Comidas' | '🍹 Bebidas'): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    button => button.textContent?.trim() === label
  ) || null;
}

export default function MenuEnhancements() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const [featuredItem, setFeaturedItem] = useState<MenuItem | null>(null);
  const [drinkCategories, setDrinkCategories] = useState<DrinkCategory[]>([]);
  const [drinkItems, setDrinkItems] = useState<MenuItem[]>([]);
  const [activeDrinkCategory, setActiveDrinkCategory] = useState('all');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [backPortalNode, setBackPortalNode] = useState<HTMLElement | null>(null);
  const [drinkModeActive, setDrinkModeActive] = useState(false);
  const featuredNodeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function loadEnhancementData() {
      setLoading(true);
      try {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .maybeSingle();

        if (!tenantData || cancelled) return;
        const currentTenant = tenantData as Tenant;
        setTenant(currentTenant);

        const [{ data: themeData }, { data: categoriesData }, { data: menuData }] = await Promise.all([
          supabase
            .from('theme_settings')
            .select('*')
            .eq('tenant_id', currentTenant.id)
            .maybeSingle(),
          supabase
            .from('categories')
            .select('id, name, sort_order')
            .eq('tenant_id', currentTenant.id)
            .eq('is_active', true)
            .eq('is_drink', true)
            .order('sort_order', { ascending: true }),
          supabase
            .from('menu_items')
            .select('*')
            .eq('tenant_id', currentTenant.id)
            .eq('is_available', true)
            .order('sort_order', { ascending: true }),
        ]);

        if (cancelled) return;
        setTheme((themeData as ThemeSettings | null) || null);

        const categories = (categoriesData || []) as DrinkCategory[];
        const items = (menuData || []) as MenuItem[];
        const categoryIds = new Set(categories.map(category => category.id));

        setDrinkCategories(categories);
        setDrinkItems(items.filter(menuItem => categoryIds.has(menuItem.category_id)).slice(0, 40));
        setFeaturedItem(items.find(menuItem => menuItem.is_featured) || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEnhancementData();
    return () => { cancelled = true; };
  }, [slug]);

  const openDetail = useCallback((item: MenuItem) => {
    setSelectedItem(item);
    setDetailOpen(true);
  }, []);

  useEffect(() => {
    if (!featuredItem) return;

    const attachFeaturedInteraction = () => {
      const wrapper = document.querySelector<HTMLElement>('.menu-evolution__featured');
      const card = wrapper?.firstElementChild as HTMLElement | null;
      if (!card || card.dataset.atlasClickable === 'true') return Boolean(card);

      card.dataset.atlasClickable = 'true';
      card.classList.add('atlas-featured-clickable');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Ver detalles y complementos de ${featuredItem.name}`);

      const clickHandler = (event: Event) => {
        if (isInteractiveTarget(event.target)) return;
        openDetail(featuredItem);
      };
      const keyHandler = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openDetail(featuredItem);
      };

      card.addEventListener('click', clickHandler);
      card.addEventListener('keydown', keyHandler);
      (card as HTMLElement & { __atlasCleanup?: () => void }).__atlasCleanup = () => {
        card.removeEventListener('click', clickHandler);
        card.removeEventListener('keydown', keyHandler);
      };
      featuredNodeRef.current = card;
      return true;
    };

    if (attachFeaturedInteraction()) return;
    const observer = new MutationObserver(() => {
      if (attachFeaturedInteraction()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const card = featuredNodeRef.current as (HTMLElement & { __atlasCleanup?: () => void }) | null;
      card?.__atlasCleanup?.();
      featuredNodeRef.current = null;
    };
  }, [featuredItem, openDetail]);

  useEffect(() => {
    const ensurePortal = () => {
      let node = document.getElementById(PORTAL_ID);
      if (node) {
        setPortalNode(node);
        return true;
      }

      const target = document.querySelector('.menu-evolution__featured')
        || document.querySelector('.menu-evolution__legacy-hero');
      if (!target?.parentElement) return false;

      node = document.createElement('div');
      node.id = PORTAL_ID;
      node.className = 'atlas-beverage-portal';
      target.insertAdjacentElement('afterend', node);
      setPortalNode(node);
      return true;
    };

    if (ensurePortal()) return;
    const observer = new MutationObserver(() => {
      if (ensurePortal()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const attached: Array<{ node: HTMLButtonElement; handler: () => void }> = [];

    const ensureBackNavigation = () => {
      const categoriesBar = document.querySelector<HTMLElement>('.menu-evolution__categories');
      if (categoriesBar) {
        let node = document.getElementById(BACK_PORTAL_ID);
        if (!node) {
          node = document.createElement('div');
          node.id = BACK_PORTAL_ID;
          node.style.flexShrink = '0';
          node.style.paddingLeft = '12px';
          categoriesBar.prepend(node);
        }
        setBackPortalNode(node);
      }

      const foodButton = findMasterButton('Comidas');
      const drinksButton = findMasterButton('🍹 Bebidas');

      if (foodButton && foodButton.dataset.atlasModeListener !== 'true') {
        const handler = () => setDrinkModeActive(false);
        foodButton.dataset.atlasModeListener = 'true';
        foodButton.addEventListener('click', handler);
        attached.push({ node: foodButton, handler });
      }

      if (drinksButton && drinksButton.dataset.atlasModeListener !== 'true') {
        const handler = () => setDrinkModeActive(true);
        drinksButton.dataset.atlasModeListener = 'true';
        drinksButton.addEventListener('click', handler);
        attached.push({ node: drinksButton, handler });
      }
    };

    ensureBackNavigation();
    const observer = new MutationObserver(ensureBackNavigation);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      attached.forEach(({ node, handler }) => {
        node.removeEventListener('click', handler);
        delete node.dataset.atlasModeListener;
      });
      document.getElementById(BACK_PORTAL_ID)?.remove();
    };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(decorateUpsellPanel);
    observer.observe(document.body, { childList: true, subtree: true });
    decorateUpsellPanel();
    return () => observer.disconnect();
  }, []);

  const visibleDrinks = useMemo(() => {
    const filtered = activeDrinkCategory === 'all'
      ? drinkItems
      : drinkItems.filter(item => item.category_id === activeDrinkCategory);
    return filtered.slice(0, 4);
  }, [activeDrinkCategory, drinkItems]);

  const showAllDrinks = useCallback(() => {
    setDrinkModeActive(true);
    findMasterButton('🍹 Bebidas')?.click();
    window.setTimeout(() => {
      document.querySelector('.menu-evolution__categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, []);

  const returnToFood = useCallback(() => {
    setDrinkModeActive(false);
    findMasterButton('Comidas')?.click();
    window.setTimeout(() => {
      document.querySelector('.menu-evolution__categories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }, []);

  const beverageSection = portalNode && (loading || drinkItems.length > 0)
    ? createPortal(
      <section className="atlas-beverage-section" aria-label="Opciones de bebidas">
        <div className="atlas-beverage-heading">
          <div className="atlas-beverage-heading__icon"><GlassWater size={24} /></div>
          <div className="atlas-beverage-heading__copy">
            <span>Completa tu experiencia</span>
            <h2>¿Qué te gustaría tomar?</h2>
            <p>Explora bebidas, cafés, vinos y coctelería sin perder tu lugar en el menú.</p>
          </div>
          <button type="button" className="atlas-beverage-heading__cta" onClick={showAllDrinks}>
            Ver todas <ArrowRight size={16} />
          </button>
        </div>

        {!loading && drinkCategories.length > 0 && (
          <div className="atlas-beverage-filters" role="tablist" aria-label="Tipos de bebida">
            <button
              type="button"
              role="tab"
              aria-selected={activeDrinkCategory === 'all'}
              data-active={activeDrinkCategory === 'all'}
              onClick={() => setActiveDrinkCategory('all')}
            >
              <Sparkles size={14} /> Para todos
            </button>
            {drinkCategories.map(category => {
              const lower = category.name.toLowerCase();
              const Icon = lower.includes('café') || lower.includes('cafeter')
                ? Coffee
                : lower.includes('vino')
                  ? Wine
                  : GlassWater;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={activeDrinkCategory === category.id}
                  data-active={activeDrinkCategory === category.id}
                  onClick={() => setActiveDrinkCategory(category.id)}
                >
                  <Icon size={14} /> {category.name}
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="atlas-beverage-grid" aria-hidden="true">
            {[0, 1, 2, 3].map(index => <div key={index} className="atlas-beverage-skeleton" />)}
          </div>
        ) : (
          <div className="atlas-beverage-grid">
            {visibleDrinks.map(drink => (
              <button key={drink.id} type="button" className="atlas-beverage-card" onClick={() => openDetail(drink)}>
                <div className="atlas-beverage-card__media">
                  {drink.image_url ? (
                    <SmartImage
                      src={getOptimizedImageUrl(drink.image_url, IMAGE_SIZES.card.width, IMAGE_SIZES.card.quality, IMAGE_SIZES.card.height)}
                      alt={drink.name}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="atlas-beverage-card__fallback"><GlassWater size={30} /></div>
                  )}
                  <span className="atlas-beverage-card__plus"><Plus size={15} /></span>
                </div>
                <div className="atlas-beverage-card__body">
                  <strong>{drink.name}</strong>
                  <span>{formatPrice(drink.price)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && visibleDrinks.length === 0 && (
          <p className="atlas-beverage-empty">No hay bebidas disponibles en esta categoría por el momento.</p>
        )}

        <button type="button" className="atlas-beverage-mobile-cta" onClick={showAllDrinks}>
          Explorar todas las bebidas <ArrowRight size={17} />
        </button>
      </section>,
      portalNode
    )
    : null;

  return (
    <>
      {beverageSection}
      {backPortalNode && drinkModeActive && createPortal(
        <button
          type="button"
          onClick={returnToFood}
          aria-label="Volver a comidas"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all active:scale-95"
          style={{
            backgroundColor: 'var(--menu-accent)',
            color: 'var(--menu-accent-contrast, #000)',
            boxShadow: '0 5px 16px color-mix(in srgb, var(--menu-accent) 28%, transparent)',
          }}
        >
          <ArrowLeft size={15} /> Comidas
        </button>,
        backPortalNode
      )}
      {tenant && theme && (
        <ProductDetailModal
          item={selectedItem}
          isOpen={detailOpen}
          onClose={() => setDetailOpen(false)}
          theme={theme}
          tenant={tenant}
        />
      )}
    </>
  );
}
