/*
 * Design: "Warm Craft" — Sección destacada tipo pizarra artesanal
 * para el "Platillo de la Semana" (Neuro-gancho: Sesgo de Novedad).
 * Placeholder listo para Fase 3.
 */
import { motion } from 'framer-motion';
import { Sparkles, Plus } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';

interface FeaturedDishProps {
  item: MenuItem;
  theme: ThemeSettings;
}

export default function FeaturedDish({ item, theme }: FeaturedDishProps) {
  const { addItem } = useCart();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mx-4 mb-6 rounded-2xl overflow-hidden relative"
      style={{
        background: `linear-gradient(135deg, ${theme.primary_color}18, ${theme.accent_color}20)`,
        border: `2px solid ${theme.primary_color}30`,
        boxShadow: `0 8px 32px ${theme.primary_color}15`,
      }}
    >
      {/* Header badge */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ backgroundColor: `${theme.primary_color}15` }}
      >
        <Sparkles size={16} style={{ color: theme.accent_color }} />
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: theme.primary_color }}
        >
          La elección del Chef esta semana
        </span>
      </div>

      <div className="p-4 flex gap-4">
        {/* Image */}
        <div
          className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0"
          style={{ backgroundColor: `${theme.primary_color}10` }}
        >
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl">👨‍🍳</div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3
            className="text-lg font-bold leading-tight mb-1"
            style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
          >
            {item.name}
          </h3>
          {item.description && (
            <p
              className="text-sm leading-relaxed mb-2 line-clamp-2 opacity-75"
              style={{ color: theme.text_color }}
            >
              {item.description}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span
              className="text-xl font-bold"
              style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
            >
              {formatPrice(item.price)}
            </span>
            <button
              onClick={() => addItem(item)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95"
              style={{ backgroundColor: theme.primary_color, color: '#fff' }}
            >
              <Plus size={16} />
              Agregar
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
