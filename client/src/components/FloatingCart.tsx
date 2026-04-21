/*
 * FloatingCart v2 — Carrito flotante tipo nube/pill.
 * Muestra el último producto agregado con animación de entrada.
 * Al hacer tap abre el CartDrawer.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ChevronRight } from 'lucide-react';
import type { ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';

interface FloatingCartProps {
  theme: ThemeSettings;
  onOpen: () => void;
}

export default function FloatingCart({ theme, onOpen }: FloatingCartProps) {
  const { totalItems, totalPrice, lastAddedItem } = useCart();
  const { lang } = useI18n();

  // Mostrar el nombre del último producto agregado por 2.5 s
  const [showBubble, setShowBubble] = useState(false);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!lastAddedItem) return;
    setShowBubble(true);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setShowBubble(false), 2500);
    return () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    };
  }, [lastAddedItem]);

  if (totalItems === 0) return null;

  const viewOrderText = lang === 'es' ? 'Ver pedido' : 'View order';

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">

      {/* Burbuja de producto agregado */}
      <AnimatePresence>
        {showBubble && lastAddedItem && (
          <motion.div
            key={lastAddedItem.id + '-bubble'}
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.92 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="pointer-events-none max-w-[200px] px-3.5 py-2 rounded-2xl text-xs font-semibold shadow-lg"
            style={{
              backgroundColor: theme.background_color || '#111',
              color: theme.text_color,
              border: `1.5px solid ${theme.primary_color}30`,
              boxShadow: `0 4px 20px rgba(0,0,0,0.35)`,
            }}
          >
            <span style={{ color: theme.primary_color }}>+1 </span>
            <span className="truncate">{lastAddedItem.name}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Botón principal tipo nube */}
      <motion.button
        key={`cart-fab-${totalItems}`}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', damping: 18, stiffness: 340 }}
        onClick={onOpen}
        className="pointer-events-auto flex items-center gap-2.5 pl-3.5 pr-4 py-3 rounded-full shadow-2xl"
        style={{
          backgroundColor: theme.primary_color,
          color: 'var(--menu-accent-contrast)',
          boxShadow: `0 6px 28px ${theme.primary_color}50`,
        }}
      >
        {/* Ícono carrito con badge */}
        <div className="relative">
          <ShoppingBag size={20} />
          <motion.span
            key={totalItems}
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.35, 1] }}
            transition={{ duration: 0.3 }}
            className="absolute -top-2 -right-2 w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{
              backgroundColor: 'var(--menu-accent-contrast)',
              color: theme.primary_color,
            }}
          >
            {totalItems}
          </motion.span>
        </div>

        {/* Texto + precio */}
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{viewOrderText}</span>
          <span className="text-xs opacity-70">·</span>
          <motion.span
            key={totalPrice}
            initial={{ y: -4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-sm font-bold"
          >
            {formatPrice(totalPrice)}
          </motion.span>
        </div>

        <ChevronRight size={15} className="opacity-70" />
      </motion.button>
    </div>
  );
}
