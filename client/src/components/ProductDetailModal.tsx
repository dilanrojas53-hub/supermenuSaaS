/*
 * ProductDetailModal — V17.0: 2 recomendaciones IA con aprendizaje
 * - Large photo, full description, quantity selector
 * - 2 sugerencias IA de categorías distintas
 * - Cada sugerencia se puede agregar independientemente
 * - Feedback (accepted/rejected) se envía al backend para aprendizaje
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Sparkles, Loader2, Check, ShoppingBag } from 'lucide-react';
import type { MenuItem, ThemeSettings, Tenant, SelectedModifier } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/lib/supabase';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/imageUtils';
import ModifierSelector from './ModifierSelector';
import { toast } from 'sonner';

interface AISuggestion {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  pitch?: string;
}

interface ProductDetailModalProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
}

/** Registra feedback de upsell al backend (fire-and-forget) */
function sendUpsellFeedback(
  tenantId: string,
  triggerItemId: string,
  triggerItemName: string,
  suggestedItemId: string,
  suggestedItemName: string,
  action: 'accepted' | 'rejected' | 'ignored'
) {
  fetch('/api/upsell-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: tenantId,
      trigger_item_id: triggerItemId,
      trigger_item_name: triggerItemName,
      suggested_item_id: suggestedItemId,
      suggested_item_name: suggestedItemName,
      action,
    }),
  }).catch(() => {/* silent fail — feedback is best-effort */});
}

