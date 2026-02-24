/*
 * Design: "Warm Craft" — Cards con sombra sepia, border-radius generoso,
 * tipografía Lora para nombres y precio en sello circular con color del tenant.
 * Badges de prueba social como sellos artesanales.
 */
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice, BADGE_CONFIG } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';

interface MenuItemCardProps {
  item: MenuItem;
  theme: ThemeSettings;
  viewMode: 'grid' | 'list';
  onUpsell?: (item: MenuItem) => void;
  allItems: MenuItem[];
}

export default function MenuItemCard({ item, theme, viewMode, onUpsell, allItems }: MenuItemCardProps) {
  const { addItem } = useCart();

  const handleAdd = () => {
    addItem(item);
    // If item has upsell, trigger upsell modal
    if (item.upsell_item_id && onUpsell) {
      const upsellItem = allItems.find(i => i.id === item.upsell_item_id);
      if (upsellItem) {
        onUpsell(upsellItem);
      }
    }
  };

  const badge = item.badge ? BADGE_CONFIG[item.badge] : null;

  if (viewMode === 'list') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex gap-4 p-4 rounded-2xl relative"
        style={{
          backgroundColor: `${theme.background_color}`,
          boxShadow: '0 2px 12px rgba(139, 109, 71, 0.08)',
          border: `1px solid ${theme.primary_color}12`,
        }}
      >
        {/* Badge */}
        {badge && (
          <div
            className="absolute -top-2 left-4 px-3 py-0.5 rounded-full text-xs font-semibold z-10"
            style={{
              backgroundColor: theme.accent_color,
              color: theme.text_color,
            }}
          >
            <span className="mr-1">{badge.icon}</span>
            {badge.label}
          </div>
        )}

        {/* Image placeholder */}
        {item.image_url && (
          <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
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
          <div className="flex items-center justify-between mt-auto">
            <span
              className="text-lg font-bold"
              style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
            >
              {formatPrice(item.price)}
            </span>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
              style={{
                backgroundColor: theme.primary_color,
                color: '#fff',
              }}
            >
              <Plus size={16} />
              Agregar
            </button>
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
      {badge && (
        <div
          className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold z-10"
          style={{
            backgroundColor: theme.accent_color,
            color: theme.text_color,
          }}
        >
          <span className="mr-1">{badge.icon}</span>
          {badge.label}
        </div>
      )}

      {/* Image area */}
      <div
        className="w-full h-40 relative"
        style={{ backgroundColor: `${theme.primary_color}15` }}
      >
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-30">
            🍽️
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className="text-base font-semibold leading-tight mb-1"
          style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
        >
          {item.name}
        </h3>
        {item.description && (
          <p
            className="text-sm leading-relaxed mb-3 line-clamp-2 opacity-70"
            style={{ color: theme.text_color }}
          >
            {item.description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span
            className="text-lg font-bold"
            style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
          >
            {formatPrice(item.price)}
          </span>
          <button
            onClick={handleAdd}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{
              backgroundColor: theme.primary_color,
              color: '#fff',
            }}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
