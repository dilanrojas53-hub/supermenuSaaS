/**
 * CustomersTab — Módulo de clientes en el admin.
 * Secciones: Top por monto, Top por frecuencia, Más puntos, Nuevos, Inactivos.
 * Ficha individual con historial, total gastado, puntos, nivel y productos frecuentes.
 */
import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronRight, X, Loader2, TrendingUp, ShoppingBag, Star, UserPlus, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@/lib/types';

interface CustomerProfile {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  points: number;
  level: string;
  total_spent: number;
  total_orders: number;
  created_at: string;
  last_login_at: string | null;
}

interface CustomerOrder {
  id: string;
  order_number: number;
  total: number;
  status: string;
  created_at: string;
  items: { name: string; quantity: number }[];
}

const LEVEL_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  bronze: { label: 'Bronce', color: '#CD7F32', icon: '🥉' },
  silver: { label: 'Plata',  color: '#C0C0C0', icon: '🥈' },
  gold:   { label: 'Oro',    color: '#FFD700', icon: '🥇' },
  vip:    { label: 'VIP',    color: '#9B59B6', icon: '💎' },
};

function CustomerCard({ c, onClick }: { c: CustomerProfile; onClick: () => void }) {
  const lvl = LEVEL_LABELS[c.level] || LEVEL_LABELS.bronze;
  const daysSince = c.last_login_at
    ? Math.floor((Date.now() - new Date(c.last_login_at).getTime()) / 86400000)
    : null;
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-white/5"
      style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
        style={{ background: `${lvl.color}22`, color: lvl.color }}>
        {c.name ? c.name[0].toUpperCase() : '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm text-white truncate">{c.name || 'Sin nombre'}</span>
          <span className="text-xs">{lvl.icon}</span>
        </div>
        <div className="text-xs text-slate-400">{c.phone}</div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-bold text-amber-400">₡{((c.total_spent || 0) / 1000).toFixed(0)}k</div>
        <div className="text-[10px] text-slate-500">{c.total_orders || 0} pedidos</div>
        {daysSince !== null && <div className="text-[10px] text-slate-600">{daysSince}d</div>}
      </div>
      <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
    </button>
  );
}

function CustomerDetail({ customer, onClose, tenantId }: { customer: CustomerProfile; onClose: () => void; tenantId: string }) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const lvl = LEVEL_LABELS[customer.level] || LEVEL_LABELS.bronze;

  useEffect(() => {
    supabase.from('orders').select('id,order_number,total,status,created_at,items')
      .eq('customer_profile_id', customer.id)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => { setOrders((data || []) as CustomerOrder[]); setLoading(false); });
  }, [customer.id, tenantId]);

  // Productos más pedidos
  const itemFreq: Record<string, number> = {};
  orders.forEach(o => {
    if (Array.isArray(o.items)) o.items.forEach(it => {
      itemFreq[it.name] = (itemFreq[it.name] || 0) + it.quantity;
    });
  });
  const topItems = Object.entries(itemFreq).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <button onClick={onClose} className="p-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <X size={18} />
        </button>
        <div className="flex-1">
          <div className="font-black text-base text-white">{customer.name || 'Sin nombre'}</div>
          <div className="text-xs text-slate-400">{customer.phone}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-black" style={{ color: lvl.color }}>{lvl.icon} {lvl.label}</div>
          <div className="text-xs text-slate-400">{customer.points || 0} pts</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total gastado', value: `₡${((customer.total_spent || 0) / 1000).toFixed(1)}k`, icon: '💰' },
            { label: 'Pedidos', value: customer.total_orders || 0, icon: '🛒' },
            { label: 'Puntos', value: customer.points || 0, icon: '⭐' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-surface)' }}>
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-lg font-black text-white">{s.value}</div>
              <div className="text-[10px] text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Productos frecuentes */}
        {topItems.length > 0 && (
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Productos frecuentes</h3>
            <div className="space-y-1.5">
              {topItems.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'var(--bg-surface)' }}>
                  <span className="text-sm text-white">{name}</span>
                  <span className="text-xs font-bold text-amber-400">{qty}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historial */}
        <div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Historial de pedidos</h3>
          {loading ? <Loader2 size={20} className="animate-spin text-slate-500 mx-auto" /> : (
            <div className="space-y-2">
              {orders.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Sin pedidos registrados</p>
              ) : orders.map(o => (
                <div key={o.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--bg-surface)' }}>
                  <div>
                    <div className="text-sm font-semibold text-white">Pedido #{o.order_number}</div>
                    <div className="text-xs text-slate-400">
                      {new Date(o.created_at).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-amber-400">₡{o.total?.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-500">{o.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SEGMENTS = [
  { key: 'top_amount',    label: 'Top por monto',     icon: <TrendingUp size={14} />,  orderBy: 'total_spent' },
  { key: 'top_frequency', label: 'Top por frecuencia', icon: <ShoppingBag size={14} />, orderBy: 'total_orders' },
  { key: 'top_points',    label: 'Más puntos',         icon: <Star size={14} />,        orderBy: 'points' },
  { key: 'new',           label: 'Nuevos',             icon: <UserPlus size={14} />,    orderBy: 'created_at' },
  { key: 'inactive',      label: 'Inactivos',          icon: <Clock size={14} />,       orderBy: 'last_login_at' },
] as const;

export default function CustomersTab({ tenant }: { tenant: Tenant }) {
  const [segment, setSegment] = useState<typeof SEGMENTS[number]['key']>('top_amount');
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerProfile | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const seg = SEGMENTS.find(s => s.key === segment)!;
    let q = supabase.from('customer_profiles').select('*').eq('tenant_id', tenant.id);
    if (segment === 'new') {
      q = q.order('created_at', { ascending: false }).limit(50);
    } else if (segment === 'inactive') {
      q = q.order('last_login_at', { ascending: true }).limit(50);
    } else {
      q = q.order(seg.orderBy, { ascending: false }).limit(50);
    }
    const { data } = await q;
    setCustomers((data || []) as CustomerProfile[]);
    setLoading(false);
  }, [segment, tenant.id]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  const filtered = customers.filter(c =>
    !search || (c.name || '').toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  if (selected) return <CustomerDetail customer={selected} onClose={() => setSelected(null)} tenantId={tenant.id} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-black text-white">Clientes</h2>
        <span className="text-xs text-slate-400">{customers.length} registrados</span>
      </div>

      {/* Segmentos */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {SEGMENTS.map(s => (
          <button key={s.key} onClick={() => setSegment(s.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0"
            style={{
              background: segment === s.key ? '#F59E0B' : 'rgba(255,255,255,0.06)',
              color: segment === s.key ? '#000' : '#94A3B8',
            }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-transparent outline-none"
          style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm">No hay clientes en este segmento</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => <CustomerCard key={c.id} c={c} onClick={() => setSelected(c)} />)}
        </div>
      )}
    </div>
  );
}
