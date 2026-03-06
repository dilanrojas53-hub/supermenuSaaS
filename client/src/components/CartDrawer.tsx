/*
 * CartDrawer v8: AI Upsell + Static Fallback + Cuenta Abierta.
 * Flow: 1. Cart  2. Customer info (skipped in Cuenta Abierta)  3. [AI Upsell]  4. Select payment  5. SINPE  6. Confirmation
 * Cuenta Abierta: Detects open_tab_order in localStorage → UPDATE existing order instead of INSERT.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, MessageCircle, Copy, Check, Loader2, Camera, ArrowLeft, ShoppingBag, Banknote, CreditCard, Smartphone, AlertCircle, RefreshCw, MapPin, Clock, Bike, UtensilsCrossed, Package } from 'lucide-react';
import { buildWhatsAppUrl } from '@/lib/phone';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
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
type DeliveryType = 'dine_in' | 'takeout' | 'delivery';

// Shape of the open_tab_order stored in localStorage by OrderStatusPage
interface OpenTabOrder {
  orderId: string;
  orderNumber: number;
  tenantId: string;
  customerName: string;
  customerPhone: string;
  customerTable: string;
  existingItems: any[];
  existingTotal: number;
  existingUpsellRevenue: number;
  existingAiUpsellRevenue: number;
}

export default function CartDrawer({ isOpen, onClose, theme, tenant, allMenuItems = [] }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();
  const { t, lang } = useI18n();
  const [, navigate] = useLocation();
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

  // ─── DELIVERY / LOGISTICA ───
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('dine_in');
  const [scheduledDate, setScheduledDate] = useState<'today' | 'tomorrow'>('today');
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryPhone, setDeliveryPhone] = useState<string>('');

  // ─── CUENTA ABIERTA (Open Tab) ───
  const [openTab, setOpenTab] = useState<OpenTabOrder | null>(null);

  // Detect open tab order from localStorage when drawer opens
  useEffect(() => {
    if (isOpen) {
      try {
        const raw = localStorage.getItem('open_tab_order');
        if (raw) {
          const parsed = JSON.parse(raw) as OpenTabOrder;
          // Only use if it belongs to this tenant
          if (parsed.tenantId === tenant.id) {
            setOpenTab(parsed);
            // Pre-fill customer info from existing order
            setCustomerName(parsed.customerName);
            setCustomerPhone(parsed.customerPhone);
            setCustomerTable(parsed.customerTable);
          }
        }
      } catch { /* ignore parse errors */ }
    }
  }, [isOpen, tenant.id]);

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
      // Smart Cart: only send items that haven't been through the upsell flow yet
      const eligibleItems = items.filter(ci => !ci.prevent_checkout_upsell && !ci.isUpsell);
      if (eligibleItems.length === 0) {
        console.log('%c[AI Upsell] All items already upselled in ProductDetailModal, skipping', 'color: #6C63FF;');
        setShowAIUpsell(false);
        setAiLoading(false);
        setStep('select_payment');
        return;
      }
      const cartPayload = eligibleItems.map(ci => ({
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

  // Submit order: INSERT new or UPDATE existing (Cuenta Abierta)
  const handleSubmitOrderWithMethod = async (method: PaymentMethod) => {
    if (!customerName.trim() && !openTab) return;
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

        if (uploadError) {
          console.error('[SINPE Upload] Error:', uploadError);
          toast.error(
            lang === 'es'
              ? 'Error al subir el comprobante. Intenta de nuevo.'
              : 'Error uploading receipt. Please try again.',
            { duration: 6000 }
          );
          setUploading(false);
          return;
        }

        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
        receiptUrl = urlData.publicUrl;
        console.log('[SINPE Upload] Success:', receiptUrl);
      }

      // Include isUpsell + upsell_source flags in order items for analytics tracking
      const newOrderItems = items.map(i => ({
        id: i.menuItem.id,
        name: i.menuItem.name,
        price: i.menuItem.price,
        quantity: i.quantity,
        isUpsell: i.isUpsell || false,
        upsell_source: i.upsell_source || null,
      }));

      // Calculate upsell revenue for NEW items only
      const newUpsellRevenue = items
        .filter(i => i.isUpsell)
        .reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);
      const newAiUpsellRevenue = items
        .filter(i => i.upsell_source === 'ai')
        .reduce((sum, i) => sum + i.menuItem.price * i.quantity, 0);

      // ─── CUENTA ABIERTA: UPDATE existing order ───
      if (openTab) {
        const mergedItems = [...openTab.existingItems, ...newOrderItems];
        const mergedTotal = openTab.existingTotal + totalPrice;
        const mergedUpsellRevenue = (openTab.existingUpsellRevenue || 0) + newUpsellRevenue;
        const mergedAiUpsellRevenue = (openTab.existingAiUpsellRevenue || 0) + newAiUpsellRevenue;

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            items: mergedItems,
            subtotal: mergedTotal,
            total: mergedTotal,
            upsell_revenue: mergedUpsellRevenue,
            ai_upsell_revenue: mergedAiUpsellRevenue,
            upsell_accepted: mergedUpsellRevenue > 0,
            has_new_items: true,
            notes: notes.trim() ? `${openTab.customerName}: ${notes.trim()}` : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', openTab.orderId);

        if (updateError) {
          console.error('Update order error:', updateError);
          setErrorMsg(lang === 'es'
            ? `Error al actualizar el pedido: ${updateError.message}`
            : `Error updating order: ${updateError.message}`);
          return;
        }

        // Success — clean up and navigate to order status
        toast.success(lang === 'es' ? '¡Nuevos platillos agregados a tu pedido!' : 'New items added to your order!');
        localStorage.removeItem('open_tab_order');
        clearCart();
        setOpenTab(null);
        setStep('cart');
        onClose();
        navigate(`/order-status/${openTab.orderId}`);
        return;
      }

      // ─── NORMAL: INSERT new order ───
      const statusMap: Record<PaymentMethod, string> = {
        sinpe: receiptUrl ? 'pago_en_revision' : 'pendiente',
        efectivo: 'pendiente',
        tarjeta: 'pendiente',
      };

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenant.id,
          customer_name: customerName.trim() || '',
          customer_phone: customerPhone.trim() || '',
          customer_table: customerTable.trim() || '',
          items: newOrderItems,
          subtotal: totalPrice,
          total: totalPrice,
          status: statusMap[method],
          payment_method: method,
          sinpe_receipt_url: method === 'sinpe' ? (receiptUrl || '') : '',
          notes: notes.trim() || '',
          upsell_revenue: newUpsellRevenue ?? 0,
          ai_upsell_revenue: newAiUpsellRevenue ?? 0,
          upsell_accepted: newUpsellRevenue > 0,
          delivery_type: deliveryType || 'dine_in',
          scheduled_date: (deliveryType === 'takeout' || deliveryType === 'delivery') ? (scheduledDate || 'today') : '',
          // V4.0 ASAP: si es "Hoy", enviar 'ASAP' para evitar campo vacío en BD
          scheduled_time: (deliveryType === 'takeout' || deliveryType === 'delivery')
            ? (scheduledDate === 'today' ? 'ASAP' : (scheduledTime || 'ASAP'))
            : '',
          delivery_address: deliveryType === 'delivery' ? (deliveryAddress.trim() || '') : '',
          delivery_phone: deliveryType === 'delivery' ? (deliveryPhone.trim() || '') : '',
        })
        .select('id, order_number')
        .single();

      if (orderError) {
        console.error('Order error:', orderError);
        setErrorMsg(lang === 'es'
          ? `Error al procesar el pedido: ${orderError.message}`
          : `Error processing order: ${orderError.message}`);
        return;
      }

      if (orderData) {
        setOrderNumber(orderData.order_number);
        setOrderId(orderData.id);
        setStep('confirmation');
      }
    } catch (err: unknown) {
      console.error('Unexpected error:', err);
      setErrorMsg(lang === 'es'
        ? 'Ocurrió un error inesperado. Por favor intenta de nuevo.'
        : 'An unexpected error occurred. Please try again.');
    } finally {
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

    const whatsappUrl = buildWhatsAppUrl(tenant.whatsapp_number, message) || `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }, [items, tenant, totalPrice, orderNumber, customerName, customerPhone, customerTable, notes, receiptFile, t, lang, paymentMethod]);

  const handleFinish = () => {
    // For new orders, save active_order to localStorage and navigate to tracking
    const finishedOrderId = orderId;
    const finishedOrderNumber = orderNumber;
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
    setOpenTab(null);
    localStorage.removeItem('open_tab_order');
    onClose();
    // Navigate to order tracking if we have an order ID
    if (finishedOrderId) {
      // Save active order for FAB
      localStorage.setItem('active_order', JSON.stringify({
        orderId: finishedOrderId,
        orderNumber: finishedOrderNumber,
        tenantSlug: localStorage.getItem('last_tenant_slug') || '',
        status: 'pendiente',
      }));
      navigate(`/order-status/${finishedOrderId}`);
    }
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
                        key={ci.cartItemId}
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
                          <p className="text-sm font-bold mt-0.5" style={{ color: theme.primary_color }}>
                            {formatPrice(ci.menuItem.price * ci.quantity)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(ci.cartItemId, ci.quantity - 1)}
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
                            onClick={() => updateQuantity(ci.cartItemId, ci.quantity + 1)}
                            className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:opacity-80"
                            style={{ backgroundColor: theme.primary_color }}
                          >
                            <Plus size={13} style={{ color: 'var(--menu-accent-contrast)' }} />
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
                    {openTab && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2" style={{ backgroundColor: '#F59E0B15', border: '1px solid #F59E0B30' }}>
                        <RefreshCw size={14} className="text-amber-500" />
                        <span className="text-xs font-semibold text-amber-500">
                          Cuenta Abierta — Pedido #{openTab.orderNumber}
                        </span>
                      </div>
                    )}
                    <motion.button
                      onClick={() => openTab ? handleProceedToPayment(allMenuItems) : setStep('customer_info')}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
                      style={{
                        backgroundColor: openTab ? '#F59E0B' : theme.primary_color,
                        boxShadow: openTab ? '0 4px 16px rgba(245,158,11,0.3)' : `0 4px 16px ${theme.primary_color}40`,
                        color: openTab ? '#000' : 'var(--menu-accent-contrast)',
                      }}
                    >
                      <ShoppingBag size={20} />
                      {openTab
                        ? (lang === 'es' ? 'Agregar a mi pedido' : 'Add to my order')
                        : t('cart.checkout')
                      }
                    </motion.button>
                  </div>
                )}
              </>
            )}

            {/* ─── STEP: CUSTOMER INFO + DELIVERY TYPE ─── */}
            {step === 'customer_info' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                  {/* ── Delivery Type Selector ── */}
                  <div>
                    <label className="text-xs font-semibold mb-2 block" style={{ color: `${theme.text_color}80` }}>
                      {lang === 'es' ? '¿Cómo recibes tu pedido?' : 'How will you receive your order?'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { type: 'dine_in' as DeliveryType, icon: <UtensilsCrossed size={18} />, label: lang === 'es' ? 'Comer Aquí' : 'Dine In' },
                        { type: 'takeout' as DeliveryType, icon: <Package size={18} />, label: 'Takeout' },
                        { type: 'delivery' as DeliveryType, icon: <Bike size={18} />, label: 'Delivery' },
                      ] as { type: DeliveryType; icon: React.ReactNode; label: string }[]).map(({ type, icon, label }) => (
                        <button
                          key={type}
                          onClick={() => setDeliveryType(type)}
                          className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all"
                          style={{
                            backgroundColor: deliveryType === type ? `${theme.primary_color}20` : `${theme.text_color}06`,
                            border: `2px solid ${deliveryType === type ? theme.primary_color : `${theme.text_color}10`}`,
                            color: deliveryType === type ? theme.primary_color : `${theme.text_color}60`,
                          }}
                        >
                          {icon}
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Scheduled Date + Time (Takeout or Delivery) ── */}
                  {(deliveryType === 'takeout' || deliveryType === 'delivery') && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold mb-2 block" style={{ color: `${theme.text_color}80` }}>
                          {lang === 'es' ? '¿Cuándo?' : 'When?'}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['today', 'tomorrow'] as const).map(d => (
                            <button
                              key={d}
                              onClick={() => setScheduledDate(d)}
                              className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                              style={{
                                backgroundColor: scheduledDate === d ? `${theme.primary_color}20` : `${theme.text_color}06`,
                                border: `2px solid ${scheduledDate === d ? theme.primary_color : `${theme.text_color}10`}`,
                                color: scheduledDate === d ? theme.primary_color : `${theme.text_color}60`,
                              }}
                            >
                              {d === 'today' ? (lang === 'es' ? 'Hoy' : 'Today') : (lang === 'es' ? 'Mañana' : 'Tomorrow')}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* FASE 1 V4.0: ASAP logic — solo mostrar hora si es "Mañana" */}
                      {scheduledDate === 'today' ? (
                        <div
                          className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                          style={{
                            backgroundColor: `${theme.primary_color}12`,
                            border: `1.5px solid ${theme.primary_color}30`,
                          }}
                        >
                          <span className="text-base">\uD83D\uDEF5</span>
                          <p className="text-sm font-semibold" style={{ color: theme.primary_color }}>
                            {lang === 'es' ? 'Entrega lo m\u00e1s pronto posible (Aprox. 30\u201345 min)' : 'Delivery as soon as possible (Approx. 30\u201345 min)'}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                            <Clock size={11} className="inline mr-1" />
                            {lang === 'es' ? 'Hora de entrega' : 'Delivery time'}
                          </label>
                          <input
                            type="time"
                            value={scheduledTime}
                            onChange={e => setScheduledTime(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                            style={{
                              backgroundColor: `${theme.text_color}06`,
                              border: `1.5px solid ${scheduledTime ? theme.primary_color : `${theme.text_color}15`}`,
                              color: theme.text_color,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Delivery Address + Phone (Delivery only) ── */}
                  {deliveryType === 'delivery' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                          <MapPin size={11} className="inline mr-1" />
                          {lang === 'es' ? 'Señas / Dirección' : 'Delivery Address'}
                        </label>
                        <textarea
                          value={deliveryAddress}
                          onChange={e => setDeliveryAddress(e.target.value)}
                          placeholder={lang === 'es' ? 'Ej: 100m norte del parque, casa azul...' : 'E.g.: 100m north of the park, blue house...'}
                          rows={2}
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
                          style={{
                            backgroundColor: `${theme.text_color}06`,
                            border: `1.5px solid ${deliveryAddress ? theme.primary_color : `${theme.text_color}15`}`,
                            color: theme.text_color,
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                          {lang === 'es' ? 'WhatsApp para coordinar entrega' : 'WhatsApp for delivery coordination'}
                        </label>
                        <input
                          type="tel"
                          value={deliveryPhone}
                          onChange={e => setDeliveryPhone(e.target.value)}
                          placeholder="8888-8888"
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                          style={{
                            backgroundColor: `${theme.text_color}06`,
                            border: `1.5px solid ${deliveryPhone ? theme.primary_color : `${theme.text_color}15`}`,
                            color: theme.text_color,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── Standard fields ── */}
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
                    {deliveryType === 'dine_in' && (
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                          {t('checkout.table')}
                        </label>
                        <input
                          type="text"
                          value={customerTable}
                          onChange={e => setCustomerTable(e.target.value)}
                          placeholder={lang === 'es' ? 'Ej: Mesa 5, Barra' : 'E.g.: Table 5, Bar'}
                          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                          style={{
                            backgroundColor: `${theme.text_color}06`,
                            border: `1.5px solid ${theme.text_color}15`,
                            color: theme.text_color,
                          }}
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block" style={{ color: `${theme.text_color}80` }}>
                        {t('checkout.notes')}
                      </label>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder={lang === 'es' ? 'Alergias, preferencias, instrucciones especiales...' : 'Allergies, preferences, special instructions...'}
                        rows={2}
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
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: theme.primary_color,
                      boxShadow: canProceedToPayment ? `0 4px 16px ${theme.primary_color}40` : 'none',
                      color: 'var(--menu-accent-contrast)',
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
                        color: 'var(--menu-accent-contrast)',
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
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
                    style={{
                      backgroundColor: '#F59E0B',
                      color: '#000',
                      boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
                    }}
                  >
                    <ShoppingBag size={20} />
                    {lang === 'es' ? 'Ver estado de mi pedido' : 'Track my order'}
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
