/*
 * KitchenDisplay — V23.1
 * Pantalla de Cocina (KDS) dedicada para SmartMenu.
 * Rol: kitchen (staff con role='kitchen')
 * Ruta: /kitchen/:slug
 *
 * Flujo de estados visibles:
 *   [mesero/admin acepta] → en_cocina → [cocina marca listo] → listo
 *
 * La cocina SOLO ve pedidos en estado 'en_cocina' (ya aceptados por mesero/admin).
 * La única acción disponible es: en_cocina → "Marcar listo" → listo
 *
 * Realtime: canal Supabase por tenant_id (INSERT + UPDATE en orders)
 * Audio: reutiliza useKitchenBell para pedidos que entran a cocina
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'wouter';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useKitchenBell } from '@/hooks/useKitchenBell';
import {
  ChefHat, LogOut, Eye, EyeOff, Clock,
  UtensilsCrossed, Flame, Bell, Wifi, WifiOff, RefreshCw,
  Maximize2
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
interface KitchenStaff {
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
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  selectedModifiers?: { group_name: string; option_name: string; price_adjustment: number }[];
  modifiersTotal?: number;
}

interface KitchenOrder {
  id: string;
  order_number: number;
  customer_name: string;
  customer_table?: string;
  items: OrderItem[];
  total: number;
  status: 'en_cocina' | 'listo';
  notes?: string;
  created_at: string;
  accepted_at?: string;
  has_new_items?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function elapsedMin(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000);
}

function formatElapsed(min: number): string {
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function urgencyColor(min: number): string {
  // en_cocina: verde → naranja → rojo según tiempo
  if (min >= 15) return '#EF4444';
  if (min >= 10) return '#F59E0B';
  return '#10B981'; // verde
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function KitchenLogin({
  tenant,
  onLogin,
}: {
  tenant: Tenant;
  onLogin: (member: KitchenStaff) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Completa todos los campos');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: dbErr } = await supabase
        .from('staff')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('username', username.trim().toLowerCase())
        .eq('role', 'kitchen')
        .eq('is_active', true)
        .single();

      if (dbErr || !data) {
        setError('Usuario no encontrado o sin acceso a cocina');
        setLoading(false);
        return;
      }
      const expectedHash = btoa(password);
      if (data.password_hash !== expectedHash) {
        setError('Contraseña incorrecta');
        setLoading(false);
        return;
      }
      onLogin(data as KitchenStaff);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-orange-500/20 border border-orange-500/30 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <ChefHat size={36} className="text-orange-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Pantalla de Cocina</h1>
          <p className="text-sm text-slate-400 mt-1">{tenant.name}</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="usuario_cocina"
                autoCapitalize="none"
                autoComplete="username"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors text-sm pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <ChefHat size={16} />
                  Entrar a Cocina
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Solo usuarios con rol <span className="text-orange-500/70 font-mono">kitchen</span> pueden acceder
        </p>
      </div>
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function KitchenOrderCard({
  order,
  onAction,
  actionLoading,
}: {
  order: KitchenOrder;
  onAction: (orderId: string) => void;
  actionLoading: string | null;
}) {
  const [elapsed, setElapsed] = useState(0);

  // Tick every 30s to update elapsed time
  useEffect(() => {
    const base = order.accepted_at || order.created_at;
    setElapsed(elapsedMin(base));
    const t = setInterval(() => setElapsed(elapsedMin(base)), 30000);
    return () => clearInterval(t);
  }, [order.accepted_at, order.created_at]);

  const urgency = urgencyColor(elapsed);
  const isLoading = actionLoading === order.id;

  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: '#111827',
        border: `2px solid ${urgency}30`,
        boxShadow: `0 0 20px ${urgency}15`,
      }}
    >
      {/* Status stripe */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: urgency }}
      />

      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="text-2xl font-black tabular-nums"
              style={{ color: urgency }}
            >
              #{order.order_number}
            </span>
            {order.has_new_items && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full border border-yellow-500/30 animate-pulse">
                NUEVO ÍTEM
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {order.customer_table && (
              <span className="text-sm font-bold text-white">
                Mesa {order.customer_table}
              </span>
            )}
            {order.customer_name && (
              <span className="text-xs text-slate-400">
                {order.customer_table ? '·' : ''} {order.customer_name}
              </span>
            )}
          </div>
        </div>

        {/* Timer */}
        <div
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold tabular-nums"
          style={{
            backgroundColor: `${urgency}15`,
            color: urgency,
            border: `1px solid ${urgency}30`,
          }}
        >
          <Clock size={12} />
          {formatElapsed(elapsed)}
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 px-4 pb-3 space-y-1.5">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            {/* Quantity badge */}
            <span
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black"
              style={{ backgroundColor: `${urgency}20`, color: urgency }}
            >
              {item.quantity}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">{item.name}</p>
              {/* Modifiers */}
              {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {item.selectedModifiers.map((mod, mi) => (
                    <p key={mi} className="text-xs text-slate-400">
                      <span className="text-slate-500">↳</span> {mod.option_name}
                      {mod.price_adjustment > 0 && (
                        <span className="text-orange-400/70"> (+₡{mod.price_adjustment.toLocaleString()})</span>
                      )}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Order notes */}
        {order.notes && (
          <div className="mt-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <p className="text-xs text-yellow-300 font-medium">📝 {order.notes}</p>
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="px-4 pb-4">
        <button
          onClick={() => onAction(order.id)}
          disabled={isLoading}
          className="w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
          style={{
            backgroundColor: urgency,
            color: '#fff',
            boxShadow: `0 4px 16px ${urgency}40`,
          }}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Bell size={15} />
              Marcar listo
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main KDS Screen ──────────────────────────────────────────────────────────
function KitchenScreen({
  tenant,
  staff,
  onLogout,
}: {
  tenant: Tenant;
  staff: KitchenStaff;
  onLogout: () => void;
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const { playBell } = useKitchenBell();
  const prevOrderIds = useRef<Set<string>>(new Set());

  // ── Fetch active orders (solo en_cocina — ya aceptados por mesero/admin) ──
  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('id,order_number,customer_name,customer_table,items,total,status,notes,created_at,accepted_at,has_new_items')
      .eq('tenant_id', tenant.id)
      .eq('status', 'en_cocina')
      .order('accepted_at', { ascending: true });

    if (error) {
      setConnected(false);
      return;
    }
    setConnected(true);
    setLastRefresh(new Date());

    const newOrders = (data || []) as KitchenOrder[];

    // Play bell when un pedido nuevo entra a cocina
    const newIds = new Set(newOrders.map(o => o.id));
    const hasNewOrder = newOrders.some(o => !prevOrderIds.current.has(o.id));
    if (hasNewOrder && prevOrderIds.current.size > 0) {
      playBell();
    }
    prevOrderIds.current = newIds;

    setOrders(newOrders);
    setLoading(false);
  }, [tenant.id, playBell]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Polling fallback every 15s
  useEffect(() => {
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // ── Realtime subscription ──
  useEffect(() => {
    const channel = supabase
      .channel(`kitchen-orders-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => { fetchOrders(); }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => { fetchOrders(); }
      )
      .subscribe(status => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [tenant.id, fetchOrders]);

  // ── Marcar listo (única acción disponible para cocina) ──
  const handleAction = useCallback(async (orderId: string) => {
    setActionLoading(orderId);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('orders')
      .update({ status: 'listo', ready_at: now, updated_at: now, has_new_items: false })
      .eq('id', orderId);

    if (error) {
      toast.error('Error al marcar como listo');
    } else {
      toast.success('🔔 ¡Pedido listo! El mesero fue notificado');
      fetchOrders();
    }
    setActionLoading(null);
  }, [fetchOrders]);

  // ── Fullscreen toggle ──
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-5 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500/20 border border-orange-500/30 rounded-xl flex items-center justify-center">
            <ChefHat size={18} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white leading-none">Cocina — {tenant.name}</h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {staff.name} · {new Date().toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${connected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
            {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
            {connected ? 'En vivo' : 'Sin conexión'}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchOrders}
            className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={14} />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            title="Pantalla completa"
          >
            <Maximize2 size={14} />
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-red-500/20 flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors"
            title="Salir"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* ── Stats bar ── */}
      <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-900/50 border-b border-gray-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <Flame size={13} className="text-orange-400" />
          <span className="text-xs text-slate-400">
            <span className="text-white font-bold">{orders.length}</span> en preparación
          </span>
        </div>
        <div className="ml-auto text-[11px] text-slate-600">
          Actualizado: {lastRefresh.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      {/* ── Main area: una sola columna — pedidos en_cocina ── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Cargando pedidos...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Column header */}
          <div className="flex items-center gap-2 px-5 py-3 bg-orange-500/5 border-b border-orange-500/20 shrink-0">
            <Flame size={13} className="text-orange-400 animate-pulse" />
            <span className="text-xs font-black text-orange-400 uppercase tracking-widest">
              En preparación
            </span>
            <span className="ml-auto text-xs font-bold text-orange-300 bg-orange-500/20 px-2 py-0.5 rounded-full">
              {orders.length}
            </span>
          </div>

          {/* Cards grid — responsive: 1 col móvil, 2 col tablet, 3 col desktop */}
          <div className="flex-1 overflow-y-auto p-4">
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <UtensilsCrossed size={36} className="text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-600">Nada en preparación</p>
                <p className="text-xs text-slate-700 mt-1">Cuando un mesero acepte un pedido aparecerá aquí</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {orders.map(order => (
                  <KitchenOrderCard
                    key={order.id}
                    order={order}
                    onAction={handleAction}
                    actionLoading={actionLoading}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Empty state (no orders at all) ── */}
      {!loading && orders.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="w-20 h-20 bg-gray-800 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <ChefHat size={36} className="text-slate-600" />
            </div>
            <h2 className="text-lg font-black text-slate-500">Cocina tranquila</h2>
            <p className="text-sm text-slate-600 mt-1">No hay pedidos activos en este momento</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function KitchenDisplay() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [staff, setStaff] = useState<KitchenStaff | null>(null);

  // Restore session from localStorage
  useEffect(() => {
    if (!slug) return;
    const stored = localStorage.getItem(`kitchen_session_${slug}`);
    if (stored) {
      try { setStaff(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, [slug]);

  // Load tenant
  useEffect(() => {
    if (!slug) return;
    supabase
      .from('tenants')
      .select('id,name,slug')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
      .then(({ data }) => {
        setTenant(data as Tenant | null);
        setTenantLoading(false);
      });
  }, [slug]);

  const handleLogin = (member: KitchenStaff) => {
    localStorage.setItem(`kitchen_session_${slug}`, JSON.stringify(member));
    setStaff(member);
  };

  const handleLogout = () => {
    localStorage.removeItem(`kitchen_session_${slug}`);
    setStaff(null);
  };

  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <ChefHat size={40} className="text-slate-600 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white">Restaurante no encontrado</h2>
          <p className="text-sm text-slate-500 mt-1">Verifica la URL de acceso a cocina</p>
        </div>
      </div>
    );
  }

  if (!staff) {
    return <KitchenLogin tenant={tenant} onLogin={handleLogin} />;
  }

  return <KitchenScreen tenant={tenant} staff={staff} onLogout={handleLogout} />;
}
