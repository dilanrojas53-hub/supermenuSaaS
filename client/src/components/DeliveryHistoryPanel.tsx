/**
 * DeliveryHistoryPanel.tsx — Fase 4c Delivery
 * Panel de historial de entregas con filtros avanzados.
 *
 * Features:
 * - Filtros: fecha (hoy/ayer/semana/mes), rider, estado, búsqueda por dirección
 * - Lista de pedidos delivery completados/cancelados
 * - Métricas del período: total, ingresos, distancia promedio, ETA promedio
 * - Exportar a CSV
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/types';
import {
  Bike, MapPin, Clock, Search, Filter, Download,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, Loader2
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
  rider_id: string | null;
  total: number;
  created_at: string;
  items: any[];
}

interface RiderProfile {
  id: string;
  name: string;
}

type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'all';
const DATE_LABELS: Record<DateFilter, string> = {
  today: 'Hoy', yesterday: 'Ayer', week: '7 días', month: 'Este mes', all: 'Todo',
};

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

export default function DeliveryHistoryPanel({ tenant }: { tenant: Tenant }) {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [riders, setRiders] = useState<RiderProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');
  const [riderFilter, setRiderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: ordersData }, { data: ridersData }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, delivery_address, delivery_formatted_address, delivery_distance_km, delivery_eta_minutes, delivery_status, rider_id, total, created_at, items')
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
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        (o.delivery_formatted_address || o.delivery_address).toLowerCase().includes(q) ||
        String(o.order_number).includes(q)
      );
    }
    return result;
  }, [orders, dateFilter, riderFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const delivered = filtered.filter(o => o.delivery_status === 'delivered');
    const totalRevenue = delivered.reduce((s, o) => s + (o.total || 0), 0);
    const withDist = delivered.filter(o => o.delivery_distance_km);
    const avgDist = withDist.length > 0
      ? withDist.reduce((s, o) => s + (o.delivery_distance_km || 0), 0) / withDist.length
      : null;
    const withEta = delivered.filter(o => o.delivery_eta_minutes);
    const avgEta = withEta.length > 0
      ? withEta.reduce((s, o) => s + (o.delivery_eta_minutes || 0), 0) / withEta.length
      : null;
    return { total: filtered.length, delivered: delivered.length, totalRevenue, avgDist, avgEta };
  }, [filtered]);

  const exportCSV = () => {
    const rows = [
      ['#Pedido', 'Fecha', 'Dirección', 'Rider', 'Distancia (km)', 'ETA (min)', 'Estado', 'Total'],
      ...filtered.map(o => [
        o.order_number,
        new Date(o.created_at).toLocaleString('es-CR'),
        o.delivery_formatted_address || o.delivery_address,
        riders.find(r => r.id === o.rider_id)?.name || '',
        o.delivery_distance_km?.toFixed(2) || '',
        o.delivery_eta_minutes || '',
        o.delivery_status || '',
        o.total,
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `delivery-historial-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* ─── Stats ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total pedidos', value: stats.total, color: '#3B82F6' },
          { label: 'Entregados', value: stats.delivered, color: '#22C55E' },
          { label: 'Ingresos', value: formatPrice(stats.totalRevenue), color: '#F59E0B' },
          { label: 'Dist. promedio', value: stats.avgDist ? `${stats.avgDist.toFixed(1)} km` : '—', color: '#F97316' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">{s.label}</p>
            <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Filtros ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Fecha */}
        <div className="flex rounded-xl overflow-hidden border border-slate-700">
          {(Object.keys(DATE_LABELS) as DateFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setDateFilter(f)}
              className={`px-3 py-1.5 text-xs font-bold transition-all ${
                dateFilter === f ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {DATE_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Rider */}
        <select
          value={riderFilter}
          onChange={e => setRiderFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300"
        >
          <option value="all">Todos los riders</option>
          {riders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {/* Estado */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300"
        >
          <option value="all">Todos los estados</option>
          <option value="delivered">Entregados</option>
          <option value="cancelled">Cancelados</option>
        </select>

        {/* Búsqueda */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 flex-1 min-w-[160px]">
          <Search size={12} className="text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar dirección o #pedido…"
            className="bg-transparent text-xs text-slate-300 placeholder-slate-500 outline-none w-full"
          />
        </div>

        {/* Export */}
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
        >
          <Download size={12} /> CSV
        </button>

        <button onClick={fetchData} className="p-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
          <Loader2 size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ─── Lista ─────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-blue-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          Sin pedidos delivery en este período
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(order => {
            const rider = riders.find(r => r.id === order.rider_id);
            const isDelivered = order.delivery_status === 'delivered';
            const isExpanded = expandedId === order.id;
            return (
              <div
                key={order.id}
                className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
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
                      <p className="text-white text-sm font-bold">#{order.order_number}</p>
                      <p className="text-slate-400 text-xs truncate max-w-[200px]">
                        {order.delivery_formatted_address || order.delivery_address}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-white text-sm font-bold">{formatPrice(order.total)}</p>
                      <p className="text-slate-500 text-xs">
                        {new Date(order.created_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-700/50 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Rider</p>
                      <div className="flex items-center gap-1.5">
                        <Bike size={12} className="text-blue-400" />
                        <p className="text-xs text-slate-300">{rider?.name || 'Sin asignar'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Distancia</p>
                      <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-orange-400" />
                        <p className="text-xs text-slate-300">
                          {order.delivery_distance_km ? `${order.delivery_distance_km.toFixed(1)} km` : '—'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">ETA final</p>
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-purple-400" />
                        <p className="text-xs text-slate-300">
                          {order.delivery_eta_minutes ? `${order.delivery_eta_minutes} min` : '—'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Fecha</p>
                      <p className="text-xs text-slate-300">
                        {new Date(order.created_at).toLocaleString('es-CR', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
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
