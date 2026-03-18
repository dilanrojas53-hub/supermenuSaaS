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
// bcryptjs removido — login ahora es server-side via Edge Function rider-login
import { buildDirectionsLink, buildMapsLink } from '@/lib/maps';
import { formatPrice } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bike, MapPin, Phone, Navigation, CheckCircle2, Package,
  Clock, AlertCircle, LogOut, ChevronRight, Loader2,
  ExternalLink, RefreshCw, User
} from 'lucide-react';
import { toast } from 'sonner';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useRiderActiveOrders } from '@/hooks/useActiveOrder';
import { syncLogisticFromDeliveryStatus } from '@/lib/DeliveryCommitEngine';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface RiderProfile {
  id: string;
  name: string;
  phone?: string | null;
  vehicle_type: string;
  is_active: boolean;
  tenant_id?: string;
  pin_hash?: string;
  current_lat?: number | null;
  current_lon?: number | null;
  last_location_at?: string | null;
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
  // F8: Hook unificado — fuente de verdad compartida con realtime incluido
  const {
    orders: activeOrdersRaw,
    currentOrder: currentActiveOrder,
    refetch: refetchOrders,
  } = useRiderActiveOrders(rider?.id);
  // Adaptar al tipo DeliveryOrder para compatibilidad con el resto del componente
  const orders = activeOrdersRaw as any as DeliveryOrder[];
  const [loading, setLoading] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  // Flujo de 2 pasos: primero seleccionar rider, luego ingresar PIN
  const [availableRiders, setAvailableRiders] = useState<{id: string; name: string; vehicle_type: string}[]>([]);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [selectedRiderName, setSelectedRiderName] = useState<string>('');
  const [loginStep, setLoginStep] = useState<'select' | 'pin'>('select');
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // F6-A: PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Capturar el evento beforeinstallprompt para mostrar botón de instalación
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    const onlineHandler = () => setIsOnline(true);
    const offlineHandler = () => setIsOnline(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!installPrompt) return;
    (installPrompt as any).prompt();
    const { outcome } = await (installPrompt as any).userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
      toast.success('App instalada en tu pantalla de inicio 🚀');
    }
  };

  // F6-B: Push Notifications para el rider
  const { subscribe: subscribePush, sendPush } = usePushNotifications({
    tenantId: tenantId || '',
    subscriberType: 'rider',
    subscriberId: rider?.id || '',
    riderId: rider?.id,
    autoSubscribe: false, // Se activa manualmente tras login exitoso
  });

  // ─── Cargar tenant + restaurar sesión desde localStorage ──────────────────────
  useEffect(() => {
    supabase.from('tenants').select('id, name').eq('slug', slug).single()
      .then(async ({ data }) => {
        if (data) {
          setTenantId(data.id);
          setTenantName(data.name);
          // Restaurar sesión del rider si existe (PWA persistencia)
          const saved = localStorage.getItem(`rider_session_${slug}`);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              // Sesión válida por 12 horas
              if (parsed.loginAt && Date.now() - parsed.loginAt < 12 * 60 * 60 * 1000) {
                setRider(parsed);
                setLoading(false);
                return;
              } else {
                localStorage.removeItem(`rider_session_${slug}`);
              }
            } catch { localStorage.removeItem(`rider_session_${slug}`); }
          }
          // Cargar lista de riders activos para el paso 1 del login
          const { data: ridersData } = await supabase
            .from('rider_profiles')
            .select('id, name, vehicle_type')
            .eq('tenant_id', data.id)
            .eq('is_active', true)
            .order('name');
          if (ridersData) setAvailableRiders(ridersData);
        }
        setLoading(false);
      });
  }, [slug]);  // eslint-disable-line react-hooks/exhaustive-deps

  // F8: fetch y realtime de pedidos manejados por useRiderActiveOrders

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
        const activeOrder = orders.find(o => o.id === activeOrderId);
        const assignment = activeOrder?.assignment;
        await supabase.from('rider_location_updates').insert({
          rider_id: rider.id,
          assignment_id: assignment?.id || null,
          lat, lon, accuracy_m: accuracy,
        });
        // ── ETA dinámico: recalcular distancia rider→cliente cada actualización ──
        if (activeOrder?.delivery_lat && activeOrder?.delivery_lon) {
          try {
            const R = 6371;
            const dLat = (activeOrder.delivery_lat - lat) * Math.PI / 180;
            const dLon = (activeOrder.delivery_lon - lon) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 +
              Math.cos(lat * Math.PI / 180) * Math.cos(activeOrder.delivery_lat * Math.PI / 180) *
              Math.sin(dLon/2)**2;
            const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const avgSpeedKmh = 25; // velocidad promedio moto en ciudad
            const etaMin = Math.max(1, Math.ceil((distKm / avgSpeedKmh) * 60) + 2);
            await supabase.from('orders').update({
              delivery_eta_minutes: etaMin,
            }).eq('id', activeOrderId);
          } catch { /* ignorar errores de cálculo */ }
        }
      });
    };

    sendLocation(); // Inmediato
    locationIntervalRef.current = setInterval(sendLocation, 15000); // Cada 15s
    return () => { if (locationIntervalRef.current) clearInterval(locationIntervalRef.current); };
  }, [rider, activeOrderId, orders]);

  // ─── Login con PIN (server-side via Edge Function — pin_hash nunca llega al cliente) ──────
  const handlePinLogin = async () => {
    if (!slug || pinInput.length < 4 || !selectedRiderId) return;
    setLoginLoading(true);
    setPinError('');
    try {
      const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk';
      const res = await fetch(
        'https://zddytyncmnivfbvehrth.supabase.co/functions/v1/rider-login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ slug, pin: pinInput, rider_id: selectedRiderId }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.locked) {
          setPinError('Demasiados intentos. Espera 15 minutos.');
        } else if (typeof data.attemptsRemaining === 'number' && data.attemptsRemaining > 0) {
          setPinError(`PIN incorrecto. ${data.attemptsRemaining} intento${data.attemptsRemaining !== 1 ? 's' : ''} restante${data.attemptsRemaining !== 1 ? 's' : ''}.`);
        } else if (data.attemptsRemaining === 0) {
          setPinError('Cuenta bloqueada temporalmente. Espera 15 minutos.');
        } else {
          setPinError(data.error || 'PIN incorrecto');
        }
        return;
      }
      // Login exitoso — guardar rider en estado (sin pin_hash)
      const riderData: RiderProfile = {
        id: data.rider.id,
        name: data.rider.name,
        vehicle_type: data.rider.vehicle_type || 'moto',
        is_active: true,
        tenant_id: data.rider.tenant_id,
        pin_hash: '',
        current_lat: null,
        current_lon: null,
        last_location_at: null,
      };
      setRider(riderData);
      // Persistir sesión en localStorage (sin pin_hash)
      localStorage.setItem(`rider_session_${slug}`, JSON.stringify({ ...riderData, loginAt: Date.now() }));
      toast.success(`¡Bienvenido, ${data.rider.name}! 🛯`);
      // F6-B: Suscribir al rider a push notifications tras login exitoso
      setTimeout(() => subscribePush(), 1000);
    } catch (err) {
      setPinError('Error de conexión. Verifica tu internet.');
      console.error('[RiderLogin]', err);
    } finally {
      setLoginLoading(false);
    }
  };

  // ─── Cambiar estado del pedido ───────────────────────────────────────────────
  const handleStatusChange = async (order: DeliveryOrder, newStatus: string) => {
    const now = new Date().toISOString();
    const assignmentUpdate: Record<string, string> = {};
    if (newStatus === 'accepted') assignmentUpdate.accepted_at = now;
    if (newStatus === 'picked_up') { assignmentUpdate.picked_up_at = now; setActiveOrderId(order.id); }
    if (newStatus === 'delivered') {
      assignmentUpdate.delivered_at = now;
      setActiveOrderId(null); // P1: Guard GPS — detiene el tracking al entregar
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    }

    // Actualizar delivery_status en orders + sincronizar status general
    const orderUpdate: Record<string, string> = { delivery_status: newStatus };
    if (newStatus === 'delivered') orderUpdate.status = 'entregado';
    if (newStatus === 'cancelled') orderUpdate.status = 'cancelado';
    await supabase.from('orders').update(orderUpdate).eq('id', order.id);

    // F7: Sincronizar logistic_status con delivery_status (assigned → assigned, picked_up → picked_up, etc.)
    // Si es 'delivered', también promueve el siguiente pedido en waitlist automáticamente
    if (tenantId) {
      syncLogisticFromDeliveryStatus(order.id, tenantId, newStatus).catch(err =>
        console.warn('[DeliveryCommitEngine] syncLogistic error:', err)
      );
    }

    // Actualizar rider_assignments
    if (order.assignment && Object.keys(assignmentUpdate).length > 0) {
      await supabase.from('rider_assignments').update(assignmentUpdate).eq('id', order.assignment.id);
    }

    // F6-B: Push notification al cliente sobre el cambio de estado
    const pushEventMap: Record<string, string> = {
      accepted: 'order_confirmed',
      picked_up: 'rider_on_the_way',
      delivered: 'order_delivered',
    };
    const pushEvent = pushEventMap[newStatus];
    if (tenantId && pushEvent) {
      sendPush(pushEvent, 'client', order.id, {
        orderNumber: String(order.order_number),
        riderName: rider?.name || '',
        eta: String(order.delivery_eta_minutes || ''),
      });
    }

    toast.success(DELIVERY_STATUS_LABELS[newStatus]?.label + ' ✅');
    if (rider) refetchOrders();
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
          <p className="text-[var(--text-primary)] font-bold">Restaurante no encontrado</p>
        </div>
      </div>
    );
  }

  // ─── Render: Login (2 pasos) ─────────────────────────────────────────────────
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
            <h1 className="text-2xl font-black text-[var(--text-primary)]">SmartMenu Rider</h1>
            <p className="text-[var(--text-secondary)] text-sm mt-1">{tenantName}</p>
          </div>

          {loginStep === 'select' ? (
            /* Paso 1: Seleccionar rider */
            <div className="bg-card border border-gray-800 rounded-2xl p-6">
              <label className="block text-xs text-[var(--text-secondary)] mb-4 font-semibold uppercase tracking-wide">
                ¿Quién eres?
              </label>
              {availableRiders.length === 0 ? (
                <div className="text-center py-6">
                  <User size={32} className="text-gray-600 mx-auto mb-2" />
                  <p className="text-[var(--text-secondary)] text-sm">No hay repartidores activos</p>
                  <p className="text-gray-600 text-xs mt-1">Pide al admin que te agregue</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {availableRiders.map(r => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelectedRiderId(r.id);
                        setSelectedRiderName(r.name);
                        setLoginStep('pin');
                        setPinInput('');
                        setPinError('');
                      }}
                      className="flex items-center gap-3 p-4 rounded-xl text-left transition-all active:scale-98"
                      style={{ backgroundColor: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}
                    >
                      <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-orange-400 font-black text-lg">{r.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-[var(--text-primary)] font-bold">{r.name}</p>
                        <p className="text-[var(--text-secondary)] text-xs capitalize">{r.vehicle_type}</p>
                      </div>
                      <ChevronRight size={16} className="text-[var(--text-secondary)] ml-auto" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Paso 2: Ingresar PIN */
            <div className="bg-card border border-gray-800 rounded-2xl p-6">
              {/* Rider seleccionado */}
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-gray-800">
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <span className="text-orange-400 font-black text-lg">{selectedRiderName.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1">
                  <p className="text-[var(--text-primary)] font-bold">{selectedRiderName}</p>
                  <p className="text-[var(--text-secondary)] text-xs">Ingresa tu PIN de 4 dígitos</p>
                </div>
                <button
                  onClick={() => { setLoginStep('select'); setPinInput(''); setPinError(''); }}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-secondary)] text-xs"
                >
                  Cambiar
                </button>
              </div>

              <label className="block text-xs text-[var(--text-secondary)] mb-3 font-semibold uppercase tracking-wide">
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
                      border: '1px solid hsl(var(--border))',
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
          )}
        </motion.div>
      </div>
    );
  }

  // ─── Render: Dashboard del Rider ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 pb-8">
      {/* Header */}
      <div className="bg-card border-b border-gray-800 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center">
            <User size={18} className="text-orange-400" />
          </div>
          <div>
            <p className="text-[var(--text-primary)] font-bold text-sm">{rider.name}</p>
            <p className="text-[var(--text-secondary)] text-xs">{tenantName} · {rider.vehicle_type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* P1: Indicador de conexión */}
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}
            title={isOnline ? 'Conectado' : 'Sin conexión'} />
          {/* F6-A: Botón de instalación PWA */}
          {installPrompt && (
            <button
              onClick={handleInstallPWA}
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
              title="Instalar app en pantalla de inicio"
            >
              Instalar
            </button>
          )}
          <button
            onClick={() => rider && refetchOrders()}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => {
              setRider(null);
              setPinInput('');
              setActiveOrderId(null);
              if (slug) localStorage.removeItem(`rider_session_${slug}`);
            }}
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-red-400 transition-colors"
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
            <p className="text-[var(--text-secondary)] font-semibold">Sin pedidos asignados</p>
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
                  className="bg-card border border-gray-800 rounded-2xl overflow-hidden"
                >
                  {/* Header del pedido */}
                  <div className="px-4 py-3 flex items-center justify-between border-b border-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-primary)] font-black">#{order.order_number}</span>
                      <span className="text-[var(--text-secondary)] text-sm">{formatPrice(order.total)}</span>
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
                        <p className="text-[var(--text-primary)] text-sm font-medium leading-snug">
                          {order.delivery_formatted_address || order.delivery_address}
                        </p>
                        {order.delivery_distance_km && (
                          <p className="text-[var(--text-secondary)] text-xs mt-0.5">
                            {order.delivery_distance_km.toFixed(1)} km · ~{order.delivery_eta_minutes} min
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Teléfono del cliente */}
                    {order.delivery_phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-[var(--text-secondary)] flex-shrink-0" />
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
                      <p className="text-[var(--text-secondary)] text-xs bg-[var(--bg-surface)] rounded-lg px-3 py-2">
                        📝 {order.notes}
                      </p>
                    )}

                    {/* Items del pedido */}
                    <div className="space-y-1 pt-1">
                      {(order.items || []).slice(0, 3).map((item: any, j: number) => (
                        <div key={j} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
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
                    {nextAction && (() => {
                      // Bloquear 'Aceptar pedido' si cocina aún no marcó el pedido como listo
                      const isAcceptAction = nextAction.nextStatus === 'accepted';
                      const orderStatus = (order as any).status;
                      const isKitchenReady = orderStatus === 'listo' || orderStatus === 'entregado';
                      const isBlocked = isAcceptAction && !isKitchenReady;
                      return (
                        <>
                          {isBlocked && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20">
                              <Clock size={12} />
                              <span>Esperando que cocina marque el pedido como listo...</span>
                            </div>
                          )}
                          <button
                            onClick={() => { if (!isBlocked) handleStatusChange(order, nextAction.nextStatus); }}
                            disabled={isBlocked}
                            className="w-full py-3 rounded-xl text-sm font-black transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              background: isBlocked
                                ? 'rgba(55,65,81,0.8)'
                                : `linear-gradient(135deg,${nextAction.color},${nextAction.color}cc)`,
                              color: '#fff',
                            }}
                          >
                            {nextAction.label}
                          </button>
                        </>
                      );
                    })()}
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
