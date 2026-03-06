/*
 * MenuItemCard — V7.0 Premium Refinement
 * Glassmorphism overlay (dark: black/60, light: white/60) sobre --menu-surface
 * Acentos solo en CTA y precios. Imágenes protagonistas con rounded-2xl.
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

  // ── LIST VIEW ──
  if (viewMode === 'list') {
    return (
      <div
        className="relative cursor-pointer transition-all duration-300 hover:-translate-y-1"
        onClick={handleOpenDetail}
        style={{ borderRadius: '1.5rem', overflow: 'hidden' }}
      >
        {/* Base surface layer */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: 'var(--menu-surface)' }}
        />
        {/* Glassmorphism overlay: softens any harsh surface color */}
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        />
        {/* Subtle border glow */}
        <div
          className="absolute inset-0"
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '1.5rem',
            pointerEvents: 'none',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex gap-3 p-3 md:p-4" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}>
          {/* Badge */}
          {showBadges && item.badge && (
            <div className="absolute -top-3 left-3 z-20">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
            </div>
          )}

          {/* Image — protagonist, no filters */}
          {hasImage && (
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl overflow-hidden flex-shrink-0 shadow-lg">
              <img
                src={item.image_url!}
                alt={item.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          <div className={`flex-1 min-w-0 flex flex-col justify-between ${!hasImage ? 'w-full' : ''}`}>
            <div>
              <h3
                className="text-base font-semibold leading-tight mb-1"
                style={{ color: 'var(--menu-text)' }}
              >
                {item.name}
              </h3>
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
              {/* Price — accent color, bold */}
              <span
                className="text-lg font-bold"
                style={{ color: 'var(--menu-accent)' }}
              >
                {formatPrice(item.price)}
              </span>
              {/* CTA button — accent bg, hover brightness */}
              <button
                onClick={handleQuickAdd}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 hover:scale-105 hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: justAdded ? '#38A169' : 'var(--menu-accent)',
                  color: '#fff',
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
      className="relative cursor-pointer transition-all duration-300 hover:-translate-y-1"
      style={{ borderRadius: '1.5rem', overflow: 'hidden' }}
    >
      {/* Base surface layer */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--menu-surface)' }}
      />
      {/* Glassmorphism overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      />
      {/* Subtle border */}
      <div
        className="absolute inset-0"
        style={{
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '1.5rem',
          pointerEvents: 'none',
        }}
      />

      {/* Badge */}
      {showBadges && item.badge && (
        <div className="absolute top-2 left-2 z-20">
          <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
        </div>
      )}

      {/* Image — protagonist, clean, no overlays */}
      {hasImage && (
        <div
          className="relative z-10 w-full h-40 overflow-hidden"
          onClick={handleOpenDetail}
          style={{ borderRadius: '1.5rem 1.5rem 0 0' }}
        >
          <img
            src={item.image_url!}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Text content */}
      <div className="relative z-10 p-4" onClick={!hasImage ? handleOpenDetail : undefined}>
        <div onClick={hasImage ? handleOpenDetail : undefined}>
          <h3
            className="text-sm font-semibold leading-tight mb-1"
            style={{ color: 'var(--menu-text)' }}
          >
            {item.name}
          </h3>
          {item.description && (
            <p
              className="text-xs leading-relaxed mb-2 line-clamp-2"
              style={{ color: 'var(--menu-text)', opacity: 0.5 }}
            >
              {item.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          {/* Price — accent */}
          <span
            className="text-base font-bold"
            style={{ color: 'var(--menu-accent)' }}
          >
            {formatPrice(item.price)}
          </span>
          {/* CTA — accent */}
          <button
            onClick={handleQuickAdd}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: justAdded ? '#38A169' : 'var(--menu-accent)',
              color: '#fff',
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
