import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'wouter';
import { supabase } from '@/lib/supabase';
import { formatPrice, ORDER_STATUS_CONFIG } from '@/lib/types';
import { toast } from 'sonner';
import {
  LogOut, ChefHat, CheckCircle2, Clock, RefreshCw,
  Plus, Minus, ShoppingCart, X, AlertTriangle, Shield,
  User, Lock, Eye, EyeOff, Zap, UtensilsCrossed,
  Bell, CreditCard, Banknote, Smartphone
} from 'lucide-react';
import { useKitchenBell } from '@/hooks/useKitchenBell';
import TablesMapPanel from '@/components/TablesMapPanel';

// ─── StaffTablesMap: wrapper ligero para meseros ───
function StaffTablesMap({ tenant }: { tenant: { id: string; slug: string; name: string } }) {
  return (
    <div>
      <h2 className="text-sm font-black text-white mb-4 flex items-center gap-2">
        Estado de Mesas
      </h2>
      <TablesMapPanel tenant={tenant} />
    </div>
  );
}

// ─── Types ───
interface StaffMember {
  id: string;
  tenant_id: string;
  name: string;
  username: string;
  password_hash: string;
  role: string;
  is_active: boolean;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  admin_pin?: string;
  sinpe_phone?: string;
  whatsapp_phone?: string;
}

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  // V22.0: Modifier Groups
  selectedModifiers?: { group_name: string; option_name: string; price_adjustment: number }[];
  modifiersTotal?: number;
}

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  customer_table?: string;
  items: OrderItem[];
  total: number;
  status: string;
  payment_method?: string;
  payment_status?: string;
  handled_by?: string;
  handled_by_name?: string;
  created_at: string;
  accepted_at?: string;
  ready_at?: string;
  quick_request_type?: 'water_ice' | 'napkins' | 'help' | null;
  quick_request_at?: string | null;
  quick_request_seen_by_staff?: boolean;
  // V26.0: Ownership
  claimed_by_staff_id?: string | null;
  claimed_by_name?: string | null;
  claimed_at?: string | null;
  quick_request_claimed_by?: string | null;
  quick_request_claimed_at?: string | null;
}

const QUICK_REQUEST_LABELS: Record<'water_ice' | 'napkins' | 'help', string> = {
  water_ice: 'Agua / Hielo',
  napkins: 'Servilletas',
  help: 'Ayuda',
};

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id: string;
  is_available: boolean;
  image_url?: string;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

