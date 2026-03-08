/*
 * AIUpsellModal v2 — Dashboard de Recomendaciones Multi-Item
 * Design: Premium bottom sheet with scrollable match cards.
 * Each card shows: "Para tu [trigger_item]..." + suggested item photo/price + AI pitch + Add button.
 * Single "Continuar al Pago →" CTA at the bottom.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, ChevronRight, Sparkles, Loader2, Check } from 'lucide-react';
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
  /** The cart item name that triggered this suggestion */
  trigger_item_name?: string;
  /** ID del item que disparó esta sugerencia (V11.0 Telemetría Local) */
  trigger_item_id?: string | null;
  /** AI-generated persuasive pitch specific to this match */
  pitch?: string;
}

interface AIUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  suggestedItems: AISuggestedItem[];
  isLoading: boolean;
  theme: ThemeSettings;
}

export default function AIUpsellModal({
  isOpen,
  onClose,
  onContinue,
  suggestedItems,
  isLoading,
  theme,
}: AIUpsellModalProps) {
  const { addItemAdvanced } = useCart();
  const { lang } = useI18n();

  // Track which items were added
  const [addedIds, setAddedIds] = React.useState<Set<string>>(new Set());

  const handleAddItem = (item: AISuggestedItem) => {
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
    // V11.0 Telemetría Local: guardar trigger_item_id y upsell_accepted_at SOLO en memoria
    // Estos campos son limpiados con destructuring ANTES del INSERT a Supabase
    addItemAdvanced(menuItem, {
      isUpsell: true,
      upsellSource: 'ai',
      triggerItemId: item.trigger_item_id || null,
      upsellAcceptedAt: new Date().toISOString(),
    });
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
  const addedCount = addedIds.size;

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
            className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-3xl pb-safe flex flex-col"
            style={{
              backgroundColor: theme.background_color,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
              maxHeight: '85vh',
            }}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1 opacity-20 flex-shrink-0" style={{ backgroundColor: theme.text_color }} />

            {/* Close button */}
            {!isLoading && (
              <button
                onClick={handleSkip}
                className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity z-10"
                style={{ backgroundColor: `${theme.text_color}10` }}
              >
                <X size={16} style={{ color: theme.text_color }} />
              </button>
            )}

            {/* ─── LOADING STATE ─── */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-4 px-5">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${theme.primary_color}15` }}
                >
                  <Sparkles size={24} style={{ color: theme.primary_color }} />
                </motion.div>
                <div className="text-center">
                  <p className="font-bold text-base" style={{ color: theme.text_color, fontFamily: "'Lora', serif" }}>
                    {lang === 'es' ? 'Analizando tu pedido...' : 'Analyzing your order...'}
                  </p>
                  <p className="text-xs opacity-50 mt-1" style={{ color: theme.text_color }}>
                    {lang === 'es' ? 'Nuestra IA está preparando sugerencias personalizadas' : 'Our AI is preparing personalized suggestions'}
                  </p>
                </div>
                <Loader2 size={20} className="animate-spin opacity-40" style={{ color: theme.primary_color }} />
              </div>
            )}

            {/* ─── CONTENT STATE: Multi-Item Dashboard ─── */}
            {!isLoading && suggestedItems.length > 0 && (
              <>
                {/* Header */}
                <div className="px-5 pt-2 pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${theme.primary_color}15` }}
                    >
                      <Sparkles size={14} style={{ color: theme.primary_color }} />
                    </div>
                    <span
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: theme.primary_color }}
                    >
                      {lang === 'es' ? 'Sugerencias personalizadas' : 'Personalized suggestions'}
                    </span>
                  </div>
                  <p
                    className="text-lg font-bold leading-snug pr-8"
                    style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                  >
                    {lang === 'es'
                      ? 'Completa tu experiencia'
                      : 'Complete your experience'}
                  </p>
                </div>

                {/* Scrollable Match Cards */}
                <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-3" style={{ minHeight: 0 }}>
                  {suggestedItems.map((item, idx) => {
                    const isAdded = addedIds.has(item.id);
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 + idx * 0.06, type: 'spring', damping: 20 }}
                        className="rounded-2xl overflow-hidden transition-all"
                        style={{
                          backgroundColor: isAdded
                            ? `${theme.primary_color}08`
                            : `${theme.text_color}03`,
                          border: `1.5px solid ${isAdded ? theme.primary_color + '30' : theme.text_color + '08'}`,
                        }}
                      >
                        {/* Trigger label */}
                        {item.trigger_item_name && (
                          <div
                            className="px-4 pt-3 pb-1"
                          >
                            <p className="text-xs font-semibold opacity-50" style={{ color: theme.text_color }}>
                              {lang === 'es' ? 'Para tu' : 'For your'}{' '}
                              <span style={{ color: theme.primary_color, opacity: 1 }} className="font-bold">
                                {item.trigger_item_name}
                              </span>
                            </p>
                          </div>
                        )}

                        {/* Card body */}
                        <div className="flex items-center gap-3 px-4 pb-3 pt-1">
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
                              <div className="w-full h-full flex items-center justify-center text-2xl opacity-40">
                                🍽️
                              </div>
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
                            {/* AI pitch in italic */}
                            {item.pitch && (
                              <p
                                className="text-xs italic leading-snug mt-0.5 line-clamp-2"
                                style={{ color: `${theme.text_color}90` }}
                              >
                                "{item.pitch}"
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
                            whileTap={{ scale: 0.88 }}
                            disabled={isAdded}
                            className="flex items-center gap-1 px-3 py-2 rounded-full text-xs font-bold flex-shrink-0 transition-all"
                            style={{
                              backgroundColor: isAdded ? theme.primary_color : `${theme.primary_color}12`,
                              color: isAdded ? 'var(--menu-accent-contrast)' : theme.primary_color,
                            }}
                          >
                            {isAdded ? (
                              <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="flex items-center gap-1"
                              >
                                <Check size={14} />
                                {lang === 'es' ? 'Agregado' : 'Added'}
                              </motion.span>
                            ) : (
                              <>
                                <Plus size={14} />
                                {lang === 'es' ? 'Agregar' : 'Add'}
                              </>
                            )}
                          </motion.button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Sticky CTA footer */}
                <div
                  className="px-5 pt-3 pb-5 flex-shrink-0 border-t"
                  style={{ borderColor: `${theme.text_color}08` }}
                >
                  {/* Added count indicator */}
                  {hasAddedAny && (
                    <motion.p
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-center mb-2 font-semibold"
                      style={{ color: theme.primary_color }}
                    >
                      {addedCount} {lang === 'es'
                        ? `item${addedCount > 1 ? 's' : ''} agregado${addedCount > 1 ? 's' : ''}`
                        : `item${addedCount > 1 ? 's' : ''} added`}
                    </motion.p>
                  )}

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
                      className="flex-[1.5] py-3.5 rounded-full text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                      style={{
                        backgroundColor: hasAddedAny ? theme.primary_color : `${theme.primary_color}15`,
                        color: hasAddedAny ? 'var(--menu-accent-contrast)' : theme.primary_color,
                        boxShadow: hasAddedAny ? `0 4px 16px ${theme.primary_color}35` : 'none',
                      }}
                    >
                      {lang === 'es' ? 'Continuar al pago' : 'Continue to payment'}
                      <ChevronRight size={16} />
                    </motion.button>
                  </div>
                </div>
              </>
            )}

            {/* ─── FALLBACK: no suggestions ─── */}
            {!isLoading && suggestedItems.length === 0 && (
              <div className="py-6 text-center px-5">
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
