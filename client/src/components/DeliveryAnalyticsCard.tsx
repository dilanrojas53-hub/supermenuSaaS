/**
 * DeliveryAnalyticsCard.tsx — F10 Delivery Analytics
 * Panel de métricas de delivery para el AnalyticsTab del AdminDashboard.
 *
 * F10 agrega:
 * - waitlistCount: pedidos que pasaron por waitlist
 * - avgWaitlistTime: tiempo promedio en waitlist (min)
 * - promotedCount: pedidos promovidos de waitlist a kitchen_commit
 * - avgCycleTime: tiempo promedio creación → dispatch (min)
 */
import { useMemo } from 'react';
import { Bike, MapPin, Clock, TrendingUp, CheckCircle2, Package, Timer, AlertCircle, Zap } from 'lucide-react';
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
  // F10: timestamps de ciclo
  waitlisted_at?: string | null;
  kitchen_committed_at?: string | null;
  dispatched_at?: string | null;
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

function diffMinutes(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const diff = (new Date(to).getTime() - new Date(from).getTime()) / 60000;
  return diff > 0 ? Math.round(diff) : null;
}

function fmtMin(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
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
    const topRiders = Object.entries(riderCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    // ─── F10: Métricas de waitlist y ciclo ──────────────────────────────────
    const waitlistOrders = deliveryOrders.filter(o => o.waitlisted_at != null);
    const waitlistCount = waitlistOrders.length;
    const promotedFromWaitlist = waitlistOrders.filter(o => o.kitchen_committed_at != null);
    const promotedCount = promotedFromWaitlist.length;

    const waitlistTimes = promotedFromWaitlist
      .map(o => diffMinutes(o.waitlisted_at, o.kitchen_committed_at))
      .filter((v): v is number => v !== null);
    const avgWaitlistTime = waitlistTimes.length > 0
      ? Math.round(waitlistTimes.reduce((a, b) => a + b, 0) / waitlistTimes.length)
      : null;

    // Ciclo total: created_at → dispatched_at (proxy de tiempo operativo completo)
    const cycleTimes = delivered
      .map(o => diffMinutes(o.created_at, o.dispatched_at))
      .filter((v): v is number => v !== null);
    const avgCycleTime = cycleTimes.length > 0
      ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length)
      : null;

    // Tiempo promedio hasta commit (desde creación)
    const commitTimes = deliveryOrders
      .filter(o => o.kitchen_committed_at)
      .map(o => diffMinutes(o.created_at, o.kitchen_committed_at))
      .filter((v): v is number => v !== null);
    const avgCommitTime = commitTimes.length > 0
      ? Math.round(commitTimes.reduce((a, b) => a + b, 0) / commitTimes.length)
      : null;

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
      // F10
      waitlistCount,
      promotedCount,
      avgWaitlistTime,
      avgCycleTime,
      avgCommitTime,
    };
  }, [orders, filter]);

  if (stats.total === 0) {
    return (
      <div className="rounded-2xl border border-border/50 bg-muted/30 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bike size={16} className="text-blue-400" />
          <h3 className="text-sm font-bold text-foreground">Delivery</h3>
        </div>
        <p className="text-xs text-muted-foreground/70 text-center py-4">Sin pedidos delivery en este período</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bike size={16} className="text-blue-400" />
          <h3 className="text-sm font-bold text-foreground">Delivery</h3>
        </div>
        {stats.successRate !== null && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
            {stats.successRate}% éxito
          </span>
        )}
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Package size={12} className="text-blue-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Total pedidos</span>
          </div>
          <p className="text-2xl font-black text-foreground tabular-nums">{stats.total}</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            {stats.delivered} entregados · {stats.active} activos
          </p>
        </div>

        <div className="rounded-xl bg-muted/60 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-green-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Ingresos</span>
          </div>
          <p className="text-lg font-black text-green-400 tabular-nums">{formatPrice(stats.totalRevenue)}</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">de pedidos entregados</p>
        </div>

        {stats.avgDistance !== null && (
          <div className="rounded-xl bg-muted/60 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin size={12} className="text-orange-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Dist. promedio</span>
            </div>
            <p className="text-2xl font-black text-foreground tabular-nums">{stats.avgDistance.toFixed(1)}<span className="text-sm font-normal text-muted-foreground"> km</span></p>
          </div>
        )}

        {stats.avgEta !== null && (
          <div className="rounded-xl bg-muted/60 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={12} className="text-purple-400" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">ETA promedio</span>
            </div>
            <p className="text-2xl font-black text-foreground tabular-nums">{Math.round(stats.avgEta)}<span className="text-sm font-normal text-muted-foreground"> min</span></p>
          </div>
        )}
      </div>

      {/* Barra de tasa de entrega */}
      {stats.total > 0 && (
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
            <span>Tasa de entrega</span>
            <span>{stats.delivered}/{stats.total}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
              style={{ width: `${(stats.delivered / stats.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── F10: Métricas de orquestación ─────────────────────────────────── */}
      <div
        className="rounded-xl p-3 space-y-3"
        style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <p className="text-[10px] text-purple-300 uppercase tracking-wide font-semibold flex items-center gap-1.5">
          <Zap size={10} /> Orquestación (F7/F9)
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <AlertCircle size={10} className="text-amber-400" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">En waitlist</span>
            </div>
            <p className="text-lg font-black text-amber-400 tabular-nums">{stats.waitlistCount}</p>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">{stats.promotedCount} promovidos</p>
          </div>

          <div className="rounded-lg bg-muted/50 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <Timer size={10} className="text-amber-400" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">T. espera prom.</span>
            </div>
            <p className="text-lg font-black text-amber-400 tabular-nums">{fmtMin(stats.avgWaitlistTime)}</p>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">en waitlist</p>
          </div>

          <div className="rounded-lg bg-muted/50 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <Clock size={10} className="text-cyan-400" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Ciclo prom.</span>
            </div>
            <p className="text-lg font-black text-cyan-400 tabular-nums">{fmtMin(stats.avgCycleTime)}</p>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">creación → dispatch</p>
          </div>

          <div className="rounded-lg bg-muted/50 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <Zap size={10} className="text-green-400" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide">T. commit prom.</span>
            </div>
            <p className="text-lg font-black text-green-400 tabular-nums">{fmtMin(stats.avgCommitTime)}</p>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">creación → cocina</p>
          </div>
        </div>

        {/* Nota si no hay datos de ciclo */}
        {stats.avgCycleTime === null && stats.avgCommitTime === null && (
          <p className="text-[9px] text-slate-600 italic">
            Los tiempos de ciclo estarán disponibles en pedidos creados después de F7.
          </p>
        )}
      </div>

      {/* Top riders */}
      {stats.topRiders.length > 0 && (
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">Top riders</p>
          <div className="space-y-1.5">
            {stats.topRiders.map(([riderId, count], i) => (
              <div key={riderId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-muted-foreground/70 w-4">#{i + 1}</span>
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Bike size={10} className="text-blue-400" />
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{riderId.slice(0, 8)}…</span>
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
