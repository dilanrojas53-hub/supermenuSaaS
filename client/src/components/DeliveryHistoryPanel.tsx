/**
 * DeliveryHistoryPanel.tsx — F10 Delivery Analytics
 * Panel de historial de entregas con filtros avanzados y tiempos de ciclo.
 *
 * F10 agrega:
 * - Campos: waitlisted_at, kitchen_committed_at, dispatched_at, logistic_status
 * - Tiempos de ciclo en fila expandida (waitlist, commit, dispatch, entrega)
 * - Filtro por logistic_status (directo vs. waitlist)
 * - Métricas: avgCycleTime, waitlistCount, avgWaitlistTime
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/types';
import {
  Bike, MapPin, Clock, Search, Download,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2,
  Timer, Zap, AlertCircle
} from 'lucide-react';

interface Tenant { id: string; slug: string; name: string; }

interface HistoryOrder {
  id: string;
  order_number: number;
  delivery_address: string;
  delivery_formatted_address: string | null;
  delivery_distance_km: number | null;
  delivery_eta_minutes: number | null;
  delivery_status: string | null;
  logistic_status: string | null;
  rider_id: string | null;
  total: number;
  created_at: string;
  // F10: timestamps de ciclo
  waitlisted_at: string | null;
  kitchen_committed_at: string | null;
  dispatched_at: string | null;
  items: any[];
}

interface RiderProfile { id: string; name: string; }

type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'all';
const DATE_LABELS: Record<DateFilter, string> = {
  today: 'Hoy', yesterday: 'Ayer', week: '7 días', month: 'Este mes', all: 'Todo',
};

// ─── Helpers de tiempo ──────────────────────────────────────────────────────
function diffMinutes(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const diff = (new Date(to).getTime() - new Date(from).getTime()) / 60000;
  return diff > 0 ? Math.round(diff) : null;
}

function fmtMin(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ─── Filtro por fecha ────────────────────────────────────────────────────────
function filterByDate(orders: HistoryOrder[], filter: DateFilter): HistoryOrder[] {
  if (filter === 'all') return orders;
  const now = new Date();
  return orders.filter(o => {
    const d = new Date(o.created_at);
    if (filter === 'today') return d.toDateString() === now.toDateString();
    if (filter === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return d.toDateString() === y.toDateString();
    }
    if (filter === 'week') { const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w; }
    if (filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  });
}

// ─── Labels de logistic_status ───────────────────────────────────────────────
const LOGISTIC_LABELS: Record<string, { label: string; color: string }> = {
  kitchen_commit: { label: 'Directo', color: '#22C55E' },
  waitlist:       { label: 'Waitlist', color: '#F59E0B' },
  soft_reserve:   { label: 'Reservado', color: '#3B82F6' },
  assigned:       { label: 'Asignado', color: '#8B5CF6' },
  picked_up:      { label: 'En camino', color: '#06B6D4' },
  delivered:      { label: 'Entregado', color: '#22C55E' },
  cancelled:      { label: 'Cancelado', color: '#EF4444' },
};

export default function DeliveryHistoryPanel({ tenant }: { tenant: Tenant }) {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [riders, setRiders] = useState<RiderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');
  const [riderFilter, setRiderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // F10: filtro por logistic_status
  const [logisticFilter, setLogisticFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: ordersData }, { data: ridersData }] = await Promise.all([
      supabase
        .from('orders')
        // F10: agregar timestamps de ciclo y logistic_status
        .select('id, order_number, delivery_address, delivery_formatted_address, delivery_distance_km, delivery_eta_minutes, delivery_status, logistic_status, rider_id, total, created_at, items, waitlisted_at, kitchen_committed_at, dispatched_at')
        .eq('tenant_id', tenant.id)
        .eq('delivery_type', 'delivery')
        .in('delivery_status', ['delivered', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('rider_profiles')
        .select('id, name')
        .eq('tenant_id', tenant.id),
    ]);
    if (ordersData) setOrders(ordersData);
    if (ridersData) setRiders(ridersData);
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let result = filterByDate(orders, dateFilter);
    if (riderFilter !== 'all') result = result.filter(o => o.rider_id === riderFilter);
    if (statusFilter !== 'all') result = result.filter(o => o.delivery_status === statusFilter);
    // F10: filtro por logistic_status
    if (logisticFilter === 'waitlist') result = result.filter(o => o.waitlisted_at !== null);
    else if (logisticFilter === 'direct') result = result.filter(o => o.waitlisted_at === null);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        (o.delivery_formatted_address || o.delivery_address).toLowerCase().includes(q) ||
        String(o.order_number).includes(q)
      );
    }
    return result;
  }, [orders, dateFilter, riderFilter, statusFilter, logisticFilter, search]);

  // F10: métricas extendidas con tiempos de ciclo
  const stats = useMemo(() => {
    const delivered = filtered.filter(o => o.delivery_status === 'delivered');
    const totalRevenue = delivered.reduce((s, o) => s + (o.total || 0), 0);
    const withDist = delivered.filter(o => o.delivery_distance_km);
    const avgDist = withDist.length > 0
      ? withDist.reduce((s, o) => s + (o.delivery_distance_km || 0), 0) / withDist.length
      : null;

    // Waitlist
    const waitlistOrders = filtered.filter(o => o.waitlisted_at !== null);
    const waitlistCount = waitlistOrders.length;
    const promotedFromWaitlist = waitlistOrders.filter(o => o.kitchen_committed_at !== null);
    const waitlistTimes = promotedFromWaitlist
      .map(o => diffMinutes(o.waitlisted_at, o.kitchen_committed_at))
      .filter((v): v is number => v !== null);
    const avgWaitlistTime = waitlistTimes.length > 0
      ? Math.round(waitlistTimes.reduce((a, b) => a + b, 0) / waitlistTimes.length)
      : null;

    // Ciclo completo: created_at → delivered_at (approx: dispatched_at como proxy de delivered)
    const cycleTimes = delivered
      .map(o => diffMinutes(o.created_at, o.dispatched_at))
      .filter((v): v is number => v !== null);
    const avgCycleTime = cycleTimes.length > 0
      ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length)
      : null;

    // Tiempo hasta commit
    const commitTimes = filtered
      .filter(o => o.kitchen_committed_at)
      .map(o => diffMinutes(o.created_at, o.kitchen_committed_at))
      .filter((v): v is number => v !== null);
    const avgCommitTime = commitTimes.length > 0
      ? Math.round(commitTimes.reduce((a, b) => a + b, 0) / commitTimes.length)
      : null;

    return {
      total: filtered.length,
      delivered: delivered.length,
      totalRevenue,
      avgDist,
      // F10
      waitlistCount,
      promotedCount: promotedFromWaitlist.length,
      avgWaitlistTime,
      avgCycleTime,
      avgCommitTime,
    };
  }, [filtered]);

  const exportCSV = () => {
    const rows = [
      ['#Pedido', 'Fecha', 'Dirección', 'Rider', 'Distancia (km)', 'ETA (min)', 'Estado', 'Logístico', 'Waitlist (min)', 'Commit (min)', 'Ciclo (min)', 'Total'],
      ...filtered.map(o => [
        o.order_number,
        new Date(o.created_at).toLocaleString('es-CR'),
        o.delivery_formatted_address || o.delivery_address,
        riders.find(r => r.id === o.rider_id)?.name || '',
        o.delivery_distance_km?.toFixed(2) || '',
        o.delivery_eta_minutes || '',
        o.delivery_status || '',
        o.logistic_status || '',
        diffMinutes(o.waitlisted_at, o.kitchen_committed_at) ?? '',
        diffMinutes(o.created_at, o.kitchen_committed_at) ?? '',
        diffMinutes(o.created_at, o.dispatched_at) ?? '',
        o.total,
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `delivery-historial-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Paleta fija oscura — independiente del tema B2B activo
  const C = {
    bg:      '#111827',
    surface: '#1e293b',
    surface2:'#0f172a',
    border:  'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.05)',
    text:    '#f1f5f9',
    muted:   '#94a3b8',
    muted2:  '#64748b',
  };

  return (
    <div className="space-y-4">
      {/* ─── Stats principales ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total pedidos', value: stats.total, color: '#3B82F6' },
          { label: 'Entregados', value: stats.delivered, color: '#22C55E' },
          { label: 'Ingresos', value: formatPrice(stats.totalRevenue), color: '#F59E0B' },
          { label: 'Dist. promedio', value: stats.avgDist ? `${stats.avgDist.toFixed(1)} km` : '—', color: '#F97316' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <p className="text-[10px] uppercase tracking-wide font-semibold mb-1" style={{ color: C.muted }}>{s.label}</p>
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ─── F10: Stats de ciclo y waitlist ─────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'En waitlist', value: stats.waitlistCount, icon: <AlertCircle size={11} />, color: '#F59E0B', hint: 'Pedidos que pasaron por cola' },
          { label: 'Promovidos', value: stats.promotedCount, icon: <Zap size={11} />, color: '#8B5CF6', hint: 'Subieron de waitlist a cocina' },
          { label: 'T. espera prom.', value: fmtMin(stats.avgWaitlistTime), icon: <Timer size={11} />, color: '#F97316', hint: 'Tiempo promedio en waitlist' },
          { label: 'Ciclo prom.', value: fmtMin(stats.avgCycleTime), icon: <Clock size={11} />, color: '#06B6D4', hint: 'Creación → dispatch' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3" style={{ background: C.surface2, border: `1px solid ${C.border}` }} title={s.hint}>
            <div className="flex items-center gap-1 mb-1" style={{ color: s.color }}>
              {s.icon}
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: C.muted }}>{s.label}</p>
            </div>
            <p className="text-lg font-black" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Filtros ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Fecha */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {(Object.keys(DATE_LABELS) as DateFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className="px-3 py-1.5 text-xs font-bold transition-all"
              style={{
                background: dateFilter === f ? '#3B82F6' : C.surface,
                color: dateFilter === f ? '#fff' : C.muted,
              }}
            >
              {DATE_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Rider */}
        <select
          value={riderFilter}
          onChange={e => setRiderFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium outline-none"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
        >
          <option value="all">Todos los riders</option>
          {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {/* Estado */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium outline-none"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
        >
          <option value="all">Todos los estados</option>
          <option value="delivered">Entregados</option>
          <option value="cancelled">Cancelados</option>
        </select>

        {/* F10: Filtro logístico */}
        <select
          value={logisticFilter}
          onChange={e => setLogisticFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium outline-none"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
        >
          <option value="all">Todos (directo + waitlist)</option>
          <option value="direct">Solo directo (sin waitlist)</option>
          <option value="waitlist">Solo pasaron por waitlist</option>
        </select>

        {/* Búsqueda */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl flex-1 min-w-[160px]" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <Search size={12} style={{ color: C.muted2 }} className="shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar dirección o #pedido…"
            className="bg-transparent text-xs outline-none w-full"
            style={{ color: C.text }}
          />
        </div>

        {/* Export */}
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
        >
          <Download size={12} /> CSV
        </button>

        <button
          onClick={fetchData}
          className="p-1.5 rounded-xl transition-colors"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
        >
          <Loader2 size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ─── Lista ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-blue-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: C.muted2 }}>
          Sin pedidos delivery en este período
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const rider = riders.find(r => r.id === order.rider_id);
            const isDelivered = order.delivery_status === 'delivered';
            const isExpanded = expandedId === order.id;
            const logisticMeta = order.logistic_status ? LOGISTIC_LABELS[order.logistic_status] : null;
            const passedWaitlist = order.waitlisted_at !== null;

            // F10: tiempos de ciclo para esta orden
            const waitlistTime = diffMinutes(order.waitlisted_at, order.kitchen_committed_at);
            const commitTime   = diffMinutes(order.created_at, order.kitchen_committed_at);
            const dispatchTime = diffMinutes(order.kitchen_committed_at, order.dispatched_at);
            const cycleTime    = diffMinutes(order.created_at, order.dispatched_at);

            return (
              <div
                key={order.id}
                className="rounded-xl overflow-hidden"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}
              >
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                >
                  <div className="flex items-center gap-3">
                    {isDelivered
                      ? <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                      : <XCircle size={16} className="text-red-400 shrink-0" />
                    }
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold" style={{ color: C.text }}>#{order.order_number}</p>
                        {/* F10: badge logístico */}
                        {passedWaitlist && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' }}>
                            WAITLIST
                          </span>
                        )}
                        {logisticMeta && !passedWaitlist && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${logisticMeta.color}15`, color: logisticMeta.color, border: `1px solid ${logisticMeta.color}30` }}>
                            {logisticMeta.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs truncate max-w-[200px]" style={{ color: C.muted }}>
                        {order.delivery_formatted_address || order.delivery_address}
                      </p>
                    </div>
                  </div>
                    <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-bold" style={{ color: C.text }}>{formatPrice(order.total)}</p>
                      <p className="text-xs" style={{ color: C.muted2 }}>
                        {new Date(order.created_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    {isExpanded
                      ? <ChevronUp size={14} style={{ color: C.muted2 }} />
                      : <ChevronDown size={14} style={{ color: C.muted2 }} />
                    }
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 space-y-3" style={{ borderTop: `1px solid ${C.border2}` }}>
                    {/* Fila 1: datos básicos */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: C.muted2 }}>Rider</p>
                        <div className="flex items-center gap-1.5">
                          <Bike size={12} className="text-blue-400" />
                          <p className="text-xs" style={{ color: C.muted }}>{rider?.name || 'Sin asignar'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: C.muted2 }}>Distancia</p>
                        <div className="flex items-center gap-1.5">
                          <MapPin size={12} className="text-orange-400" />
                          <p className="text-xs" style={{ color: C.muted }}>
                            {order.delivery_distance_km ? `${order.delivery_distance_km.toFixed(1)} km` : '—'}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: C.muted2 }}>ETA estimado</p>
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-purple-400" />
                          <p className="text-xs" style={{ color: C.muted }}>
                            {order.delivery_eta_minutes ? `${order.delivery_eta_minutes} min` : '—'}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: C.muted2 }}>Creado</p>
                        <p className="text-xs" style={{ color: C.muted }}>
                          {new Date(order.created_at).toLocaleString('es-CR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    {/* F10: Fila 2 — tiempos de ciclo */}
                    <div
                      className="rounded-lg px-3 py-2.5 space-y-1.5"
                      style={{ background: C.surface2, border: `1px solid ${C.border2}` }}
                    >
                      <p className="text-[10px] uppercase tracking-wide font-semibold mb-2 flex items-center gap-1.5" style={{ color: C.muted2 }}>
                        <Timer size={10} /> Tiempos de ciclo (F10)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <p className="text-[9px] mb-0.5" style={{ color: C.muted2 }}>Creación → Commit</p>
                          <p className="text-xs font-bold" style={{ color: commitTime !== null ? '#22C55E' : '#64748B' }}>
                            {fmtMin(commitTime)}
                          </p>
                        </div>
                        {passedWaitlist && (
                          <div>
                            <p className="text-[9px] mb-0.5" style={{ color: C.muted2 }}>Tiempo en waitlist</p>
                            <p className="text-xs font-bold" style={{ color: waitlistTime !== null ? '#F59E0B' : '#64748B' }}>
                              {fmtMin(waitlistTime)}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-[9px] mb-0.5" style={{ color: C.muted2 }}>Commit → Dispatch</p>
                          <p className="text-xs font-bold" style={{ color: dispatchTime !== null ? '#8B5CF6' : '#64748B' }}>
                            {fmtMin(dispatchTime)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] mb-0.5" style={{ color: C.muted2 }}>Ciclo total</p>
                          <p className="text-xs font-bold" style={{ color: cycleTime !== null ? '#06B6D4' : '#64748B' }}>
                            {fmtMin(cycleTime)}
                          </p>
                        </div>
                      </div>
                      {/* Nota sobre datos históricos */}
                      {(!order.kitchen_committed_at && !order.dispatched_at) && (
                        <p className="text-[9px] mt-1.5 italic" style={{ color: C.muted2 }}>
                          Pedido anterior a F7/F10 — timestamps de ciclo no disponibles
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
