/*
 * ProductDetailModal — Full-screen half-sheet product detail with:
 * - Large photo, full description, quantity selector
 * - In-modal AI upsell: fetches a suggestion specific to this item
 * - Smart Cart integration: marks items with prevent_checkout_upsell
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Sparkles, Loader2, Check, ShoppingBag } from 'lucide-react';
import type { MenuItem, ThemeSettings, Tenant } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
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
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFetched, setAiFetched] = useState(false);
  const [suggestionQty, setSuggestionQty] = useState(1);
  const [suggestionAdded, setSuggestionAdded] = useState(false);
  const [mainAdded, setMainAdded] = useState(false);

  // Reset state when item changes
  useEffect(() => {
    if (item && isOpen) {
      setQuantity(1);
      setAiSuggestion(null);
      setAiLoading(false);
      setAiFetched(false);
      setSuggestionQty(1);
      setSuggestionAdded(false);
      setMainAdded(false);
    }
  }, [item?.id, isOpen]);

  // Fetch AI suggestion for this specific item
  useEffect(() => {
    if (!item || !isOpen || aiFetched) return;
    setAiFetched(true);

    const fetchSuggestion = async () => {
      setAiLoading(true);
      try {
        const response = await fetch('/api/generate-upsell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cart: [{ id: item.id, name: item.name, price: item.price, category_id: item.category_id }],
            tenant_id: tenant.id,
            restaurant_name: tenant.name,
            // V16.6: pasar categoría del ítem para que el API excluya misma categoría
            trigger_category_id: item.category_id,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
          const data = await response.json();
          if (!data.fallback && data.suggested_items?.length > 0) {
            // Take the first suggestion
            const s = data.suggested_items[0];
            setAiSuggestion({
              id: s.id,
              name: s.name,
              description: s.description,
              price: s.price,
              image_url: s.image_url,
              pitch: s.pitch || s.trigger_item_name
                ? `${lang === 'es' ? 'Perfecto con' : 'Perfect with'} ${item.name}`
                : undefined,
            });
          }
        }
      } catch {
        // Silent fail — no suggestion is fine
      } finally {
        setAiLoading(false);
      }
    };

    fetchSuggestion();
  }, [item, isOpen, aiFetched, tenant.id, tenant.name, lang]);

  const handleAddToCart = useCallback(() => {
    if (!item) return;

    // Add main item with unique cartItemId
    const mainCartId = addItemAdvanced(item, {
      quantity,
      preventCheckoutUpsell: true, // User saw the modal — don't upsell again at checkout
    });

    // If user also added the suggestion, link it
    if (suggestionAdded && aiSuggestion) {
      const suggestionMenuItem: MenuItem = {
        id: aiSuggestion.id,
        tenant_id: tenant.id,
        category_id: '',
        name: aiSuggestion.name,
        description: aiSuggestion.description,
        price: aiSuggestion.price,
        image_url: aiSuggestion.image_url,
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
        quantity: suggestionQty,
        isUpsell: true,
        upsellSource: 'ai',
        parentCartItemId: mainCartId,
        preventCheckoutUpsell: true,
      });
    }

    // Mark as handled even if user declined the suggestion
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
  }, [item, quantity, aiSuggestion, suggestionAdded, suggestionQty, addItemAdvanced, markUpsellHandled, tenant.id, lang, onClose]);

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
            onClick={onClose}
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
              onClick={onClose}
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
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover"
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
                      <Plus size={16} style={{ color: 'var(--menu-accent-contrast)' }} />
                    </button>
                  </div>
                </div>

                {/* ─── AI SUGGESTION SECTION ─── */}
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
                        <Sparkles size={16} style={{ color: theme.primary_color }} />
                      </motion.div>
                      <span className="text-xs" style={{ color: `${theme.text_color}70` }}>
                        {lang === 'es' ? 'Buscando el complemento perfecto...' : 'Finding the perfect match...'}
                      </span>
                    </motion.div>
                  )}

                  {!aiLoading && aiSuggestion && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl overflow-hidden"
                      style={{
                        backgroundColor: `${theme.primary_color}06`,
                        border: `1px solid ${theme.primary_color}18`,
                      }}
                    >
                      {/* Header */}
                      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                        <Sparkles size={14} style={{ color: theme.primary_color }} />
                        <span
                          className="text-xs font-semibold uppercase tracking-wider"
                          style={{ color: theme.primary_color }}
                        >
                          {lang === 'es' ? 'Recomendado para ti' : 'Recommended for you'}
                        </span>
                      </div>

                      {/* Suggestion card */}
                      <div className="px-4 pb-4 flex gap-3">
                        {aiSuggestion.image_url ? (
                          <img
                            src={aiSuggestion.image_url}
                            alt={aiSuggestion.name}
                            className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className="w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center text-2xl opacity-30"
                            style={{ backgroundColor: `${theme.primary_color}10` }}
                          >
                            🍽️
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-semibold truncate"
                            style={{ color: theme.text_color }}
                          >
                            {aiSuggestion.name}
                          </p>
                          {aiSuggestion.pitch && (
                            <p
                              className="text-xs italic leading-snug mt-0.5 line-clamp-2"
                              style={{ color: `${theme.text_color}60` }}
                            >
                              "{aiSuggestion.pitch}"
                            </p>
                          )}
                          <p
                            className="text-sm font-bold mt-1"
                            style={{ color: theme.primary_color }}
                          >
                            {formatPrice(aiSuggestion.price)}
                          </p>

                          {/* Suggestion quantity + add button */}
                          <div className="flex items-center gap-2 mt-2">
                            {!suggestionAdded ? (
                              <>
                                {/* Qty selector for suggestion */}
                                <div
                                  className="flex items-center gap-2 px-2 py-1 rounded-full"
                                  style={{ backgroundColor: `${theme.text_color}06` }}
                                >
                                  <button
                                    onClick={() => setSuggestionQty(q => Math.max(1, q - 1))}
                                    className="w-6 h-6 rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: `${theme.text_color}10` }}
                                  >
                                    <Minus size={12} style={{ color: theme.text_color }} />
                                  </button>
                                  <span
                                    className="text-sm font-bold w-4 text-center"
                                    style={{ color: theme.text_color }}
                                  >
                                    {suggestionQty}
                                  </span>
                                  <button
                                    onClick={() => setSuggestionQty(q => q + 1)}
                                    className="w-6 h-6 rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: theme.primary_color }}
                                  >
                                    <Plus size={12} style={{ color: 'var(--menu-accent-contrast)' }} />
                                  </button>
                                </div>

                                {/* Add button */}
                                <motion.button
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => setSuggestionAdded(true)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                                  style={{
                                    backgroundColor: theme.primary_color,
                                    color: 'var(--menu-accent-contrast)',
                                  }}
                                >
                                  <Plus size={12} />
                                  {lang === 'es' ? 'Agregar' : 'Add'}
                                </motion.button>
                              </>
                            ) : (
                              <motion.div
                                initial={{ scale: 0.8 }}
                                animate={{ scale: 1 }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                                style={{ backgroundColor: '#38A16920', color: '#38A169' }}
                              >
                                <Check size={12} />
                                {lang === 'es'
                                  ? `${suggestionQty}× agregado`
                                  : `${suggestionQty}× added`}
                              </motion.div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            {/* Sticky bottom CTA */}
            <div
              className="px-5 py-4 pb-8 border-t flex-shrink-0"
              style={{ borderColor: `${theme.text_color}10` }}
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAddToCart}
                disabled={mainAdded}
                className="w-full py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-all"
                style={{
                  backgroundColor: mainAdded ? '#38A169' : theme.primary_color,
                  color: mainAdded ? '#fff' : 'var(--menu-accent-contrast)',
                  boxShadow: mainAdded ? 'none' : `0 4px 20px ${theme.primary_color}40`,
                }}
              >
                {mainAdded ? (
                  <>
                    <Check size={20} />
                    {lang === 'es' ? '¡Agregado!' : 'Added!'}
                  </>
                ) : (
                  <>
                    <ShoppingBag size={20} />
                    {lang === 'es' ? 'Agregar al carrito' : 'Add to cart'}
                    <span className="ml-1 opacity-80">
                      — {formatPrice(
                        item.price * quantity +
                        (suggestionAdded && aiSuggestion ? aiSuggestion.price * suggestionQty : 0)
                      )}
                    </span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
