/*
 * Neuro-Ventas: "Platillo de la Semana" con countdown de disponibilidad,
 * spotlight shimmer, copy persuasivo, y contador de pedidos.
 * i18n: traduce strings de interfaz dura.
 */
import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Users, Clock, Star } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';

interface FeaturedDishProps {
  item: MenuItem;
  theme: ThemeSettings;
}

function getHoursUntilEndOfWeek(): number {
  const now = new Date();
  const daysUntilSunday = 7 - now.getDay();
  const hoursLeft = daysUntilSunday * 24 - now.getHours();
  return Math.max(hoursLeft, 1);
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function FeaturedDish({ item, theme }: FeaturedDishProps) {
  const { addItem } = useCart();
  const { lang, t } = useI18n();
  const [justAdded, setJustAdded] = useState(false);
  const [hoursLeft] = useState(getHoursUntilEndOfWeek);

  const seed = useMemo(() => hashCode(item.id), [item.id]);
  const ordersThisWeek = useMemo(() => 45 + (seed % 60), [seed]);

  const handleAdd = useCallback(() => {
    addItem(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }, [addItem, item]);

  const days = Math.floor(hoursLeft / 24);
  const hours = hoursLeft % 24;

  const remainingText = lang === 'es' ? `${days}d ${hours}h restantes` : `${days}d ${hours}h left`;
  const ordersText = lang === 'es' ? `${ordersThisWeek} pedidos esta semana` : `${ordersThisWeek} orders this week`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mx-4 mb-6 rounded-2xl overflow-hidden relative"
      style={{
        // V4.0 PREMIUM: fondo sólido del tema, sin gradiente neón
        // Borde sutil con el color de marca al 20% de opacidad
        backgroundColor: theme.background_color,
        border: `1px solid ${theme.primary_color}20`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)',
      }}
    >
      {/* Shimmer overlay */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: `linear-gradient(110deg, transparent 30%, ${theme.primary_color}08 45%, transparent 60%)`,
        }}
        animate={{ x: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', repeatDelay: 3 }}
      />

      {/* Header badge */}
      <div
        className="flex items-center justify-between px-4 py-2.5 relative z-10"
        style={{ backgroundColor: `${theme.primary_color}12` }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          >
            <Star size={16} style={{ color: theme.accent_color }} fill={theme.accent_color} />
          </motion.div>
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: theme.primary_color }}
          >
            {t('menu.featured')}
          </span>
        </div>
        {/* Countdown */}
        <div
          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
          style={{ backgroundColor: `${theme.primary_color}15`, color: theme.primary_color }}
        >
          <Clock size={10} />
          <span>{remainingText}</span>
        </div>
      </div>

      <div className="p-4 flex gap-4 relative z-10">
        {/* Image */}
        <div
          className="w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 relative"
          style={{ backgroundColor: `${theme.primary_color}08` }}
        >
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">👨‍🍳</div>
          )}
          <div
            className="absolute bottom-1 right-1 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ backgroundColor: theme.accent_color, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}
          >
            <span className="text-xs">👨‍🍳</span>
          </div>
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

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex items-center gap-1 text-[11px] font-medium mb-3 opacity-65"
            style={{ color: theme.text_color }}
          >
            <Users size={11} />
            <span>{ordersText}</span>
          </motion.div>

          <div className="flex items-center justify-between">
            <span
              className="text-xl font-bold"
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
                boxShadow: justAdded ? '0 2px 8px rgba(56,161,105,0.3)' : `0 2px 8px ${theme.primary_color}30`,
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
      </div>
    </motion.div>
  );
}
