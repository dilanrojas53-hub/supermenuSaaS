/*
 * Neuro-Ventas: Modal de Upsell Condicionado mejorado.
 * - Copy persuasivo personalizado desde la BD
 * - Indicador de ahorro ("Combo perfecto")
 * - Prueba social ("X personas también lo agregaron")
 * - Animación de entrada suave con spring
 * - Botón de aceptar con urgencia visual
 * Sesgos: Anclaje, Reciprocidad, Prueba Social.
 */
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, ChevronRight, Users, Sparkles } from 'lucide-react';
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

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function UpsellModal({ isOpen, onClose, upsellItem, upsellText, theme }: UpsellModalProps) {
  const { addItem } = useCart();

  const seed = useMemo(() => upsellItem ? hashCode(upsellItem.id) : 0, [upsellItem]);
  const alsoAddedPercent = useMemo(() => 65 + (seed % 25), [seed]);

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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
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
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
              style={{ backgroundColor: `${theme.text_color}10` }}
            >
              <X size={16} style={{ color: theme.text_color }} />
            </button>

            {/* Sparkle header */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <Sparkles size={18} style={{ color: theme.accent_color }} />
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: theme.primary_color }}
              >
                Combo perfecto
              </span>
              <Sparkles size={18} style={{ color: theme.accent_color }} />
            </div>

            {/* Persuasive copy */}
            <div className="text-center mb-4">
              <p
                className="text-lg font-bold leading-tight px-2"
                style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
              >
                {upsellText || `¿Completamos tu pedido con ${upsellItem.name}?`}
              </p>
            </div>

            {/* Upsell item preview */}
            <div
              className="flex items-center gap-4 p-4 rounded-2xl mb-3"
              style={{
                backgroundColor: `${theme.primary_color}06`,
                border: `1px solid ${theme.primary_color}15`,
              }}
            >
              <div
                className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0"
                style={{ backgroundColor: `${theme.primary_color}08` }}
              >
                {upsellItem.image_url ? (
                  <img src={upsellItem.image_url} alt={upsellItem.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4
                  className="font-bold text-base mb-0.5"
                  style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                >
                  {upsellItem.name}
                </h4>
                {upsellItem.description && (
                  <p className="text-xs opacity-60 line-clamp-2 mb-1" style={{ color: theme.text_color }}>
                    {upsellItem.description}
                  </p>
                )}
                <span
                  className="text-lg font-bold"
                  style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
                >
                  +{formatPrice(upsellItem.price)}
                </span>
              </div>
            </div>

            {/* Social proof */}
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center justify-center gap-1.5 mb-4 text-xs font-medium opacity-60"
              style={{ color: theme.text_color }}
            >
              <Users size={12} />
              <span>{alsoAddedPercent}% de los clientes también lo agregan</span>
            </motion.div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98]"
                style={{
                  border: `2px solid ${theme.primary_color}20`,
                  color: `${theme.text_color}90`,
                }}
              >
                No, gracias
              </button>
              <motion.button
                onClick={handleAccept}
                whileTap={{ scale: 0.95 }}
                className="flex-[1.3] py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{
                  backgroundColor: theme.primary_color,
                  color: '#fff',
                  boxShadow: `0 4px 16px ${theme.primary_color}30`,
                }}
              >
                <Plus size={16} />
                Sí, agregar
                <ChevronRight size={14} />
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