// ─── PIN Modal ───
function PinModal({ onConfirm, onCancel, adminPin }: { onConfirm: () => void; onCancel: () => void; adminPin: string }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (pin === adminPin) { onConfirm(); }
    else { setError(true); setPin(''); setTimeout(() => setError(false), 1500); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-yellow-500/30 rounded-3xl p-6 w-full max-w-xs shadow-2xl">
        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Shield size={24} className="text-yellow-400" />
          </div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">PIN de Administrador</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Ingresa el PIN para cancelar este pedido</p>
        </div>
        <input
          type="password"
          maxLength={4}
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="••••"
          autoFocus
          className={`w-full px-4 py-3 bg-[var(--bg-surface)] border rounded-xl text-center text-2xl font-bold text-[var(--text-primary)] tracking-widest focus:outline-none mb-3 transition-colors ${error ? 'border-red-500 bg-red-500/10' : 'border-[var(--border)] focus:border-yellow-500'}`}
        />
        {error && <p className="text-xs text-red-400 text-center mb-3">PIN incorrecto</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-xl text-sm font-bold hover:bg-slate-600 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={pin.length !== 4}
            className="flex-1 py-2.5 bg-yellow-500 text-black rounded-xl text-sm font-bold hover:bg-yellow-400 transition-colors disabled:opacity-40">
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Add Modal ───
function QuickAddModal({
  tenant, staff, categories, items, onClose, onOrderCreated
}: {
  tenant: Tenant;
  staff: StaffMember;
  categories: Category[];
  items: MenuItem[];
  onClose: () => void;
  onOrderCreated: () => void;
}) {
  const [selectedCat, setSelectedCat] = useState<string>(categories[0]?.id || '');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [tableName, setTableName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [placing, setPlacing] = useState(false);

  const filteredItems = items.filter(i => i.category_id === selectedCat && i.is_available);
  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0).map(([id, qty]) => {
    const item = items.find(i => i.id === id)!;
    return { ...item, quantity: qty };
  });
  const total = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);

  const addItem = (id: string) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const removeItem = (id: string) => setCart(c => {
    const next = { ...c, [id]: (c[id] || 0) - 1 };
    if (next[id] <= 0) delete next[id];
    return next;
  });

  const handlePlace = async () => {
    if (cartItems.length === 0) { toast.error('Agrega al menos un producto'); return; }
    setPlacing(true);
    // Get next order number
    const { data: lastOrder } = await supabase
      .from('orders').select('order_number').eq('tenant_id', tenant.id)
      .order('order_number', { ascending: false }).limit(1).single();
    const nextNum = (lastOrder?.order_number || 0) + 1;

    const { error } = await supabase.from('orders').insert({
      tenant_id: tenant.id,
      order_number: nextNum,
      customer_name: customerName.trim() || `Mesa ${tableName || '?'}`,
      customer_table: tableName.trim() || null,
      items: cartItems.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
      subtotal: total,
      total,
      status: 'en_cocina',
      payment_method: 'efectivo',
      payment_status: 'pending',
      handled_by: staff.id,
      handled_by_name: staff.name,
    });
    if (error) { toast.error('Error al crear pedido: ' + error.message); }
    else { toast.success(`Pedido #${nextNum} enviado a cocina`); onOrderCreated(); onClose(); }
    setPlacing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-card">
        <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Zap size={16} className="text-amber-400" /> Quick Add
        </h2>
        <button onClick={onClose} className="p-2 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: categories + items */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Table / name inputs */}
          <div className="flex gap-2 px-3 py-2 border-b border-[var(--border)]">
            <input value={tableName} onChange={e => setTableName(e.target.value)} placeholder="Mesa #"
              className="w-20 px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-amber-500" />
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre cliente (opcional)"
              className="flex-1 px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-amber-500" />
          </div>

          {/* Category tabs */}
          <div className="flex overflow-x-auto gap-1 px-3 py-2 border-b border-[var(--border)] scrollbar-hide">
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${selectedCat === cat.id ? 'bg-amber-500 text-black' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'}`}>
                {cat.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
            {filteredItems.map(item => (
              <button key={item.id} onClick={() => addItem(item.id)}
                className="relative p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-left hover:border-amber-500/40 transition-all active:scale-95">
                {cart[item.id] > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-amber-500 text-black text-xs font-bold rounded-full flex items-center justify-center">
                    {cart[item.id]}
                  </span>
                )}
                <p className="text-xs font-bold text-[var(--text-primary)] leading-tight pr-5">{item.name}</p>
                <p className="text-xs text-amber-400 font-bold mt-1">{formatPrice(item.price)}</p>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <p className="col-span-2 text-center text-[var(--text-secondary)] text-xs py-8">Sin productos disponibles</p>
            )}
          </div>
        </div>

        {/* Right: cart */}
        <div className="w-48 flex flex-col border-l border-[var(--border)] bg-card/60">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <p className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1"><ShoppingCart size={12} /> Carrito</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {cartItems.length === 0 ? (
              <p className="text-center text-slate-600 text-xs py-6">Vacío</p>
            ) : cartItems.map(item => (
              <div key={item.id} className="flex items-center gap-1 bg-[var(--bg-surface)] rounded-lg px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-primary)] truncate leading-tight">{item.name}</p>
                  <p className="text-xs text-amber-400">{formatPrice(item.price * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => removeItem(item.id)} className="w-5 h-5 bg-[var(--bg-surface)] rounded text-[var(--text-primary)] text-xs flex items-center justify-center hover:bg-red-500/40">
                    <Minus size={10} />
                  </button>
                  <span className="text-xs text-[var(--text-primary)] w-4 text-center">{item.quantity}</span>
                  <button onClick={() => addItem(item.id)} className="w-5 h-5 bg-[var(--bg-surface)] rounded text-[var(--text-primary)] text-xs flex items-center justify-center hover:bg-green-500/40">
                    <Plus size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-[var(--border)]">
            <p className="text-xs font-bold text-amber-400 mb-2">Total: {formatPrice(total)}</p>
            <button onClick={handlePlace} disabled={placing || cartItems.length === 0}
              className="w-full py-2.5 bg-amber-500 text-black rounded-xl text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-40">
                  {placing ? 'Enviando...' : 'A Cocina'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Staff Login ───
function StaffLogin({ tenant, onLogin }: { tenant: Tenant; onLogin: (member: StaffMember) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) { setError('Completa todos los campos'); return; }
    setLoading(true);
    setError('');
    const { data, error: dbErr } = await supabase
      .from('staff')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('username', username.trim().toLowerCase())
      .eq('is_active', true)
      .single();

    if (dbErr || !data) { setError('Usuario no encontrado o inactivo'); setLoading(false); return; }
    const expectedHash = btoa(password);
    if (data.password_hash !== expectedHash) { setError('Contraseña incorrecta'); setLoading(false); return; }
    toast.success(`Bienvenido, ${data.name}`);
    onLogin(data as StaffMember);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <UtensilsCrossed size={28} className="text-[var(--text-primary)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{tenant.name}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Panel de Meseros</p>
        </div>

        <div className="bg-card border border-[var(--border)] rounded-3xl p-6 space-y-4">
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Usuario</label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="tu_usuario"
                className="w-full pl-9 pr-3 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)] mb-1 block">Contraseña</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="••••••"
                className="w-full pl-9 pr-10 py-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-amber-500"
              />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-secondary)]">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="w-full py-3 bg-amber-500 text-black rounded-xl text-sm font-bold hover:bg-amber-400 transition-colors disabled:opacity-50">
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Staff Kanban ───
function StaffKanban({ tenant, staff, onLogout }: { tenant: Tenant; staff: StaffMember; onLogout: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [pinModal, setPinModal] = useState<{ orderId: string } | null>(null);
  const [paymentTab, setPaymentTab] = useState<'active' | 'cobrar' | 'cobrados' | 'mesas'>('active');
  const [staffPayModal, setStaffPayModal] = useState<{ orderId: string; orderNumber: number } | null>(null);
  const [staffPayMethod, setStaffPayMethod] = useState<string>('efectivo');
  const { playBell } = useKitchenBell();
  const prevCountRef = useRef(0);

  // ─── V21.0: Smart Bill Alert ───
  const [billAlert, setBillAlert] = useState<{
    orderId: string;
    orderNumber: number;
    tableNumber: string;
    paymentMethod: string;
  } | null>(null);
  const [quickRequestAlert, setQuickRequestAlert] = useState<{
    orderId: string;
    orderNumber: number;
    tableNumber: string;
    requestType: 'water_ice' | 'napkins' | 'help';
  } | null>(null);

  // ─── Wake Lock ───
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) {
      console.log('Wake Lock API no soportada en este dispositivo');
      return;
    }
    try {
      const sentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener('release', () => {
        setWakeLockActive(false);
      });
    } catch (err) {
      console.log('Wake Lock no disponible:', err);
      setWakeLockActive(false);
    }
  };

  useEffect(() => {
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wakeLockRef.current?.release();
    };
  }, []);

  const ACTIVE_STATUSES = ['pendiente', 'en_cocina', 'listo', 'entregado'];

  const handleMarkPaid = async (orderId: string, paymentMethod?: string) => {
    const payload: Record<string, string> = { payment_status: 'paid', handled_by: staff.id, handled_by_name: staff.name };
    if (paymentMethod) payload.payment_method = paymentMethod;
    await supabase.from('orders').update(payload).eq('id', orderId);
    setStaffPayModal(null);
    fetchOrders();
    toast.success('Cobro registrado');
  };

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('status', ACTIVE_STATUSES)
      .in('delivery_type', ['dine_in', 'takeout'])
      .order('created_at', { ascending: false })
      .limit(80);
    const newOrders = (data as Order[]) || [];
    // Bell on new order
    if (newOrders.length > prevCountRef.current && prevCountRef.current > 0) {
      playBell();
      toast.success('¡Nuevo pedido recibido!', { duration: 6000 });
    }
    prevCountRef.current = newOrders.length;
    setOrders(newOrders);
    setLoading(false);
  }, [tenant.id]);

  const fetchMenuData = useCallback(async () => {
    const [catRes, itemsRes] = await Promise.all([
      supabase.from('categories').select('*').eq('tenant_id', tenant.id).order('sort_order'),
      supabase.from('menu_items').select('*').eq('tenant_id', tenant.id).eq('is_available', true).order('sort_order'),
    ]);
    setCategories(catRes.data || []);
    setItems(itemsRes.data || []);
  }, [tenant.id]);

  useEffect(() => { fetchOrders(); fetchMenuData(); }, [fetchOrders, fetchMenuData]);
  useEffect(() => {
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // ─── V21.0: Listener Realtime para bill_requested ───
  useEffect(() => {
    const channel = supabase
      .channel(`staff-bill-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          // Solo disparar si bill_requested acaba de cambiar a true
          if (updated.bill_requested === true && payload.old?.bill_requested === false) {
            playBell();
            // Vibrar 3 veces si está disponible
            if ('vibrate' in navigator) {
              navigator.vibrate([400, 150, 400, 150, 400]);
            }
            setBillAlert({
              orderId: updated.id,
              orderNumber: updated.order_number,
              tableNumber: updated.customer_table || 'Sin mesa',
              paymentMethod: updated.payment_method || 'efectivo',
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant.id, playBell]);

  useEffect(() => {
    const channel = supabase
      .channel(`staff-quick-requests-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        (payload) => {
          const updated = payload.new as Order;
          const previous = payload.old as Partial<Order>;
          if (!updated.quick_request_type) return;

          const becameNewRequest =
            updated.quick_request_type !== previous.quick_request_type ||
            previous.quick_request_seen_by_staff === true;
          if (!becameNewRequest || updated.quick_request_seen_by_staff === true) return;

          playBell();
          if ('vibrate' in navigator) navigator.vibrate([250, 120, 250]);
          setQuickRequestAlert({
            orderId: updated.id,
            orderNumber: updated.order_number,
            tableNumber: updated.customer_table || 'Sin mesa',
            requestType: updated.quick_request_type,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant.id, playBell]);

  const acknowledgeQuickRequest = async () => {
    if (!quickRequestAlert) return;
    const now = new Date().toISOString();
    await supabase
      .from('orders')
      .update({
        quick_request_seen_by_staff: true,
        quick_request_claimed_by: staff.name,
        quick_request_claimed_at: now,
        updated_at: now,
      })
      .eq('id', quickRequestAlert.orderId);
    // Log event
    const orderForLog = orders.find(o => o.id === quickRequestAlert.orderId);
    if (orderForLog) await logStaffEvent('quick_request_attended', orderForLog, { request_type: quickRequestAlert.requestType });
    setQuickRequestAlert(null);
    fetchOrders();
  };

  // ─── V26.0: Log staff event ───
  const logStaffEvent = async (eventType: string, order: Order, extraMeta?: Record<string, any>) => {
    const now = new Date();
    let responseTimeSec: number | null = null;
    if (eventType === 'order_accepted' && order.created_at) {
      responseTimeSec = Math.floor((now.getTime() - new Date(order.created_at).getTime()) / 1000);
    } else if (eventType === 'order_ready' && order.accepted_at) {
      responseTimeSec = Math.floor((now.getTime() - new Date(order.accepted_at).getTime()) / 1000);
    } else if (eventType === 'order_delivered' && order.ready_at) {
      responseTimeSec = Math.floor((now.getTime() - new Date(order.ready_at).getTime()) / 1000);
    } else if (eventType === 'quick_request_attended' && order.quick_request_at) {
      responseTimeSec = Math.floor((now.getTime() - new Date(order.quick_request_at).getTime()) / 1000);
    }
    await supabase.from('staff_events').insert({
      tenant_id: tenant.id,
      staff_id: staff.id,
      staff_name: staff.name,
      event_type: eventType,
      order_id: order.id,
      order_number: order.order_number,
      table_number: order.customer_table || null,
      response_time_seconds: responseTimeSec,
      metadata: { status_from: order.status, ...extraMeta },
    });
  };

  const handleAdvanceStatus = async (order: Order) => {
    const statusFlow: Record<string, string> = {
      pendiente: 'en_cocina',
      en_cocina: 'listo',
      listo: 'entregado',
    };
    const next = statusFlow[order.status];
    if (!next) return;
    const now = new Date().toISOString();
    const updateData: Record<string, any> = {
      status: next,
      handled_by: staff.id,
      handled_by_name: staff.name,
    };
    if (next === 'en_cocina') {
      updateData.accepted_at = now;
      // V26.0: Claim ownership when accepting
      updateData.claimed_by_staff_id = staff.id;
      updateData.claimed_by_name = staff.name;
      updateData.claimed_at = now;
    }
    if (next === 'listo') updateData.ready_at = now;
    if (next === 'entregado') updateData.completed_at = now;
    await supabase.from('orders').update(updateData).eq('id', order.id);
    // Liberar mesa automáticamente cuando se entrega (dine_in)
    if (next === 'entregado' && (order as any).delivery_type !== 'delivery') {
      supabase
        .from('restaurant_tables')
        .update({ is_occupied: false, current_order_id: null, occupied_at: null })
        .eq('current_order_id', order.id)
        .then(() => console.info('[Tables] Mesa liberada por mesero'));
    }
    // Log event
    const eventMap: Record<string, string> = { en_cocina: 'order_accepted', listo: 'order_ready', entregado: 'order_delivered' };
    if (eventMap[next]) await logStaffEvent(eventMap[next], order);
    fetchOrders();
    toast.success(`Pedido #${order.order_number} → ${ORDER_STATUS_CONFIG[next as keyof typeof ORDER_STATUS_CONFIG]?.label || next}`);
  };

  const handleCancelWithPin = async (orderId: string) => {
    if (!tenant.admin_pin) {
      toast.error('El admin no ha configurado el PIN de seguridad');
      return;
    }
    setPinModal({ orderId });
  };

  const confirmCancel = async () => {
    if (!pinModal) return;
    await supabase.from('orders').update({ status: 'cancelado', handled_by: staff.id, handled_by_name: staff.name }).eq('id', pinModal.orderId);
    setPinModal(null);
    fetchOrders();
    toast.success('Pedido cancelado');
  };

  const columns = [
    { key: 'pendiente', label: 'Nuevos', color: 'text-blue-400', bg: 'border-blue-500/30' },
    { key: 'en_cocina', label: 'En Cocina', color: 'text-orange-400', bg: 'border-orange-500/30' },
    { key: 'listo', label: 'Listos', color: 'text-green-400', bg: 'border-green-500/30' },
  ];

  const getActionLabel = (status: string) => {
    if (status === 'pendiente') return 'A Cocina';
    if (status === 'en_cocina') return 'Listo';
    if (status === 'listo') return 'Entregado';
    return '';
  };

  const elapsedMin = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);

  // ─── Mute state ───
  // ─── Stats del turno ───
  const [staffStats, setStaffStats] = useState<{ delivered: number; revenue: number; avgMin: number } | null>(null);
  useEffect(() => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    supabase.from('staff_events')
      .select('event_type, response_time_seconds, metadata')
      .eq('tenant_id', tenant.id)
      .eq('staff_id', staff.id)
      .eq('event_type', 'order_delivered')
      .gte('created_at', todayStart.toISOString())
      .then(({ data }) => {
        if (!data) return;
        const delivered = data.length;
        const times = data.map(d => d.response_time_seconds).filter(Boolean) as number[];
        const avgMin = times.length ? Math.round(times.reduce((a,b) => a+b,0) / times.length / 60) : 0;
        setStaffStats({ delivered, revenue: 0, avgMin });
      });
  }, [orders.length]);

  const [mutedUntil, setMutedUntil] = useState<Date | null>(null);
  const isMuted = mutedUntil ? new Date() < mutedUntil : false;
  const muteFor = (minutes: number) => {
    const until = new Date(Date.now() + minutes * 60 * 1000);
    setMutedUntil(until);
    toast.success(`Alertas silenciadas por ${minutes} min`);
  };
  const unmute = () => { setMutedUntil(null); toast.success('Alertas reactivadas'); };

  // ─── Asistencias activas ───
  const activeAssistances = orders.filter(o =>
    o.quick_request_type && !o.quick_request_seen_by_staff
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0a0f1a', color: '#e2e8f0' }}>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b"
        style={{ backgroundColor: 'rgba(10,15,26,0.97)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)', boxShadow: '0 4px 12px rgba(245,158,11,0.35)' }}>
            <UtensilsCrossed size={16} className="text-black" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black truncate leading-none text-white">{tenant.name}</h1>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: '#64748b' }}>
              👤 {staff.name}
              {wakeLockActive && <span className="ml-2 text-emerald-400">● activo</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Mute button */}
          {isMuted ? (
            <button onClick={unmute}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all"
              style={{ backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}>
              <Bell size={12} />
              <span>Silenciado</span>
            </button>
          ) : (
            <div className="relative group">
              <button className="w-9 h-9 rounded-xl flex items-center justify-center transition-all border"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}>
                <Bell size={15} />
              </button>
              {/* Mute dropdown */}
              <div className="absolute right-0 top-full mt-1 w-44 rounded-2xl border shadow-2xl hidden group-hover:block z-50"
                style={{ backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.08)' }}>
                {[5, 15, 60].map(m => (
                  <button key={m} onClick={() => muteFor(m)}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 transition-all first:rounded-t-2xl last:rounded-b-2xl"
                    style={{ color: '#94a3b8' }}>
                    Silenciar {m} min
                  </button>
                ))}
                <button onClick={() => muteFor(480)}
                  className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-white/5 transition-all rounded-b-2xl border-t"
                  style={{ color: '#f87171', borderColor: 'rgba(255,255,255,0.06)' }}>
                  Silenciar turno
                </button>
              </div>
            </div>
          )}
          <button onClick={fetchOrders}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all border"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}>
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowQuickAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)', color: '#000', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
            <Plus size={13} /><span>Agregar</span>
          </button>
          <button onClick={onLogout}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all border hover:bg-red-500/20 hover:text-red-400"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* ── STATS DEL TURNO ── */}
      {staffStats && staffStats.delivered > 0 && (
        <div className="mx-3 mt-3 rounded-2xl px-4 py-3 flex items-center justify-between gap-2"
          style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>Entregados hoy</p>
            <p className="text-xl font-black" style={{ color: '#F59E0B' }}>{staffStats.delivered}</p>
          </div>
          <div className="w-px h-8" style={{ backgroundColor: 'rgba(245,158,11,0.2)' }} />
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>Tiempo prom.</p>
            <p className="text-xl font-black" style={{ color: '#F59E0B' }}>{staffStats.avgMin}m</p>
          </div>
          <div className="w-px h-8" style={{ backgroundColor: 'rgba(245,158,11,0.2)' }} />
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#64748b' }}>Activos ahora</p>
            <p className="text-xl font-black" style={{ color: '#F59E0B' }}>
              {orders.filter(o => ['pendiente','en_cocina','listo'].includes(o.status)).length}
            </p>
          </div>
        </div>
      )}

      {/* ── TABS ── */}
      <div className="flex px-3 pt-3 pb-1 gap-1.5">
        {([
          { key: 'active', label: 'Activos', count: orders.filter(o => ['pendiente','en_cocina','listo'].includes(o.status)).length },
          { key: 'cobrar', label: 'Por Cobrar', count: orders.filter(o => o.status === 'entregado' && o.payment_status !== 'paid').length },
          { key: 'cobrados', label: 'Cobrados', count: orders.filter(o => o.payment_status === 'paid').length },
          { key: 'mesas', label: 'Mesas', count: 0 },
        ] as const).map(tab => {
          const isActive = paymentTab === (tab.key as string);
          return (
            <button key={tab.key} onClick={() => setPaymentTab(tab.key as any)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-black transition-all"
              style={{
                background: isActive ? 'linear-gradient(135deg, #F59E0B, #F97316)' : 'rgba(255,255,255,0.04)',
                color: isActive ? '#000' : '#64748b',
                border: isActive ? 'none' : '1px solid rgba(255,255,255,0.06)',
                boxShadow: isActive ? '0 4px 14px rgba(245,158,11,0.3)' : 'none',
              }}>
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black"
                style={{ backgroundColor: isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)', color: isActive ? '#000' : '#64748b' }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── ASISTENCIAS ACTIVAS ── */}
      {activeAssistances.length > 0 && paymentTab === 'active' && (
        <div className="mx-3 mt-3 rounded-2xl overflow-hidden border-2" style={{ borderColor: 'rgba(34,197,94,0.4)', backgroundColor: 'rgba(34,197,94,0.06)' }}>
          <div className="px-4 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400">
              Asistencias activas ({activeAssistances.length})
            </h2>
          </div>
          <div className="p-3 space-y-2">
            {activeAssistances.map(order => (
              <div key={order.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl flex-shrink-0">
                    {order.quick_request_type === 'water_ice' ? 'Agua' : order.quick_request_type === 'napkins' ? 'Serv.' : 'Ayuda'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white leading-none">
                      {QUICK_REQUEST_LABELS[order.quick_request_type!]}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>
                      {order.customer_table ? order.customer_table : `#${order.order_number}`}
                      {order.customer_name ? ` · ${order.customer_name}` : ''}
                      {order.quick_request_at ? ` · hace ${elapsedMin(order.quick_request_at)}m` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const now = new Date().toISOString();
                    await supabase.from('orders').update({
                      quick_request_seen_by_staff: true,
                      quick_request_claimed_by: staff.name,
                      quick_request_claimed_at: now,
                    }).eq('id', order.id);
                    fetchOrders();
                      toast.success('Asistencia atendida');
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-black flex-shrink-0 transition-all active:scale-95"
                  style={{ backgroundColor: '#22c55e', color: '#052e16' }}>
                  Atendido
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CONTENIDO PRINCIPAL ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        </div>
      ) : paymentTab === 'cobrar' || paymentTab === 'cobrados' ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {(() => {
            const cobrarOrders = paymentTab === 'cobrar'
              ? orders.filter(o => o.status === 'entregado' && o.payment_status !== 'paid')
              : orders.filter(o => o.payment_status === 'paid');
            if (cobrarOrders.length === 0) return (
              <p className="text-center text-sm py-16" style={{ color: '#475569' }}>
                {paymentTab === 'cobrar' ? 'Sin cuentas pendientes' : 'Sin cobros registrados'}
              </p>
            );
            return cobrarOrders.map(order => (
              <div key={order.id} className="rounded-2xl border overflow-hidden"
                style={{ backgroundColor: '#111827', borderColor: 'rgba(255,255,255,0.07)' }}>
                {/* Card header */}
                <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-white">#{order.order_number}</span>
                    {order.customer_table && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                        {order.customer_table}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold" style={{ color: '#475569' }}>
                    {new Date(order.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  {order.customer_name && <p className="text-sm font-bold text-white">{order.customer_name}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black" style={{ color: '#F59E0B' }}>{formatPrice(order.total)}</span>
                    {order.payment_method && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-black"
                        style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {order.payment_method === 'sinpe' ? 'SINPE' : order.payment_method === 'tarjeta' ? 'Tarjeta' : order.payment_method === 'efectivo' ? 'Efectivo' : order.payment_method || 'Tipo de pago'}
                      </span>
                    )}
                  </div>
                  {order.payment_status === 'paid' ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <CheckCircle2 size={14} className="text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400">Pagado</span>
                    </div>
                  ) : (
                    <button onClick={() => { setStaffPayMethod(order.payment_method || 'efectivo'); setStaffPayModal({ orderId: order.id, orderNumber: order.order_number }); }}
                      className="w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}>
                      <CheckCircle2 size={16} /> Registrar cobro
                    </button>
                  )}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {columns.map(col => {
            const colOrders = orders.filter(o => o.status === col.key);
            if (colOrders.length === 0) return null;
            const colAccent = col.key === 'pendiente' ? '#3b82f6' : col.key === 'en_cocina' ? '#f97316' : '#22c55e';
            return (
              <div key={col.key} className="rounded-2xl overflow-hidden"
                style={{ border: `1.5px solid ${colAccent}25`, backgroundColor: `${colAccent}06` }}>
                {/* Column header */}
                <div className="px-4 py-2.5 flex items-center justify-between border-b"
                  style={{ borderColor: `${colAccent}18` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colAccent }} />
                    <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: colAccent }}>{col.label}</h2>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                    style={{ backgroundColor: `${colAccent}18`, color: colAccent }}>{colOrders.length}</span>
                </div>
                {/* Orders */}
                <div className="p-3 space-y-2.5">
                  {colOrders.map(order => {
                    const elapsed = elapsedMin(order.created_at);
                    const isUrgent = elapsed >= 15;
                    const hasAssistance = !!order.quick_request_type && !order.quick_request_seen_by_staff;
                    return (
                      <div key={order.id} className="rounded-2xl overflow-hidden transition-all"
                        style={{
                          backgroundColor: isUrgent ? 'rgba(239,68,68,0.07)' : '#111827',
                          border: hasAssistance ? '2px solid rgba(34,197,94,0.5)' : isUrgent ? '1.5px solid rgba(239,68,68,0.3)' : '1.5px solid rgba(255,255,255,0.07)',
                          boxShadow: hasAssistance ? '0 0 16px rgba(34,197,94,0.15)' : isUrgent ? '0 4px 20px rgba(239,68,68,0.12)' : '0 2px 12px rgba(0,0,0,0.3)',
                        }}>
                        {/* Card header */}
                        <div className="px-4 py-3 flex items-center justify-between border-b"
                          style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Número de pedido — GRANDE Y VISIBLE */}
                            <span className="text-lg font-black text-white leading-none">#{order.order_number}</span>
                            {/* Mesa */}
                            {order.customer_table && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-black"
                                style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
                                {order.customer_table}
                              </span>
                            )}
                            {/* Canal */}
                            {(order as any).delivery_type && (order as any).delivery_type !== 'dine_in' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                                style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}>
                                {(order as any).delivery_type === 'delivery' ? 'Delivery' : 'Takeout'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {hasAssistance && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse"
                                style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>
                                Asistencia
                              </span>
                            )}
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${isUrgent ? 'text-red-400' : ''}`}
                              style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)', color: isUrgent ? '#f87171' : '#64748b' }}>
                              <Clock size={9} /> {elapsed}m
                            </span>
                          </div>
                        </div>
                        {/* Card body */}
                        <div className="px-4 py-3 space-y-2.5">
                          {/* Cliente */}
                          {order.customer_name && (
                            <p className="text-sm font-bold text-white">{order.customer_name}</p>
                          )}
                          {/* Ownership */}
                          {order.claimed_by_name && (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <User size={8} className="inline mr-1" />{order.claimed_by_name}{order.claimed_by_name === staff.name ? ' (tú)' : ''}
                              </span>
                            </div>
                          )}
                          {/* Items */}
                          <div className="rounded-xl px-3 py-2.5 space-y-1.5"
                            style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {((order.items || []) as OrderItem[]).map((item, i) => (
                              <div key={i}>
                                <div className="flex justify-between text-[13px]">
                                  <span className="font-bold text-white">{item.quantity}× {item.name}</span>
                                  <span className="flex-shrink-0 ml-2" style={{ color: '#64748b' }}>
                                    {formatPrice((item.price + (item.modifiersTotal ?? 0)) * item.quantity)}
                                  </span>
                                </div>
                                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                  <div className="pl-3 mt-0.5 space-y-0.5">
                                    {item.selectedModifiers.map((mod, mi) => (
                                      <p key={mi} className="text-[10px] text-amber-400/70">
                                        └ {mod.option_name}{mod.price_adjustment > 0 ? ` +${formatPrice(mod.price_adjustment)}` : ''}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {/* Total + método */}
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-lg font-black" style={{ color: '#F59E0B' }}>{formatPrice(order.total)}</span>
                            {order.payment_method && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-black"
                                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.07)' }}>
                                {order.payment_method === 'sinpe' ? 'SINPE' : order.payment_method === 'tarjeta' ? 'Tarjeta' : order.payment_method === 'efectivo' ? 'Efectivo' : order.payment_method || 'Tipo de pago'}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Card footer — Acciones */}
                        <div className="px-4 pb-3 flex gap-2">
                          {order.status !== 'entregado' && (
                            <button onClick={() => handleAdvanceStatus(order)}
                              className="flex-1 py-3.5 rounded-xl text-sm font-black transition-all active:scale-95"
                              style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)', color: '#000', boxShadow: '0 6px 16px rgba(245,158,11,0.35)' }}>
                              {getActionLabel(order.status)}
                            </button>
                          )}
                          {order.status === 'entregado' && order.payment_status !== 'paid' && (
                            <button onClick={() => { setStaffPayMethod(order.payment_method || 'efectivo'); setStaffPayModal({ orderId: order.id, orderNumber: order.order_number }); }}
                              className="flex-1 py-3.5 rounded-xl text-sm font-black transition-all active:scale-95"
                              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', boxShadow: '0 6px 16px rgba(34,197,94,0.35)' }}>
                              Registrar cobro
                            </button>
                          )}
                          <button onClick={() => handleCancelWithPin(order.id)}
                            className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95"
                            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {/* Empty state */}
          {columns.every(col => orders.filter(o => o.status === col.key).length === 0) && (
            <div className="flex flex-col items-center justify-center py-24" style={{ color: '#1e293b' }}>
              <ChefHat size={44} className="mb-3 opacity-20" />
              <p className="text-sm font-semibold text-slate-600">Sin pedidos activos</p>
              <p className="text-xs mt-1 text-slate-700">Los nuevos pedidos aparecerán aquí</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Mesas */}
      {paymentTab === 'mesas' && (
        <div className="flex-1 overflow-y-auto p-4">
          <StaffTablesMap tenant={tenant} />
        </div>
      )}

      {/* ── Modal de Confirmación de Cobro ── */}
      {staffPayModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setStaffPayModal(null)}>
          <div className="w-full max-w-md rounded-t-2xl p-5 shadow-2xl" style={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-white">Registrar cobro — Pedido #{staffPayModal.orderNumber}</span>
              <button onClick={() => setStaffPayModal(null)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#94a3b8' }}><X size={14} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: '#64748b' }}>Selecciona el método de pago con el que pagó el cliente:</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[{v:'efectivo',l:'Efectivo'},{v:'tarjeta',l:'Tarjeta'},{v:'sinpe',l:'SINPE'},{v:'mixto',l:'Mixto'}].map(({v,l}) => (
                <button key={v} onClick={() => setStaffPayMethod(v)}
                  className="py-3 rounded-xl text-sm font-bold transition-all"
                  style={staffPayMethod === v
                    ? { background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.5)', color: '#4ade80' }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}>{l}</button>
              ))}
            </div>
            <button
              onClick={() => handleMarkPaid(staffPayModal.orderId, staffPayMethod)}
              className="w-full py-3.5 rounded-xl text-sm font-black transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}>
              Confirmar cobro
            </button>
          </div>
        </div>
      )}

      {/* ── MODALES ── */}
      {showQuickAdd && (
        <QuickAddModal tenant={tenant} staff={staff} categories={categories} items={items}
          onClose={() => setShowQuickAdd(false)} onOrderCreated={fetchOrders} />
      )}
      {pinModal && (
        <PinModal adminPin={tenant.admin_pin || ''} onConfirm={confirmCancel} onCancel={() => setPinModal(null)} />
      )}

      {/* ── BILL ALERT MODAL ── */}
      {billAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ backgroundColor: '#0f172a', border: '2px solid #F59E0B', boxShadow: '0 0 60px rgba(245,158,11,0.4)' }}>
            <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #F59E0B, #EF4444, #F59E0B)' }} />
            <div className="p-6 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(245,158,11,0.12)', border: '2px solid rgba(245,158,11,0.3)' }}>
                  <Bell size={36} className="text-amber-400" style={{ animation: 'bounce 0.6s infinite' }} />
                </div>
              </div>
              <h2 className="text-2xl font-black text-white mb-1">¡Mesa {billAlert.tableNumber} pide la cuenta!</h2>
              <p className="text-sm mb-5" style={{ color: '#64748b' }}>Pedido #{billAlert.orderNumber}</p>
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl mb-6 font-bold text-sm"
                style={{
                  backgroundColor: billAlert.paymentMethod === 'sinpe' ? '#6C63FF20' : billAlert.paymentMethod === 'tarjeta' ? '#3B82F620' : '#38A16920',
                  border: `1px solid ${billAlert.paymentMethod === 'sinpe' ? '#6C63FF50' : billAlert.paymentMethod === 'tarjeta' ? '#3B82F650' : '#38A16950'}`,
                  color: billAlert.paymentMethod === 'sinpe' ? '#a78bfa' : billAlert.paymentMethod === 'tarjeta' ? '#60a5fa' : '#6ee7b7',
                }}>
                {billAlert.paymentMethod === 'sinpe' && <><Smartphone size={16} /><span>Verificar comprobante en sistema</span></>}
                {billAlert.paymentMethod === 'tarjeta' && <><CreditCard size={16} /><span>Llevar Datáfono</span></>}
                {billAlert.paymentMethod === 'efectivo' && <><Banknote size={16} /><span>Llevar cambio</span></>}
              </div>
              <button onClick={() => setBillAlert(null)}
                className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95"
                style={{ backgroundColor: '#F59E0B', color: '#000', boxShadow: '0 4px 20px rgba(245,158,11,0.4)' }}>
                Entendido — Voy en camino
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── QUICK REQUEST ALERT MODAL ── */}
      {quickRequestAlert && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ backgroundColor: '#0f172a', border: '2px solid #22c55e', boxShadow: '0 0 60px rgba(34,197,94,0.35)' }}>
            <div className="p-6 text-center">
              <h2 className="text-2xl font-black text-white mb-1">Solicitud rápida de mesa</h2>
              <p className="text-sm mb-1" style={{ color: '#64748b' }}>Mesa {quickRequestAlert.tableNumber}</p>
              <p className="text-sm mb-4" style={{ color: '#64748b' }}>Pedido #{quickRequestAlert.orderNumber}</p>
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl mb-6 font-bold text-sm border"
                style={{ backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#86efac' }}>
                {QUICK_REQUEST_LABELS[quickRequestAlert.requestType]}
              </div>
              <button onClick={acknowledgeQuickRequest}
                className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95"
                style={{ backgroundColor: '#22c55e', color: '#052e16' }}>
                Entendido — Atiendo la mesa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Staff Dashboard ───
export default function StaffDashboard() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [loggedInStaff, setLoggedInStaff] = useState<StaffMember | null>(() => {
    try {
      const stored = localStorage.getItem(`staff_session_${slug}`);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (!slug) return;
    supabase.from('tenants').select('*').eq('slug', slug).single().then(({ data }) => {
      setTenant(data as Tenant);
      setLoadingTenant(false);
    });
  }, [slug]);

  const handleLogin = (member: StaffMember) => {
    localStorage.setItem(`staff_session_${slug}`, JSON.stringify(member));
    setLoggedInStaff(member);
  };

  const handleLogout = () => {
    localStorage.removeItem(`staff_session_${slug}`);
    setLoggedInStaff(null);
  };

  if (loadingTenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">Restaurante no encontrado</h1>
          <p className="text-sm text-[var(--text-secondary)]">El slug "{slug}" no existe.</p>
        </div>
      </div>
    );
  }

  if (!loggedInStaff) {
    return <StaffLogin tenant={tenant} onLogin={handleLogin} />;
  }

  return <StaffKanban tenant={tenant} staff={loggedInStaff} onLogout={handleLogout} />;
}
