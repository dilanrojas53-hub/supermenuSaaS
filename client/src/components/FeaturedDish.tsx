/*
 * FeaturedDish — V7.0 Premium Refinement
 * Glassmorphism overlay sobre --menu-surface.
 * Acentos solo en badge, precio y CTA. Imagen protagonista.
 */
import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Users, Clock } from 'lucide-react';
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
      className="mx-4 mb-6 relative overflow-hidden"
      style={{ borderRadius: '2rem' }}
    >
      {/* Base surface */}
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--menu-surface)' }} />
      {/* Glassmorphism overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      />
      {/* Premium border */}
      <div
        className="absolute inset-0"
        style={{
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '2rem',
          pointerEvents: 'none',
        }}
      />

      {/* Shimmer overlay */}
      <motion.div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.04) 45%, transparent 60%)',
          borderRadius: '2rem',
        }}
        animate={{ x: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', repeatDelay: 3 }}
      />

      {/* Content */}
      <div className="relative z-10 p-5" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.35)' }}>
        {/* Header: badge + countdown */}
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{
              backgroundColor: 'var(--menu-accent)',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            ⭐ {lang === 'es' ? 'Recomendación del Chef' : "Chef's Recommendation"}
          </span>
          <div
            className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: 'var(--menu-accent)',
            }}
          >
            <Clock size={10} />
            <span>{remainingText}</span>
          </div>
        </div>

        {/* Content row */}
        <div className="flex gap-4">
          {/* Image — protagonist */}
          {item.image_url && (
            <div className="w-28 h-28 rounded-2xl overflow-hidden flex-shrink-0 shadow-lg relative">
              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              <div
                className="absolute bottom-1 right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                style={{ backgroundColor: 'var(--menu-accent)' }}
              >
                <span className="text-xs">👨‍🍳</span>
              </div>
            </div>
          )}

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h3
              className="text-lg font-bold leading-tight mb-1"
              style={{ fontFamily: "'Lora', serif", color: 'var(--menu-text)' }}
            >
              {item.name}
            </h3>
            {item.description && (
              <p
                className="text-sm leading-relaxed mb-2 line-clamp-2"
                style={{ color: 'var(--menu-text)', opacity: 0.65 }}
              >
                {item.description}
              </p>
            )}

            {/* Social proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="flex items-center gap-1 text-[11px] font-medium mb-3"
              style={{ color: 'var(--menu-text)', opacity: 0.5 }}
            >
              <Users size={11} />
              <span>{ordersText}</span>
            </motion.div>

            <div className="flex items-center justify-between">
              {/* Price — accent */}
              <span
                className="text-xl font-bold"
                style={{ fontFamily: "'Lora', serif", color: 'var(--menu-accent)' }}
              >
                {formatPrice(item.price)}
              </span>
              {/* CTA — accent */}
              <motion.button
                onClick={handleAdd}
                whileTap={{ scale: 0.92 }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all hover:scale-105 hover:brightness-110 active:scale-95"
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
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
