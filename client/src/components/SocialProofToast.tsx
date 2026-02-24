/*
 * Neuro-Ventas: Toast de Prueba Social REAL.
 * Muestra notificaciones de compras reales de las últimas 2 horas.
 * Solo aparece si hay pedidos recientes verificados en la tabla orders.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag } from 'lucide-react';
import type { ThemeSettings } from '@/lib/types';
import { supabase } from '@/lib/supabase';

interface SocialProofToastProps {
  tenantId: string;
  theme: ThemeSettings;
}

interface RecentOrder {
  customer_name: string;
  items: { name: string }[];
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'hace un momento';
  if (diff < 2) return 'hace 1 minuto';
  if (diff < 60) return `hace ${diff} minutos`;
  const hours = Math.floor(diff / 60);
  return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
}

export default function SocialProofToast({ tenantId, theme }: SocialProofToastProps) {
  const [visible, setVisible] = useState(false);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch real orders from the last 2 hours
  const fetchRecentOrders = useCallback(async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('orders')
      .select('customer_name, items, created_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelado')
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      setRecentOrders(data as RecentOrder[]);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchRecentOrders();
    // Re-fetch every 5 minutes
    const interval = setInterval(fetchRecentOrders, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchRecentOrders]);

  const showToast = useCallback(() => {
    if (recentOrders.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % recentOrders.length);
    setVisible(true);
    setTimeout(() => setVisible(false), 4000);
  }, [recentOrders]);

  useEffect(() => {
    if (recentOrders.length === 0) return;

    // First toast after 10 seconds
    const initialTimer = setTimeout(showToast, 10000);

    // Subsequent toasts every 20-35 seconds
    const interval = setInterval(showToast, 20000 + Math.random() * 15000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [recentOrders, showToast]);

  // Don't render anything if no real orders exist
  if (recentOrders.length === 0) return null;

  const order = recentOrders[currentIndex % recentOrders.length];
  // Get first name only for privacy
  const firstName = order.customer_name?.split(' ')[0] || 'Un cliente';
  // Get the first item name from the order
  const itemName = (order.items as any[])?.[0]?.name || 'un platillo';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: -100, y: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: -100 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed top-4 left-4 right-4 z-40 max-w-sm"
        >
          <div
            className="flex items-center gap-3 p-3 rounded-2xl backdrop-blur-md"
            style={{
              backgroundColor: `${theme.background_color}F0`,
              boxShadow: `0 4px 20px ${theme.primary_color}15, 0 1px 3px rgba(0,0,0,0.1)`,
              border: `1px solid ${theme.primary_color}15`,
            }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${theme.primary_color}12` }}
            >
              <ShoppingBag size={16} style={{ color: theme.primary_color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-tight" style={{ color: theme.text_color }}>
                <span style={{ color: theme.primary_color }}>{firstName}</span> pidió{' '}
                <span className="font-bold">{itemName}</span>
              </p>
              <p className="text-[10px] opacity-50 mt-0.5" style={{ color: theme.text_color }}>
                {timeAgo(order.created_at)}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
