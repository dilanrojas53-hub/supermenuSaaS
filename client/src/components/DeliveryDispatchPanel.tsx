/**
 * DeliveryDispatchPanel.tsx — Fase 2 Delivery
 * Panel de dispatch para el admin: gestión de riders y asignación de pedidos delivery.
 *
 * Features:
 * - Lista de pedidos delivery pendientes de asignación
 * - Lista de riders activos con su estado actual
 * - Asignar rider a pedido con un click
 * - Ver estado en tiempo real (Supabase Realtime)
 * - Crear/gestionar riders (nombre, PIN, vehículo)
 * - Link directo a la RiderApp para cada rider
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { buildDirectionsLink } from '@/lib/maps';
import LiveTrackingMap from '@/components/LiveTrackingMap';
import { formatPrice } from '@/lib/types';
import { buildWhatsAppUrl } from '@/lib/phone';
import * as bcrypt from 'bcryptjs';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import {
  Bike, MapPin, Phone, Plus, User, CheckCircle2, Clock,
  Navigation, AlertCircle, ExternalLink, Trash2, Eye,
  EyeOff, Copy, RefreshCw, Loader2, X
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Tenant { id: string; slug: string; name: string; }

interface RiderProfile {
  id: string;
  name: string;
  phone: string | null;
  pin_hash: string;
  vehicle_type: string;
  is_active: boolean;
  current_lat: number | null;
  current_lon: number | null;
  last_location_at: string | null;
}

interface DeliveryOrder {
  id: string;
  order_number: number;
  delivery_address: string;
  delivery_phone: string | null;
  delivery_lat: number | null;
  delivery_lon: number | null;
  delivery_formatted_address: string | null;
  delivery_eta_minutes: number | null;
  delivery_distance_km: number | null;
  delivery_status: string | null;
  rider_id: string | null;
  total: number;
  created_at: string;
  items: any[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_assignment: { label: 'Sin asignar', color: '#F59E0B' },
  assigned:           { label: 'Asignado', color: '#3B82F6' },
  accepted:           { label: 'Aceptado', color: '#8B5CF6' },
  picked_up:          { label: 'En camino', color: '#F97316' },
  delivered:          { label: 'Entregado', color: '#22C55E' },
  cancelled:          { label: 'Cancelado', color: '#EF4444' },
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function DeliveryDispatchPanel({ tenant }: { tenant: Tenant }) {
  const [riders, setRiders] = useState<RiderProfile[]>([]);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddRider, setShowAddRider] = useState(false);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [showPins, setShowPins] = useState<Record<string, boolean>>({});
  const [trackingOrder, setTrackingOrder] = useState<DeliveryOrder | null>(null);

  // Form de nuevo rider
  const [newRider, setNewRider] = useState({ name: '', phone: '', pin: '', vehicle_type: 'moto' });
  const [savingRider, setSavingRider] = useState(false);
  const [deliverySettings, setDeliverySettings] = useState<{ restaurant_lat: number; restaurant_lon: number } | null>(null);

  // F6-B: Push Notifications — admin usa sendPush para notificar riders y clientes
  const { sendPush } = usePushNotifications({
    tenantId: tenant.id,
    subscriberType: 'admin',
    subscriberId: tenant.id,
    autoSubscribe: false,
  });

  // ─── Fetch data ─────────────────────────────────────────────────────────────
  const fetchRiders = useCallback(async () => {
    const { data } = await supabase
      .from('rider_profiles')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name');
    if (data) setRiders(data);
  }, [tenant.id]);

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, delivery_address, delivery_phone, delivery_lat, delivery_lon, delivery_formatted_address, delivery_eta_minutes, delivery_distance_km, delivery_status, rider_id, total, created_at, items')
      .eq('tenant_id', tenant.id)
      .eq('delivery_type', 'delivery')
      .not('delivery_status', 'in', '(delivered,cancelled)')
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  }, [tenant.id]);

  useEffect(() => {
    // Cargar coordenadas del restaurante para el mapa
    supabase.from('delivery_settings').select('restaurant_lat, restaurant_lon').eq('tenant_id', tenant.id).single()
      .then(({ data }) => { if (data) setDeliverySettings(data as any); });
    Promise.all([fetchRiders(), fetchOrders()]).finally(() => setLoading(false));

    // Realtime
    const channel = supabase
      .channel(`dispatch-${tenant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenant.id}` }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_profiles', filter: `tenant_id=eq.${tenant.id}` }, fetchRiders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_assignments' }, fetchOrders)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenant.id, fetchRiders, fetchOrders]);

  // ─── Asignar rider a pedido ──────────────────────────────────────────────────
  const assignRider = async (orderId: string, riderId: string) => {
    setAssigningOrderId(orderId);
    try {
      // Actualizar order
      await supabase.from('orders').update({
        rider_id: riderId,
        delivery_status: 'assigned',
      }).eq('id', orderId);

      // Crear o actualizar rider_assignment
      await supabase.from('rider_assignments').upsert({
        order_id: orderId,
        rider_id: riderId,
        tenant_id: tenant.id,
        assigned_at: new Date().toISOString(),
      }, { onConflict: 'order_id' });

      // Notificar al rider por WhatsApp si tiene teléfono
      const rider = riders.find(r => r.id === riderId);
      const order = orders.find(o => o.id === orderId);
      if (rider?.phone && order) {
        const riderAppUrl = `${window.location.origin}/rider/${tenant.slug}`;
        const msg = `🛵 *Nuevo pedido asignado* #${order.order_number}\n\n` +
          `📍 *Dirección:* ${order.delivery_formatted_address || order.delivery_address}\n` +
          (order.delivery_distance_km ? `📐 *Distancia:* ${order.delivery_distance_km.toFixed(1)} km\n` : '') +
          (order.delivery_eta_minutes ? `⏱️ *ETA:* ${order.delivery_eta_minutes} min\n` : '') +
          `\n🔗 Entra a la app: ${riderAppUrl}`;
        const waUrl = buildWhatsAppUrl(rider.phone, msg);
        if (waUrl) window.open(waUrl, '_blank');
      }
      // F6-B: Push notification al rider
      const riderForPush = riders.find(r => r.id === riderId);
      const orderForPush = orders.find(o => o.id === orderId);
      if (riderForPush && orderForPush) {
        sendPush('rider_assigned', 'rider', riderId, {
          orderNumber: String(orderForPush.order_number),
          address: orderForPush.delivery_formatted_address || orderForPush.delivery_address,
          distance: orderForPush.delivery_distance_km ? `${orderForPush.delivery_distance_km.toFixed(1)} km` : '',
        });
      }
      toast.success('Rider asignado ✅');
      await fetchOrders();
    } catch {
      toast.error('Error al asignar rider');
    } finally {
      setAssigningOrderId(null);
    }
  };

  // ─── Crear rider ─────────────────────────────────────────────────────────────
  const createRider = async () => {
    if (!newRider.name.trim() || newRider.pin.length < 4) {
      toast.error('Nombre y PIN de 4 dígitos son requeridos');
      return;
    }
    setSavingRider(true);
    const { error } = await supabase.from('rider_profiles').insert({
      tenant_id: tenant.id,
      name: newRider.name.trim(),
      phone: newRider.phone.trim() || null,
      pin_hash: bcrypt.hashSync(newRider.pin, 10), // Fase 3: hash bcrypt en cliente
      vehicle_type: newRider.vehicle_type,
      is_active: true,
    });
    setSavingRider(false);
    if (error) { toast.error('Error al crear rider'); return; }
    toast.success(`Rider ${newRider.name} creado ✅`);
    setNewRider({ name: '', phone: '', pin: '', vehicle_type: 'moto' });
    setShowAddRider(false);
    fetchRiders();
  };

  // ─── Desactivar rider ────────────────────────────────────────────────────────
  const toggleRiderActive = async (rider: RiderProfile) => {
    await supabase.from('rider_profiles').update({ is_active: !rider.is_active }).eq('id', rider.id);
    fetchRiders();
  };

  const riderAppUrl = `${window.location.origin}/rider/${tenant.slug}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="text-blue-400 animate-spin" />
      </div>
    );
  }

  // ─── Pedidos sin asignar ─────────────────────────────────────────────────────
  const unassigned = orders.filter(o => !o.rider_id || o.delivery_status === 'pending_assignment');
  const assigned   = orders.filter(o => o.rider_id && o.delivery_status !== 'pending_assignment');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <Bike size={16} className="text-blue-400" />
            Dispatch de Delivery
          </h3>
          <p className="text-slate-400 text-xs mt-0.5">
            {unassigned.length} sin asignar · {assigned.length} en curso · {riders.filter(r => r.is_active).length} riders activos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => Promise.all([fetchRiders(), fetchOrders()])}
            className="p-2 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowAddRider(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA' }}
          >
            <Plus size={12} />
            Agregar Rider
          </button>
        </div>
      </div>

      {/* Link a la RiderApp */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl text-xs"
        style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <div>
          <p className="text-blue-300 font-semibold">App para Repartidores</p>
          <p className="text-slate-500 mt-0.5 font-mono">{riderAppUrl}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { navigator.clipboard.writeText(riderAppUrl); toast.success('URL copiada'); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <Copy size={13} />
          </button>
          <a href={riderAppUrl} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 transition-colors">
            <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* ─── Riders ─────────────────────────────────────────────────────────── */}
      <div>
        <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3">Repartidores</h4>
        {riders.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            No hay riders registrados. Agrega uno arriba.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {riders.map(rider => {
              const activeOrder = assigned.find(o => o.rider_id === rider.id);
              const isOnline = rider.last_location_at
                ? (Date.now() - new Date(rider.last_location_at).getTime()) < 5 * 60 * 1000
                : false;

              return (
                <div
                  key={rider.id}
                  className="rounded-xl p-3 space-y-2"
                  style={{
                    background: rider.is_active ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${rider.is_active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
                    opacity: rider.is_active ? 1 : 0.5,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <User size={14} className="text-blue-400" />
                        </div>
                        {isOnline && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-gray-900" />
                        )}
                      </div>
                      <div>
                        <p className="text-white text-sm font-bold">{rider.name}</p>
                        <p className="text-slate-500 text-xs">{rider.vehicle_type} · {rider.phone || 'Sin teléfono'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setShowPins(p => ({ ...p, [rider.id]: !p[rider.id] }))}
                        className="p-1.5 rounded text-slate-500 hover:text-white transition-colors"
                        title="Ver PIN"
                      >
                        {showPins[rider.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                      <button
                        onClick={() => toggleRiderActive(rider)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: rider.is_active ? '#EF4444' : '#22C55E' }}
                        title={rider.is_active ? 'Desactivar' : 'Activar'}
                      >
                        {rider.is_active ? <Trash2 size={12} /> : <CheckCircle2 size={12} />}
                      </button>
                    </div>
                  </div>

                  {showPins[rider.id] && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <span className="text-yellow-400 text-xs font-mono font-bold">PIN guardado (hasheado) ✓</span>
                    </div>
                  )}

                  {activeOrder && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                      <Navigation size={11} className="text-orange-400" />
                      <span className="text-orange-300 text-xs">Pedido #{activeOrder.order_number} · {STATUS_LABELS[activeOrder.delivery_status || '']?.label}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Pedidos sin asignar ─────────────────────────────────────────────── */}
      {unassigned.length > 0 && (
        <div>
          <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            Sin asignar ({unassigned.length})
          </h4>
          <div className="space-y-3">
            {unassigned.map(order => (
              <div
                key={order.id}
                className="rounded-xl overflow-hidden"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <div className="px-4 py-3 flex items-center justify-between border-b border-yellow-500/10">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-yellow-400" />
                    <span className="text-white font-black">#{order.order_number}</span>
                    <span className="text-slate-400 text-sm">{formatPrice(order.total)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock size={11} />
                    {new Date(order.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <MapPin size={13} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-slate-300 text-xs leading-snug">
                      {order.delivery_formatted_address || order.delivery_address}
                      {order.delivery_distance_km && (
                        <span className="text-slate-500 ml-1">· {order.delivery_distance_km.toFixed(1)} km</span>
                      )}
                    </p>
                  </div>

                  {order.delivery_phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={11} className="text-slate-500" />
                      <span className="text-slate-400 text-xs">{order.delivery_phone}</span>
                    </div>
                  )}

                  {/* Selector de rider */}
                  {riders.filter(r => r.is_active).length > 0 ? (
                    <div>
                      <p className="text-slate-500 text-xs mb-2">Asignar a:</p>
                      <div className="flex flex-wrap gap-2">
                        {riders.filter(r => r.is_active).map(rider => {
                          const isBusy = assigned.some(o => o.rider_id === rider.id && o.delivery_status === 'picked_up');
                          return (
                            <button
                              key={rider.id}
                              onClick={() => assignRider(order.id, rider.id)}
                              disabled={assigningOrderId === order.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                              style={{
                                background: isBusy ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.15)',
                                border: `1px solid ${isBusy ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}`,
                                color: isBusy ? '#F87171' : '#60A5FA',
                              }}
                            >
                              {assigningOrderId === order.id
                                ? <Loader2 size={10} className="animate-spin" />
                                : <Bike size={10} />
                              }
                              {rider.name}
                              {isBusy && <span className="opacity-60">(ocupado)</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs">No hay riders activos. Agrega uno primero.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Pedidos en curso ────────────────────────────────────────────────── */}
      {assigned.length > 0 && (
        <div>
          <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-3">En curso ({assigned.length})</h4>
          <div className="space-y-2">
            {assigned.map(order => {
              const rider = riders.find(r => r.id === order.rider_id);
              const statusInfo = STATUS_LABELS[order.delivery_status || 'assigned'];
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white font-black text-sm">#{order.order_number}</span>
                    <div>
                      <p className="text-slate-300 text-xs">{rider?.name || 'Rider'}</p>
                      <p className="text-slate-500 text-xs">{order.delivery_distance_km?.toFixed(1)} km</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.delivery_lat && order.delivery_lon && (
                      <>
                        <button
                          onClick={() => setTrackingOrder(order)}
                          className="p-1.5 rounded text-slate-500 hover:text-blue-400 transition-colors"
                          title="Ver en mapa"
                        >
                          <Navigation size={12} />
                        </button>
                        <a
                          href={buildDirectionsLink(0, 0, order.delivery_lat, order.delivery_lon)}
                          target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </>
                    )}
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{ backgroundColor: `${statusInfo?.color}20`, color: statusInfo?.color }}
                    >
                      {statusInfo?.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Modal: Agregar Rider ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddRider && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddRider(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 space-y-4"
              style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold">Nuevo Repartidor</h3>
                <button onClick={() => setShowAddRider(false)} className="text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nombre del repartidor"
                  value={newRider.name}
                  onChange={e => setNewRider(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-slate-500 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <input
                  type="tel"
                  placeholder="Teléfono (opcional)"
                  value={newRider.phone}
                  onChange={e => setNewRider(p => ({ ...p, phone: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-slate-500 outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <input
                  type="text"
                  placeholder="PIN de 4 dígitos"
                  value={newRider.pin}
                  maxLength={4}
                  onChange={e => setNewRider(p => ({ ...p, pin: e.target.value.replace(/\D/g, '') }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-slate-500 outline-none font-mono tracking-widest"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
                <select
                  value={newRider.vehicle_type}
                  onChange={e => setNewRider(p => ({ ...p, vehicle_type: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  <option value="moto">🛵 Moto</option>
                  <option value="bicicleta">🚲 Bicicleta</option>
                  <option value="carro">🚗 Carro</option>
                  <option value="a_pie">🚶 A pie</option>
                </select>
              </div>

              <button
                onClick={createRider}
                disabled={savingRider}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', color: '#fff' }}
              >
                {savingRider ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Crear Repartidor'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Live Tracking Map Modal ── */}
      {trackingOrder && trackingOrder.rider_id && deliverySettings && (
        <LiveTrackingMap
          orderId={trackingOrder.id}
          riderId={trackingOrder.rider_id}
          restaurantLat={deliverySettings.restaurant_lat}
          restaurantLon={deliverySettings.restaurant_lon}
          clientLat={trackingOrder.delivery_lat!}
          clientLon={trackingOrder.delivery_lon!}
          clientAddress={trackingOrder.delivery_formatted_address || trackingOrder.delivery_address}
          orderNumber={trackingOrder.order_number}
          onClose={() => setTrackingOrder(null)}
        />
      )}
    </div>
  );
}
