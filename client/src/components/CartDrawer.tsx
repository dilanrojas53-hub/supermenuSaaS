/*
 * CartDrawer v4: Full checkout flow + i18n ES/EN + Payment Method Selection + Upsell Tracking.
 * 1. Cart summary  2. Customer info  3. Payment method selection  4. SINPE details (if SINPE)  5. Confirmation + WhatsApp
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, MessageCircle, Copy, Check, Loader2, Camera, ArrowLeft, ShoppingBag, Banknote, CreditCard, Smartphone } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import type { ThemeSettings, Tenant } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/lib/supabase';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
}

type PaymentMethod = 'sinpe' | 'efectivo' | 'tarjeta';
type Step = 'cart' | 'customer_info' | 'select_payment' | 'payment' | 'confirmation';

export default function CartDrawer({ isOpen, onClose, theme, tenant }: CartDrawerProps) {
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
  const receiptInputRef = useRef<HTMLInputElement>(null);

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

  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    if (method === 'sinpe') {
      setStep('payment'); // Go to SINPE details step
    } else {
      // For efectivo/tarjeta, submit order directly
      handleSubmitOrderWithMethod(method);
    }
  };

  const handleSubmitOrderWithMethod = async (method: PaymentMethod) => {
    if (!customerName.trim()) return;
    setUploading(true);

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

    // BUG 2 FIX: Include isUpsell flag in order items for analytics tracking
    const orderItems = items.map(i => ({
      id: i.menuItem.id,
      name: i.menuItem.name,
      price: i.menuItem.price,
      quantity: i.quantity,
      isUpsell: i.isUpsell || false,
    }));

    // Calculate upsell revenue for the order
    const upsellRevenue = items
      .filter(i => i.isUpsell)
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
        upsell_accepted: upsellRevenue > 0,
      })
      .select('id, order_number')
      .single();

    setUploading(false);

    if (orderError) {
      console.error('Order error:', orderError);
      return;
    }

    if (orderData) {
      setOrderNumber(orderData.order_number);
      setOrderId(orderData.id);
      setStep('confirmation');
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
    onClose();
  };

  const canProceedToPayment = customerName.trim().length > 0;

  const handleBack = () => {
    if (step === 'customer_info') setStep('cart');
    else if (step === 'select_payment') setStep('customer_info');
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

  // Step indicator steps (4 steps now)
  const stepOrder: Step[] = ['customer_info', 'select_payment', 'payment', 'confirmation'];
  const currentStepIdx = stepOrder.indexOf(step);

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
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${theme.text_color}08` }}
                >
                  <X size={18} style={{ color: theme.text_color }} />
                </button>
              </div>
            </div>

            {/* Step indicator */}
            {step !== 'cart' && (
              <div className="flex items-center gap-1 px-5 pt-3">
                {stepOrder.map((s, i) => (
                  <div
                    key={s}
                    className="h-1 flex-1 rounded-full transition-all"
                    style={{
                      backgroundColor: currentStepIdx >= i
                        ? theme.primary_color
                        : `${theme.text_color}15`,
                    }}
                  />
                ))}
              </div>
            )}

            {/* ─── STEP: CART ─── */}
            {step === 'cart' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {items.length === 0 ? (
                    <div className="text-center py-12 opacity-50">
                      <p className="text-4xl mb-3">🛒</p>
                      <p className="text-sm" style={{ color: theme.text_color }}>{t('cart.empty')}</p>
                      <p className="text-xs mt-1 opacity-60" style={{ color: theme.text_color }}>
                        {t('cart.empty_desc')}
                      </p>
                    </div>
                  ) : (
                    items.map((cartItem, idx) => (
                      <motion.div
                        key={cartItem.menuItem.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ backgroundColor: `${theme.primary_color}05` }}
                      >
                        {cartItem.menuItem.image_url && (
                          <img
                            src={cartItem.menuItem.image_url}
                            alt={cartItem.menuItem.name}
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-1">
                            <p className="text-sm font-semibold truncate" style={{ color: theme.text_color }}>
                              {cartItem.menuItem.name}
                            </p>
                            {cartItem.isUpsell && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex-shrink-0">
                                IA
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-bold mt-0.5" style={{ color: theme.primary_color }}>
                            {formatPrice(cartItem.menuItem.price * cartItem.quantity)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(cartItem.menuItem.id, cartItem.quantity - 1)}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                            style={{ backgroundColor: `${theme.text_color}08` }}
                          >
                            {cartItem.quantity === 1 ? (
                              <Trash2 size={14} style={{ color: '#ef4444' }} />
                            ) : (
                              <Minus size={14} style={{ color: theme.text_color }} />
                            )}
                          </button>
                          <span className="text-sm font-bold w-5 text-center" style={{ color: theme.text_color }}>
                            {cartItem.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(cartItem.menuItem.id, cartItem.quantity + 1)}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                            style={{ backgroundColor: `${theme.primary_color}15`, color: theme.primary_color }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                {items.length > 0 && (
                  <div className="p-5 border-t space-y-3" style={{ borderColor: `${theme.text_color}10` }}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm opacity-60" style={{ color: theme.text_color }}>
                        {t('cart.subtotal')} ({items.reduce((a, b) => a + b.quantity, 0)} {t('cart.items')})
                      </span>
                      <span className="text-xl font-bold" style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}>
                        {formatPrice(totalPrice)}
                      </span>
                    </div>
                    <motion.button
                      onClick={() => setStep('customer_info')}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
                      style={{
                        backgroundColor: theme.primary_color,
                        color: '#fff',
                        boxShadow: `0 4px 16px ${theme.primary_color}30`,
                      }}
                    >
                      {t('cart.proceed')}
                    </motion.button>
                  </div>
                )}
              </>
            )}

            {/* ─── STEP: CUSTOMER INFO ─── */}
            {step === 'customer_info' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block" style={{ color: theme.text_color }}>
                      {t('checkout.name')} *
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder={t('checkout.name_placeholder')}
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: `${theme.text_color}05`,
                        border: `1.5px solid ${theme.text_color}15`,
                        color: theme.text_color,
                      }}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block" style={{ color: theme.text_color }}>
                      {t('checkout.phone')}
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="8888-0000"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: `${theme.text_color}05`,
                        border: `1.5px solid ${theme.text_color}15`,
                        color: theme.text_color,
                      }}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block" style={{ color: theme.text_color }}>
                      {t('checkout.table')}
                    </label>
                    <input
                      type="text"
                      value={customerTable}
                      onChange={e => setCustomerTable(e.target.value)}
                      placeholder="1, 2, 3..."
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{
                        backgroundColor: `${theme.text_color}05`,
                        border: `1.5px solid ${theme.text_color}15`,
                        color: theme.text_color,
                      }}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block" style={{ color: theme.text_color }}>
                      {t('checkout.notes')}
                    </label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder={t('checkout.notes_placeholder')}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all resize-none"
                      style={{
                        backgroundColor: `${theme.text_color}05`,
                        border: `1.5px solid ${theme.text_color}15`,
                        color: theme.text_color,
                      }}
                    />
                  </div>
                </div>

                <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                  <motion.button
                    onClick={() => setStep('select_payment')}
                    disabled={!canProceedToPayment}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                    style={{
                      backgroundColor: theme.primary_color,
                      color: '#fff',
                      boxShadow: `0 4px 16px ${theme.primary_color}30`,
                    }}
                  >
                    {t('checkout.continue')}
                  </motion.button>
                </div>
              </>
            )}

            {/* ─── STEP: SELECT PAYMENT METHOD (BUG 1 FIX) ─── */}
            {step === 'select_payment' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Order summary mini */}
                  <div className="rounded-2xl p-4" style={{ backgroundColor: `${theme.primary_color}06`, border: `1px solid ${theme.primary_color}12` }}>
                    <div className="flex justify-between items-center">
                      <span className="text-sm opacity-70" style={{ color: theme.text_color }}>
                        {lang === 'es' ? 'Total a pagar' : 'Total to pay'}
                      </span>
                      <span className="text-2xl font-bold" style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}>
                        {formatPrice(totalPrice)}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-center opacity-60" style={{ color: theme.text_color }}>
                    {lang === 'es' ? 'Selecciona tu método de pago' : 'Select your payment method'}
                  </p>

                  {/* Payment method buttons */}
                  <div className="space-y-3">
                    {/* SINPE Móvil */}
                    <motion.button
                      onClick={() => handleSelectPaymentMethod('sinpe')}
                      whileTap={{ scale: 0.97 }}
                      disabled={uploading}
                      className="w-full p-5 rounded-2xl flex items-center gap-4 transition-all active:scale-[0.98]"
                      style={{
                        backgroundColor: `${theme.primary_color}08`,
                        border: `2px solid ${theme.primary_color}25`,
                      }}
                    >
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: '#6C63FF15' }}
                      >
                        <Smartphone size={28} style={{ color: '#6C63FF' }} />
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-base font-bold" style={{ color: theme.text_color }}>SINPE Móvil</p>
                        <p className="text-xs opacity-60 mt-0.5" style={{ color: theme.text_color }}>
                          {lang === 'es' ? 'Pago instantáneo desde tu celular' : 'Instant payment from your phone'}
                        </p>
                      </div>
                    </motion.button>

                    {/* Efectivo */}
                    <motion.button
                      onClick={() => handleSelectPaymentMethod('efectivo')}
                      whileTap={{ scale: 0.97 }}
                      disabled={uploading}
                      className="w-full p-5 rounded-2xl flex items-center gap-4 transition-all active:scale-[0.98]"
                      style={{
                        backgroundColor: `${theme.primary_color}08`,
                        border: `2px solid ${theme.primary_color}25`,
                      }}
                    >
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: '#38A16915' }}
                      >
                        <Banknote size={28} style={{ color: '#38A169' }} />
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-base font-bold" style={{ color: theme.text_color }}>
                          {lang === 'es' ? 'Efectivo' : 'Cash'}
                        </p>
                        <p className="text-xs opacity-60 mt-0.5" style={{ color: theme.text_color }}>
                          {lang === 'es' ? 'Paga al recibir tu pedido' : 'Pay when you receive your order'}
                        </p>
                      </div>
                    </motion.button>

                    {/* Tarjeta */}
                    <motion.button
                      onClick={() => handleSelectPaymentMethod('tarjeta')}
                      whileTap={{ scale: 0.97 }}
                      disabled={uploading}
                      className="w-full p-5 rounded-2xl flex items-center gap-4 transition-all active:scale-[0.98]"
                      style={{
                        backgroundColor: `${theme.primary_color}08`,
                        border: `2px solid ${theme.primary_color}25`,
                      }}
                    >
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: '#E5393515' }}
                      >
                        <CreditCard size={28} style={{ color: '#E53935' }} />
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-base font-bold" style={{ color: theme.text_color }}>
                          {lang === 'es' ? 'Tarjeta' : 'Card'}
                        </p>
                        <p className="text-xs opacity-60 mt-0.5" style={{ color: theme.text_color }}>
                          {lang === 'es' ? 'Débito o crédito al entregar' : 'Debit or credit on delivery'}
                        </p>
                      </div>
                    </motion.button>
                  </div>

                  {uploading && (
                    <div className="flex items-center justify-center gap-2 py-4">
                      <Loader2 size={20} className="animate-spin" style={{ color: theme.primary_color }} />
                      <span className="text-sm" style={{ color: theme.text_color }}>
                        {t('payment.processing')}
                      </span>
                    </div>
                  )}
                </div>
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

                    <div className="rounded-2xl p-4 text-left mb-4" style={{ backgroundColor: `${theme.primary_color}06` }}>
                      {items.map(ci => (
                        <div key={ci.menuItem.id} className="flex justify-between text-sm py-1" style={{ color: theme.text_color }}>
                          <span>{ci.quantity}x {ci.menuItem.name}</span>
                          <span className="font-semibold">{formatPrice(ci.menuItem.price * ci.quantity)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 mt-3 border-t text-base font-bold" style={{ borderColor: `${theme.text_color}10`, color: theme.primary_color }}>
                        <span>{t('cart.total')}</span>
                        <span>{formatPrice(totalPrice)}</span>
                      </div>
                    </div>

                    {/* Payment method badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4" style={{ backgroundColor: `${theme.primary_color}10` }}>
                      {paymentMethod === 'sinpe' && <Smartphone size={16} style={{ color: theme.primary_color }} />}
                      {paymentMethod === 'efectivo' && <Banknote size={16} style={{ color: theme.primary_color }} />}
                      {paymentMethod === 'tarjeta' && <CreditCard size={16} style={{ color: theme.primary_color }} />}
                      <span className="text-sm font-semibold" style={{ color: theme.primary_color }}>
                        {paymentMethodLabel(paymentMethod)}
                      </span>
                    </div>

                    <p className="text-xs opacity-50 mb-4" style={{ color: theme.text_color }}>
                      {lang === 'es'
                        ? 'Envía tu pedido por WhatsApp para que el restaurante lo prepare.'
                        : 'Send your order via WhatsApp so the restaurant can prepare it.'}
                    </p>
                  </motion.div>
                </div>

                <div className="p-5 border-t space-y-3" style={{ borderColor: `${theme.text_color}10` }}>
                  <motion.button
                    onClick={handleWhatsApp}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
                    style={{
                      backgroundColor: '#25D366',
                      color: '#fff',
                      boxShadow: '0 4px 16px rgba(37, 211, 102, 0.3)',
                    }}
                  >
                    <MessageCircle size={20} />
                    {t('confirm.whatsapp')}
                  </motion.button>
                  <button
                    onClick={handleFinish}
                    className="w-full py-3 rounded-2xl text-sm font-medium transition-all"
                    style={{ color: theme.text_color, backgroundColor: `${theme.text_color}06` }}
                  >
                    {t('general.close')}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
