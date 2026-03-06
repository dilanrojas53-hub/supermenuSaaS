/*
 * FeaturedDish — V8.0 Polímata Visual
 * Inner Glow, Neon Glass badge, Jerarquía tipográfica.
 * 4 CSS vars: --menu-bg, --menu-surface, --menu-text, --menu-accent
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
      style={{
        borderRadius: '1.5rem',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Base surface */}
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--menu-surface)' }} />
      {/* Glassmorphism overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      />

      {/* Shimmer overlay */}
      <motion.div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.03) 45%, transparent 60%)',
          borderRadius: '1.5rem',
        }}
        animate={{ x: ['-100%', '200%'] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', repeatDelay: 3 }}
      />

      {/* Content */}
      <div className="relative z-10 p-5">
        {/* Header: Neon Glass badge + countdown */}
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          {/* Neon Glass badge */}
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide uppercase"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--menu-accent) 15%, transparent)',
              color: 'var(--menu-accent)',
              border: '1px solid color-mix(in srgb, var(--menu-accent) 30%, transparent)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            ⭐ {lang === 'es' ? 'Recomendación del Chef' : "Chef's Recommendation"}
          </span>
          {/* Countdown — subtle */}
          <div
            className="flex items-center gap-1 text-[10px] font-semibold tracking-wide px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
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
            <div className="w-28 h-28 rounded-xl overflow-hidden flex-shrink-0 shadow-lg relative">
              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              <div
                className="absolute bottom-1 right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--menu-accent) 20%, transparent)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span className="text-xs">👨‍🍳</span>
              </div>
            </div>
          )}

          {/* Text */}
          <div className="flex-1 min-w-0">
            {/* Title — bold, lg */}
            <h3
              className="text-lg font-bold leading-tight mb-1"
              style={{ color: 'var(--menu-text)' }}
            >
              {item.name}
            </h3>
            {/* Description — 60% opacity */}
            {item.description && (
              <p
                className="text-sm leading-relaxed mb-2 line-clamp-2"
                style={{ color: 'var(--menu-text)', opacity: 0.6 }}
              >
                {item.description}
              </p>
            )}

            {/* Social proof — subtle */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="flex items-center gap-1 text-[11px] font-medium mb-3"
              style={{ color: 'var(--menu-text)', opacity: 0.45 }}
            >
              <Users size={11} />
              <span>{ordersText}</span>
            </motion.div>

            <div className="flex items-center justify-between">
              {/* Price — accent, extrabold */}
              <span
                className="text-xl font-extrabold"
                style={{ color: 'var(--menu-accent)' }}
              >
                {formatPrice(item.price)}
              </span>
              {/* CTA — accent */}
              <motion.button
                onClick={handleAdd}
                whileTap={{ scale: 0.92 }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all hover:brightness-110"
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
