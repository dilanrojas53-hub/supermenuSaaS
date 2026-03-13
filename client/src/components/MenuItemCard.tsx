/*
 * MenuItemCard — V8.0 Polímata Visual
 * Inner Glow (inset shadow top), border white/5, jerarquía tipográfica.
 * Badges posicionados sobre la imagen (absolute top-2 left-2).
 * Precios: text-accent font-extrabold. Descripciones: text-main/60.
 * 4 CSS vars: --menu-bg, --menu-surface, --menu-text, --menu-accent
 */
import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Check, GlassWater, Wine, UtensilsCrossed } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import SocialProofBadge from './SocialProofBadge';

// V11.0: Clasificación rápida para placeholder icon (sin acceso a allCategories)
const DRINK_ICON_KEYWORDS = ['bebida', 'drink', 'jugo', 'agua', 'refresco', 'smoothie', 'café', 'coffee', 'té', 'tea'];
const WINE_ICON_KEYWORDS = ['vino', 'wine', 'licor', 'cóctel', 'cocktail', 'cerveza', 'beer', 'destilado'];

/**
 * Devuelve el ícono Lucide apropiado según el nombre del item o su categoría.
 * Bebidas no alcohólicas → GlassWater | Alcohólicas → Wine | Comida → UtensilsCrossed
 */
const getPlaceholderIcon = (itemName: string, categoryName?: string): React.ReactNode => {
  const combined = `${itemName} ${categoryName || ''}`.toLowerCase();
  if (WINE_ICON_KEYWORDS.some(k => combined.includes(k))) {
    return <Wine className="text-accent/40 hover:scale-105 transition-transform duration-300" size={32} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
  }
  if (DRINK_ICON_KEYWORDS.some(k => combined.includes(k))) {
    return <GlassWater className="hover:scale-105 transition-transform duration-300" size={32} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
  }
  return <UtensilsCrossed className="hover:scale-105 transition-transform duration-300" size={32} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
};

interface MenuItemCardProps {
  item: MenuItem;
  theme: ThemeSettings;
  viewMode: 'grid' | 'list';
  allItems?: MenuItem[];
  showBadges?: boolean;
  onOpenDetail?: (item: MenuItem) => void;
}

