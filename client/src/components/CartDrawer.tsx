/*
 * Neuro-Ventas + Checkout: Drawer del carrito con resumen de pedido,
 * información de SINPE Móvil, y botón de WhatsApp.
 * Incluye indicador de ahorro y copy persuasivo.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, MessageCircle, CreditCard, Copy, Check } from 'lucide-react';
import { useState, useCallback } from 'react';
import type { ThemeSettings, Tenant } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
}

export default function CartDrawer({ isOpen, onClose, theme, tenant }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();
  const [sinpeCopied, setSinpeCopied] = useState(false);
  const [step, setStep] = useState<'cart' | 'checkout'>('cart');

  const handleCopySinpe = useCallback(() => {
    if (tenant.sinpe_number) {
      navigator.clipboard.writeText(tenant.sinpe_number.replace(/-/g, '')).catch(() => {});
      setSinpeCopied(true);
      setTimeout(() => setSinpeCopied(false), 2000);
    }
  }, [tenant.sinpe_number]);

  const handleWhatsApp = useCallback(() => {
    if (items.length === 0) return;

    let message = `🛒 *Nuevo Pedido — ${tenant.name}*\n\n`;
    items.forEach(item => {
      message += `• ${item.quantity}x ${item.menuItem.name} — ${formatPrice(item.menuItem.price * item.quantity)}\n`;
    });
    message += `\n💰 *Total: ${formatPrice(totalPrice)}*\n`;
    message += `\n💳 Método de pago: SINPE Móvil`;
    if (tenant.sinpe_number) {
      message += `\n📱 SINPE: ${tenant.sinpe_number}`;
      if (tenant.sinpe_owner) {
        message += ` (${tenant.sinpe_owner})`;
      }
    }
    message += `\n\n📎 Adjunto comprobante de pago.`;

    const phone = tenant.whatsapp_number?.replace(/[^0-9]/g, '') || '';
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  }, [items, tenant, totalPrice]);

  const handleProceedToCheckout = () => {
    setStep('checkout');
  };

  const handleBackToCart = () => {
    setStep('cart');
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

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl max-h-[90vh] flex flex-col"
            style={{ backgroundColor: theme.background_color }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: `${theme.text_color}10` }}>
              <div className="flex items-center gap-3">
                {step === 'checkout' && (
                  <button
                    onClick={handleBackToCart}
                    className="text-sm opacity-60 hover:opacity-100 transition-opacity"
                    style={{ color: theme.text_color }}
                  >
                    ← Volver
                  </button>
                )}
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
                >
                  {step === 'cart' ? 'Tu pedido' : 'Confirmar pedido'}
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
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${theme.text_color}08` }}
                >
                  <X size={18} style={{ color: theme.text_color }} />
                </button>
              </div>
            </div>

            {step === 'cart' ? (
              <>
                {/* Cart Items */}
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
                        <div className="flex-1 min-w-0">
                          <h4
                            className="text-sm font-semibold truncate"
                            style={{ color: theme.text_color }}
                          >
                            {cartItem.menuItem.name}
                          </h4>
                          <p
                            className="text-sm font-bold mt-0.5"
                            style={{ color: theme.primary_color }}
                          >
                            {formatPrice(cartItem.menuItem.price * cartItem.quantity)}
                          </p>
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(cartItem.menuItem.id, cartItem.quantity - 1)}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                            style={{ border: `1px solid ${theme.primary_color}30`, color: theme.primary_color }}
                          >
                            {cartItem.quantity === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                          </button>
                          <span
                            className="w-6 text-center text-sm font-bold"
                            style={{ color: theme.text_color }}
                          >
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

                {/* Footer with total */}
                {items.length > 0 && (
                  <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm opacity-60" style={{ color: theme.text_color }}>
                        Total ({items.reduce((s, i) => s + i.quantity, 0)} items)
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

                    <motion.button
                      onClick={handleProceedToCheckout}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
                      style={{
                        backgroundColor: theme.primary_color,
                        color: '#fff',
                        boxShadow: `0 4px 16px ${theme.primary_color}30`,
                      }}
                    >
                      <CreditCard size={20} />
                      Proceder al pago
                    </motion.button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Checkout Step */}
                <div className="flex-1 overflow-y-auto p-5">
                  {/* Order summary */}
                  <div
                    className="rounded-2xl p-4 mb-4"
                    style={{ backgroundColor: `${theme.primary_color}06`, border: `1px solid ${theme.primary_color}10` }}
                  >
                    <h3 className="text-sm font-bold mb-3 opacity-70" style={{ color: theme.text_color }}>
                      Resumen del pedido
                    </h3>
                    {items.map(cartItem => (
                      <div key={cartItem.menuItem.id} className="flex justify-between items-center py-1.5">
                        <span className="text-sm" style={{ color: theme.text_color }}>
                          {cartItem.quantity}x {cartItem.menuItem.name}
                        </span>
                        <span className="text-sm font-semibold" style={{ color: theme.text_color }}>
                          {formatPrice(cartItem.menuItem.price * cartItem.quantity)}
                        </span>
                      </div>
                    ))}
                    <div
                      className="flex justify-between items-center pt-3 mt-3 border-t"
                      style={{ borderColor: `${theme.text_color}10` }}
                    >
                      <span className="text-base font-bold" style={{ color: theme.text_color }}>Total</span>
                      <span
                        className="text-xl font-bold"
                        style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
                      >
                        {formatPrice(totalPrice)}
                      </span>
                    </div>
                  </div>

                  {/* SINPE info */}
                  {tenant.sinpe_number && (
                    <div
                      className="rounded-2xl p-4 mb-4"
                      style={{ backgroundColor: `${theme.primary_color}06`, border: `1px solid ${theme.primary_color}10` }}
                    >
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
                            <span className="text-sm font-bold" style={{ color: theme.text_color }}>
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
                          <span className="text-xs opacity-60" style={{ color: theme.text_color }}>Monto</span>
                          <span className="text-sm font-bold" style={{ color: theme.primary_color }}>
                            {formatPrice(totalPrice)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Instructions */}
                  <div
                    className="rounded-2xl p-4 mb-4 text-center"
                    style={{ backgroundColor: `${theme.accent_color}10`, border: `1px solid ${theme.accent_color}20` }}
                  >
                    <p className="text-xs leading-relaxed opacity-70" style={{ color: theme.text_color }}>
                      Realiza el SINPE Móvil y envía tu comprobante por WhatsApp. 
                      El restaurante confirmará tu pedido al instante.
                    </p>
                  </div>
                </div>

                {/* WhatsApp button */}
                <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
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
                    Enviar pedido por WhatsApp
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
