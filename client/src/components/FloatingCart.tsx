/*
 * Neuro-Ventas: Carrito flotante con bounce al agregar items,
 * pulso en el badge de cantidad, y total actualizado en tiempo real.
 * i18n: traduce "Ver pedido" / "View order".
 */
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, ChevronUp } from 'lucide-react';
import type { ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';

interface FloatingCartProps {
  theme: ThemeSettings;
  onOpen: () => void;
}

export default function FloatingCart({ theme, onOpen }: FloatingCartProps) {
  const { totalItems, totalPrice } = useCart();
  const { lang } = useI18n();

  const viewOrderText = lang === 'es' ? 'Ver pedido' : 'View order';

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
            key={`cart-${totalItems}`}
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 0.35 }}
            onClick={onOpen}
            className="w-full flex items-center justify-between px-6 py-4 rounded-2xl shadow-xl transition-all active:scale-[0.98]"
            style={{
              backgroundColor: theme.primary_color,
              color: 'var(--menu-accent-contrast)',
              boxShadow: `0 8px 32px ${theme.primary_color}40`,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag size={22} />
                <motion.span
                  key={totalItems}
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.3, 1] }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                  style={{ backgroundColor: theme.accent_color, color: theme.text_color }}
                >
                  {totalItems}
                </motion.span>
              </div>
              <span className="font-semibold text-sm">{viewOrderText}</span>
            </div>
            <div className="flex items-center gap-2">
              <motion.span
                key={totalPrice}
                initial={{ y: -5, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-lg font-bold"
                style={{ fontFamily: "'Lora', serif" }}
              >
                {formatPrice(totalPrice)}
              </motion.span>
              <ChevronUp size={18} />
            </div>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
