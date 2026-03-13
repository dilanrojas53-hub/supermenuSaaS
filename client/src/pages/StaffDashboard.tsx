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
}

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
      <div className="bg-slate-900 border border-yellow-500/30 rounded-3xl p-6 w-full max-w-xs shadow-2xl">
        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Shield size={24} className="text-yellow-400" />
          </div>
          <h3 className="text-base font-bold text-white">PIN de Administrador</h3>
          <p className="text-xs text-slate-400 mt-1">Ingresa el PIN para cancelar este pedido</p>
        </div>
        <input
          type="password"
          maxLength={4}
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="••••"
          autoFocus
          className={`w-full px-4 py-3 bg-slate-800 border rounded-xl text-center text-2xl font-bold text-white tracking-widest focus:outline-none mb-3 transition-colors ${error ? 'border-red-500 bg-red-500/10' : 'border-slate-600 focus:border-yellow-500'}`}
        />
        {error && <p className="text-xs text-red-400 text-center mb-3">PIN incorrecto</p>}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 bg-slate-700 text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-600 transition-colors">
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Zap size={16} className="text-amber-400" /> Quick Add
        </h2>
        <button onClick={onClose} className="p-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: categories + items */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Table / name inputs */}
          <div className="flex gap-2 px-3 py-2 border-b border-slate-700/30">
            <input value={tableName} onChange={e => setTableName(e.target.value)} placeholder="Mesa #"
              className="w-20 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500" />
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nombre cliente (opcional)"
              className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500" />
          </div>

          {/* Category tabs */}
          <div className="flex overflow-x-auto gap-1 px-3 py-2 border-b border-slate-700/30 scrollbar-hide">
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setSelectedCat(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${selectedCat === cat.id ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300'}`}>
                {cat.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
            {filteredItems.map(item => (
              <button key={item.id} onClick={() => addItem(item.id)}
                className="relative p-3 bg-slate-800/60 border border-slate-700/40 rounded-xl text-left hover:border-amber-500/40 transition-all active:scale-95">
                {cart[item.id] > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-amber-500 text-black text-xs font-bold rounded-full flex items-center justify-center">
                    {cart[item.id]}
                  </span>
                )}
                <p className="text-xs font-bold text-white leading-tight pr-5">{item.name}</p>
                <p className="text-xs text-amber-400 font-bold mt-1">{formatPrice(item.price)}</p>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <p className="col-span-2 text-center text-slate-500 text-xs py-8">Sin productos disponibles</p>
            )}
          </div>
        </div>

        {/* Right: cart */}
        <div className="w-48 flex flex-col border-l border-slate-700/40 bg-slate-900/60">
          <div className="px-3 py-2 border-b border-slate-700/30">
            <p className="text-xs font-bold text-slate-400 flex items-center gap-1"><ShoppingCart size={12} /> Carrito</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {cartItems.length === 0 ? (
              <p className="text-center text-slate-600 text-xs py-6">Vacío</p>
            ) : cartItems.map(item => (
              <div key={item.id} className="flex items-center gap-1 bg-slate-800/60 rounded-lg px-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate leading-tight">{item.name}</p>
                  <p className="text-xs text-amber-400">{formatPrice(item.price * item.quantity)}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => removeItem(item.id)} className="w-5 h-5 bg-slate-700 rounded text-white text-xs flex items-center justify-center hover:bg-red-500/40">
                    <Minus size={10} />
                  </button>
                  <span className="text-xs text-white w-4 text-center">{item.quantity}</span>
                  <button onClick={() => addItem(item.id)} className="w-5 h-5 bg-slate-700 rounded text-white text-xs flex items-center justify-center hover:bg-green-500/40">
                    <Plus size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-slate-700/30">
            <p className="text-xs font-bold text-amber-400 mb-2">Total: {formatPrice(total)}</p>
            <button onClick={handlePlace} disabled={placing || cartItems.length === 0}
              className="w-full py-2.5 bg-amber-500 text-black rounded-xl text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-40">
              {placing ? 'Enviando...' : '🍳 A Cocina'}
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
            <UtensilsCrossed size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">{tenant.name}</h1>
          <p className="text-sm text-slate-400 mt-1">Panel de Meseros</p>
        </div>

        <div className="bg-slate-900 border border-slate-700/40 rounded-3xl p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Usuario</label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="tu_usuario"
                className="w-full pl-9 pr-3 py-3 bg-slate-800 border border-slate-600 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Contraseña</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="••••••"
                className="w-full pl-9 pr-10 py-3 bg-slate-800 border border-slate-600 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
              <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
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
  const [paymentTab, setPaymentTab] = useState<'active' | 'cobrar' | 'cobrados'>('active');
  const { playBell } = useKitchenBell();
  const prevCountRef = useRef(0);

  // ─── V21.0: Smart Bill Alert ───
  const [billAlert, setBillAlert] = useState<{
    orderId: string;
    orderNumber: number;
    tableNumber: string;
    paymentMethod: string;
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
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener('release', () => {
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

  const handleMarkPaid = async (orderId: string) => {
    await supabase.from('orders').update({ payment_status: 'paid', handled_by: staff.id, handled_by_name: staff.name }).eq('id', orderId);
    fetchOrders();
    toast.success('Pago registrado ✅');
  };

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(80);
    const newOrders = (data as Order[]) || [];
    // Bell on new order
    if (newOrders.length > prevCountRef.current && prevCountRef.current > 0) {
      playBell();
      toast.success('🔔 ¡Nuevo pedido recibido!', { duration: 6000 });
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

  const handleAdvanceStatus = async (order: Order) => {
    const statusFlow: Record<string, string> = {
      pendiente: 'en_cocina',
      en_cocina: 'listo',
      listo: 'entregado',
    };
    const next = statusFlow[order.status];
    if (!next) return;
    const updateData: Record<string, any> = {
      status: next,
      handled_by: staff.id,
      handled_by_name: staff.name,
    };
    if (next === 'en_cocina') updateData.accepted_at = new Date().toISOString();
    if (next === 'listo') updateData.ready_at = new Date().toISOString();
    if (next === 'entregado') updateData.completed_at = new Date().toISOString();
    await supabase.from('orders').update(updateData).eq('id', order.id);
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
    if (status === 'pendiente') return '🍳 A Cocina';
    if (status === 'en_cocina') return '🔔 Listo';
    if (status === 'listo') return '✅ Entregado';
    return '';
  };

  const elapsedMin = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700/40 px-3 py-2.5 flex items-center justify-between sticky top-0 z-30">
        <div className="min-w-0 flex-1 mr-2">
          <h1 className="text-sm font-bold text-white truncate">{tenant.name}</h1>
          <p className="text-xs text-slate-400 truncate">👤 {staff.name}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {wakeLockActive && (
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="App Activa" />
          )}
          <button onClick={fetchOrders} className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowQuickAdd(true)}
            className="flex items-center gap-1 px-2.5 py-2 bg-amber-500 text-black rounded-xl text-xs font-bold hover:bg-amber-400 transition-colors">
            <Plus size={13} /> <span className="hidden xs:inline">Quick Add</span><span className="xs:hidden">Add</span>
          </button>
          <button onClick={onLogout} className="p-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Payment Tabs */}
      <div className="flex px-3 pt-2.5 pb-0 gap-1">
        {[
          { key: 'active', label: 'Activos', emoji: '📊', count: orders.filter(o => ['pendiente','en_cocina','listo'].includes(o.status)).length },
          { key: 'cobrar', label: 'Por Cobrar', emoji: '💰', count: orders.filter(o => o.status === 'entregado' && o.payment_status !== 'paid').length },
          { key: 'cobrados', label: 'Cobrados', emoji: '✅', count: orders.filter(o => o.payment_status === 'paid').length },
        ].map(tab => (
          <button key={tab.key} onClick={() => setPaymentTab(tab.key as any)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-bold transition-all ${
              paymentTab === tab.key
                ? 'bg-amber-500 text-black'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}>
            <span>{tab.emoji}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${
              paymentTab === tab.key ? 'bg-black/20 text-black' : 'bg-slate-700 text-slate-300'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
        </div>
      ) : paymentTab === 'cobrar' || paymentTab === 'cobrados' ? (
        // ─ Vista de cobros ─
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(() => {
            const cobrarOrders = paymentTab === 'cobrar'
              ? orders.filter(o => o.status === 'entregado' && o.payment_status !== 'paid')
              : orders.filter(o => o.payment_status === 'paid');
            if (cobrarOrders.length === 0) return (
              <p className="text-center text-slate-500 text-sm py-16">
                {paymentTab === 'cobrar' ? 'Sin cuentas pendientes 🎉' : 'Sin cobros registrados'}
              </p>
            );
            return cobrarOrders.map(order => (
              <div key={order.id} className="bg-slate-900 border border-slate-700/40 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">#{order.order_number} — {order.customer_name}</span>
                  {order.customer_table && <span className="text-xs text-slate-400">🪑 Mesa {order.customer_table}</span>}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-amber-400">{formatPrice(order.total)}</span>
                  <span className="text-xs text-slate-500 uppercase">{order.payment_method}</span>
                </div>
                {order.payment_status === 'paid' ? (
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <CheckCircle2 size={14} className="text-green-400" />
                    <span className="text-xs font-bold text-green-400">Pagado</span>
                  </div>
                ) : (
                  <button onClick={() => handleMarkPaid(order.id)}
                    className="w-full py-2.5 bg-green-500 text-white rounded-xl text-sm font-bold hover:bg-green-400 transition-colors flex items-center justify-center gap-2">
                    <CheckCircle2 size={16} /> Marcar como Pagado
                  </button>
                )}
              </div>
            ));
          })()}
        </div>
      ) : (
        // ─ Vista Kanban adaptada a móvil ─
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {columns.map(col => {
            const colOrders = orders.filter(o => o.status === col.key);
            if (colOrders.length === 0) return null;
            return (
              <div key={col.key} className={`bg-slate-900/60 border ${col.bg} rounded-2xl overflow-hidden`}>
                {/* Column header */}
                <div className="px-4 py-2.5 border-b border-slate-700/30 flex items-center justify-between">
                  <h2 className={`text-sm font-bold ${col.color}`}>{col.label}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold bg-slate-800 ${col.color}`}>{colOrders.length}</span>
                </div>
                {/* Orders list */}
                <div className="p-3 space-y-2.5">
                  {colOrders.map(order => (
                    <div key={order.id} className="bg-slate-800/60 border border-slate-700/30 rounded-xl p-3 space-y-2">
                      {/* Order header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">#{order.order_number}</span>
                          {order.customer_table && (
                            <span className="text-xs text-slate-400">🪑 {order.customer_table}</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock size={10} /> {elapsedMin(order.created_at)}m
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-medium">{order.customer_name}</p>
                      {/* Items */}
                      <div className="space-y-0.5">
                        {((order.items || []) as OrderItem[]).map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-slate-400">{item.quantity}× {item.name}</span>
                            <span className="text-slate-500 flex-shrink-0 ml-2">{formatPrice(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      {/* Total + method */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-700/30">
                        <span className="text-sm font-bold text-amber-400">{formatPrice(order.total)}</span>
                        {order.payment_method && (
                          <span className="text-xs text-slate-500 uppercase">{order.payment_method}</span>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div className="flex gap-2 pt-0.5">
                        {order.status !== 'entregado' && (
                          <button onClick={() => handleAdvanceStatus(order)}
                            className="flex-1 py-2.5 bg-amber-500 text-black rounded-xl text-xs font-bold hover:bg-amber-400 active:scale-95 transition-all">
                            {getActionLabel(order.status)}
                          </button>
                        )}
                        {order.status === 'entregado' && order.payment_status !== 'paid' && (
                          <button onClick={() => handleMarkPaid(order.id)}
                            className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-400 active:scale-95 transition-all">
                            ✅ Cobrar
                          </button>
                        )}
                        <button onClick={() => handleCancelWithPin(order.id)}
                          className="px-3 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 active:scale-95 transition-all">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {/* Empty state when all columns are empty */}
          {columns.every(col => orders.filter(o => o.status === col.key).length === 0) && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <ChefHat size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Sin pedidos activos</p>
            </div>
          )}
        </div>
      )}

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <QuickAddModal
          tenant={tenant}
          staff={staff}
          categories={categories}
          items={items}
          onClose={() => setShowQuickAdd(false)}
          onOrderCreated={fetchOrders}
        />
      )}

      {/* PIN Modal */}
      {pinModal && (
        <PinModal
          adminPin={tenant.admin_pin || ''}
          onConfirm={confirmCancel}
          onCancel={() => setPinModal(null)}
        />
      )}

      {/* ─── V21.0: SMART BILL ALERT MODAL ─── */}
      {billAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
          <div
            className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ backgroundColor: '#0f172a', border: '2px solid #F59E0B', boxShadow: '0 0 60px rgba(245,158,11,0.4)' }}
          >
            {/* Animated top bar */}
            <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #F59E0B, #EF4444, #F59E0B)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />

            <div className="p-6 text-center">
              {/* Bell icon pulsing */}
              <div className="flex items-center justify-center mb-4">
                <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F59E0B20', border: '2px solid #F59E0B50' }}>
                  <Bell size={36} className="text-amber-400" style={{ animation: 'bounce 0.6s infinite' }} />
                </div>
              </div>

              <h2 className="text-2xl font-black text-white mb-1" style={{ fontFamily: "'Lora', serif" }}>
                🛎️ ¡Mesa {billAlert.tableNumber} pide la cuenta!
              </h2>
              <p className="text-sm text-slate-400 mb-5">Pedido #{billAlert.orderNumber}</p>

              {/* Payment method badge */}
              <div
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl mb-6 font-bold text-sm"
                style={{
                  backgroundColor: billAlert.paymentMethod === 'sinpe' ? '#6C63FF20' : billAlert.paymentMethod === 'tarjeta' ? '#3B82F620' : '#38A16920',
                  border: `1px solid ${billAlert.paymentMethod === 'sinpe' ? '#6C63FF50' : billAlert.paymentMethod === 'tarjeta' ? '#3B82F650' : '#38A16950'}`,
                  color: billAlert.paymentMethod === 'sinpe' ? '#a78bfa' : billAlert.paymentMethod === 'tarjeta' ? '#60a5fa' : '#6ee7b7',
                }}
              >
                {billAlert.paymentMethod === 'sinpe' && <><Smartphone size={16} /><span>Verificar comprobante en sistema</span></>}
                {billAlert.paymentMethod === 'tarjeta' && <><CreditCard size={16} /><span>Llevar Datáfono</span></>}
                {billAlert.paymentMethod === 'efectivo' && <><Banknote size={16} /><span>Pago en Efectivo (Llevar cambio)</span></>}
              </div>

              {/* CTA button */}
              <button
                onClick={() => setBillAlert(null)}
                className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95"
                style={{ backgroundColor: '#F59E0B', color: '#000', boxShadow: '0 4px 20px rgba(245,158,11,0.4)' }}
              >
                ✅ Entendido — Voy en camino
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
          <h1 className="text-xl font-bold text-white mb-2">Restaurante no encontrado</h1>
          <p className="text-sm text-slate-400">El slug "{slug}" no existe.</p>
        </div>
      </div>
    );
  }

  if (!loggedInStaff) {
    return <StaffLogin tenant={tenant} onLogin={handleLogin} />;
  }

  return <StaffKanban tenant={tenant} staff={loggedInStaff} onLogout={handleLogout} />;
}