export default function ProductDetailModal({
  item,
  isOpen,
  onClose,
  theme,
  tenant,
}: ProductDetailModalProps) {
  const { addItemAdvanced, markUpsellHandled } = useCart();
  const { lang } = useI18n();

  const [quantity, setQuantity] = useState(1);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFetched, setAiFetched] = useState(false);
  // V22.1: Modifier groups support
  const [hasModifiers, setHasModifiers] = useState(false);
  const [showModifierSelector, setShowModifierSelector] = useState(false);
  // Per-suggestion state: qty and added flag
  const [suggestionQtys, setSuggestionQtys] = useState<Record<string, number>>({});
  const [suggestionAdded, setSuggestionAdded] = useState<Record<string, boolean>>({});
  const [mainAdded, setMainAdded] = useState(false);
  // Track which suggestions were shown (for "ignored" feedback on close)
  const [shownSuggestionIds, setShownSuggestionIds] = useState<string[]>([]);

  // Reset state when item changes
  useEffect(() => {
    if (item && isOpen) {
      setQuantity(1);
      setAiSuggestions([]);
      setAiLoading(false);
      setAiFetched(false);
      setSuggestionQtys({});
      setSuggestionAdded({});
      setMainAdded(false);
      setShownSuggestionIds([]);
    }
  }, [item?.id, isOpen]);

  // Fetch AI suggestions for this specific item
  useEffect(() => {
    if (!item || !isOpen || aiFetched) return;
    setAiFetched(true);

    const fetchSuggestions = async () => {
      setAiLoading(true);
      try {
        const response = await fetch('/api/generate-upsell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cart: [{ id: item.id, name: item.name, price: item.price, category_id: item.category_id }],
            tenant_id: tenant.id,
            restaurant_name: tenant.name,
            trigger_category_id: item.category_id,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
          const data = await response.json();
          if (!data.fallback && data.suggested_items?.length > 0) {
            const suggestions: AISuggestion[] = data.suggested_items.slice(0, 2).map((s: any) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              price: s.price,
              image_url: s.image_url,
              pitch: s.pitch || `${lang === 'es' ? 'Perfecto con' : 'Perfect with'} ${item.name}`,
            }));
            setAiSuggestions(suggestions);
            setShownSuggestionIds(suggestions.map(s => s.id));
            // Initialize qty for each suggestion
            const qtys: Record<string, number> = {};
            suggestions.forEach(s => { qtys[s.id] = 1; });
            setSuggestionQtys(qtys);
          }
        }
      } catch {
        // Silent fail — no suggestion is fine
      } finally {
        setAiLoading(false);
      }
    };

    fetchSuggestions();
  }, [item, isOpen, aiFetched, tenant.id, tenant.name, lang]);

  // Send "ignored" feedback for suggestions not added when modal closes
  const handleClose = useCallback(() => {
    if (item && shownSuggestionIds.length > 0) {
      shownSuggestionIds.forEach(sugId => {
        if (!suggestionAdded[sugId]) {
          const suggestion = aiSuggestions.find(s => s.id === sugId);
          if (suggestion) {
            sendUpsellFeedback(
              tenant.id, item.id, item.name,
              sugId, suggestion.name, 'ignored'
            );
          }
        }
      });
    }
    onClose();
  }, [item, shownSuggestionIds, suggestionAdded, aiSuggestions, tenant.id, onClose]);

  const handleAddSuggestion = useCallback((suggestion: AISuggestion) => {
    if (!item) return;
    const qty = suggestionQtys[suggestion.id] || 1;
    const suggestionMenuItem: MenuItem = {
      id: suggestion.id,
      tenant_id: tenant.id,
      category_id: '',
      name: suggestion.name,
      description: suggestion.description,
      price: suggestion.price,
      image_url: suggestion.image_url,
      is_available: true,
      is_featured: false,
      badge: null,
      upsell_item_id: null,
      upsell_text: null,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    addItemAdvanced(suggestionMenuItem, {
      quantity: qty,
      isUpsell: true,
      upsellSource: 'ai',
      preventCheckoutUpsell: true,
    });
    setSuggestionAdded(prev => ({ ...prev, [suggestion.id]: true }));
    toast.success(
      lang === 'es' ? `${suggestion.name} agregado` : `${suggestion.name} added`,
      { duration: 1500 }
    );
    // Register "accepted" feedback
    sendUpsellFeedback(
      tenant.id, item.id, item.name,
      suggestion.id, suggestion.name, 'accepted'
    );
  }, [item, suggestionQtys, addItemAdvanced, tenant.id, lang]);

  // V22.1: Check if this item has modifier groups assigned
  useEffect(() => {
    if (!item || !isOpen) return;
    supabase
      .from('product_modifier_groups')
      .select('group_id', { count: 'exact', head: true })
      .eq('product_id', item.id)
      .then(({ count }) => setHasModifiers((count ?? 0) > 0));
  }, [item?.id, isOpen]);

  // V22.2: addToCartDirectly declared FIRST to avoid hoisting issue with handleAddToCart
  const addToCartDirectly = useCallback((selectedModifiers: SelectedModifier[], modifiersTotal: number) => {
    if (!item) return;
    const mainCartId = addItemAdvanced(item, {
      quantity,
      preventCheckoutUpsell: true,
      selectedModifiers,
      modifiersTotal,
    });
    // Register "rejected" feedback for suggestions not added
    shownSuggestionIds.forEach(sugId => {
      if (!suggestionAdded[sugId]) {
        const suggestion = aiSuggestions.find(s => s.id === sugId);
        if (suggestion) {
          sendUpsellFeedback(
            tenant.id, item.id, item.name,
            sugId, suggestion.name, 'rejected'
          );
        }
      }
    });
    markUpsellHandled(mainCartId);
    setMainAdded(true);
    toast.success(
      lang === 'es'
        ? `${item.name} agregado al carrito`
        : `${item.name} added to cart`,
      { duration: 2000 }
    );
    setTimeout(() => {
      onClose();
    }, 600);
  }, [item, quantity, aiSuggestions, suggestionAdded, shownSuggestionIds, addItemAdvanced, markUpsellHandled, tenant.id, lang, onClose]);

  // handleAddToCart declared AFTER addToCartDirectly so it can reference it safely
  const handleAddToCart = useCallback(() => {
    if (!item) return;
    if (hasModifiers) {
      setShowModifierSelector(true);
      return;
    }
    addToCartDirectly([], 0);
  }, [item, hasModifiers, addToCartDirectly]);

  if (!item) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-[9999]"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          />

          {/* Modal — slides up from bottom */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[9999] max-h-[92vh] flex flex-col rounded-t-3xl overflow-hidden"
            style={{
              backgroundColor: theme.background_color,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
            }}
          >
            {/* Close button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff' }}
            >
              <X size={18} />
            </button>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* Hero image */}
              {item.image_url ? (
                <div className="w-full h-64 relative">
                  <img
                    src={getOptimizedImageUrl(item.image_url, IMAGE_SIZES.detail.width, IMAGE_SIZES.detail.quality)}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="eager"
                    decoding="async"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(to top, ${theme.background_color} 0%, transparent 50%)`,
                    }}
                  />
                </div>
              ) : (
                <div
                  className="w-full h-48 flex items-center justify-center text-6xl opacity-20"
                  style={{ backgroundColor: `${theme.primary_color}10` }}
                >
                  🍽️
                </div>
              )}

              {/* Product info */}
              <div className="px-5 -mt-8 relative">
                <h2
                  className="text-2xl font-bold leading-tight mb-2"
                  style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                >
                  {item.name}
                </h2>

                <p
                  className="text-2xl font-bold mb-3"
                  style={{ color: theme.primary_color }}
                >
                  {formatPrice(item.price)}
                </p>

                {item.description && (
                  <p
                    className="text-sm leading-relaxed opacity-70 mb-5"
                    style={{ color: theme.text_color }}
                  >
                    {item.description}
                  </p>
                )}

                {/* Quantity selector */}
                <div className="flex items-center justify-between mb-6">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: theme.text_color }}
                  >
                    {lang === 'es' ? 'Cantidad' : 'Quantity'}
                  </span>
                  <div
                    className="flex items-center gap-4 px-4 py-2 rounded-full"
                    style={{ backgroundColor: `${theme.text_color}08`, border: `1px solid ${theme.text_color}12` }}
                  >
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                      style={{ backgroundColor: `${theme.text_color}10` }}
                    >
                      <Minus size={16} style={{ color: theme.text_color }} />
                    </button>
                    <span
                      className="text-lg font-bold w-8 text-center"
                      style={{ color: theme.text_color }}
                    >
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(q => q + 1)}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                      style={{ backgroundColor: theme.primary_color }}
                    >
                      <Plus size={16} style={{ color: '#fff' }} />
                    </button>
                  </div>
                </div>

                {/* ─── AI SUGGESTIONS SECTION (V17.0: 2 sugerencias) ─── */}
                <div className="mb-5">
                  {aiLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center gap-2 py-3 px-4 rounded-2xl"
                      style={{ backgroundColor: `${theme.primary_color}08`, border: `1px dashed ${theme.primary_color}25` }}
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      >
                        <Sparkles size={14} style={{ color: theme.primary_color }} />
                      </motion.div>
                      <span className="text-xs opacity-60" style={{ color: theme.text_color }}>
                        {lang === 'es' ? 'Buscando el complemento perfecto...' : 'Finding the perfect pairing...'}
                      </span>
                    </motion.div>
                  )}

                  {!aiLoading && aiSuggestions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={13} style={{ color: theme.primary_color }} />
                        <span
                          className="text-xs font-bold tracking-widest uppercase"
                          style={{ color: theme.primary_color }}
                        >
                          {lang === 'es' ? 'Recomendado para ti' : 'Recommended for you'}
                        </span>
                      </div>

                      {/* Suggestion cards */}
                      <div className="flex flex-col gap-3">
                        {aiSuggestions.map((suggestion) => {
                          const isAdded = suggestionAdded[suggestion.id];
                          const qty = suggestionQtys[suggestion.id] || 1;
                          return (
                            <motion.div
                              key={suggestion.id}
                              className="flex items-center gap-3 p-3 rounded-2xl"
                              style={{
                                backgroundColor: isAdded
                                  ? `${theme.primary_color}15`
                                  : `${theme.text_color}06`,
                                border: `1px solid ${isAdded ? theme.primary_color + '40' : theme.text_color + '10'}`,
                                transition: 'all 0.3s ease',
                              }}
                            >
                              {/* Thumbnail */}
                              {suggestion.image_url ? (
                                <img
                                  src={getOptimizedImageUrl(suggestion.image_url, IMAGE_SIZES.thumbnail.width, IMAGE_SIZES.thumbnail.quality, IMAGE_SIZES.thumbnail.height)}
                                  alt={suggestion.name}
                                  className="w-16 h-16 rounded-xl object-cover shrink-0"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div
                                  className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl shrink-0"
                                  style={{ backgroundColor: `${theme.primary_color}15` }}
                                >
                                  🍽️
                                </div>
                              )}

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-sm font-bold leading-tight truncate"
                                  style={{ color: theme.text_color }}
                                >
                                  {suggestion.name}
                                </p>
                                {suggestion.pitch && (
                                  <p
                                    className="text-xs italic opacity-60 mt-0.5 line-clamp-1"
                                    style={{ color: theme.text_color }}
                                  >
                                    "{suggestion.pitch}"
                                  </p>
                                )}
                                <p
                                  className="text-sm font-bold mt-1"
                                  style={{ color: theme.primary_color }}
                                >
                                  {formatPrice(suggestion.price)}
                                </p>
                              </div>

                              {/* Controls */}
                              <div className="flex flex-col items-end gap-2 shrink-0">
                                {!isAdded ? (
                                  <>
                                    {/* Qty mini controls */}
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => setSuggestionQtys(prev => ({ ...prev, [suggestion.id]: Math.max(1, (prev[suggestion.id] || 1) - 1) }))}
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                                        style={{ backgroundColor: `${theme.text_color}12`, color: theme.text_color }}
                                      >
                                        <Minus size={10} />
                                      </button>
                                      <span className="text-xs font-bold w-4 text-center" style={{ color: theme.text_color }}>
                                        {qty}
                                      </span>
                                      <button
                                        onClick={() => setSuggestionQtys(prev => ({ ...prev, [suggestion.id]: (prev[suggestion.id] || 1) + 1 }))}
                                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                                        style={{ backgroundColor: theme.primary_color, color: '#fff' }}
                                      >
                                        <Plus size={10} />
                                      </button>
                                    </div>
                                    {/* Add button */}
                                    <button
                                      onClick={() => handleAddSuggestion(suggestion)}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95"
                                      style={{ backgroundColor: theme.primary_color, color: '#fff' }}
                                    >
                                      <Plus size={11} />
                                      {lang === 'es' ? 'Agregar' : 'Add'}
                                    </button>
                                  </>
                                ) : (
                                  <div
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                                    style={{ backgroundColor: `${theme.primary_color}20`, color: theme.primary_color }}
                                  >
                                    <Check size={12} />
                                    {lang === 'es' ? 'Agregado' : 'Added'}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Bottom CTA ─── */}
            <div
              className="px-5 py-4 shrink-0"
              style={{
                borderTop: `1px solid ${theme.text_color}10`,
                backgroundColor: theme.background_color,
              }}
            >
              <button
                onClick={handleAddToCart}
                disabled={mainAdded}
                className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70"
                style={{
                  backgroundColor: mainAdded ? `${theme.primary_color}60` : theme.primary_color,
                  color: '#fff',
                }}
              >
                {mainAdded ? (
                  <><Check size={18} /><span>{lang === 'es' ? '¡Agregado!' : 'Added!'}</span></>
                ) : (
                  <>
                    <ShoppingBag size={18} />
                    <span>
                      {hasModifiers
                        ? (lang === 'es' ? 'Personalizar y agregar' : 'Customize & add')
                        : (lang === 'es' ? `Agregar al carrito — ${formatPrice(item.price * quantity)}` : `Add to cart — ${formatPrice(item.price * quantity)}`)}
                    </span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
      {/* V22.1: ModifierSelector overlay — shown when item has modifier groups */}
      {showModifierSelector && item && (
        <ModifierSelector
          item={item}
          theme={{ primary_color: theme.primary_color, accent_color: theme.accent_color }}
          lang={lang}
          onConfirm={(selectedModifiers, modifiersTotal) => {
            setShowModifierSelector(false);
            addToCartDirectly(selectedModifiers, modifiersTotal);
          }}
          onCancel={() => setShowModifierSelector(false)}
        />
      )}
    </AnimatePresence>
  );
}
