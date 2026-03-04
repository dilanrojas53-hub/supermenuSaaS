/*
 * OrderStatusPage — Live Tracking + Cuenta Abierta
 * Design: "Warm Craft" dark card with animated status steps.
 * Supabase Realtime subscription for live status updates.
 * Route: /order-status/:orderId
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Flame, CheckCircle2, Package, XCircle, Plus, ShoppingBag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Order, OrderStatus } from '@/lib/types';
import { formatPrice, ORDER_STATUS_CONFIG } from '@/lib/types';
import { useAnimationConfig } from '@/contexts/AnimationContext';

// Status step config with icons and animations
const STATUS_STEPS: {
  key: OrderStatus;
  label: string;
  icon: React.ReactNode;
  animClass: string;
  color: string;
}[] = [
  {
    key: 'pendiente',
    label: 'Pedido recibido',
    icon: <Clock size={24} />,
    animClass: 'animate-pulse',
    color: '#F59E0B',
  },
  {
    key: 'en_cocina',
    label: 'En preparación',
    icon: <Flame size={24} />,
    animClass: 'animate-bounce',
    color: '#F97316',
  },
  {
    key: 'listo',
    label: '¡Listo para recoger!',
    icon: <CheckCircle2 size={24} />,
    animClass: 'animate-pulse',
    color: '#10B981',
  },
  {
    key: 'entregado',
    label: 'Entregado',
    icon: <Package size={24} />,
    animClass: '',
    color: '#6B7280',
  },
];

// Map status to step index
function getStepIndex(status: OrderStatus): number {
  if (status === 'pendiente' || status === 'pago_en_revision') return 0;
  if (status === 'en_cocina') return 1;
  if (status === 'listo') return 2;
  if (status === 'entregado') return 3;
  return -1; // cancelado
}

export default function OrderStatusPage() {
  const params = useParams<{ orderId: string }>();
  const [, navigate] = useLocation();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Push animation config to global context
  const { setAnimationConfig } = useAnimationConfig();
  useEffect(() => {
    if (!order) return;
    (async () => {
      const { data: themeData } = await supabase
        .from('theme_settings')
        .select('primary_color, secondary_color, background_color, theme_animation')
        .eq('tenant_id', order.tenant_id)
        .single();
      if (themeData) {
        setAnimationConfig({
          animation: themeData.theme_animation,
          primaryColor: themeData.primary_color,
          secondaryColor: themeData.secondary_color,
          backgroundColor: themeData.background_color,
        });
      }
    })();
  }, [order?.tenant_id, setAnimationConfig]);

  // Fetch order initially
  const fetchOrder = useCallback(async () => {
    if (!params.orderId) return;
    const { data, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', params.orderId)
      .single();

    if (fetchErr || !data) {
      setError('No se encontró la orden');
      setLoading(false);
      return;
    }
    setOrder(data as Order);
    setLoading(false);
  }, [params.orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!params.orderId) return;

    const channel = supabase
      .channel(`order-${params.orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${params.orderId}`,
        },
        (payload) => {
          console.log('[OrderStatus] Realtime update:', payload.new);
          setOrder(payload.new as Order);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.orderId]);

  // Save active order to localStorage for FAB
  useEffect(() => {
    if (order && order.status !== 'entregado' && order.status !== 'cancelado') {
      const slug = window.location.pathname.split('/')[1]; // best effort
      localStorage.setItem('active_order', JSON.stringify({
        orderId: order.id,
        orderNumber: order.order_number,
        tenantSlug: localStorage.getItem('last_tenant_slug') || '',
        status: order.status,
      }));
    } else if (order && (order.status === 'entregado' || order.status === 'cancelado')) {
      localStorage.removeItem('active_order');
    }
  }, [order]);

  const currentStepIdx = order ? getStepIndex(order.status) : -1;
  const isCancelled = order?.status === 'cancelado';
  const isCompleted = order?.status === 'entregado';
  const canAddMore = order && !isCancelled && !isCompleted && order.status !== 'listo';

  // Navigate back to menu to add more items (Cuenta Abierta)
  const handleAddMore = () => {
    if (!order) return;
    // Store the order ID so CartDrawer knows to UPDATE instead of INSERT
    localStorage.setItem('open_tab_order', JSON.stringify({
      orderId: order.id,
      orderNumber: order.order_number,
      tenantId: order.tenant_id,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerTable: order.customer_table,
      existingItems: order.items,
      existingTotal: order.total,
      existingUpsellRevenue: order.upsell_revenue || 0,
      existingAiUpsellRevenue: order.ai_upsell_revenue || 0,
    }));
    // Navigate back to menu
    const slug = localStorage.getItem('last_tenant_slug');
    if (slug) {
      navigate(`/${slug}`);
    } else {
      window.history.back();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white px-6">
        <XCircle size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-bold mb-2">Orden no encontrada</h2>
        <p className="text-sm text-slate-400 mb-6">{error || 'La orden no existe o fue eliminada.'}</p>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 rounded-full bg-amber-500 text-black font-bold text-sm"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: 'transparent' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/60 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-slate-400" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold" style={{ fontFamily: "'Lora', serif" }}>
              Pedido #{order.order_number}
            </h1>
            <p className="text-xs text-slate-500">
              {new Date(order.created_at).toLocaleString('es-CR', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <div
            className="px-3 py-1 rounded-full text-xs font-bold"
            style={{
              backgroundColor: ORDER_STATUS_CONFIG[order.status]?.bgColor || '#F3F4F6',
              color: ORDER_STATUS_CONFIG[order.status]?.color || '#6B7280',
            }}
          >
            {ORDER_STATUS_CONFIG[order.status]?.label || order.status}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* ─── STATUS TRACKER ─── */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5">Estado del pedido</h2>

          {isCancelled ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-6"
            >
              <XCircle size={48} className="text-red-400 mx-auto mb-3" />
              <p className="text-lg font-bold text-red-400">Pedido cancelado</p>
              <p className="text-sm text-slate-500 mt-1">Este pedido fue cancelado por el restaurante.</p>
            </motion.div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-slate-800" />

              {STATUS_STEPS.map((step, idx) => {
                const isActive = idx === currentStepIdx;
                const isDone = idx < currentStepIdx;
                const isFuture = idx > currentStepIdx;

                return (
                  <div key={step.key} className="relative flex items-start gap-4 mb-6 last:mb-0">
                    {/* Circle */}
                    <motion.div
                      animate={isActive ? { scale: [1, 1.15, 1] } : {}}
                      transition={isActive ? { duration: 1.5, repeat: Infinity } : {}}
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all ${
                        isDone ? 'bg-emerald-500/20' :
                        isActive ? 'ring-2 ring-offset-2 ring-offset-slate-900' :
                        'bg-slate-800'
                      }`}
                      style={{
                        backgroundColor: isDone ? '#10B98120' : isActive ? `${step.color}20` : undefined,
                        color: isDone ? '#10B981' : isActive ? step.color : '#475569',
                        // @ts-ignore ring color via Tailwind
                        '--tw-ring-color': isActive ? step.color : undefined,
                      } as React.CSSProperties}
                    >
                      {isDone ? (
                        <CheckCircle2 size={20} className="text-emerald-500" />
                      ) : (
                        <span className={isActive ? step.animClass : ''}>{step.icon}</span>
                      )}
                    </motion.div>

                    {/* Text */}
                    <div className={`pt-2 ${isFuture ? 'opacity-30' : ''}`}>
                      <p className={`text-sm font-bold ${isActive ? 'text-white' : isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                        {step.label}
                      </p>
                      {isActive && step.key === 'pendiente' && (
                        <p className="text-xs text-amber-400/70 mt-0.5">El restaurante está revisando tu pedido...</p>
                      )}
                      {isActive && step.key === 'en_cocina' && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-xs text-orange-400/70 mt-0.5"
                        >
                          🔥 Tu pedido se está preparando ahora mismo
                        </motion.p>
                      )}
                      {isActive && step.key === 'listo' && (
                        <motion.p
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-xs text-emerald-400/70 mt-0.5"
                        >
                          ✅ ¡Puedes pasar a recoger tu pedido!
                        </motion.p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── ORDER DETAILS ─── */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Detalle del pedido</h2>
          <div className="space-y-1.5">
            {(order.items as any[]).map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-300">
                  {item.quantity}× {item.name}
                </span>
                <span className="text-slate-500">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3 mt-3 border-t border-slate-800 font-bold">
            <span className="text-amber-400">Total</span>
            <span className="text-amber-400">{formatPrice(order.total)}</span>
          </div>
          {order.customer_name && (
            <div className="mt-3 pt-3 border-t border-slate-800/50 text-xs text-slate-500 space-y-0.5">
              <p>👤 {order.customer_name}</p>
              {order.customer_table && <p>🪑 Mesa: {order.customer_table}</p>}
              {order.payment_method && <p>💳 {order.payment_method.toUpperCase()}</p>}
            </div>
          )}
        </div>

        {/* ─── CUENTA ABIERTA: ADD MORE BUTTON ─── */}
        {canAddMore && (
          <motion.button
            onClick={handleAddMore}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: '#F59E0B',
              color: '#000',
              boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
            }}
          >
            <Plus size={20} />
            Agregar más platillos / bebidas
          </motion.button>
        )}

        {/* Completed state */}
        {isCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-4"
          >
            <p className="text-6xl mb-3">🎉</p>
            <p className="text-lg font-bold" style={{ fontFamily: "'Lora', serif" }}>¡Buen provecho!</p>
            <p className="text-sm text-slate-500 mt-1">Gracias por tu pedido. ¡Esperamos verte pronto!</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
