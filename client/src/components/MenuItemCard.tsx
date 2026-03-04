/*
 * Design: "Warm Craft" + Neuro-Ventas + i18n + Smart Cart
 * Cards con sombra sepia, tipografía Lora, badges de prueba social animados,
 * feedback visual al agregar (scale + checkmark flash).
 *
 * Smart Cart behavior:
 * - Clicking photo/text → opens ProductDetailModal (with AI upsell)
 * - Clicking + button → Quick Add (no modal, prevent_checkout_upsell = false)
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  /** Called when user taps on the photo/text area to open the detail modal */
  onOpenDetail?: (item: MenuItem) => void;
}

export default function MenuItemCard({ item, theme, viewMode, allItems, showBadges = true, onOpenDetail }: MenuItemCardProps) {
  const { addItem } = useCart();
  const { t } = useI18n();
  const [justAdded, setJustAdded] = useState(false);

  // Quick Add — no modal, prevent_checkout_upsell stays false (will get checkout AI)
  const handleQuickAdd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Don't open the detail modal
    addItem(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }, [addItem, item]);

  // Open detail modal
  const handleOpenDetail = useCallback(() => {
    if (onOpenDetail) {
      onOpenDetail(item);
    }
  }, [onOpenDetail, item]);

  if (viewMode === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex gap-3 p-3 md:p-4 rounded-2xl relative cursor-pointer transition-all hover:scale-[1.01]"
        onClick={handleOpenDetail}
        style={{
          // V4.0 PREMIUM: fondo semitransparente sobre el fondo oscuro del app
          // Borde sutil blanco/10 en dark, sin colores de marca en el fondo
          backgroundColor: theme.background_color,
          boxShadow: '0 1px 8px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.15)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Badge */}
        {showBadges && item.badge && (
          <div className="absolute -top-3 left-3 z-10">
            <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
          </div>
        )}

        {/* Image */}
        {item.image_url ? (
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl overflow-hidden flex-shrink-0">
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          </div>
        ) : (
          <div
            className="w-28 h-28 md:w-36 md:h-36 rounded-2xl flex-shrink-0 flex items-center justify-center text-4xl opacity-30"
            style={{ backgroundColor: `${theme.primary_color}08` }}
          >
            🍽️
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3
            className="text-base font-semibold leading-tight mb-1"
            style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
          >
            {item.name}
          </h3>
          {item.description && (
            <p
              className="text-sm leading-relaxed mb-2 line-clamp-2 opacity-70"
              style={{ color: theme.text_color }}
            >
              {item.description}
            </p>
          )}

          {/* Social proof counter */}
          {showBadges && item.badge && (
            <div className="mb-1">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} />
            </div>
          )}

          <div className="flex items-center justify-between mt-auto">
            <span
              className="text-lg font-bold"
              style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
            >
              {formatPrice(item.price)}
            </span>
            <motion.button
              onClick={handleQuickAdd}
              whileTap={{ scale: 0.92 }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{
                backgroundColor: justAdded ? '#38A169' : theme.primary_color,
                color: '#fff',
              }}
            >
              <AnimatePresence mode="wait">
                {justAdded ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-1"
                  >
                    <Check size={16} />
                    {t('menu.added')}
                  </motion.span>
                ) : (
                  <motion.span
                    key="add"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-1"
                  >
                    <Plus size={16} />
                    {t('menu.add')}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Grid view
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl overflow-hidden relative cursor-pointer transition-all hover:scale-[1.02] hover:shadow-2xl"
      style={{
        // V4.0 PREMIUM: sombra profunda y borde sutil — las fotos son las protagonistas
        backgroundColor: theme.background_color,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Badge */}
        {showBadges && item.badge && (
          <div className="absolute top-2 left-2 z-10">
            <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
          </div>
        )}

      {/* Image area — clicking opens detail modal */}
      <div
        className="w-full h-40 relative"
        style={{ backgroundColor: `${theme.primary_color}08` }}
        onClick={handleOpenDetail}
      >
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">
            🍽️
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Text area — clicking opens detail modal */}
        <div onClick={handleOpenDetail}>
          <h3
            className="text-sm font-semibold leading-tight mb-1"
            style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
          >
            {item.name}
          </h3>
          {item.description && (
            <p
              className="text-xs leading-relaxed mb-2 line-clamp-2 opacity-60"
              style={{ color: theme.text_color }}
            >
              {item.description}
            </p>
          )}
        </div>

        {/* Social proof counter */}
        {showBadges && item.badge && (
          <div className="mb-2">
            <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} />
          </div>
        )}

        <div className="flex items-center justify-between">
          <span
            className="text-base font-bold"
            style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
          >
            {formatPrice(item.price)}
          </span>
          {/* Quick Add button — does NOT open modal */}
          <motion.button
            onClick={handleQuickAdd}
            whileTap={{ scale: 0.85 }}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
            style={{
              backgroundColor: justAdded ? '#38A169' : theme.primary_color,
              color: '#fff',
            }}
          >
            <AnimatePresence mode="wait">
              {justAdded ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                >
                  <Check size={18} />
                </motion.div>
              ) : (
                <motion.div
                  key="plus"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Plus size={18} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
