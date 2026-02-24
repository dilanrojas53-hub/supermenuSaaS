/*
 * Design: "Warm Craft" — Drawer del carrito que sube desde abajo.
 * Muestra items, cantidades, total y botón de checkout (placeholder Fase 4).
 */
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, Trash2, MessageCircle } from 'lucide-react';
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

  const handleCheckout = () => {
    if (items.length === 0) return;

    // Build WhatsApp message
    let message = `🛒 *Nuevo Pedido - ${tenant.name}*\n\n`;
    items.forEach(item => {
      message += `• ${item.quantity}x ${item.menuItem.name} — ${formatPrice(item.menuItem.price * item.quantity)}\n`;
    });
    message += `\n💰 *Total: ${formatPrice(totalPrice)}*\n`;
    message += `\n💳 Método de pago: SINPE Móvil / Transferencia`;
    if (tenant.sinpe_number) {
      message += `\n📱 SINPE: ${tenant.sinpe_number}`;
      if (tenant.sinpe_owner) {
        message += ` (${tenant.sinpe_owner})`;
      }
    }
    message += `\n\n📎 Por favor adjunte su comprobante de pago en este chat.`;

    const whatsappUrl = `https://wa.me/${tenant.whatsapp_number}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl max-h-[85vh] flex flex-col"
            style={{ backgroundColor: theme.background_color }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: `${theme.text_color}10` }}>
              <h2
                className="text-xl font-bold"
                style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
              >
                Tu pedido
              </h2>
              <div className="flex items-center gap-2">
                {items.length > 0 && (
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

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {items.length === 0 ? (
                <div className="text-center py-12 opacity-50">
                  <p className="text-4xl mb-3">🛒</p>
                  <p style={{ color: theme.text_color }}>Tu carrito está vacío</p>
                </div>
              ) : (
                items.map(cartItem => (
                  <div
                    key={cartItem.menuItem.id}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: `${theme.primary_color}06` }}
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
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
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
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                        style={{ backgroundColor: theme.primary_color, color: '#fff' }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer with total and checkout */}
            {items.length > 0 && (
              <div className="p-5 border-t" style={{ borderColor: `${theme.text_color}10` }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm opacity-60" style={{ color: theme.text_color }}>Total</span>
                  <span
                    className="text-2xl font-bold"
                    style={{ fontFamily: "'Lora', serif", color: theme.primary_color }}
                  >
                    {formatPrice(totalPrice)}
                  </span>
                </div>

                {/* SINPE info */}
                {tenant.sinpe_number && (
                  <div
                    className="text-xs text-center mb-3 py-2 px-3 rounded-lg opacity-70"
                    style={{ backgroundColor: `${theme.primary_color}08`, color: theme.text_color }}
                  >
                    SINPE Móvil: {tenant.sinpe_number} • {tenant.sinpe_owner}
                  </div>
                )}

                <button
                  onClick={handleCheckout}
                  className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: '#25D366',
                    color: '#fff',
                    boxShadow: '0 4px 16px rgba(37, 211, 102, 0.3)',
                  }}
                >
                  <MessageCircle size={20} />
                  Pedir por WhatsApp
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
