/*
 * AIUpsellModal — Motor de Neuro-Ventas con IA (GPT-4o-mini)
 * Design: Premium bottom sheet con animaciones spring, social proof y copy persuasivo.
 * Flujo: CartDrawer intercepta "Continuar al pago" → llama /api/generate-upsell →
 *        muestra este modal → usuario acepta/rechaza → continúa al pago.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, ChevronRight, Sparkles, Zap, Loader2 } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';

export interface AISuggestedItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  dietary_tags?: string[];
}

interface AIUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  suggestedItems: AISuggestedItem[];
  pitchMessage: string | null;
  isLoading: boolean;
  theme: ThemeSettings;
}

export default function AIUpsellModal({
  isOpen,
  onClose,
  onContinue,
  suggestedItems,
  pitchMessage,
  isLoading,
  theme,
}: AIUpsellModalProps) {
  const { addItem } = useCart();
  const { lang } = useI18n();

  // Track which items were added
  const [addedIds, setAddedIds] = React.useState<Set<string>>(new Set());

  const handleAddItem = (item: AISuggestedItem) => {
    // Cast to MenuItem shape (compatible subset)
    const menuItem: MenuItem = {
      id: item.id,
      tenant_id: '',
      category_id: '',
      name: item.name,
      description: item.description,
      price: item.price,
      image_url: item.image_url,
      is_available: true,
      is_featured: false,
      badge: null,
      upsell_item_id: null,
      upsell_text: null,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    addItem(menuItem, true, 'ai'); // isUpsell=true, upsell_source='ai' for analytics tracking
    setAddedIds(prev => new Set(Array.from(prev).concat(item.id)));
  };

  const handleContinue = () => {
    setAddedIds(new Set());
    onContinue();
  };

  const handleSkip = () => {
    setAddedIds(new Set());
    onClose();
  };

  const hasAddedAny = addedIds.size > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            onClick={isLoading ? undefined : handleSkip}
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 120 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 120 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-3xl pb-safe"
            style={{
              backgroundColor: theme.background_color,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
            }}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 opacity-20" style={{ backgroundColor: theme.text_color }} />

            {/* Close button */}
            {!isLoading && (
              <button
                onClick={handleSkip}
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                style={{ backgroundColor: `${theme.text_color}10` }}
              >
                <X size={16} style={{ color: theme.text_color }} />
              </button>
            )}

            <div className="px-5 pt-2 pb-6">
              {/* ─── LOADING STATE ─── */}
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${theme.primary_color}15` }}
                  >
                    <Sparkles size={24} style={{ color: theme.primary_color }} />
                  </motion.div>
                  <div className="text-center">
                    <p className="font-bold text-base" style={{ color: theme.text_color }}>
                      {lang === 'es' ? 'Preparando sugerencias...' : 'Preparing suggestions...'}
                    </p>
                    <p className="text-xs opacity-50 mt-1" style={{ color: theme.text_color }}>
                      {lang === 'es' ? 'Nuestra IA está analizando tu pedido' : 'Our AI is analyzing your order'}
                    </p>
                  </div>
                  <Loader2 size={20} className="animate-spin opacity-40" style={{ color: theme.primary_color }} />
                </div>
              )}

              {/* ─── CONTENT STATE ─── */}
              {!isLoading && suggestedItems.length > 0 && (
                <>
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${theme.primary_color}15` }}
                    >
                      <Zap size={16} style={{ color: theme.primary_color }} />
                    </div>
                    <span
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: theme.primary_color }}
                    >
                      {lang === 'es' ? 'Sugerido por IA' : 'AI Suggested'}
                    </span>
                  </div>

                  {/* Pitch message */}
                  {pitchMessage && (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-lg font-bold leading-snug mb-4 pr-8"
                      style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                    >
                      {pitchMessage}
                    </motion.p>
                  )}

                  {/* Suggested items */}
                  <div className="space-y-3 mb-4">
                    {suggestedItems.map((item, idx) => {
                      const isAdded = addedIds.has(item.id);
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 + idx * 0.08 }}
                          className="flex items-center gap-3 rounded-2xl p-3 transition-all"
                          style={{
                            backgroundColor: isAdded
                              ? `${theme.primary_color}10`
                              : `${theme.text_color}04`,
                            border: `1.5px solid ${isAdded ? theme.primary_color : `${theme.text_color}08`}`,
                          }}
                        >
                          {/* Image */}
                          <div
                            className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0"
                            style={{ backgroundColor: `${theme.primary_color}08` }}
                          >
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-bold text-sm leading-tight"
                              style={{ color: theme.text_color }}
                            >
                              {item.name}
                            </p>
                            {item.description && (
                              <p
                                className="text-xs opacity-50 line-clamp-1 mt-0.5"
                                style={{ color: theme.text_color }}
                              >
                                {item.description}
                              </p>
                            )}
                            <p
                              className="text-sm font-bold mt-1"
                              style={{ color: theme.primary_color }}
                            >
                              +{formatPrice(item.price)}
                            </p>
                          </div>

                          {/* Add button */}
                          <motion.button
                            onClick={() => !isAdded && handleAddItem(item)}
                            whileTap={{ scale: 0.92 }}
                            disabled={isAdded}
                            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                            style={{
                              backgroundColor: isAdded ? theme.primary_color : `${theme.primary_color}15`,
                              color: isAdded ? '#fff' : theme.primary_color,
                            }}
                          >
                            {isAdded ? (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="text-base"
                              >
                                ✓
                              </motion.span>
                            ) : (
                              <Plus size={18} />
                            )}
                          </motion.button>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleSkip}
                      className="flex-1 py-3.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98]"
                      style={{
                        border: `1.5px solid ${theme.text_color}20`,
                        color: `${theme.text_color}70`,
                      }}
                    >
                      {lang === 'es' ? 'No, gracias' : 'No, thanks'}
                    </button>
                    <motion.button
                      onClick={handleContinue}
                      whileTap={{ scale: 0.95 }}
                      className="flex-[1.4] py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                      style={{
                        backgroundColor: hasAddedAny ? theme.primary_color : `${theme.primary_color}15`,
                        color: hasAddedAny ? '#fff' : theme.primary_color,
                        boxShadow: hasAddedAny ? `0 4px 16px ${theme.primary_color}35` : 'none',
                      }}
                    >
                      {hasAddedAny ? (
                        <>
                          {lang === 'es' ? 'Continuar al pago' : 'Continue to payment'}
                          <ChevronRight size={16} />
                        </>
                      ) : (
                        <>
                          {lang === 'es' ? 'Continuar sin agregar' : 'Continue without adding'}
                          <ChevronRight size={14} />
                        </>
                      )}
                    </motion.button>
                  </div>
                </>
              )}

              {/* ─── FALLBACK: no suggestions (skip silently) ─── */}
              {!isLoading && suggestedItems.length === 0 && (
                <div className="py-4 text-center">
                  <p className="text-sm opacity-50" style={{ color: theme.text_color }}>
                    {lang === 'es' ? 'Sin sugerencias adicionales' : 'No additional suggestions'}
                  </p>
                  <button
                    onClick={handleContinue}
                    className="mt-3 text-sm font-semibold"
                    style={{ color: theme.primary_color }}
                  >
                    {lang === 'es' ? 'Continuar al pago →' : 'Continue to payment →'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Need React for useState
import React from 'react';
