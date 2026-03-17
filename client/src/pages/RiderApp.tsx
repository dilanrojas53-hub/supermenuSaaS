/**
 * RiderApp.tsx — Fase 2 Delivery
 * Interfaz móvil para repartidores de SmartMenu.
 *
 * Flujo:
 * 1. Login con PIN (4 dígitos) → identifica al rider por tenant
 * 2. Lista de pedidos delivery asignados al rider
 * 3. Botones de estado: Aceptar → En camino → Entregado
 * 4. Tracking GPS automático mientras hay un pedido activo
 * 5. Link de Google Maps Directions al cliente
 *
 * Ruta: /rider/:slug
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'wouter';
import { supabase } from '@/lib/supabase';
import { buildDirectionsLink, buildMapsLink } from '@/lib/maps';
import { formatPrice } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bike, MapPin, Phone, Navigation, CheckCircle2, Package,
  Clock, AlertCircle, LogOut, ChevronRight, Loader2,
  ExternalLink, RefreshCw, User
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface RiderProfile {
  id: string;
  name: string;
  phone: string | null;
  vehicle_type: string;
  is_active: boolean;
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
  total: number;
  notes: string | null;
  created_at: string;
  items: any[];
  assignment: {
    id: string;
    accepted_at: string | null;
    picked_up_at: string | null;
    delivered_at: string | null;
  } | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const DELIVERY_STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending_assignment: { label: 'Pendiente', color: '#F59E0B', icon: <Clock size={14} /> },
  assigned:          { label: 'Asignado', color: '#3B82F6', icon: <Bike size={14} /> },
  accepted:          { label: 'Aceptado', color: '#8B5CF6', icon: <CheckCircle2 size={14} /> },
  picked_up:         { label: 'En camino', color: '#F97316', icon: <Navigation size={14} /> },
  delivered:         { label: 'Entregado', color: '#22C55E', icon: <CheckCircle2 size={14} /> },
  cancelled:         { label: 'Cancelado', color: '#EF4444', icon: <AlertCircle size={14} /> },
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function RiderApp() {
  const { slug } = useParams<{ slug: string }>();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Cargar tenant ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('tenants').select('id, name').eq('slug', slug).single()
      .then(({ data }) => {
        if (data) { setTenantId(data.id); setTenantName(data.name); }
        setLoading(false);
      });
  }, [slug]);

  // ─── Cargar pedidos del rider ───────────────────────────────────────────────
  const fetchOrders = useCallback(async (riderId: string) => {
    const { data } = await supabase
      .from('orders')
      .select(`
        id, order_number, delivery_address, delivery_phone,
        delivery_lat, delivery_lon, delivery_formatted_address,
        delivery_eta_minutes, delivery_distance_km, delivery_status,
        total, notes, created_at, items,
        rider_assignments!inner(id, accepted_at, picked_up_at, delivered_at)
      `)
      .eq('rider_id', riderId)
      .eq('delivery_type', 'delivery')
      .not('delivery_status', 'in', '(delivered,cancelled)')
      .order('created_at', { ascending: false });

    if (data) {
      const mapped = data.map((o: any) => ({
        ...o,
        assignment: o.rider_assignments?.[0] || null,
      }));
      setOrders(mapped);
    }
  }, []);

  // ─── Realtime: escuchar cambios en orders del rider ─────────────────────────
  useEffect(() => {
    if (!rider) return;
    fetchOrders(rider.id);

    const channel = supabase
      .channel(`rider-orders-${rider.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `rider_id=eq.${rider.id}`,
      }, () => fetchOrders(rider.id))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rider_assignments',
        filter: `rider_id=eq.${rider.id}`,
      }, () => fetchOrders(rider.id))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [rider, fetchOrders]);

  // ─── Tracking GPS automático ─────────────────────────────────────────────────
  useEffect(() => {
    if (!rider || !activeOrderId) {
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
      return;
    }

    const sendLocation = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        // Actualizar current_lat/lon en rider_profiles
        await supabase.from('rider_profiles').update({
          current_lat: lat, current_lon: lon,
          last_location_at: new Date().toISOString(),
        }).eq('id', rider.id);
        // Insertar en rider_location_updates para historial
        const assignment = orders.find(o => o.id === activeOrderId)?.assignment;
        await supabase.from('rider_location_updates').insert({
          rider_id: rider.id,
          assignment_id: assignment?.id || null,
          lat, lon, accuracy_m: accuracy,
        });
      });
    };

    sendLocation(); // Inmediato
    locationIntervalRef.current = setInterval(sendLocation, 15000); // Cada 15s
    return () => { if (locationIntervalRef.current) clearInterval(locationIntervalRef.current); };
  }, [rider, activeOrderId, orders]);

  // ─── Login con PIN ──────────────────────────────────────────────────────────
  const handlePinLogin = async () => {
    if (!tenantId || pinInput.length < 4) return;
    setLoginLoading(true);
    setPinError('');

    // Buscar riders activos del tenant
    const { data: riders } = await supabase
      .from('rider_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (!riders?.length) {
      setPinError('No hay repartidores registrados para este restaurante');
      setLoginLoading(false);
      return;
    }

    // Verificar PIN (comparación directa — en producción usar bcrypt en edge function)
    // Por ahora el PIN se guarda como texto plano en pin_hash para simplificar Fase 2
    const match = riders.find(r => r.pin_hash === pinInput);
    if (!match) {
      setPinError('PIN incorrecto');
      setLoginLoading(false);
      return;
    }

    setRider(match);
    setLoginLoading(false);
    toast.success(`¡Bienvenido, ${match.name}! 🛵`);
  };

  // ─── Cambiar estado del pedido ───────────────────────────────────────────────
  const handleStatusChange = async (order: DeliveryOrder, newStatus: string) => {
    const now = new Date().toISOString();
    const assignmentUpdate: Record<string, string> = {};
    if (newStatus === 'accepted') assignmentUpdate.accepted_at = now;
    if (newStatus === 'picked_up') { assignmentUpdate.picked_up_at = now; setActiveOrderId(order.id); }
    if (newStatus === 'delivered') { assignmentUpdate.delivered_at = now; setActiveOrderId(null); }

    // Actualizar delivery_status en orders
    await supabase.from('orders').update({ delivery_status: newStatus }).eq('id', order.id);

    // Actualizar rider_assignments
    if (order.assignment && Object.keys(assignmentUpdate).length > 0) {
      await supabase.from('rider_assignments').update(assignmentUpdate).eq('id', order.assignment.id);
    }

    toast.success(DELIVERY_STATUS_LABELS[newStatus]?.label + ' ✅');
    if (rider) fetchOrders(rider.id);
  };

  const getNextAction = (status: string | null): { label: string; nextStatus: string; color: string } | null => {
    if (status === 'assigned' || status === 'pending_assignment')
      return { label: 'Aceptar pedido', nextStatus: 'accepted', color: '#8B5CF6' };
    if (status === 'accepted')
      return { label: '🛵 Salir a entregar', nextStatus: 'picked_up', color: '#F97316' };
    if (status === 'picked_up')
      return { label: '✅ Marcar entregado', nextStatus: 'delivered', color: '#22C55E' };
    return null;
  };

  // ─── Render: Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 size={32} className="text-orange-400 animate-spin" />
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-3" />
          <p className="text-white font-bold">Restaurante no encontrado</p>
        </div>
      </div>
    );
  }

  // ─── Render: Login PIN ───────────────────────────────────────────────────────
  if (!rider) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <Bike size={32} className="text-orange-400" />
            </div>
            <h1 className="text-2xl font-black text-white">SmartMenu Rider</h1>
            <p className="text-gray-400 text-sm mt-1">{tenantName}</p>
          </div>

          {/* PIN Input */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <label className="block text-xs text-gray-400 mb-3 font-semibold uppercase tracking-wide">
              Ingresa tu PIN
            </label>
            <div className="flex gap-3 justify-center mb-6">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className="w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-black transition-all"
                  style={{
                    borderColor: pinInput.length > i ? '#F97316' : '#374151',
                    backgroundColor: pinInput.length > i ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.03)',
                    color: '#fff',
                  }}
                >
                  {pinInput.length > i ? '●' : ''}
                </div>
              ))}
            </div>

            {/* Teclado numérico */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((key, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (key === '⌫') setPinInput(p => p.slice(0, -1));
                    else if (key !== '' && pinInput.length < 4) setPinInput(p => p + String(key));
                  }}
                  disabled={key === ''}
                  className="h-14 rounded-xl text-xl font-bold transition-all active:scale-95 disabled:invisible"
                  style={{
                    backgroundColor: key === '⌫' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
                    color: key === '⌫' ? '#EF4444' : '#fff',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {key}
                </button>
              ))}
            </div>

            {pinError && (
              <p className="text-red-400 text-sm text-center mb-3">{pinError}</p>
            )}

            <button
              onClick={handlePinLogin}
              disabled={pinInput.length < 4 || loginLoading}
              className="w-full py-3.5 rounded-xl font-bold text-base transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#F97316,#EF4444)', color: '#fff' }}
            >
              {loginLoading ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Entrar'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Render: Dashboard del Rider ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 pb-8">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center">
            <User size={18} className="text-orange-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">{rider.name}</p>
            <p className="text-gray-500 text-xs">{tenantName} · {rider.vehicle_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => rider && fetchOrders(rider.id)}
            className="p-2 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => { setRider(null); setPinInput(''); setActiveOrderId(null); }}
            className="p-2 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="px-4 pt-4 space-y-4">
        {/* Indicador de tracking activo */}
        {activeOrderId && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: '#F97316' }}
          >
            <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
            Tracking GPS activo — enviando ubicación cada 15s
          </motion.div>
        )}

        {/* Lista de pedidos */}
        {orders.length === 0 ? (
          <div className="text-center py-16">
            <Package size={48} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">Sin pedidos asignados</p>
            <p className="text-gray-600 text-sm mt-1">Los pedidos aparecerán aquí cuando te sean asignados</p>
          </div>
        ) : (
          <AnimatePresence>
            {orders.map((order, i) => {
              const statusInfo = DELIVERY_STATUS_LABELS[order.delivery_status || 'assigned'];
              const nextAction = getNextAction(order.delivery_status);

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
                >
                  {/* Header del pedido */}
                  <div className="px-4 py-3 flex items-center justify-between border-b border-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-black">#{order.order_number}</span>
                      <span className="text-gray-400 text-sm">{formatPrice(order.total)}</span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{ backgroundColor: `${statusInfo?.color}20`, color: statusInfo?.color }}
                    >
                      {statusInfo?.icon}
                      {statusInfo?.label}
                    </div>
                  </div>

                  {/* Dirección */}
                  <div className="px-4 py-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin size={15} className="text-orange-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium leading-snug">
                          {order.delivery_formatted_address || order.delivery_address}
                        </p>
                        {order.delivery_distance_km && (
                          <p className="text-gray-500 text-xs mt-0.5">
                            {order.delivery_distance_km.toFixed(1)} km · ~{order.delivery_eta_minutes} min
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Teléfono del cliente */}
                    {order.delivery_phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-gray-500 flex-shrink-0" />
                        <a
                          href={`tel:${order.delivery_phone}`}
                          className="text-blue-400 text-sm hover:text-blue-300 transition-colors"
                        >
                          {order.delivery_phone}
                        </a>
                      </div>
                    )}

                    {/* Notas */}
                    {order.notes && (
                      <p className="text-gray-400 text-xs bg-gray-800/50 rounded-lg px-3 py-2">
                        📝 {order.notes}
                      </p>
                    )}

                    {/* Items del pedido */}
                    <div className="space-y-1 pt-1">
                      {(order.items || []).slice(0, 3).map((item: any, j: number) => (
                        <div key={j} className="flex items-center gap-2 text-xs text-gray-400">
                          <ChevronRight size={10} className="text-gray-600" />
                          <span>{item.quantity}x {item.name}</span>
                        </div>
                      ))}
                      {(order.items || []).length > 3 && (
                        <p className="text-xs text-gray-600 pl-4">+{order.items.length - 3} más</p>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="px-4 pb-4 space-y-2">
                    {/* Link Google Maps */}
                    {order.delivery_lat && order.delivery_lon && (
                      <a
                        href={buildDirectionsLink(0, 0, order.delivery_lat, order.delivery_lon)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#60A5FA' }}
                      >
                        <ExternalLink size={14} />
                        Abrir en Google Maps
                      </a>
                    )}

                    {/* Botón de acción principal */}
                    {nextAction && (
                      <button
                        onClick={() => handleStatusChange(order, nextAction.nextStatus)}
                        className="w-full py-3 rounded-xl text-sm font-black transition-all active:scale-98"
                        style={{ background: `linear-gradient(135deg,${nextAction.color},${nextAction.color}cc)`, color: '#fff' }}
                      >
                        {nextAction.label}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
