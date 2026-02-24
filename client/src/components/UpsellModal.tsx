/*
 * Design: "Warm Craft" — Modal elegante de upsell condicionado.
 * Aparece al agregar un plato fuerte, ofreciendo un complemento lógico.
 * Copy persuasivo con el texto personalizado de la BD.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, ChevronRight } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';

interface UpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  upsellItem: MenuItem | null;
  upsellText: string | null;
  theme: ThemeSettings;
}

export default function UpsellModal({ isOpen, onClose, upsellItem, upsellText, theme }: UpsellModalProps) {
  const { addItem } = useCart();

  if (!upsellItem) return null;

  const handleAccept = () => {
    addItem(upsellItem);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-8 rounded-t-3xl"
            style={{ backgroundColor: theme.background_color }}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-4 opacity-30" style={{ backgroundColor: theme.text_color }} />

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center opacity-50"
              style={{ backgroundColor: `${theme.text_color}10` }}
            >
              <X size={16} style={{ color: theme.text_color }} />
            </button>

            {/* Content */}
            <div className="text-center mb-4">
              <p
                className="text-lg font-bold leading-tight"
                style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
              >
                {upsellText || `Completa tu experiencia con ${upsellItem.name} por solo ${formatPrice(upsellItem.price)}`}
              </p>
            </div>

            {/* Upsell item preview */}
            <div
              className="flex items-center gap-4 p-4 rounded-2xl mb-4"
              style={{
                backgroundColor: `${theme.primary_color}08`,
                border: `1px solid ${theme.primary_color}20`,
              }}
            >
              <div
                className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0"
                style={{ backgroundColor: `${theme.primary_color}10` }}
              >
                {upsellItem.image_url ? (
                  <img src={upsellItem.image_url} alt={upsellItem.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                )}
              </div>
              <div className="flex-1">
                <h4
                  className="font-semibold text-sm"
                  style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                >
                  {upsellItem.name}
                </h4>
                <p className="text-sm opacity-60" style={{ color: theme.text_color }}>
                  {upsellItem.description?.substring(0, 60)}...
                </p>
              </div>
              <span
                className="text-lg font-bold flex-shrink-0"
                style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
              >
                {formatPrice(upsellItem.price)}
              </span>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3.5 rounded-full text-sm font-semibold transition-all"
                style={{
                  border: `2px solid ${theme.primary_color}30`,
                  color: theme.text_color,
                }}
              >
                No, gracias
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 py-3.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ backgroundColor: theme.primary_color, color: '#fff' }}
              >
                <Plus size={16} />
                Sí, agregar
                <ChevronRight size={14} />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
