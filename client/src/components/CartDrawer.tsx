/*
 * CartDrawer v7: AI Upsell + Static Fallback Integration.
 * Flow: 1. Cart  2. Customer info  3. [AI Upsell Modal OR Static Fallback]  4. Select payment  5. SINPE details  6. Confirmation
 * AI: Calls /api/generate-upsell (GPT-4o-mini). On failure → shows static UpsellModal as fallback.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, MessageCircle, Copy, Check, Loader2, Camera, ArrowLeft, ShoppingBag, Banknote, CreditCard, Smartphone, AlertCircle } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import AIUpsellModal, { type AISuggestedItem } from './AIUpsellModal';
import UpsellModal from './UpsellModal';
import type { ThemeSettings, Tenant, MenuItem } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/lib/supabase';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
  /** All menu items — used to find static upsell fallback candidates */
  allMenuItems?: MenuItem[];
}

type PaymentMethod = 'sinpe' | 'efectivo' | 'tarjeta';
type Step = 'cart' | 'customer_info' | 'select_payment' | 'payment' | 'confirmation';

export default function CartDrawer({ isOpen, onClose, theme, tenant, allMenuItems = [] }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();
  const { t, lang } = useI18n();
  const [sinpeCopied, setSinpeCopied] = useState(false);
  const [step, setStep] = useState<Step>('cart');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerTable, setCustomerTable] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // AI Upsell state
  const [showAIUpsell, setShowAIUpsell] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestedItems, setAiSuggestedItems] = useState<AISuggestedItem[]>([]);
  // pitchMessage removed — each suggested item now carries its own pitch

  // Static Upsell Fallback state (shown when AI fails)
  const [showStaticUpsell, setShowStaticUpsell] = useState(false);
  const [staticUpsellItem, setStaticUpsellItem] = useState<MenuItem | null>(null);
  const [staticUpsellText, setStaticUpsellText] = useState<string | null>(null);

  const handleCopySinpe = useCallback(() => {
    if (tenant.sinpe_number) {
      navigator.clipboard.writeText(tenant.sinpe_number.replace(/-/g, '')).catch(() => {});
      setSinpeCopied(true);
      setTimeout(() => setSinpeCopied(false), 2000);
    }
  }, [tenant.sinpe_number]);

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Helper: find the best static upsell candidate from cart items
  const getStaticUpsellCandidate = useCallback((allMenuItems: MenuItem[]): { item: MenuItem; text: string | null } | null => {
    for (const ci of items) {
      if (ci.menuItem.upsell_item_id) {
        const target = allMenuItems.find(m => m.id === ci.menuItem.upsell_item_id);
        if (target && target.is_available) {
          return { item: target, text: ci.menuItem.upsell_text || null };
        }
      }
    }
    return null;
  }, [items]);

  // AI Upsell: Call /api/generate-upsell → on failure show static fallback
  const handleProceedToPayment = useCallback(async (allMenuItems?: MenuItem[]) => {
    // Show modal immediately with loading state
    setShowAIUpsell(true);
    setAiLoading(true);
    setAiSuggestedItems([]);

    const goToStaticFallback = () => {
      setShowAIUpsell(false);
      setAiLoading(false);
      // Try to show static upsell if any cart item has upsell_item_id
      const candidate = allMenuItems ? getStaticUpsellCandidate(allMenuItems) : null;
      if (candidate) {
        console.log('[AI Upsell] Showing static fallback for:', candidate.item.name);
        setStaticUpsellItem(candidate.item);
        setStaticUpsellText(candidate.text);
        setShowStaticUpsell(true);
      } else {
        console.log('[AI Upsell] No static fallback available, going to payment');
        setStep('select_payment');
      }
    };

    try {
      // Send only the fields the API actually needs (no dietary_tags — column doesn't exist)
      const cartPayload = items.map(ci => ({
        id: ci.menuItem.id,
        name: ci.menuItem.name,
        price: ci.menuItem.price,
      }));

      console.log('%c[AI Upsell] ► Calling /api/generate-upsell', 'color: #6C63FF; font-weight: bold;', {
        cart: cartPayload.map(i => i.name),
        tenant_id: tenant.id,
        restaurant_name: tenant.name,
      });

      const response = await fetch('/api/generate-upsell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: cartPayload,
          tenant_id: tenant.id,
          restaurant_name: tenant.name,
        }),
        signal: AbortSignal.timeout(10000),
      });

      console.log('%c[AI Upsell] HTTP Status:', 'color: #6C63FF;', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('%c[AI Upsell] Response:', 'color: #10B981; font-weight: bold;', data);

        if (!data.fallback && data.suggested_items?.length > 0) {
          // v2: each item now carries trigger_item_name + pitch
          setAiSuggestedItems(data.suggested_items as AISuggestedItem[]);
          // Keep AI modal open to show suggestions
        } else {
          // AI returned fallback (no API key, Supabase error, etc.)
          const reason = data.reason || 'no_suggestions';
          console.warn('%c[AI Upsell] Fallback triggered. Reason:', 'color: #F59E0B; font-weight: bold;', reason);
          toast.warning(`[DEBUG] AI Upsell fallback: ${reason}`, { duration: 6000 });
          goToStaticFallback();
          return;
        }
      } else {
        const errText = await response.text().catch(() => 'unknown');
        console.error('%c[AI Upsell] ✖ API Error:', 'color: #EF4444; font-weight: bold;', response.status, errText);
        toast.error(`[DEBUG] AI Upsell API ${response.status}: ${errText.slice(0, 80)}`, { duration: 8000 });
        goToStaticFallback();
        return;
      }
    } catch (err: any) {
      // Network error, timeout, CORS, etc.
      const errMsg = err?.message || String(err);
      console.error('%c[AI Upsell] ✖ Fetch Error:', 'color: #EF4444; font-weight: bold;', errMsg, err);
      toast.error(`[DEBUG] AI Upsell error: ${errMsg}`, { duration: 8000 });
      goToStaticFallback();
      return;
    } finally {
      setAiLoading(false);
    }
  }, [items, tenant, getStaticUpsellCandidate]);

  const handleAIUpsellContinue = () => {
    setShowAIUpsell(false);
    setStep('select_payment');
  };

  const handleAIUpsellClose = () => {
    setShowAIUpsell(false);
    setStep('select_payment');
  };

  // BUG 1 FIX: Selecting a method only updates state + gives visual feedback.
  // For SINPE → go to payment step. For efectivo/tarjeta → stay on select_payment with confirm button.
  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setErrorMsg('');
    if (method === 'sinpe') {
      setStep('payment');
    }
    // efectivo/tarjeta: stay on select_payment, show confirm button
  };

  // BUG 2 FIX: Full try/catch, setUploading(false) in finally, error toast on failure.
  const handleSubmitOrderWithMethod = async (method: PaymentMethod) => {
    if (!customerName.trim()) return;
    setUploading(true);
    setErrorMsg('');

    try {
      let receiptUrl = '';

      if (receiptFile && method === 'sinpe') {
        const ext = receiptFile.name.split('.').pop() || 'jpg';
        const fileName = `${tenant.slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, receiptFile, { cacheControl: '3600', upsert: false });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
          receiptUrl = urlData.publicUrl;
        }
      }

      // Include isUpsell + upsell_source flags in order items for analytics tracking
      const orderItems = items.map(i => ({
        id: i.menuItem.id,
        name: i.menuItem.name,
        price: i.menuItem.price,
        quantity: i.quantity,
        isUpsell: i.isUpsell || false,
        upsell_source: i.upsell_source || null, // 'ai' | 'static' | null
      }));

      // Calculate total upsell revenue (AI + static combined)
      const upsellRevenue = items
        .filter(i => i.isUpsell)
        .reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);

      // Calculate AI-specific upsell revenue for granular analytics
      const aiUpsellRevenue = items
        .filter(i => i.upsell_source === 'ai')
        .reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);

      const statusMap: Record<PaymentMethod, string> = {
        sinpe: receiptUrl ? 'pago_en_revision' : 'pendiente',
        efectivo: 'pendiente',
        tarjeta: 'pendiente',
      };

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenant.id,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_table: customerTable.trim(),
          items: orderItems,
          subtotal: totalPrice,
          total: totalPrice,
          status: statusMap[method],
          payment_method: method,
          sinpe_receipt_url: method === 'sinpe' ? receiptUrl : null,
          notes: notes.trim(),
          upsell_revenue: upsellRevenue,
          ai_upsell_revenue: aiUpsellRevenue,
          upsell_accepted: upsellRevenue > 0,
        })
        .select('id, order_number')
        .single();

      if (orderError) {
        console.error('Order error:', orderError);
        setErrorMsg(
          lang === 'es'
            ? `Error al procesar el pedido: ${orderError.message}`
            : `Error processing order: ${orderError.message}`
        );
        return;
      }

      if (orderData) {
        setOrderNumber(orderData.order_number);
        setOrderId(orderData.id);
        setStep('confirmation');
      }
    } catch (err: unknown) {
      console.error('Unexpected error:', err);
      setErrorMsg(
        lang === 'es'
          ? 'Ocurrió un error inesperado. Por favor intenta de nuevo.'
          : 'An unexpected error occurred. Please try again.'
      );
    } finally {
      // BUG 2 FIX: Always reset loading state, even on error
      setUploading(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!paymentMethod) return;
    await handleSubmitOrderWithMethod(paymentMethod);
  };

  const paymentMethodLabel = (method: PaymentMethod | null): string => {
    if (!method) return '';
    const labels: Record<PaymentMethod, Record<string, string>> = {
      sinpe: { es: 'SINPE Móvil', en: 'SINPE Mobile' },
      efectivo: { es: 'Efectivo', en: 'Cash' },
      tarjeta: { es: 'Tarjeta', en: 'Card' },
    };
    return labels[method]?.[lang] || labels[method]?.es || '';
  };

  const handleWhatsApp = useCallback(() => {
    if (items.length === 0) return;

    let message = `🛒 *${t('confirm.order_number')} #${orderNumber || '---'} — ${tenant.name}*\n\n`;
    if (customerName) message += `👤 ${t('checkout.name')}: ${customerName}\n`;
    if (customerPhone) message += `📱 ${t('checkout.phone')}: ${customerPhone}\n`;
    if (customerTable) message += `🪑 ${t('checkout.table')}: ${customerTable}\n`;
    message += `\n`;

    items.forEach(item => {
      message += `• ${item.quantity}x ${item.menuItem.name} — ${formatPrice(item.menuItem.price * item.quantity)}\n`;
    });
    message += `\n💰 *${t('cart.total')}: ${formatPrice(totalPrice)}*\n`;
    message += `💳 ${paymentMethodLabel(paymentMethod)}`;
    if (notes) message += `\n📝 ${lang === 'es' ? 'Notas' : 'Notes'}: ${notes}`;
    if (paymentMethod === 'sinpe') {
      const receiptLabel = lang === 'es'
        ? (receiptFile ? 'adjunto' : 'pendiente')
        : (receiptFile ? 'attached' : 'pending');
      message += `\n\n✅ ${lang === 'es' ? 'Comprobante' : 'Receipt'} ${receiptLabel}.`;
    }

    const phone = tenant.whatsapp_number?.replace(/[^0-9]/g, '') || '';
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }, [items, tenant, totalPrice, orderNumber, customerName, customerPhone, customerTable, notes, receiptFile, t, lang, paymentMethod]);

  const handleFinish = () => {
    clearCart();
    setStep('cart');
    setPaymentMethod(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerTable('');
    setNotes('');
    setReceiptFile(null);
    setReceiptPreview('');
    setOrderNumber(null);
    setOrderId(null);
    setErrorMsg('');
    onClose();
  };

  const canProceedToPayment = customerName.trim().length > 0;

  const handleBack = () => {
    setErrorMsg('');
    if (step === 'customer_info') setStep('cart');
    else if (step === 'select_payment') { setStep('customer_info'); setPaymentMethod(null); }
    else if (step === 'payment') setStep('select_payment');
  };

  // Step titles
  const stepTitles: Record<Step, string> = {
    cart: t('cart.title'),
    customer_info: t('checkout.customer_info'),
    select_payment: lang === 'es' ? '¿Cómo deseas pagar?' : 'How would you like to pay?',
    payment: t('payment.title'),
    confirmation: t('confirm.title'),
  };

  const stepOrder: Step[] = ['customer_info', 'select_payment', 'payment', 'confirmation'];
  const currentStepIdx = stepOrder.indexOf(step);

  // Payment method config
  const paymentOptions: { method: PaymentMethod; icon: React.ReactNode; label: string; desc: string; color: string; bg: string }[] = [
    {
      method: 'sinpe',
      icon: <Smartphone size={28} style={{ color: '#6C63FF' }} />,
      label: 'SINPE Móvil',
      desc: lang === 'es' ? 'Pago instantáneo desde tu celular' : 'Instant payment from your phone',
      color: '#6C63FF',
      bg: '#6C63FF15',
    },
    {
      method: 'efectivo',
      icon: <Banknote size={28} style={{ color: '#38A169' }} />,
      label: lang === 'es' ? 'Efectivo' : 'Cash',
      desc: lang === 'es' ? 'Paga al recibir tu pedido' : 'Pay when you receive your order',
      color: '#38A169',
      bg: '#38A16915',
    },
    {
      method: 'tarjeta',
      icon: <CreditCard size={28} style={{ color: '#E53935' }} />,
      label: lang === 'es' ? 'Tarjeta' : 'Card',
      desc: lang === 'es' ? 'Débito o crédito al entregar' : 'Debit or credit on delivery',
      color: '#E53935',
      bg: '#E5393515',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl max-h-[92vh] flex flex-col"
            style={{ backgroundColor: theme.background_color }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: `${theme.text_color}10` }}>
              <div className="flex items-center gap-3">
                {step !== 'cart' && step !== 'confirmation' && (
                  <button
                    onClick={handleBack}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                    style={{ backgroundColor: `${theme.text_color}08` }}
                  >
                    <ArrowLeft size={16} style={{ color: theme.text_color }} />
                  </button>
                )}
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                >
                  {stepTitles[step]}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {step === 'cart' && items.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs px-3 py-1.5 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: theme.text_color, border: `1px solid ${theme.text_color}20` }}
                  >
                    {lang === 'es' ? 'Vaciar' : 'Clear'}
                  </button>
                )}
                <button
                  onClick={step === 'confirmation' ? handleFinish : onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                  style={{ backgroundColor: `${theme.text_color}08` }}
                >
                  <X size={16} style={{ color: theme.text_color }} />
                </button>
              </div>
            </div>

            {/* Step indicator */}
            {step !== 'cart' && (
              <div className="flex items-center gap-1.5 px-5 py-3">
                {stepOrder.map((s, idx) => {
                  const isActive = idx === currentStepIdx;
                  const isDone = idx < currentStepIdx;
                  // Skip 'payment' step indicator if not SINPE
                  if (s === 'payment' && paymentMethod !== 'sinpe' && !isActive) return null;
                  return (
                    <div
                      key={s}
                      className="h-1.5 rounded-full flex-1 transition-all"
                      style={{
                        backgroundColor: isDone || isActive ? theme.primary_color : `${theme.text_color}15`,
                        opacity: isActive ? 1 : isDone ? 0.6 : 0.3,
                      }}
                    />
                  );
                })}
              </div>
            )}

            {/* ─── STEP: CART ─── */}
            {step === 'cart' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                      <ShoppingBag size={48} style={{ color: `${theme.text_color}30` }} />
                      <p className="text-center opacity-40" style={{ color: theme.text_color }}>
                        {t('cart.empty')}
                      </p>
                    </div>
                  ) : (
                    items.map(ci => (
                      <motion.div
                        key={ci.menuItem.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex items-center gap-3 rounded-2xl p-3"
                        style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}08` }}
                      >
                        {ci.menuItem.image_url && (
                          <img
                            src={ci.menuItem.image_url}
                            alt={ci.menuItem.name}
                            className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: theme.text_color }}>
                            {ci.menuItem.name}
                          </p>
                          {ci.isUpsell && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${theme.primary_color}20`, color: theme.primary_color }}>
                              ✨ {lang === 'es' ? 'Sugerido' : 'Suggested'}
                            </span>
                          )}
                          <p className="text-sm font-bold mt-0.5" style={{ color: theme.primary_color }}>
                            {formatPrice(ci.menuItem.price * ci.quantity)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(ci.menuItem.id, ci.quantity - 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                            style={{ backgroundColor: `${theme.text_color}08` }}
                          >
                            {ci.quantity === 1 ? (
                              <Trash2 size={13} style={{ color: '#ef4444' }} />
                            ) : (
                              <Minus size={13} style={{ color: theme.text_color }} />
                            )}
                          </button>
                          <span className="text-sm font-bold w-5 text-center" style={{ color: theme.text_color }}>
                            {ci.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(ci.menuItem.id, ci.quantity + 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                            style={{ backgroundColor: theme.primary_color }}
                          >
                            <Plus size={13} className="text-white" />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                {items.length > 0 && (
                  <div className="p-5 border-t space-y-3" style={{ borderColor: `${theme.text_color}10` }}>
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold" style={{ color: theme.text_color }}>
                        {t('cart.total')}
                      </span>
                      <span className="text-xl font-bold" style={{ color: theme.primary_color }}>
                        {formatPrice(totalPrice)}
                      </span>
                    </div>
                    <motion.button
                      onClick={() => setStep('customer_info')}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 text-white transition-all"
                      style={{
                        backgroundColor: theme.primary_color,
                        boxShadow: `0 4px 16px ${theme.primary_color}40`,
                      }}
                    >
                      <ShoppingBag size={20} />
                      {t('cart.checkout')}
                    </motion.button>
                  </div>
                )}
              </>
            )}

            {/* ─── STEP: CUSTOMER INFO ─── */}
            {step === 'customer_info' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                        {t('checkout.name')} *
                      </label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        placeholder={lang === 'es' ? 'Tu nombre completo' : 'Your full name'}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                        style={{
                          backgroundColor: `${theme.text_color}06`,
                          border: `1.5px solid ${customerName ? theme.primary_color : `${theme.text_color}15`}`,
                          color: theme.text_color,
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                        {t('checkout.phone')}
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                        placeholder="8888-8888"
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                        style={{
                          backgroundColor: `${theme.text_color}06`,
                          border: `1.5px solid ${theme.text_color}15`,
                          color: theme.text_color,
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                        {t('checkout.table')}
                      </label>
                      <input
                        type="text"
                        value={customerTable}
                        onChange={e => setCustomerTable(e.target.value)}
                        placeholder={lang === 'es' ? 'Ej: Mesa 5, Barra, Para llevar' : 'E.g.: Table 5, Bar, Takeout'}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                        style={{
                          backgroundColor: `${theme.text_color}06`,
                          border: `1.5px solid ${theme.text_color}15`,
                          color: theme.text_color,
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                        {t('checkout.notes')}
                      </label>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder={lang === 'es' ? 'Alergias, preferencias, instrucciones especiales...' : 'Allergies, preferences, special instructions...'}
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
                        style={{
                          backgroundColor: `${theme.text_color}06`,
                          border: `1.5px solid ${theme.text_color}15`,
                          color: theme.text_color,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                  <motion.button
                    onClick={() => handleProceedToPayment(allMenuItems)}
                    disabled={!canProceedToPayment}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: theme.primary_color,
                      boxShadow: canProceedToPayment ? `0 4px 16px ${theme.primary_color}40` : 'none',
                    }}
                  >
                    {lang === 'es' ? 'Continuar al pago' : 'Continue to payment'}
                  </motion.button>
                </div>
              </>
            )}

            {/* ─── STEP: SELECT PAYMENT METHOD ─── */}
            {step === 'select_payment' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Order total summary */}
                  <div
                    className="rounded-2xl p-4 flex items-center justify-between"
                    style={{ backgroundColor: `${theme.primary_color}08`, border: `1px solid ${theme.primary_color}15` }}
                  >
                    <span className="text-sm font-semibold" style={{ color: theme.text_color }}>
                      {t('cart.total')}
                    </span>
                    <span className="text-2xl font-bold" style={{ color: theme.primary_color }}>
                      {formatPrice(totalPrice)}
                    </span>
                  </div>

                  <p className="text-sm text-center opacity-60" style={{ color: theme.text_color }}>
                    {lang === 'es' ? 'Selecciona tu método de pago' : 'Select your payment method'}
                  </p>

                  {/* BUG 1 FIX: Payment method buttons with visual selection state */}
                  <div className="space-y-3">
                    {paymentOptions.map(opt => {
                      const isSelected = paymentMethod === opt.method;
                      return (
                        <motion.button
                          key={opt.method}
                          onClick={() => handleSelectPaymentMethod(opt.method)}
                          whileTap={{ scale: 0.97 }}
                          disabled={uploading}
                          className="w-full p-5 rounded-2xl flex items-center gap-4 transition-all"
                          style={{
                            backgroundColor: isSelected ? `${opt.color}18` : `${theme.primary_color}06`,
                            border: `2px solid ${isSelected ? opt.color : `${theme.primary_color}20`}`,
                            boxShadow: isSelected ? `0 0 0 1px ${opt.color}30` : 'none',
                          }}
                        >
                          <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: opt.bg }}
                          >
                            {opt.icon}
                          </div>
                          <div className="text-left flex-1">
                            <p className="text-base font-bold" style={{ color: isSelected ? opt.color : theme.text_color }}>
                              {opt.label}
                            </p>
                            <p className="text-xs opacity-60 mt-0.5" style={{ color: theme.text_color }}>
                              {opt.desc}
                            </p>
                          </div>
                          {/* Checkmark when selected */}
                          {isSelected && (
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: opt.color }}
                            >
                              <Check size={14} className="text-white" />
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Error message */}
                  {errorMsg && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{errorMsg}</p>
                    </div>
                  )}
                </div>

                {/* BUG 1 FIX: Confirm button only shown when efectivo/tarjeta is selected */}
                {paymentMethod && paymentMethod !== 'sinpe' && (
                  <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                    <motion.button
                      onClick={handleSubmitOrder}
                      disabled={uploading}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      style={{
                        backgroundColor: theme.primary_color,
                        color: '#fff',
                        boxShadow: `0 4px 16px ${theme.primary_color}40`,
                      }}
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          {t('payment.processing')}
                        </>
                      ) : (
                        <>
                          <ShoppingBag size={20} />
                          {lang === 'es'
                            ? `Confirmar pedido — ${paymentMethod === 'efectivo' ? 'Efectivo' : 'Tarjeta'}`
                            : `Confirm order — ${paymentMethod === 'efectivo' ? 'Cash' : 'Card'}`}
                        </>
                      )}
                    </motion.button>
                  </div>
                )}
              </>
            )}

            {/* ─── STEP: PAYMENT (SINPE details) ─── */}
            {step === 'payment' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Order summary */}
                  <div className="rounded-2xl p-4" style={{ backgroundColor: `${theme.primary_color}06`, border: `1px solid ${theme.primary_color}12` }}>
                    {items.map(ci => (
                      <div key={ci.menuItem.id} className="flex justify-between text-sm py-1" style={{ color: theme.text_color }}>
                        <span className="opacity-70">{ci.quantity}x {ci.menuItem.name}</span>
                        <span className="font-semibold">{formatPrice(ci.menuItem.price * ci.quantity)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-3 mt-3 border-t text-lg font-bold" style={{ borderColor: `${theme.text_color}10`, color: theme.primary_color }}>
                      <span>{t('cart.total')}</span>
                      <span>{formatPrice(totalPrice)}</span>
                    </div>
                  </div>

                  {/* SINPE Info */}
                  {tenant.sinpe_number && (
                    <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}10` }}>
                      <h3 className="text-sm font-bold" style={{ color: theme.text_color }}>
                        💳 {t('payment.send_to')}
                      </h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-2xl font-bold tracking-wide" style={{ color: theme.primary_color }}>
                            {tenant.sinpe_number}
                          </p>
                          {tenant.sinpe_owner && (
                            <p className="text-xs opacity-60 mt-1" style={{ color: theme.text_color }}>
                              {t('payment.owner')} {tenant.sinpe_owner}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={handleCopySinpe}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                          style={{
                            backgroundColor: sinpeCopied ? '#38A16920' : `${theme.primary_color}12`,
                            color: sinpeCopied ? '#38A169' : theme.primary_color,
                          }}
                        >
                          {sinpeCopied ? <Check size={14} /> : <Copy size={14} />}
                          {sinpeCopied ? t('payment.copied') : t('payment.copy')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Receipt upload */}
                  <div className="rounded-2xl p-4" style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}10` }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: theme.text_color }}>
                      📸 {t('payment.receipt')}
                    </h3>
                    <p className="text-xs opacity-60 mb-3" style={{ color: theme.text_color }}>
                      {t('payment.receipt_desc')}
                    </p>

                    {receiptPreview ? (
                      <div className="relative">
                        <img src={receiptPreview} alt="Comprobante" className="w-full h-40 object-cover rounded-xl" />
                        <button
                          onClick={() => { setReceiptFile(null); setReceiptPreview(''); }}
                          className="absolute top-2 right-2 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center"
                        >
                          <X size={14} className="text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => receiptInputRef.current?.click()}
                        className="w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all hover:opacity-80"
                        style={{ borderColor: `${theme.primary_color}30`, color: theme.primary_color }}
                      >
                        <Camera size={24} />
                        <span className="text-sm font-medium">{t('payment.take_photo')}</span>
                      </button>
                    )}
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptSelect}
                      className="hidden"
                    />
                  </div>

                  {/* Error message */}
                  {errorMsg && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                      <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{errorMsg}</p>
                    </div>
                  )}
                </div>

                <div className="p-5 border-t space-y-3" style={{ borderColor: `${theme.text_color}10` }}>
                  <motion.button
                    onClick={handleSubmitOrder}
                    disabled={uploading}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                    style={{
                      backgroundColor: '#25D366',
                      color: '#fff',
                      boxShadow: '0 4px 16px rgba(37, 211, 102, 0.3)',
                    }}
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        {t('payment.processing')}
                      </>
                    ) : (
                      <>
                        <ShoppingBag size={20} />
                        {t('payment.confirm')}
                      </>
                    )}
                  </motion.button>
                </div>
              </>
            )}

            {/* ─── STEP: CONFIRMATION ─── */}
            {step === 'confirmation' && (
              <>
                <div className="flex-1 overflow-y-auto p-5">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center py-6"
                  >
                    <div className="text-6xl mb-4">🎉</div>
                    <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "'Lora', serif", color: theme.text_color }}>
                      {t('confirm.order_number')} #{orderNumber}
                    </h3>
                    <p className="text-sm opacity-60 mb-6" style={{ color: theme.text_color }}>
                      {lang === 'es' ? 'Tu pedido fue registrado exitosamente' : 'Your order was registered successfully'}
                    </p>

                    {/* Order summary */}
                    <div className="rounded-2xl p-4 text-left mb-4" style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}10` }}>
                      {items.map(ci => (
                        <div key={ci.menuItem.id} className="flex justify-between text-sm py-1" style={{ color: theme.text_color }}>
                          <span className="opacity-70">{ci.quantity}x {ci.menuItem.name}</span>
                          <span className="font-semibold">{formatPrice(ci.menuItem.price * ci.quantity)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 mt-3 border-t font-bold" style={{ borderColor: `${theme.text_color}10`, color: theme.primary_color }}>
                        <span>{t('cart.total')}</span>
                        <span>{formatPrice(totalPrice)}</span>
                      </div>
                      {paymentMethod && (
                        <div className="flex justify-between pt-2 text-sm" style={{ color: `${theme.text_color}70` }}>
                          <span>{lang === 'es' ? 'Método de pago' : 'Payment method'}</span>
                          <span className="font-semibold">{paymentMethodLabel(paymentMethod)}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>

                <div className="p-5 border-t space-y-3" style={{ borderColor: `${theme.text_color}10` }}>
                  {tenant.whatsapp_number && (
                    <motion.button
                      onClick={handleWhatsApp}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 text-white transition-all"
                      style={{
                        backgroundColor: '#25D366',
                        boxShadow: '0 4px 16px rgba(37, 211, 102, 0.3)',
                      }}
                    >
                      <MessageCircle size={20} />
                      {t('confirm.whatsapp')}
                    </motion.button>
                  )}
                  <motion.button
                    onClick={handleFinish}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3 rounded-2xl font-semibold text-sm transition-all"
                    style={{
                      backgroundColor: `${theme.text_color}08`,
                      color: theme.text_color,
                    }}
                  >
                    {t('confirm.close')}
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}

      {/* ─── AI UPSELL MODAL (rendered outside the main drawer z-stack) ─── */}
      <AIUpsellModal
        isOpen={showAIUpsell}
        onClose={handleAIUpsellClose}
        onContinue={handleAIUpsellContinue}
        suggestedItems={aiSuggestedItems}
        isLoading={aiLoading}
        theme={theme}
      />

      {/* ─── STATIC UPSELL MODAL (fallback when AI fails) ─── */}
      <UpsellModal
        isOpen={showStaticUpsell}
        onClose={() => {
          setShowStaticUpsell(false);
          setStaticUpsellItem(null);
          setStaticUpsellText(null);
          setStep('select_payment');
        }}
        upsellItem={staticUpsellItem}
        upsellText={staticUpsellText}
        theme={theme}
      />
    </AnimatePresence>
  );
}
