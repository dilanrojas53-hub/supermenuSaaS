/*
 * ActiveOrderFAB — Floating Action Button for active order tracking.
 * Shows on the menu page when the customer has an active order in localStorage.
 * Clicking navigates to /order-status/:orderId.
 */
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat } from 'lucide-react';

interface ActiveOrderData {
  orderId: string;
  orderNumber: number;
  tenantSlug: string;
  status: string;
}

export default function ActiveOrderFAB() {
  const [activeOrder, setActiveOrder] = useState<ActiveOrderData | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    const checkOrder = () => {
      try {
        const raw = localStorage.getItem('active_order');
        if (raw) {
          const parsed = JSON.parse(raw) as ActiveOrderData;
          setActiveOrder(parsed);
        } else {
          setActiveOrder(null);
        }
      } catch {
        setActiveOrder(null);
      }
    };

    checkOrder();
    // Poll every 3 seconds to catch updates
    const interval = setInterval(checkOrder, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = () => {
    if (activeOrder) {
      navigate(`/order-status/${activeOrder.orderId}`);
    }
  };

  const statusEmoji: Record<string, string> = {
    pendiente: '⏳',
    pago_en_revision: '⏳',
    en_cocina: '🔥',
    listo: '✅',
  };

  return (
    <AnimatePresence>
      {activeOrder && (
        <motion.button
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.8 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleClick}
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg"
          style={{
            backgroundColor: '#1E293B',
            border: '2px solid #F59E0B40',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4), 0 0 20px rgba(245,158,11,0.15)',
          }}
        >
          <motion.span
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
            className="text-lg"
          >
            {statusEmoji[activeOrder.status] || '🍳'}
          </motion.span>
          <div className="text-left">
            <p className="text-xs font-bold text-amber-400 leading-none">
              Pedido #{activeOrder.orderNumber}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
              Ver estado en vivo
            </p>
          </div>
          <ChefHat size={16} className="text-amber-500/60 ml-1" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
