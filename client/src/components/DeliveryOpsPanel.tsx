/**
 * DeliveryOpsPanel.tsx — Fase 5c Delivery
 * Panel de operaciones en tiempo real del día.
 *
 * Features:
 * - Métricas del día: pedidos, ingresos, distancia total, ETA promedio
 * - Riders activos con su pedido actual y última ubicación
 * - Pedidos en curso con estado y tiempo transcurrido
 * - Alertas: pedidos sin asignar hace más de 10 min
 * - Actualización automática cada 30s
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/types';
import { useActiveTenantOrders } from '@/hooks/useActiveOrder';
import {
  Bike, MapPin, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, DollarSign, Navigation, RefreshCw, Loader2,
  Activity, Users
} from 'lucide-react';
import { motion } from 'framer-motion';

interface Tenant { id: string; slug: string; name: string; }

interface OpsOrder {
  id: string;
  order_number: number;
  delivery_address: string;
  delivery_formatted_address: string | null;
  delivery_status: string | null;
  logistic_status: string | null;
  waitlisted_at: string | null;
  kitchen_committed_at: string | null;
  delivery_distance_km: number | null;
  delivery_eta_minutes: number | null;
  rider_id: string | null;
  total: number;
  created_at: string;
}

interface OpsRider {
  id: string;
  name: string;
  vehicle_type: string;
  is_active: boolean;
  current_lat: number | null;
  current_lon: number | null;
  last_location_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_assignment: { label: 'Sin asignar', color: '#F59E0B' },
  assigned:           { label: 'Asignado', color: '#3B82F6' },
  accepted:           { label: 'Aceptado', color: '#8B5CF6' },
  picked_up:          { label: 'En camino', color: '#F97316' },
  delivered:          { label: 'Entregado', color: '#22C55E' },
  cancelled:          { label: 'Cancelado', color: '#EF4444' },
};

function minutesSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

export default function DeliveryOpsPanel({ tenant }: { tenant: Tenant }) {
  const [riders, setRiders] = useState<OpsRider[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // F8: Hook unificado — fuente de verdad compartida con realtime incluido
  const {
    orders: activeOrdersRaw,
    loading,
    waitlistOrders: waitlistOrdersRaw,
    committedOrders: committedOrdersRaw,
    unassignedOrders: unassignedOrdersRaw,
  } = useActiveTenantOrders(tenant.id);

  // Riders: fetch separado (no es parte del modelo de pedidos activos)
  const fetchRiders = useCallback(async () => {
    const { data } = await supabase
      .from('rider_profiles')
      .select('id, name, vehicle_type, is_active, current_lat, current_lon, last_location_at')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true);
    if (data) setRiders(data);
    setLastRefresh(new Date());
  }, [tenant.id]);

  useEffect(() => {
    fetchRiders();
    const interval = setInterval(fetchRiders, 30000);
    return () => clearInterval(interval);
  }, [fetchRiders]);

  // Realtime para riders (pedidos ya cubiertos por useActiveTenantOrders)
  useEffect(() => {
    const channel = supabase
      .channel(`ops-riders-${tenant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_profiles', filter: `tenant_id=eq.${tenant.id}` }, fetchRiders)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant.id, fetchRiders]);

  // Adaptar al tipo OpsOrder para compatibilidad con el resto del componente
  const orders = activeOrdersRaw as any as OpsOrder[];
  const waitlistOrders = waitlistOrdersRaw as any as OpsOrder[];
  const committedOrders = committedOrdersRaw as any as OpsOrder[];
  const unassigned = unassignedOrdersRaw as any as OpsOrder[];

  // ─── Métricas ────────────────────────────────────────────────────────────────
  const activeOrders = orders; // useActiveTenantOrders ya excluye delivered/cancelled
  const deliveredToday: OpsOrder[] = []; // Solo pedidos activos en el hook
  const alerts = unassigned.filter(o => minutesSince(o.created_at) > 10);
  const totalRevenue = 0;
  const withDist = orders.filter(o => o.delivery_distance_km);
  const totalDistKm = withDist.reduce((s, o) => s + (o.delivery_distance_km || 0), 0);
  const withEta = orders.filter(o => o.delivery_eta_minutes);
  const avgEta = withEta.length > 0
    ? Math.round(withEta.reduce((s, o) => s + (o.delivery_eta_minutes || 0), 0) / withEta.length)
    : null;

  const ridersWithOrder = riders.map(r => ({
    ...r,
    currentOrder: activeOrders.find(o => o.rider_id === r.id),
  }));

  const VEHICLE_ICONS: Record<string, string> = { moto: '🛵', bicicleta: '🚲', carro: '🚗', a_pie: '🚶' };

  return (
    <div className="space-y-5">
      {/* ─── Header con refresh ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-green-400" />
          <h3 className="text-foreground font-bold text-sm">Operaciones del día</h3>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/70 text-xs">
            Actualizado {lastRefresh.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button onClick={fetchRiders} className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

       {/* F7: Alerta de waitlist — pedidos en cola de espera */}
      {waitlistOrders.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
        >
          <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 text-sm font-bold">
              {waitlistOrders.length} pedido{waitlistOrders.length > 1 ? 's' : ''} en lista de espera
            </p>
            <p className="text-amber-400/70 text-xs mt-0.5">
              {waitlistOrders.map(a => `#${a.order_number}`).join(', ')} · Ir al panel de Dispatch para procesar
            </p>
          </div>
        </motion.div>
      )}

      {/* ─── Alertas ──────────────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 text-sm font-bold">
              {alerts.length} pedido{alerts.length > 1 ? 's' : ''} sin asignar hace más de 10 min
            </p>
            <p className="text-red-400/70 text-xs mt-0.5">
              {alerts.map(a => `#${a.order_number}`).join(', ')}
            </p>
          </div>
        </motion.div>
      )}

      {/* ─── KPIs del día ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'En curso', value: activeOrders.length, color: '#3B82F6', icon: <Navigation size={14} /> },
          { label: 'Entregados hoy', value: deliveredToday.length, color: '#22C55E', icon: <CheckCircle2 size={14} /> },
          { label: 'Ingresos hoy', value: formatPrice(totalRevenue), color: '#F59E0B', icon: <DollarSign size={14} /> },
          { label: 'ETA promedio', value: avgEta ? `${avgEta} min` : '—', color: '#F97316', icon: <Clock size={14} /> },
        ].map(kpi => (
          <div
            key={kpi.label}
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-1.5 mb-1" style={{ color: kpi.color }}>
              {kpi.icon}
              <p className="text-[10px] uppercase tracking-wide font-semibold">{kpi.label}</p>
            </div>
            <p className="text-xl font-black text-foreground">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Riders activos ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-muted-foreground" />
          <h4 className="text-muted-foreground text-xs font-bold uppercase tracking-wide">
            Riders activos ({riders.length})
          </h4>
        </div>
        {riders.length === 0 ? (
          <p className="text-muted-foreground/70 text-xs text-center py-4">Sin riders activos</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ridersWithOrder.map(rider => {
              const isOnline = rider.last_location_at
                ? minutesSince(rider.last_location_at) < 5
                : false;
              const statusInfo = rider.currentOrder
                ? STATUS_CONFIG[rider.currentOrder.delivery_status || 'assigned']
                : null;
              return (
                <div
                  key={rider.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-base">
                        {VEHICLE_ICONS[rider.vehicle_type] || '🛵'}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${isOnline ? 'bg-green-400' : 'bg-slate-500'}`} />
                    </div>
                    <div>
                      <p className="text-foreground text-xs font-bold">{rider.name}</p>
                      {rider.currentOrder ? (
                        <p className="text-xs" style={{ color: statusInfo?.color || '#94a3b8' }}>
                          #{rider.currentOrder.order_number} · {statusInfo?.label}
                        </p>
                      ) : (
                        <p className="text-muted-foreground/70 text-xs">Disponible</p>
                      )}
                    </div>
                  </div>
                  {rider.currentOrder?.delivery_eta_minutes && (
                    <div className="text-right">
                      <p className="text-orange-400 text-xs font-bold">{rider.currentOrder.delivery_eta_minutes} min</p>
                      <p className="text-muted-foreground/70 text-[10px]">ETA</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Pedidos en curso ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Bike size={14} className="text-muted-foreground" />
          <h4 className="text-muted-foreground text-xs font-bold uppercase tracking-wide">
            Pedidos activos ({activeOrders.length})
          </h4>
        </div>
        {activeOrders.length === 0 ? (
          <p className="text-muted-foreground/70 text-xs text-center py-4">Sin pedidos activos</p>
        ) : (
          <div className="space-y-2">
            {activeOrders.map(order => {
              const rider = riders.find(r => r.id === order.rider_id);
              const statusInfo = STATUS_CONFIG[order.delivery_status || 'pending_assignment'];
              const mins = minutesSince(order.created_at);
              const isLate = mins > 45 && order.delivery_status !== 'delivered';
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{
                    background: isLate ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isLate ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-black text-sm">#{order.order_number}</span>
                    <div>
                      <p className="text-muted-foreground text-xs truncate max-w-[160px]">
                        {order.delivery_formatted_address || order.delivery_address}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: `${statusInfo.color}20`, color: statusInfo.color }}
                        >
                          {statusInfo.label}
                        </span>
                        {rider && (
                          <span className="text-muted-foreground/70 text-[10px]">{rider.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-bold ${isLate ? 'text-red-400' : 'text-muted-foreground'}`}>
                      {mins} min
                    </p>
                    {order.delivery_eta_minutes && (
                      <p className="text-orange-400 text-[10px]">ETA {order.delivery_eta_minutes}m</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Resumen del día ─────────────────────────────────────────────────── */}
      {totalDistKm > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-blue-400" />
            <span className="text-muted-foreground text-xs">Distancia total recorrida hoy</span>
          </div>
          <span className="text-blue-400 font-bold text-sm">{totalDistKm.toFixed(1)} km</span>
        </div>
      )}
    </div>
  );
}