export default function MenuItemCard({ item, theme, viewMode, allItems, showBadges = true, onOpenDetail }: MenuItemCardProps) {
  const { addItem } = useCart();
  const { t } = useI18n();
  const [justAdded, setJustAdded] = useState(false);

  const handleQuickAdd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }, [addItem, item]);

  const handleOpenDetail = useCallback(() => {
    if (onOpenDetail) onOpenDetail(item);
  }, [onOpenDetail, item]);

  const hasImage = Boolean(item.image_url);

  /* Shared card container styles — Inner Glow + subtle border */
  const cardContainerStyle: React.CSSProperties = {
    borderRadius: '1.25rem',
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.05)',
  };

  /* Card background layers as inline style — surface + dark overlay */
  const cardBgStyle: React.CSSProperties = {
    backgroundColor: 'var(--menu-surface)',
  };
  const cardOverlayStyle: React.CSSProperties = {
    backgroundColor: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
  };

  // ── LIST VIEW ──
  if (viewMode === 'list') {
    return (
      <div
        className="relative cursor-pointer transition-all duration-300 hover:-translate-y-0.5"
        onClick={handleOpenDetail}
        style={{
          // V15.0: micro-bisel premium — bg-surface + border white/5 + shadow-xl
          backgroundColor: 'var(--bg-surface)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.35), 0 6px 24px rgba(0,0,0,0.20)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Background layers */}
        <div className="absolute inset-0" style={cardBgStyle} />
        <div className="absolute inset-0" style={cardOverlayStyle} />

        {/* Content */}
        <div className="relative z-10 flex gap-3 p-3 md:p-4">
          {/* Image with badge overlay */}
          {hasImage && (
            <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-xl overflow-hidden flex-shrink-0 shadow-lg">
              <img
                src={item.image_url!}
                alt={item.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Badge floats on image */}
              {showBadges && item.badge && (
                <div className="absolute top-2 left-2 z-10">
                  <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
                </div>
              )}
            </div>
          )}

          {/* Placeholder inteligente si no hay imagen (V11.0) */}
          {!hasImage && (
            <div
              className="relative w-28 h-28 md:w-32 md:h-32 rounded-xl flex-shrink-0 flex items-center justify-center"
              style={{
                backgroundColor: 'var(--menu-surface)',
                border: '1px solid rgba(255,255,255,0.05)',
                opacity: 0.5,
              }}
            >
              {getPlaceholderIcon(item.name)}
              {/* Badge sobre el placeholder */}
              {showBadges && item.badge && (
                <div className="absolute top-2 left-2 z-10">
                  <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              {/* Title — bold, lg */}
              <h3
                className="text-lg font-bold leading-tight mb-1"
                style={{ color: 'var(--menu-text)' }}
              >
                {item.name}
              </h3>
              {/* Description — 60% opacity for harmony */}
              {item.description && (
                <p
                  className="text-sm leading-relaxed mb-2 line-clamp-2"
                  style={{ color: 'var(--menu-text)', opacity: 0.6 }}
                >
                  {item.description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between mt-auto pt-1">
              {/* Price — accent, extrabold */}
              <span
                className="text-lg font-extrabold"
                style={{ color: 'var(--menu-accent)' }}
              >
                {formatPrice(item.price)}
              </span>
              {/* CTA — accent bg */}
              <button
                onClick={handleQuickAdd}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 hover:scale-105 hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: justAdded ? '#38A169' : 'var(--menu-accent)',
                  color: 'var(--menu-accent-contrast)',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.3)',
                }}
              >
                <AnimatePresence mode="wait">
                  {justAdded ? (
                    <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                      <Check size={16} /><span>{t('menu.added')}</span>
                    </motion.span>
                  ) : (
                    <motion.span key="add" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                      <Plus size={16} /><span>{t('menu.add')}</span>
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── GRID VIEW ──
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl overflow-hidden relative cursor-pointer transition-all hover:scale-[1.02] hover:shadow-2xl"
      style={{
        // V15.0: micro-bisel premium — bg-surface + border white/5 + shadow-xl
        backgroundColor: 'var(--bg-surface)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.40), 0 10px 32px rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Background layers */}
      <div className="absolute inset-0" style={cardBgStyle} />
      <div className="absolute inset-0" style={cardOverlayStyle} />

      {/* Image with badge overlay */}
      {hasImage && (
        <div
          className="relative z-10 w-full h-44 overflow-hidden"
          onClick={handleOpenDetail}
          style={{ borderRadius: '1.25rem 1.25rem 0 0' }}
        >
          <img
            src={item.image_url!}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Badge floats on image corner */}
          {showBadges && item.badge && (
            <div className="absolute top-2 left-2 z-10">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
            </div>
          )}
        </div>
      )}

      {/* Placeholder inteligente si no hay imagen (V11.0) */}
      {!hasImage && (
        <div
          className="relative z-10 w-full h-44 flex items-center justify-center cursor-pointer"
          onClick={handleOpenDetail}
          style={{
            backgroundColor: 'var(--menu-surface)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '1.25rem 1.25rem 0 0',
          }}
        >
          {getPlaceholderIcon(item.name)}
          {/* Badge sobre el placeholder */}
          {showBadges && item.badge && (
            <div className="absolute top-2 left-2 z-10">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
            </div>
          )}
        </div>
      )}

      {/* Text content */}
      <div className="relative z-10 p-4" onClick={handleOpenDetail}>
        <div>
          {/* Title — bold */}
          <h3
            className="text-base font-bold leading-tight mb-1"
            style={{ color: 'var(--menu-text)' }}
          >
            {item.name}
          </h3>
          {/* Description — 60% opacity */}
          {item.description && (
            <p
              className="text-xs leading-relaxed mb-3 line-clamp-2"
              style={{ color: 'var(--menu-text)', opacity: 0.6 }}
            >
              {item.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          {/* Price — accent, extrabold */}
          <span
            className="text-lg font-extrabold"
            style={{ color: 'var(--menu-accent)' }}
          >
            {formatPrice(item.price)}
          </span>
          {/* CTA — accent circle */}
          <button
            onClick={handleQuickAdd}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: justAdded ? '#38A169' : 'var(--menu-accent)',
              color: 'var(--menu-accent-contrast)',
              boxShadow: '0 3px 12px rgba(0,0,0,0.3)',
            }}
          >
            <AnimatePresence mode="wait">
              {justAdded ? (
                <motion.div key="check" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                  <Check size={18} />
                </motion.div>
              ) : (
                <motion.div key="plus" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Plus size={18} />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
