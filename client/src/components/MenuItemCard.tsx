/*
 * MenuItemCard — V8.0 Polímata Visual
 * Inner Glow (inset shadow top), border white/5, jerarquía tipográfica.
 * Badges posicionados sobre la imagen (absolute top-2 left-2).
 * Precios: text-accent font-extrabold. Descripciones: text-main/60.
 * 4 CSS vars: --menu-bg, --menu-surface, --menu-text, --menu-accent
 */
import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import SocialProofBadge from './SocialProofBadge';

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
        style={cardContainerStyle}
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

          {/* Badge outside if no image */}
          {!hasImage && showBadges && item.badge && (
            <div className="absolute top-3 left-3 z-10">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
            </div>
          )}

          <div className={`flex-1 min-w-0 flex flex-col justify-between ${!hasImage ? 'pt-8 w-full' : ''}`}>
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
                      <Check size={16} /> {t('menu.added')}
                    </motion.span>
                  ) : (
                    <motion.span key="add" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                      <Plus size={16} /> {t('menu.add')}
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
    <div
      className="relative cursor-pointer transition-all duration-300 hover:-translate-y-0.5"
      style={cardContainerStyle}
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

      {/* Badge outside if no image */}
      {!hasImage && showBadges && item.badge && (
        <div className="relative z-10 pt-3 pl-3">
          <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
        </div>
      )}

      {/* Text content */}
      <div className="relative z-10 p-4" onClick={!hasImage ? handleOpenDetail : undefined}>
        <div onClick={hasImage ? handleOpenDetail : undefined}>
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
    </div>
  );
}
