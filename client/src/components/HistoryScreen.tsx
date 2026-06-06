/**
 * HistoryScreen — Pantalla de historial de pedidos para el cliente.
 * Muestra los pedidos del cliente en este restaurante.
 * V24.0: Reorden inteligente — permite repetir pedidos usando precios/disponibilidad actuales del menú.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, CheckCircle2, ChevronDown, ChevronUp, Loader2, ShoppingBag, AlertCircle, ChefHat, Bike, RotateCcw, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import { useCart } from '@/contexts/CartContext';
import type { ThemeSettings, Tenant, MenuItem, SelectedModifier } from '@/lib/types';

interface OrderItem {
  id?: string;
  name: string;
  quantity: number;
  price?: number;
  selectedModifiers?: SelectedModifier[];
  modifiersTotal?: number;
}

interface Order {
  id: string;
  order_number: number;
  total: number;
  status: string;
  payment_method: string | null;
  delivery_type: string | null;
  items: OrderItem[];
  created_at: string;
  completed_at: string | null;
}

interface HistoryScreenProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
  onOpenLogin: () => void;
  /** Menú actual del restaurante: se usa para reordenar con disponibilidad/precio vigente */
  allItems?: MenuItem[];
  /** Callback para abrir el carrito después de repetir un pedido */
  onReorderComplete?: () => void;
}

// Estados reales del sistema (en español, igual que OrderStatusPage)
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  // Estados reales del sistema
  pendiente:  { label: 'Pendiente',   color: '#F59E0B', icon: <Clock size={14} /> },
  en_cocina:  { label: 'En cocina',   color: '#3B82F6', icon: <ChefHat size={14} /> },
  listo:      { label: 'Listo',       color: '#10B981', icon: <CheckCircle2 size={14} /> },
  entregado:  { label: 'Entregado',   color: '#6B7280', icon: <CheckCircle2 size={14} /> },
  cancelado:  { label: 'Cancelado',   color: '#EF4444', icon: <AlertCircle size={14} /> },
  // Aliases en inglés por compatibilidad con registros viejos
  pending:    { label: 'Pendiente',   color: '#F59E0B', icon: <Clock size={14} /> },
  accepted:   { label: 'En cocina',   color: '#3B82F6', icon: <ChefHat size={14} /> },
  ready:      { label: 'Listo',       color: '#10B981', icon: <CheckCircle2 size={14} /> },
  completed:  { label: 'Entregado',   color: '#6B7280', icon: <CheckCircle2 size={14} /> },
  cancelled:  { label: 'Cancelado',   color: '#EF4444', icon: <AlertCircle size={14} /> },
  // Delivery
  en_camino:  { label: 'En camino',   color: '#8B5CF6', icon: <Bike size={14} /> },
};

const DELIVERY_LABELS: Record<string, string> = {
  dine_in: '🍽 En mesa',
  takeout: '🥡 Para llevar',
  delivery: '🛵 Delivery',
};

