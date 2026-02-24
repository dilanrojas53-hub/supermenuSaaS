/*
 * Design: "Warm Craft" + Neuro-Ventas
 * Cards con sombra sepia, tipografía Lora, badges de prueba social animados,
 * feedback visual al agregar (scale + checkmark flash), upsell con delay de 600ms.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import SocialProofBadge from './SocialProofBadge';

interface MenuItemCardProps {
  item: MenuItem;
  theme: ThemeSettings;
  viewMode: 'grid' | 'list';
  onUpsell?: (item: MenuItem, text: string | null) => void;
  allItems: MenuItem[];
}

export default function MenuItemCard({ item, theme, viewMode, onUpsell, allItems }: MenuItemCardProps) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = useCallback(() => {
    addItem(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);

    // Upsell with 600ms delay for better UX
    if (item.upsell_item_id && onUpsell) {
      const upsellTarget = allItems.find(i => i.id === item.upsell_item_id);
      if (upsellTarget) {
        setTimeout(() => {
          onUpsell(upsellTarget, item.upsell_text);
        }, 600);
      }
    }
  }, [addItem, item, onUpsell, allItems]);

  if (viewMode === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex gap-4 p-4 rounded-2xl relative"
        style={{
          backgroundColor: theme.background_color,
          boxShadow: '0 2px 12px rgba(139, 109, 71, 0.08)',
          border: `1px solid ${theme.primary_color}12`,
        }}
      >
        {/* Badge */}
        {item.badge && (
          <div className="absolute -top-3 left-3 z-10">
            <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
          </div>
        )}

        {/* Image placeholder */}
        {item.image_url ? (
          <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          </div>
        ) : (
          <div
            className="w-24 h-24 rounded-xl flex-shrink-0 flex items-center justify-center text-3xl opacity-30"
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

          {/* Social proof counter (non-compact) */}
          {item.badge && (
            <div className="mb-2">
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
              onClick={handleAdd}
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
                    Listo
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
                    Agregar
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
      className="rounded-2xl overflow-hidden relative"
      style={{
        backgroundColor: theme.background_color,
        boxShadow: '0 4px 20px rgba(139, 109, 71, 0.1)',
        border: `1px solid ${theme.primary_color}10`,
      }}
    >
      {/* Badge */}
      {item.badge && (
        <div className="absolute top-3 left-3 z-10">
          <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
        </div>
      )}

      {/* Image area */}
      <div
        className="w-full h-40 relative"
        style={{ backgroundColor: `${theme.primary_color}08` }}
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

        {/* Social proof counter */}
        {item.badge && (
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
          <motion.button
            onClick={handleAdd}
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
