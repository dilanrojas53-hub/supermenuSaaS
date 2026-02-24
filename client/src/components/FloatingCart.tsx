/*
 * Design: "Warm Craft" — Carrito flotante sticky en la parte inferior.
 * Bounce suave al recibir items. Muestra total y cantidad.
 * Placeholder para Fase 4 (checkout).
 */
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ChevronUp } from 'lucide-react';
import type { ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';

interface FloatingCartProps {
  theme: ThemeSettings;
  onOpen: () => void;
}

export default function FloatingCart({ theme, onOpen }: FloatingCartProps) {
  const { totalItems, totalPrice } = useCart();

  return (
    <AnimatePresence>
      {totalItems > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-40 p-4 pb-6"
        >
          <motion.button
            key={totalItems}
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 0.3 }}
            onClick={onOpen}
            className="w-full flex items-center justify-between px-6 py-4 rounded-2xl shadow-xl transition-all active:scale-[0.98]"
            style={{
              backgroundColor: theme.primary_color,
              color: '#fff',
              boxShadow: `0 8px 32px ${theme.primary_color}40`,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag size={22} />
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                  style={{ backgroundColor: theme.accent_color, color: theme.text_color }}
                >
                  {totalItems}
                </span>
              </div>
              <span className="font-semibold text-sm">Ver pedido</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold" style={{ fontFamily: "'Lora', serif" }}>
                {formatPrice(totalPrice)}
              </span>
              <ChevronUp size={18} />
            </div>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
