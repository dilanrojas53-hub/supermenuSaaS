/**
 * DeliveryAnalyticsCard.tsx — Fase 3 Delivery
 * Panel de métricas de delivery para el AnalyticsTab del AdminDashboard.
 *
 * Muestra:
 * - Total de pedidos delivery en el período
 * - Ingreso generado por delivery
 * - Distancia promedio y ETA promedio
 * - Top riders por pedidos entregados
 * - Tasa de entrega exitosa
 */
import { useMemo } from 'react';
import { Bike, MapPin, Clock, TrendingUp, CheckCircle2, Package } from 'lucide-react';
import { formatPrice } from '@/lib/types';

interface Order {
  id: string;
  status: string;
  total: number;
  created_at: string;
  delivery_type?: string;
  delivery_status?: string;
  delivery_distance_km?: number | null;
  delivery_eta_minutes?: number | null;
  rider_id?: string | null;
  [key: string]: any;
}

interface DeliveryAnalyticsCardProps {
  orders: Order[];
  filter: 'today' | 'yesterday' | 'week' | 'month';
}

function filterByPeriod(orders: Order[], filter: string): Order[] {
  const now = new Date();
  return orders.filter(o => {
    const d = new Date(o.created_at);
    if (filter === 'today') {
      return d.toDateString() === now.toDateString();
    }
    if (filter === 'yesterday') {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return d.toDateString() === y.toDateString();
    }
    if (filter === 'week') {
      const w = new Date(now); w.setDate(w.getDate() - 7);
      return d >= w;
    }
    if (filter === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

export function DeliveryAnalyticsCard({ orders, filter }: DeliveryAnalyticsCardProps) {
  const stats = useMemo(() => {
    const periodOrders = filterByPeriod(orders, filter);
    const deliveryOrders = periodOrders.filter(o => o.delivery_type === 'delivery');
    const delivered = deliveryOrders.filter(o => o.delivery_status === 'delivered' || o.status === 'entregado');
    const cancelled = deliveryOrders.filter(o => o.status === 'cancelado');
    const active = deliveryOrders.filter(o => !['delivered', 'cancelado'].includes(o.delivery_status || o.status));

    const totalRevenue = delivered.reduce((s, o) => s + (o.total || 0), 0);
    const avgDistance = delivered.filter(o => o.delivery_distance_km).length > 0
      ? delivered.reduce((s, o) => s + (o.delivery_distance_km || 0), 0) / delivered.filter(o => o.delivery_distance_km).length
      : null;
    const avgEta = delivered.filter(o => o.delivery_eta_minutes).length > 0
      ? delivered.reduce((s, o) => s + (o.delivery_eta_minutes || 0), 0) / delivered.filter(o => o.delivery_eta_minutes).length
      : null;

    const successRate = deliveryOrders.length > 0
      ? Math.round((delivered.length / deliveryOrders.length) * 100)
      : null;

    // Riders más activos
    const riderCounts: Record<string, number> = {};
    delivered.forEach(o => {
      if (o.rider_id) riderCounts[o.rider_id] = (riderCounts[o.rider_id] || 0) + 1;
    });
    const topRiders = Object.entries(riderCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      total: deliveryOrders.length,
      delivered: delivered.length,
      active: active.length,
      cancelled: cancelled.length,
      totalRevenue,
      avgDistance,
      avgEta,
      successRate,
      topRiders,
    };
  }, [orders, filter]);

  if (stats.total === 0) {
    return (
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bike size={16} className="text-blue-400" />
          <h3 className="text-sm font-bold text-white">Delivery</h3>
        </div>
        <p className="text-xs text-slate-500 text-center py-4">Sin pedidos delivery en este período</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bike size={16} className="text-blue-400" />
          <h3 className="text-sm font-bold text-white">Delivery</h3>
        </div>
        {stats.successRate !== null && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
            {stats.successRate}% éxito
          </span>
        )}
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-800/60 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Package size={12} className="text-blue-400" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Total pedidos</span>
          </div>
          <p className="text-2xl font-black text-white tabular-nums">{stats.total}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {stats.delivered} entregados · {stats.active} activos
          </p>
        </div>

        <div className="rounded-xl bg-slate-800/60 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-green-400" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Ingresos</span>
          </div>
          <p className="text-lg font-black text-green-400 tabular-nums">{formatPrice(stats.totalRevenue)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">de pedidos entregados</p>
        </div>

        {stats.avgDistance !== null && (
          <div className="rounded-xl bg-slate-800/60 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin size={12} className="text-orange-400" />
              <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Dist. promedio</span>
            </div>
            <p className="text-2xl font-black text-white tabular-nums">{stats.avgDistance.toFixed(1)}<span className="text-sm font-normal text-slate-400"> km</span></p>
          </div>
        )}

        {stats.avgEta !== null && (
          <div className="rounded-xl bg-slate-800/60 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={12} className="text-purple-400" />
              <span className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">ETA promedio</span>
            </div>
            <p className="text-2xl font-black text-white tabular-nums">{Math.round(stats.avgEta)}<span className="text-sm font-normal text-slate-400"> min</span></p>
          </div>
        )}
      </div>

      {/* Barra de estado */}
      {stats.total > 0 && (
        <div>
          <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
            <span>Tasa de entrega</span>
            <span>{stats.delivered}/{stats.total}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
              style={{ width: `${(stats.delivered / stats.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Top riders */}
      {stats.topRiders.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-2">Top riders</p>
          <div className="space-y-1.5">
            {stats.topRiders.map(([riderId, count], i) => (
              <div key={riderId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-500 w-4">#{i + 1}</span>
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Bike size={10} className="text-blue-400" />
                  </div>
                  <span className="text-xs text-slate-300 font-mono">{riderId.slice(0, 8)}…</span>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 size={10} className="text-green-400" />
                  <span className="text-xs font-bold text-green-400">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