function OrderCard({
  order,
  accentColor,
  textColor,
  onReorder,
  reorderDisabled,
}: {
  order: Order;
  accentColor: string;
  textColor: string;
  onReorder: (order: Order) => void;
  reorderDisabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pendiente;
  const date = new Date(order.created_at);
  const dateStr = date.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
            style={{ background: `${accentColor}22`, color: accentColor }}>
            #{order.order_number}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm" style={{ color: textColor }}>
                ₡{order.total.toLocaleString()}
              </span>
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: `${status.color}22`, color: status.color }}>
                {status.icon}
                {status.label}
              </span>
            </div>
            <div className="text-xs opacity-50 mt-0.5">
              {dateStr} · {timeStr}
              {order.delivery_type && ` · ${DELIVERY_LABELS[order.delivery_type] || order.delivery_type}`}
            </div>
          </div>
        </div>
        <div className="opacity-40">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Acción rápida: pedir de nuevo */}
      <div className="px-4 pb-4 -mt-1">
        <button
          onClick={() => onReorder(order)}
          disabled={reorderDisabled}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
          style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}25` }}
        >
          <RotateCcw size={14} />
          Pedir de nuevo
        </button>
      </div>

      {/* Items expandidos */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 space-y-1.5"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="pt-3 text-xs font-bold uppercase tracking-wider opacity-40 mb-2">
                Detalle del pedido
              </div>
              {(order.items || []).map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="opacity-80">
                    <span className="font-bold" style={{ color: accentColor }}>{item.quantity}×</span> {item.name}
                  </span>
                  {item.price && (
                    <span className="opacity-50 text-xs">₡{(item.price * item.quantity).toLocaleString()}</span>
                  )}
                </div>
              ))}
              {order.payment_method && (
                <div className="text-xs opacity-40 pt-1">
                  Pago: {order.payment_method === 'sinpe' ? 'SINPE Móvil' :
                    order.payment_method === 'efectivo' ? 'Efectivo' :
                    order.payment_method === 'tarjeta' ? 'Tarjeta' : order.payment_method}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HistoryScreen({ isOpen, onClose, theme, tenant, onOpenLogin, allItems = [], onReorderComplete }: HistoryScreenProps) {
  const { profile, isLoading: authLoading } = useCustomerProfile();
  const { addItemAdvanced } = useCart();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const accentColor = theme.primary_color || '#F59E0B';
  const bgColor = theme.background_color || '#0a0a0a';
  const textColor = theme.text_color || '#f0f0f0';

  useEffect(() => {
    if (!isOpen || !profile?.id || !tenant.id) return;
    setLoading(true);
    supabase
      .from('orders')
      .select('id, order_number, total, status, payment_method, delivery_type, items, created_at, completed_at')
      .eq('tenant_id', tenant.id)
      .eq('customer_profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setOrders((data || []) as Order[]);
        setLoading(false);
      });
  }, [isOpen, profile?.id, tenant.id]);

  const handleReorder = async (order: Order) => {
    if (!order.items?.length) {
      toast.error('Este pedido no tiene productos para repetir');
      return;
    }
    setReorderingId(order.id);

    try {
      const ids = Array.from(new Set(order.items.map(i => i.id).filter(Boolean))) as string[];
      let currentItems = allItems;

      // Si el menú actual no trae todos los IDs, se consulta Supabase para rehidratar el pedido.
      const missingIds = ids.filter(id => !currentItems.some(mi => mi.id === id));
      if (missingIds.length > 0) {
        const { data } = await supabase
          .from('menu_items')
          .select('*')
          .eq('tenant_id', tenant.id)
          .in('id', missingIds);
        currentItems = [...currentItems, ...((data || []) as MenuItem[])];
      }

      let added = 0;
      let skipped = 0;

      order.items.forEach(orderItem => {
        const menuItem = orderItem.id
          ? currentItems.find(mi => mi.id === orderItem.id)
          : currentItems.find(mi => mi.name.toLowerCase().trim() === orderItem.name.toLowerCase().trim());

        if (!menuItem || menuItem.is_available === false) {
          skipped += 1;
          return;
        }

        addItemAdvanced(menuItem, {
          quantity: Math.max(1, Number(orderItem.quantity) || 1),
          selectedModifiers: orderItem.selectedModifiers || [],
          modifiersTotal: orderItem.modifiersTotal || 0,
          preventCheckoutUpsell: false,
        });
        added += 1;
      });

      if (added === 0) {
        toast.error('No se pudieron agregar productos disponibles de ese pedido');
        return;
      }

      toast.success(
        skipped > 0
          ? `Se agregaron ${added} productos. ${skipped} no están disponibles.`
          : `Pedido #${order.order_number} agregado al carrito`,
        { duration: 2500 }
      );
      onReorderComplete?.();
    } catch (error: any) {
      console.error('[HistoryScreen] reorder error:', error);
      toast.error('No se pudo repetir el pedido. Intenta de nuevo.');
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          style={{ backgroundColor: bgColor, color: textColor }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-12 pb-4"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2">
              <Clock size={20} style={{ color: accentColor }} />
              <h1 className="text-lg font-black">Mis Pedidos</h1>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {authLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={28} className="animate-spin" style={{ color: accentColor }} />
              </div>
            ) : !profile ? (
              /* No logueado */
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="text-5xl mb-4">🛒</div>
                <div className="font-black text-lg mb-2">Inicia sesión para ver tus pedidos</div>
                <div className="text-sm opacity-50 mb-6">
                  Tu historial de pedidos en {tenant.name} aparecerá aquí.
                </div>
                <button
                  onClick={onOpenLogin}
                  className="px-6 py-3 rounded-2xl font-bold text-sm"
                  style={{ backgroundColor: accentColor, color: '#000' }}>
                  Iniciar sesión
                </button>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={28} className="animate-spin" style={{ color: accentColor }} />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4">
                  <ShoppingBag size={48} style={{ color: accentColor, opacity: 0.4 }} />
                </div>
                <div className="font-bold text-base mb-1">Aún no tienes pedidos</div>
                <div className="text-sm opacity-50">¡Haz tu primer pedido y aparecerá aquí!</div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Shortcut del último pedido */}
                <button
                  onClick={() => handleReorder(orders[0])}
                  disabled={reorderingId === orders[0]?.id}
                  className="w-full rounded-2xl p-4 text-left active:scale-[0.99] transition-all disabled:opacity-60"
                  style={{ background: `${accentColor}16`, border: `1px solid ${accentColor}28` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-black text-sm" style={{ color: accentColor }}>
                        <ShoppingCart size={16} />
                        Repetir mi último pedido
                      </div>
                      <div className="text-xs opacity-55 mt-1">
                        Agrega de nuevo los productos disponibles del pedido #{orders[0].order_number}
                      </div>
                    </div>
                    {reorderingId === orders[0]?.id ? (
                      <Loader2 size={18} className="animate-spin" style={{ color: accentColor }} />
                    ) : (
                      <RotateCcw size={18} style={{ color: accentColor }} />
                    )}
                  </div>
                </button>

                <div className="text-xs opacity-40 mb-1">{orders.length} pedido{orders.length !== 1 ? 's' : ''}</div>
                {orders.map(order => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    accentColor={accentColor}
                    textColor={textColor}
                    onReorder={handleReorder}
                    reorderDisabled={reorderingId === order.id}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
