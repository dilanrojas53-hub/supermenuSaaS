/*
 * CartDrawer v2: Flujo de checkout completo con:
 * 1. Resumen del carrito
 * 2. Datos del cliente (nombre, teléfono, mesa)
 * 3. Info SINPE Móvil con número copiable
 * 4. Upload de comprobante SINPE a Supabase Storage
 * 5. Creación de orden en tabla orders
 * 6. Generación de mensaje WhatsApp con ID de pedido
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, MessageCircle, CreditCard, Copy, Check, Upload, Loader2, Camera, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import type { ThemeSettings, Tenant } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { supabase } from '@/lib/supabase';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
}

type Step = 'cart' | 'customer_info' | 'payment' | 'confirmation';

export default function CartDrawer({ isOpen, onClose, theme, tenant }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();
  const [sinpeCopied, setSinpeCopied] = useState(false);
  const [step, setStep] = useState<Step>('cart');
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

  const handleSubmitOrder = async () => {
    if (!customerName.trim()) return;
    setUploading(true);

    let receiptUrl = '';

    // Upload receipt if provided
    if (receiptFile) {
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

    // Create order in database
    const orderItems = items.map(i => ({
      id: i.menuItem.id,
      name: i.menuItem.name,
      price: i.menuItem.price,
      quantity: i.quantity,
    }));

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
        status: 'pendiente',
        payment_method: 'sinpe',
        sinpe_receipt_url: receiptUrl,
        notes: notes.trim(),
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

  const handleWhatsApp = useCallback(() => {
    if (items.length === 0) return;

    let message = `🛒 *Pedido #${orderNumber || '---'} — ${tenant.name}*\n\n`;
    if (customerName) message += `👤 Cliente: ${customerName}\n`;
    if (customerPhone) message += `📱 Tel: ${customerPhone}\n`;
    if (customerTable) message += `🪑 Mesa: ${customerTable}\n`;
    message += `\n`;

    items.forEach(item => {
      message += `• ${item.quantity}x ${item.menuItem.name} — ${formatPrice(item.menuItem.price * item.quantity)}\n`;
    });
    message += `\n💰 *Total: ${formatPrice(totalPrice)}*\n`;
    message += `💳 Pago: SINPE Móvil`;
    if (notes) message += `\n📝 Notas: ${notes}`;
    message += `\n\n✅ Comprobante ${receiptFile ? 'adjunto' : 'pendiente'}.`;

    const phone = tenant.whatsapp_number?.replace(/[^0-9]/g, '') || '';
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }, [items, tenant, totalPrice, orderNumber, customerName, customerPhone, customerTable, notes, receiptFile]);

  const handleFinish = () => {
    clearCart();
    setStep('cart');
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

          {/* Drawer */}
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
                    onClick={() => setStep(step === 'payment' ? 'customer_info' : 'cart')}
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
                  {step === 'cart' && 'Tu pedido'}
                  {step === 'customer_info' && 'Tus datos'}
                  {step === 'payment' && 'Pago SINPE'}
                  {step === 'confirmation' && 'Pedido confirmado'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {step === 'cart' && items.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-xs px-3 py-1.5 rounded-full opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: theme.text_color, border: `1px solid ${theme.text_color}20` }}
                  >
                    Vaciar
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
                {['customer_info', 'payment', 'confirmation'].map((s, i) => (
                  <div
                    key={s}
                    className="h-1 flex-1 rounded-full transition-all"
                    style={{
                      backgroundColor: ['customer_info', 'payment', 'confirmation'].indexOf(step) >= i
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
                      <p className="text-sm" style={{ color: theme.text_color }}>Tu carrito está vacío</p>
                      <p className="text-xs mt-1 opacity-60" style={{ color: theme.text_color }}>
                        Agrega platillos del menú para comenzar
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
                        {/* Item image */}
                        {cartItem.menuItem.image_url && (
                          <img
                            src={cartItem.menuItem.image_url}
                            alt={cartItem.menuItem.name}
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold truncate" style={{ color: theme.text_color }}>
                            {cartItem.menuItem.name}
                          </h4>
                          <p className="text-sm font-bold mt-0.5" style={{ color: theme.primary_color }}>
                            {formatPrice(cartItem.menuItem.price * cartItem.quantity)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(cartItem.menuItem.id, cartItem.quantity - 1)}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                            style={{ border: `1px solid ${theme.primary_color}30`, color: theme.primary_color }}
                          >
                            {cartItem.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                          </button>
                          <span className="w-6 text-center text-sm font-bold" style={{ color: theme.text_color }}>
                            {cartItem.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(cartItem.menuItem.id, cartItem.quantity + 1)}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                            style={{ backgroundColor: theme.primary_color, color: '#fff' }}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                {items.length > 0 && (
                  <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm opacity-60" style={{ color: theme.text_color }}>
                        Total ({items.reduce((s, i) => s + i.quantity, 0)} artículos)
                      </span>
                      <motion.span
                        key={totalPrice}
                        initial={{ scale: 1.1 }}
                        animate={{ scale: 1 }}
                        className="text-2xl font-bold"
                        style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
                      >
                        {formatPrice(totalPrice)}
                      </motion.span>
                    </div>

                    {!tenant.is_open ? (
                      <div className="w-full py-4 rounded-2xl text-center text-sm font-medium"
                        style={{ backgroundColor: `${theme.text_color}08`, color: theme.text_color }}>
                        🔒 Restaurante cerrado — No se aceptan pedidos
                      </div>
                    ) : (
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
                        <CreditCard size={20} />
                        Continuar al pago
                      </motion.button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ─── STEP: CUSTOMER INFO ─── */}
            {step === 'customer_info' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5 opacity-70" style={{ color: theme.text_color }}>
                      Tu nombre *
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ej: María López"
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                      style={{
                        backgroundColor: `${theme.text_color}06`,
                        color: theme.text_color,
                        border: `1.5px solid ${theme.text_color}15`,
                      }}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 opacity-70" style={{ color: theme.text_color }}>
                      Teléfono (opcional)
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Ej: 8888-1234"
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                      style={{
                        backgroundColor: `${theme.text_color}06`,
                        color: theme.text_color,
                        border: `1.5px solid ${theme.text_color}15`,
                      }}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 opacity-70" style={{ color: theme.text_color }}>
                      Número de mesa (opcional)
                    </label>
                    <input
                      type="text"
                      value={customerTable}
                      onChange={(e) => setCustomerTable(e.target.value)}
                      placeholder="Ej: Mesa 5"
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
                      style={{
                        backgroundColor: `${theme.text_color}06`,
                        color: theme.text_color,
                        border: `1.5px solid ${theme.text_color}15`,
                      }}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5 opacity-70" style={{ color: theme.text_color }}>
                      Notas especiales (opcional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej: Sin cebolla, extra picante..."
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all resize-none"
                      style={{
                        backgroundColor: `${theme.text_color}06`,
                        color: theme.text_color,
                        border: `1.5px solid ${theme.text_color}15`,
                      }}
                    />
                  </div>

                  {/* Order summary mini */}
                  <div className="rounded-xl p-3" style={{ backgroundColor: `${theme.primary_color}06` }}>
                    <p className="text-xs opacity-50 mb-2" style={{ color: theme.text_color }}>Resumen</p>
                    {items.map(ci => (
                      <div key={ci.menuItem.id} className="flex justify-between text-xs py-0.5" style={{ color: theme.text_color }}>
                        <span>{ci.quantity}x {ci.menuItem.name}</span>
                        <span className="font-semibold">{formatPrice(ci.menuItem.price * ci.quantity)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 mt-2 border-t text-sm font-bold" style={{ borderColor: `${theme.text_color}10`, color: theme.primary_color }}>
                      <span>Total</span>
                      <span>{formatPrice(totalPrice)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                  <motion.button
                    onClick={() => setStep('payment')}
                    disabled={!canProceedToPayment}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                    style={{
                      backgroundColor: theme.primary_color,
                      color: '#fff',
                      boxShadow: canProceedToPayment ? `0 4px 16px ${theme.primary_color}30` : 'none',
                    }}
                  >
                    <CreditCard size={20} />
                    Ir al pago SINPE
                  </motion.button>
                </div>
              </>
            )}

            {/* ─── STEP: PAYMENT ─── */}
            {step === 'payment' && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* SINPE info */}
                  {tenant.sinpe_number && (
                    <div className="rounded-2xl p-4" style={{ backgroundColor: `${theme.primary_color}06`, border: `1px solid ${theme.primary_color}12` }}>
                      <div className="flex items-center gap-2 mb-3">
                        <CreditCard size={16} style={{ color: theme.primary_color }} />
                        <h3 className="text-sm font-bold" style={{ color: theme.text_color }}>
                          Pago con SINPE Móvil
                        </h3>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs opacity-60" style={{ color: theme.text_color }}>Número SINPE</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold font-mono" style={{ color: theme.text_color }}>
                              {tenant.sinpe_number}
                            </span>
                            <button
                              onClick={handleCopySinpe}
                              className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                              style={{ backgroundColor: `${theme.primary_color}12` }}
                            >
                              {sinpeCopied ? (
                                <Check size={12} style={{ color: '#38A169' }} />
                              ) : (
                                <Copy size={12} style={{ color: theme.primary_color }} />
                              )}
                            </button>
                          </div>
                        </div>
                        {tenant.sinpe_owner && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs opacity-60" style={{ color: theme.text_color }}>A nombre de</span>
                            <span className="text-sm font-semibold" style={{ color: theme.text_color }}>
                              {tenant.sinpe_owner}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs opacity-60" style={{ color: theme.text_color }}>Monto a transferir</span>
                          <span className="text-lg font-bold" style={{ color: theme.primary_color }}>
                            {formatPrice(totalPrice)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Receipt upload */}
                  <div className="rounded-2xl p-4" style={{ backgroundColor: `${theme.text_color}04`, border: `1px solid ${theme.text_color}10` }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: theme.text_color }}>
                      📸 Comprobante SINPE (opcional)
                    </h3>
                    <p className="text-xs opacity-60 mb-3" style={{ color: theme.text_color }}>
                      Sube una captura de pantalla de tu transferencia para agilizar la confirmación.
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
                        <span className="text-sm font-medium">Tomar foto o seleccionar</span>
                      </button>
                    )}
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleReceiptSelect}
                      className="hidden"
                    />
                  </div>

                  {/* Instructions */}
                  <div className="rounded-xl p-3 text-center" style={{ backgroundColor: `${theme.accent_color}10` }}>
                    <p className="text-xs leading-relaxed opacity-70" style={{ color: theme.text_color }}>
                      Realiza el SINPE Móvil, sube tu comprobante y confirma el pedido. 
                      El restaurante lo recibirá al instante por WhatsApp.
                    </p>
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
                        Procesando pedido...
                      </>
                    ) : (
                      <>
                        <ShoppingBag size={20} />
                        Confirmar pedido
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
                      Pedido #{orderNumber}
                    </h3>
                    <p className="text-sm opacity-60 mb-6" style={{ color: theme.text_color }}>
                      Tu pedido fue registrado exitosamente
                    </p>

                    {/* Summary */}
                    <div className="rounded-2xl p-4 text-left mb-4" style={{ backgroundColor: `${theme.primary_color}06` }}>
                      {items.map(ci => (
                        <div key={ci.menuItem.id} className="flex justify-between text-sm py-1" style={{ color: theme.text_color }}>
                          <span>{ci.quantity}x {ci.menuItem.name}</span>
                          <span className="font-semibold">{formatPrice(ci.menuItem.price * ci.quantity)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 mt-3 border-t text-base font-bold" style={{ borderColor: `${theme.text_color}10`, color: theme.primary_color }}>
                        <span>Total</span>
                        <span>{formatPrice(totalPrice)}</span>
                      </div>
                    </div>

                    <p className="text-xs opacity-50 mb-4" style={{ color: theme.text_color }}>
                      Envía tu pedido por WhatsApp para que el restaurante lo prepare.
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
                    Enviar por WhatsApp
                  </motion.button>
                  <button
                    onClick={handleFinish}
                    className="w-full py-3 rounded-2xl text-sm font-medium transition-all"
                    style={{ color: theme.text_color, backgroundColor: `${theme.text_color}06` }}
                  >
                    Cerrar
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
