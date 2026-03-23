/*
 * OrderStatusPage — Live Tracking + Cuenta Abierta
 * Design: "Warm Craft" dark card with animated status steps.
 * Supabase Realtime subscription for live status updates.
 * Route: /order-status/:orderId
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useActiveOrder } from '@/hooks/useActiveOrder';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Flame, CheckCircle2, Package, XCircle, Plus, ShoppingBag, MessageCircle, MapPin, Bike, Camera, Loader2, Check, ShieldCheck } from 'lucide-react';
import { buildWhatsAppUrl, waPhone } from '@/lib/phone';
import { buildMapsLink } from '@/lib/maps';
import { supabase } from '@/lib/supabase';
import type { Order, OrderStatus } from '@/lib/types';
import { formatPrice, ORDER_STATUS_CONFIG } from '@/lib/types';
import { useAnimationConfig } from '@/contexts/AnimationContext';
import { applyRestaurantTheme } from '@/lib/themes';
import { toast } from 'sonner';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const TABLE_QUICK_REQUESTS = [
  { type: 'water_ice', label: 'Agua / Hielo', emoji: '💧' },
  { type: 'napkins', label: 'Servilletas', emoji: '🧻' },
  { type: 'help', label: 'Ayuda', emoji: '🆘' },
] as const;

type TableQuickRequestType = typeof TABLE_QUICK_REQUESTS[number]['type'];

// Status step config with icons and animations
const STATUS_STEPS: {
  key: OrderStatus;
  label: string;
  icon: React.ReactNode;
  animClass: string;
  color: string;
}[] = [
  {
    key: 'pendiente',
    label: 'Pedido recibido',
    icon: <Clock size={24} />,
    animClass: 'animate-pulse',
    color: '#F59E0B',
  },
  {
    key: 'en_cocina',
    label: 'En preparación',
    icon: <Flame size={24} />,
    animClass: 'animate-bounce',
    color: '#F97316',
  },
  {
    key: 'listo',
    label: '¡Listo para recoger!',
    icon: <CheckCircle2 size={24} />,
    animClass: 'animate-pulse',
    color: '#10B981',
  },
  {
    key: 'entregado',
    label: 'Entregado',
    icon: <Package size={24} />,
    animClass: '',
    color: '#6B7280',
  },
];

// ─── Componente auxiliar: muestra el número SINPE del restaurante ───
function SinpeTenantNumber({ tenantId }: { tenantId: string }) {
  const [sinpeNumber, setSinpeNumber] = useState<string | null>(null);
  const [sinpeOwner, setSinpeOwner] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase
      .from('tenants')
      .select('sinpe_number, sinpe_owner')
      .eq('id', tenantId)
      .single()
      .then(({ data }) => {
        if (data) {
          setSinpeNumber(data.sinpe_number || null);
          setSinpeOwner(data.sinpe_owner || null);
        }
      });
  }, [tenantId]);

  if (!sinpeNumber) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(sinpeNumber.replace(/-/g, '')).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ backgroundColor: 'var(--menu-bg)', borderColor: 'var(--menu-accent)' }}>
      <div>
        <p className="text-xs mb-0.5" style={{ color: 'var(--menu-muted)' }}>Número SINPE del local</p>
        <p className="text-lg font-black tracking-wider" style={{ color: 'var(--menu-accent)' }}>{sinpeNumber}</p>
        {sinpeOwner && <p className="text-xs" style={{ color: 'var(--menu-muted)' }}>A nombre de: {sinpeOwner}</p>}
      </div>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
        style={{ backgroundColor: copied ? 'rgba(34,197,94,0.15)' : 'var(--menu-accent)' + '20', color: copied ? '#22C55E' : 'var(--menu-accent)' }}
      >
        {copied ? <Check size={14} /> : <Camera size={14} />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

// ─── Componente: Delivery Tracking Block ─────────────────────────────────────
// F7: Muestra logistic_status pre-dispatch (waitlist, soft_reserve, kitchen_commit)
// y delivery_status post-dispatch (assigned, picked_up, delivered)
function DeliveryTrackingBlock({ orderId, order }: { orderId: string; order: any }) {
  const [riderLocation, setRiderLocation] = useState<{ lat: number; lon: number } | null>(null);
  const deliveryStatus = order.delivery_status as string | null;
  const logisticStatus = order.logistic_status as string | null;

  // Escuchar actualizaciones de ubicación del rider en tiempo real
  useEffect(() => {
    if (!order.rider_id) return;
    // Cargar última ubicación conocida
    supabase
      .from('rider_profiles')
      .select('current_lat, current_lon, last_location_at')
      .eq('id', order.rider_id)
      .single()
      .then(({ data }) => {
        if (data?.current_lat && data?.current_lon) {
          setRiderLocation({ lat: data.current_lat, lon: data.current_lon });
        }
      });
    // Realtime: escuchar nuevas ubicaciones
    const channel = supabase
      .channel(`rider-loc-${order.rider_id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'rider_location_updates',
        filter: `rider_id=eq.${order.rider_id}`,
      }, (payload) => {
        const loc = payload.new as any;
        setRiderLocation({ lat: loc.lat, lon: loc.lon });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [order.rider_id]);

  // F7: Pasos logísticos completos (pre-dispatch + post-dispatch)
  // Los pasos pre-dispatch se basan en logistic_status
  // Los pasos post-dispatch se basan en delivery_status
  const PRE_DISPATCH_STEPS = [
    { key: 'waitlist',       label: 'En lista de espera',     icon: '⏳', color: '#F59E0B' },
    { key: 'soft_reserve',   label: 'Disponibilidad confirmada', icon: '✔️', color: '#3B82F6' },
    { key: 'kitchen_commit', label: 'Cocina preparando',     icon: '👨‍🍳', color: '#8B5CF6' },
    { key: 'ready_for_pickup', label: 'Listo para recoger',  icon: '📦', color: '#EAB308' },
  ];

  const POST_DISPATCH_STEPS = [
    { status: 'assigned',   label: 'Repartidor asignado',    icon: '🛵', color: '#3B82F6' },
    { status: 'picked_up',  label: 'Pedido recogido',        icon: '🏃', color: '#F97316' },
    { status: 'delivered',  label: '¡Entregado!',            icon: '✅', color: '#22C55E' },
  ];

  // Determinar si estamos en fase pre-dispatch o post-dispatch
  const isPreDispatch = !deliveryStatus || deliveryStatus === 'pending_assignment';
  const preIdx = PRE_DISPATCH_STEPS.findIndex(s => s.key === logisticStatus);

  // Fallback: si no hay logistic_status, usar el flujo legacy
  const DELIVERY_STEPS = [
    { status: 'pending_assignment', label: 'Buscando repartidor', icon: '🔍', color: '#F59E0B' },
    { status: 'assigned',          label: 'Repartidor asignado', icon: '🛵', color: '#3B82F6' },
    { status: 'accepted',          label: 'Repartidor en camino', icon: '🛵', color: '#8B5CF6' },
    { status: 'picked_up',         label: 'Pedido recogido', icon: '📦', color: '#F97316' },
    { status: 'delivered',         label: '¡Entregado!', icon: '✅', color: '#22C55E' },
  ];

  const currentIdx = DELIVERY_STEPS.findIndex(s => s.status === deliveryStatus);

  return (
    <div className="rounded-2xl p-5 border space-y-4" style={{ backgroundColor: 'var(--menu-surface)', borderColor: 'var(--menu-border)' }}>
      <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--menu-muted)' }}>
        <Bike size={14} className="text-orange-400" />
        Seguimiento del Delivery
      </h2>

      {/* F7: Pasos del delivery — pre-dispatch o post-dispatch según logistic_status */}
      {logisticStatus && isPreDispatch ? (
        // Vista pre-dispatch: mostrar progreso logístico
        <div className="space-y-3">
          {/* Indicador de estado logístico */}
          {logisticStatus === 'waitlist' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <span className="text-lg">⏳</span>
              <div>
                <p className="text-amber-300 text-sm font-bold">Tu pedido está en lista de espera</p>
                <p className="text-muted-foreground text-xs">Te notificaremos cuando haya disponibilidad</p>
              </div>
            </div>
          )}
          {logisticStatus === 'soft_reserve' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
              <span className="text-lg">✔️</span>
              <div>
                <p className="text-blue-300 text-sm font-bold">Disponibilidad confirmada</p>
                <p className="text-muted-foreground text-xs">Tu pedido está siendo procesado</p>
              </div>
            </div>
          )}
          {logisticStatus === 'kitchen_commit' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <span className="text-lg">👨‍🍳</span>
              <div>
                <p className="text-purple-300 text-sm font-bold">Cocina preparando tu pedido</p>
                <p className="text-muted-foreground text-xs">Pronto asignaremos un repartidor</p>
              </div>
            </div>
          )}
          {logisticStatus === 'ready_for_pickup' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}>
              <span className="text-lg">📦</span>
              <div>
                <p className="text-yellow-300 text-sm font-bold">¡Pedido listo!</p>
                <p className="text-muted-foreground text-xs">Esperando que el repartidor lo recoja</p>
              </div>
            </div>
          )}
          {/* Pasos pre-dispatch */}
          <div className="space-y-2">
            {PRE_DISPATCH_STEPS.map((step, i) => {
              const isDone = preIdx > i;
              const isActive = preIdx === i;
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                    style={{
                      background: isDone ? 'rgba(34,197,94,0.2)' : isActive ? `${step.color}25` : 'var(--menu-border)',
                      border: `1.5px solid ${isDone ? '#22C55E' : isActive ? step.color : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {isDone ? '✓' : step.icon}
                  </div>
                  <span className="text-sm" style={{ color: isDone ? '#22C55E' : isActive ? step.color : 'var(--menu-muted)' }}>
                    {step.label}
                  </span>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full animate-pulse ml-auto" style={{ background: step.color }} />}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // Vista post-dispatch (legacy + nuevo): pasos del rider
        <div className="space-y-3">
          {DELIVERY_STEPS.map((step, i) => {
            const isDone = currentIdx > i;
            const isActive = currentIdx === i;
            return (
              <div key={step.status} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all"
                  style={{
                    background: isDone ? 'rgba(34,197,94,0.2)' : isActive ? `${step.color}25` : 'var(--menu-border)',
                    border: `1.5px solid ${isDone ? '#22C55E' : isActive ? step.color : 'var(--menu-border)'}`,
                  }}
                >
                  {isDone ? '✓' : step.icon}
                </div>
                <span
                  className="text-sm font-semibold transition-all"
                  style={{ color: isDone ? '#22C55E' : isActive ? step.color : 'var(--menu-muted)' }}
                >
                  {step.label}
                </span>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse ml-auto" style={{ background: step.color }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info de dirección */}
      {order.delivery_formatted_address && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-muted/50">
          <MapPin size={13} className="text-orange-400 mt-0.5 flex-shrink-0" />
          <p className="text-muted-foreground text-xs leading-snug">{order.delivery_formatted_address}</p>
        </div>
      )}

      {/* ETA */}
      {order.delivery_eta_minutes && deliveryStatus !== 'delivered' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock size={12} />
          <span>ETA estimado: <strong className="text-foreground">{order.delivery_eta_minutes} min</strong></span>
        </div>
      )}

      {/* Link a Maps si hay ubicación del rider */}
      {riderLocation && deliveryStatus === 'picked_up' && (
        <a
          href={buildMapsLink(riderLocation.lat, riderLocation.lon)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all"
          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#60A5FA' }}
        >
          <MapPin size={12} />
          Ver ubicación del repartidor en Maps
        </a>
      )}
    </div>
  );
}

// Map status to step index
function getStepIndex(status: OrderStatus): number {
  if (status === 'pendiente' || status === 'pago_en_revision') return 0;
  if (status === 'en_cocina') return 1;
  if (status === 'listo') return 2;
  if (status === 'entregado') return 3;
  return -1; // cancelado
}

export default function OrderStatusPage() {
  const params = useParams<{ orderId: string }>();
  const [, navigate] = useLocation();

  // F8: Hook unificado — fuente de verdad compartida con realtime incluido
  const { order: activeOrder, loading, error } = useActiveOrder(params.orderId);
  // Cast al tipo Order legacy para compatibilidad con el resto del componente
  const order = activeOrder as any as Order | null;

  // F6-B: Push Notifications para el cliente (solo pedidos delivery)
  const { subscribe: subscribePush } = usePushNotifications({
    tenantId: order?.tenant_id || '',
    subscriberType: 'client',
    subscriberId: params.orderId || '',
    orderId: params.orderId,
    autoSubscribe: false,
  });
  // Suscribir al cliente cuando se carga el pedido delivery
  useEffect(() => {
    if (order && order.delivery_type === 'delivery' && order.tenant_id) {
      setTimeout(() => subscribePush(), 1500);
    }
  }, [order?.id, order?.delivery_type, order?.tenant_id]);

  // V19.0: Cargar tema del restaurante desde Supabase (igual que MenuPage)
  const { setAnimationConfig } = useAnimationConfig();
  useEffect(() => {
    if (!order?.tenant_id) return;
    (async () => {
      const { data: themeData } = await supabase
        .from('theme_settings')
        .select('primary_color, secondary_color, background_color, surface_color, text_color, theme_animation')
        .eq('tenant_id', order.tenant_id)
        .single();
      if (themeData) {
        // Aplicar colores del restaurante como CSS vars del menú público
        applyRestaurantTheme({
          background: themeData.background_color || '#0a0a0a',
          surface:    (themeData as any).surface_color    || '#161616',
          text:       (themeData as any).text_color       || '#f5f5f5',
          primary:    themeData.primary_color    || '#c6a75e',
        });
        setAnimationConfig({
          animation: themeData.theme_animation,
          primaryColor: themeData.primary_color,
          secondaryColor: themeData.secondary_color,
          backgroundColor: themeData.background_color,
        });
      }
    })();
  }, [order?.tenant_id, setAnimationConfig]);

  // F8: fetch y realtime manejados por useActiveOrder — sin duplicación

  // Save active order to localStorage for FAB
  // V17.2.2: Keep FAB visible if SINPE payment is still pending after delivery
  useEffect(() => {
    if (!order) return;
    const paymentStatus = (order as any).payment_status || 'pending';
    const isSinpePending = order.payment_method === 'sinpe' && isDelivery && paymentStatus !== 'paid'; // GATING
    const isFullyDone =
      (order.status === 'entregado' && !isSinpePending) ||
      order.status === 'cancelado';
    if (isFullyDone) {
      localStorage.removeItem('active_order');
    } else {
      localStorage.setItem('active_order', JSON.stringify({
        orderId: order.id,
        orderNumber: order.order_number,
        tenantSlug: localStorage.getItem('last_tenant_slug') || '',
        status: order.status,
        payment_method: order.payment_method,
        payment_status: paymentStatus,
      }));
    }
  }, [order]);

  const currentStepIdx = order ? getStepIndex(order.status) : -1;
  const isCancelled = order?.status === 'cancelado';
  const isDelivery = (order as any)?.delivery_type === 'delivery';
  // SINPE payment verification state
  // GATING: SINPE solo aplica en delivery (dine-in/takeout cobran externamente)
  const isSinpe = order?.payment_method === 'sinpe' && isDelivery;
  const isPaymentVerified = (order as any)?.payment_verified === true;
  const isPaymentPending = isSinpe && !isPaymentVerified && order?.status === 'pendiente';
  // REGLA: Para delivery, el pedido se considera completado solo cuando el rider confirma
  // la entrega (delivery_status === 'delivered'). Para otros tipos, cuando status === 'entregado'.
  const isCompleted = isDelivery
    ? (order as any)?.delivery_status === 'delivered'
    : order?.status === 'entregado';
  const canAddMore = order && !isCancelled && !isCompleted && order.status !== 'listo';
  const isTakeout = (order as any)?.delivery_type === 'takeout';
  const scheduledDate = (order as any)?.scheduled_date;
  const scheduledTime = (order as any)?.scheduled_time;
  const deliveryAddress = (order as any)?.delivery_address;
  const deliveryPhone = (order as any)?.delivery_phone;
  const deliveryLat = (order as any)?.delivery_lat;
  const deliveryLon = (order as any)?.delivery_lon;

  // ── V21.0: Smart Bill ──
  const [billRequested, setBillRequested] = useState(false);
  const [billLoading, setBillLoading] = useState(false);
  const [quickRequestLoading, setQuickRequestLoading] = useState<TableQuickRequestType | null>(null);

  const activeQuickRequest = (order as any)?.quick_request_type as TableQuickRequestType | null;

  // Sincronizar estado con el order (por si ya fue solicitado antes)
  useEffect(() => {
    if (order && (order as any).bill_requested) {
      setBillRequested(true);
    }
  }, [order?.id]);

  const handleRequestBill = async () => {
    if (!order || billRequested || billLoading) return;
    setBillLoading(true);
    try {
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ bill_requested: true, updated_at: new Date().toISOString() })
        .eq('id', order.id);
      if (updateErr) throw updateErr;
      setBillRequested(true);
      toast.success('🛎️ ¡Mesero notificado! Va en camino con tu cuenta.');
    } catch (err: any) {
      toast.error('Error al solicitar la cuenta. Intenta de nuevo.');
      console.error('[SmartBill]', err);
    } finally {
      setBillLoading(false);
    }
  };

  const handleQuickRequest = async (requestType: TableQuickRequestType) => {
    if (!order || quickRequestLoading) return;
    setQuickRequestLoading(requestType);
    try {
      const { error: updateErr } = await supabase
        .from('orders')
        .update({
          quick_request_type: requestType,
          quick_request_at: new Date().toISOString(),
          quick_request_seen_by_staff: false,
          quick_request_seen_by_admin: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (updateErr) throw updateErr;
      const selected = TABLE_QUICK_REQUESTS.find((r) => r.type === requestType);
      toast.success(`${selected?.emoji || '🛎️'} Solicitud enviada al personal.`);
    } catch (err) {
      toast.error('No se pudo enviar la solicitud. Intenta de nuevo.');
      console.error('[QuickRequest]', err);
    } finally {
      setQuickRequestLoading(null);
    }
  };

  // ── FASE 3: Auto-GPS ──
  const [gpsLink, setGpsLink] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // ── V17.2: SINPE async dropzone ──
  const [sinpeFile, setSinpeFile] = useState<File | null>(null);
  const [sinpePreview, setSinpePreview] = useState<string>('');
  const [sinpeUploading, setSinpeUploading] = useState(false);
  const [sinpeUploaded, setSinpeUploaded] = useState(false);
  const sinpeInputRef = useRef<HTMLInputElement>(null);
  const sinpeCameraInputRef = useRef<HTMLInputElement>(null);

  // Detectar si ya tenía comprobante subido al cargar
  useEffect(() => {
    if (order?.sinpe_receipt_url) setSinpeUploaded(true);
  }, [order?.sinpe_receipt_url]);

  const handleSinpeFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSinpeFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSinpePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSinpeUpload = async () => {
    if (!sinpeFile || !order) return;
    setSinpeUploading(true);
    try {
      const ext = sinpeFile.name.split('.').pop() || 'jpg';
      const fileName = `${order.tenant_id}/${order.id}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, sinpeFile, { cacheControl: '3600', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
      const receiptUrl = urlData.publicUrl;
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          sinpe_receipt_url: receiptUrl,
          pago_en_revision: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (updateError) throw updateError;
      setSinpeUploaded(true);
      toast.success('✅ Comprobante enviado. El restaurante lo revisará pronto.');
    } catch (err: any) {
      toast.error('Error al subir el comprobante. Intenta de nuevo.');
      console.error('[SINPE Dropzone]', err);
    } finally {
      setSinpeUploading(false);
    }
  };

  const handleGetGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Tu navegador no soporta geolocalización.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const link = `https://www.google.com/maps?q=${latitude},${longitude}`;
        setGpsLink(link);
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('Permiso de ubicación denegado. Actívalo en tu navegador.');
        } else {
          setGpsError('No se pudo obtener tu ubicación. Intenta de nuevo.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleWhatsAppDelivery = () => {
    if (!order) return;
    const gpsLine = gpsLink ? `\n\ud83d\udccd Ubicación GPS: ${gpsLink}` : '';
    const msg =
      `\ud83d\uded5 *Pedido #${order.order_number} listo para entrega*\n` +
      `\ud83d\udccd ${deliveryAddress || 'Sin dirección'}\n` +
      `\u23f0 ${scheduledDate === 'tomorrow' ? 'Mañana' : 'Hoy'} ${scheduledTime || ''}\n` +
      `\ud83d\udcb0 Total: ${formatPrice(order.total)}${gpsLine}`;
    const url = buildWhatsAppUrl(deliveryPhone, msg);
    if (url) window.open(url, '_blank');
  };

  // Navigate back to menu to add more items (Cuenta Abierta)
  const handleAddMore = () => {
    if (!order) return;
    // Store the order ID so CartDrawer knows to UPDATE instead of INSERT
    localStorage.setItem('open_tab_order', JSON.stringify({
      orderId: order.id,
      orderNumber: order.order_number,
      tenantId: order.tenant_id,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerTable: order.customer_table,
      existingItems: order.items,
      existingTotal: order.total,
      existingUpsellRevenue: order.upsell_revenue || 0,
      existingAiUpsellRevenue: order.ai_upsell_revenue || 0,
    }));
    // Navigate back to menu
    const slug = localStorage.getItem('last_tenant_slug');
    if (slug) {
      navigate(`/${slug}`);
    } else {
      window.history.back();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--menu-bg)' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 rounded-full"
          style={{ border: '3px solid var(--menu-accent)', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: 'var(--menu-bg)', color: 'var(--menu-text)' }}>
        <XCircle size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-bold mb-2">Orden no encontrada</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--menu-muted)' }}>{error || 'La orden no existe o fue eliminada.'}</p>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 rounded-full font-bold text-sm"
          style={{ backgroundColor: 'var(--menu-accent)', color: 'var(--menu-accent-contrast, #000)' }}
        >
          Volver
        </button>
      </div>
    );
  }

  // ─── Theme engine ───
  const th = {
    bg: 'var(--menu-bg)',
    surface: 'var(--menu-surface)',
    text: 'var(--menu-text)',
    muted: 'var(--menu-muted)',
    border: 'var(--menu-border)',
    accent: 'var(--menu-accent)',
    accentContrast: 'var(--menu-accent-contrast, #000)',
  };

  const heroConfig: Record<string, { emoji: string; title: string; subtitle: string; pulse?: boolean }> = {
    pendiente: { emoji: '🕐', title: 'Pedido recibido', subtitle: 'El restaurante está revisando tu pedido...', pulse: true },
    pago_en_revision: { emoji: '🔍', title: 'Verificando tu pago', subtitle: 'El restaurante está revisando tu comprobante SINPE', pulse: true },
    en_cocina: { emoji: '🔥', title: 'Estamos preparando tu pedido', subtitle: 'Tu pedido está en manos del chef ahora mismo', pulse: true },
    listo: { emoji: isDelivery ? '📦' : '✅', title: isDelivery ? '¡Pedido listo para despacho!' : '¡Tu pedido está listo!', subtitle: isDelivery ? 'Asignando repartidor...' : 'Puedes pasar a recogerlo' },
    entregado: { emoji: '🎉', title: '¡Pedido entregado!', subtitle: isDelivery ? 'Tu pedido llegó. ¡Buen provecho!' : 'Gracias por pedir con nosotros' },
    cancelado: { emoji: '❌', title: 'Pedido cancelado', subtitle: 'Este pedido fue cancelado. Contáctanos si tienes dudas.' },
  };
  const hero = heroConfig[order.status] || heroConfig['pendiente'];

  const statusLabel: Record<string, string> = {
    pendiente: 'Pedido recibido', pago_en_revision: 'Verificando pago',
    en_cocina: 'En preparación', listo: isDelivery ? 'Listo para despacho' : 'Listo para recoger',
    entregado: 'Entregado', cancelado: 'Cancelado',
  };

  type TimelineStep = { id: string; label: string; sublabel?: string; icon: string; done: boolean; active: boolean };
  const buildTimeline = (): TimelineStep[] => {
    const steps: TimelineStep[] = [];
    const s = order.status;
    const payVerified = (order as any).payment_verified === true;
    const deliveryStatus = (order as any).delivery_status as string | null;
    if (isSinpe) {
      steps.push({
        id: 'pago', label: payVerified ? 'Pago verificado' : 'Verificando pago SINPE',
        sublabel: payVerified ? 'Tu pago fue confirmado' : 'El restaurante está revisando tu comprobante',
        icon: payVerified ? '✅' : '🔍', done: payVerified,
        active: !payVerified && (s === 'pendiente' || s === 'pago_en_revision'),
      });
    }
    const statusOrder = ['pendiente', 'pago_en_revision', 'en_cocina', 'listo', 'entregado'];
    const currentIdx = statusOrder.indexOf(s);
    ([
      { id: 'recibido', label: 'Pedido recibido', icon: '📋', status: 'pendiente' },
      { id: 'cocina', label: 'En preparación', sublabel: 'El chef está trabajando en tu pedido', icon: '🔥', status: 'en_cocina' },
      { id: 'listo', label: isDelivery ? 'Listo para despacho' : '¡Listo para recoger!', icon: '✅', status: 'listo' },
    ] as any[]).forEach((step: any) => {
      const stepIdx = statusOrder.indexOf(step.status);
      steps.push({ id: step.id, label: step.label, sublabel: step.sublabel, icon: step.icon, done: currentIdx > stepIdx, active: currentIdx === stepIdx });
    });
    if (isDelivery) {
      const dsOrder = ['assigned', 'picked_up', 'delivered'];
      const dsIdx = dsOrder.indexOf(deliveryStatus || '');
      ([
        { id: 'asignado', label: 'Rider asignado', icon: '🛵', ds: 'assigned' },
        { id: 'en_camino', label: 'En camino', sublabel: 'Tu pedido va en camino', icon: '🚀', ds: 'picked_up' },
        { id: 'entregado_rider', label: 'Entregado', icon: '🎉', ds: 'delivered' },
      ] as any[]).forEach((step: any) => {
        const si = dsOrder.indexOf(step.ds);
        steps.push({ id: step.id, label: step.label, sublabel: step.sublabel, icon: step.icon, done: dsIdx > si || s === 'entregado', active: dsIdx === si && s !== 'entregado' });
      });
    } else {
      steps.push({ id: 'entregado_final', label: 'Entregado', icon: '🎉', done: s === 'entregado', active: false });
    }
    return steps;
  };
  const timeline = buildTimeline();

  return (
    <div className="min-h-screen" style={{ backgroundColor: th.bg, color: th.text }}>
      {/* HEADER */}
      <div className="sticky top-0 z-20 backdrop-blur-xl border-b" style={{ backgroundColor: th.bg + 'e8', borderColor: th.border }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => window.history.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ backgroundColor: th.surface, color: th.muted }}>
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black tracking-tight" style={{ color: th.text }}>Pedido #{order.order_number}</h1>
            <p className="text-[11px] mt-0.5" style={{ color: th.muted }}>
              {new Date(order.created_at).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <motion.div key={order.status} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black tracking-wide"
            style={{
              backgroundColor: isCancelled ? 'rgba(239,68,68,0.15)' : isCompleted ? 'rgba(16,185,129,0.15)' : 'color-mix(in srgb, var(--menu-accent) 15%, transparent)',
              color: isCancelled ? '#F87171' : isCompleted ? '#34D399' : th.accent,
              border: `1.5px solid ${isCancelled ? 'rgba(239,68,68,0.3)' : isCompleted ? 'rgba(16,185,129,0.3)' : 'color-mix(in srgb, var(--menu-accent) 35%, transparent)'}`,
            }}>
            <span className="text-[10px]">{hero.emoji}</span>
            <span>{statusLabel[order.status] || order.status}</span>
          </motion.div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 pb-32 space-y-4">

        {/* HERO CARD */}
        <motion.div key={order.status + '_hero'} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: isCompleted
              ? 'linear-gradient(135deg, color-mix(in srgb, var(--menu-accent) 12%, var(--menu-surface)), var(--menu-surface))'
              : isCancelled ? 'rgba(239,68,68,0.08)'
              : 'linear-gradient(135deg, color-mix(in srgb, var(--menu-accent) 10%, var(--menu-surface)), var(--menu-surface))',
            border: `1.5px solid ${isCompleted ? 'color-mix(in srgb, var(--menu-accent) 30%, transparent)' : isCancelled ? 'rgba(239,68,68,0.2)' : 'color-mix(in srgb, var(--menu-accent) 20%, transparent)'}`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 blur-2xl" style={{ backgroundColor: th.accent }} />
          <div className="relative flex items-start gap-4">
            <motion.div animate={hero.pulse ? { scale: [1, 1.1, 1] } : {}} transition={{ duration: 2, repeat: Infinity }} className="text-4xl flex-shrink-0 mt-0.5">
              {hero.emoji}
            </motion.div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black leading-tight" style={{ color: th.text }}>{hero.title}</h2>
              <p className="text-sm mt-1 leading-snug" style={{ color: th.muted }}>{hero.subtitle}</p>
              {isDelivery && (order as any).delivery_eta_minutes && !isCompleted && (
                <div className="flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-xl w-fit"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--menu-accent) 25%, transparent)' }}>
                  <Clock size={12} style={{ color: th.accent }} />
                  <span className="text-xs font-bold" style={{ color: th.accent }}>ETA: {(order as any).delivery_eta_minutes} min</span>
                </div>
              )}
              {(scheduledDate || scheduledTime) && !isCompleted && (
                <div className="flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-xl w-fit"
                  style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <Clock size={12} className="text-amber-400" />
                  <span className="text-xs font-bold text-amber-400">{scheduledDate === 'tomorrow' ? 'Mañana' : 'Hoy'}{scheduledTime ? ` · ${scheduledTime}` : ''}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* TIMELINE UNIFICADO */}
        {!isCancelled && (
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: th.surface, borderColor: th.border }}>
            <h3 className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: th.muted }}>Seguimiento</h3>
            <div className="space-y-0">
              {timeline.map((step, idx) => {
                const isLast = idx === timeline.length - 1;
                return (
                  <div key={step.id} className="flex gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <motion.div animate={step.active ? { scale: [1, 1.2, 1] } : {}} transition={step.active ? { duration: 1.5, repeat: Infinity } : {}}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all z-10"
                        style={{
                          backgroundColor: step.done ? 'rgba(16,185,129,0.15)' : step.active ? 'color-mix(in srgb, var(--menu-accent) 15%, transparent)' : 'transparent',
                          border: step.done ? '2px solid rgba(16,185,129,0.5)' : step.active ? '2px solid var(--menu-accent)' : `2px solid ${th.border}`,
                          color: step.done ? '#34D399' : step.active ? th.accent : th.muted,
                        }}>
                        {step.done ? '✓' : step.icon}
                      </motion.div>
                      {!isLast && <div className="w-0.5 flex-1 my-1 min-h-[20px]" style={{ backgroundColor: step.done ? 'rgba(16,185,129,0.3)' : th.border }} />}
                    </div>
                    <div className={`pb-4 pt-1.5 flex-1 min-w-0${isLast ? ' pb-0' : ''}`}>
                      <p className="text-sm font-bold leading-tight transition-all"
                        style={{ color: step.done ? '#34D399' : step.active ? th.text : th.muted, opacity: step.done || step.active ? 1 : 0.4 }}>
                        {step.label}
                      </p>
                      {(step.active || step.done) && step.sublabel && (
                        <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-xs mt-0.5 leading-snug"
                          style={{ color: step.done ? 'rgba(52,211,153,0.7)' : th.muted }}>
                          {step.sublabel}
                        </motion.p>
                      )}
                      {step.active && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: th.accent }} />
                          <span className="text-[10px] font-bold" style={{ color: th.accent }}>En curso</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MAPA */}
        {isDelivery && deliveryLat && deliveryLon && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl overflow-hidden border" style={{ borderColor: th.border }}>
            {!isCompleted ? (
              <>
                <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: th.surface }}>
                  <MapPin size={13} style={{ color: th.accent }} />
                  <span className="text-xs font-medium truncate" style={{ color: th.text }}>
                    {(order as any).delivery_formatted_address || deliveryAddress || 'Ubicación de entrega'}
                  </span>
                </div>
                <iframe title="Mapa de entrega" width="100%" height="180" style={{ border: 0, display: 'block' }} loading="lazy"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(deliveryLon)-0.005},${Number(deliveryLat)-0.005},${Number(deliveryLon)+0.005},${Number(deliveryLat)+0.005}&layer=mapnik&marker=${deliveryLat},${deliveryLon}`} />
                <a href={`https://www.google.com/maps?q=${deliveryLat},${deliveryLon}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 transition-colors" style={{ backgroundColor: th.surface, color: th.accent }}>
                  <MapPin size={13} /><span className="text-xs font-bold">Abrir en Google Maps</span>
                </a>
              </>
            ) : (
              <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: th.surface }}>
                <MapPin size={13} style={{ color: th.muted }} />
                <span className="text-xs flex-1 truncate" style={{ color: th.muted }}>{(order as any).delivery_formatted_address || deliveryAddress}</span>
                <a href={`https://www.google.com/maps?q=${deliveryLat},${deliveryLon}`} target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-bold ml-auto" style={{ color: th.accent }}>Ver</a>
              </div>
            )}
          </motion.div>
        )}

        {isDelivery && !deliveryLat && deliveryAddress && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border" style={{ backgroundColor: th.surface, borderColor: th.border }}>
            <MapPin size={15} style={{ color: th.accent }} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold mb-0.5" style={{ color: th.muted }}>Dirección de entrega</p>
              <p className="text-sm" style={{ color: th.text }}>{deliveryAddress}</p>
            </div>
          </div>
        )}

        {/* GPS + WhatsApp */}
        {isDelivery && deliveryPhone && !isCompleted && (
          <div className="space-y-2">
            {!gpsLink ? (
              <button onClick={handleGetGPS} disabled={gpsLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.97]"
                style={{ backgroundColor: 'rgba(16,163,127,0.1)', color: '#10A37F', border: '1.5px solid rgba(16,163,127,0.25)' }}>
                <MapPin size={15} />{gpsLoading ? 'Obteniendo ubicación...' : 'Compartir mi ubicación GPS'}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl" style={{ backgroundColor: 'rgba(16,185,129,0.08)', border: '1.5px solid rgba(16,185,129,0.2)' }}>
                <MapPin size={13} className="text-emerald-400 flex-shrink-0" />
                <p className="text-xs font-bold text-emerald-400 flex-1">Ubicación GPS capturada ✅</p>
                <button onClick={() => setGpsLink(null)} className="text-xs" style={{ color: th.muted }}>✕</button>
              </div>
            )}
            {gpsError && <p className="text-[11px] text-red-400 text-center">{gpsError}</p>}
            <button onClick={handleWhatsAppDelivery}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all active:scale-[0.97]"
              style={{ backgroundColor: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1.5px solid rgba(37,211,102,0.25)' }}>
              <MessageCircle size={15} />{gpsLink ? 'Enviar pedido y GPS por WhatsApp' : 'Coordinar entrega por WhatsApp'}
            </button>
          </div>
        )}

        {/* DETALLE DEL PEDIDO */}
        <div className="rounded-2xl p-5 border" style={{ backgroundColor: th.surface, borderColor: th.border }}>
          <h3 className="text-[11px] font-black uppercase tracking-widest mb-4" style={{ color: th.muted }}>Tu pedido</h3>
          <div className="space-y-2.5">
            {((order.items as any[]) || []).map((item: any, i: number) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span className="text-xs font-black px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 15%, transparent)', color: th.accent }}>
                    {item.quantity}×
                  </span>
                  <span className="text-sm leading-snug" style={{ color: th.text }}>{item.name}</span>
                </div>
                <span className="text-sm font-bold flex-shrink-0" style={{ color: th.muted }}>{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="my-4 border-t" style={{ borderColor: th.border }} />
          <div className="space-y-2">
            {isDelivery && (
              <>
                <div className="flex justify-between text-sm">
                  <span style={{ color: th.muted }}>Subtotal</span>
                  <span style={{ color: th.muted }}>{formatPrice(order.total - ((order as any).delivery_fee_final || 0))}</span>
                </div>
                {((order as any).delivery_fee_final || (order as any).delivery_fee_pending) && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: th.muted }}>Envío</span>
                    <span style={{ color: (order as any).delivery_fee_pending ? '#F59E0B' : th.muted }}>
                      {(order as any).delivery_fee_pending ? 'Por confirmar' : formatPrice((order as any).delivery_fee_final)}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between items-center pt-1">
              <span className="text-base font-black" style={{ color: th.text }}>Total</span>
              <span className="text-xl font-black" style={{ color: th.accent }}>{formatPrice(order.total)}</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between gap-3" style={{ borderColor: th.border }}>
            <div className="flex items-center gap-2 flex-wrap">
              {order.customer_name && <span className="text-xs" style={{ color: th.muted }}>👤 {order.customer_name}</span>}
              {order.customer_table && <span className="text-xs" style={{ color: th.muted }}>🪑 {order.customer_table}</span>}
            </div>
            {order.payment_method && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-black flex-shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 12%, transparent)', color: th.accent, border: '1px solid color-mix(in srgb, var(--menu-accent) 25%, transparent)' }}>
                {order.payment_method === 'sinpe' ? '📱 SINPE' : order.payment_method === 'efectivo' ? '💵 Efectivo' : order.payment_method === 'tarjeta' ? '💳 Tarjeta' : order.payment_method.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        {/* QUICK REQUESTS */}
        {order.status !== 'cancelado' && !isDelivery && !isTakeout && (
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: th.surface, borderColor: th.border }}>
            <h3 className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: th.muted }}>¿Necesitas algo?</h3>
            <div className="grid grid-cols-3 gap-2">
              {TABLE_QUICK_REQUESTS.map((request) => {
                const isActive = activeQuickRequest === request.type;
                return (
                  <button key={request.type} onClick={() => handleQuickRequest(request.type)} disabled={!!quickRequestLoading}
                    className="rounded-xl px-2 py-3 text-xs font-bold border transition-all disabled:opacity-60 active:scale-95"
                    style={{ backgroundColor: isActive ? 'color-mix(in srgb, var(--menu-accent) 15%, transparent)' : th.bg, borderColor: isActive ? th.accent : th.border, color: isActive ? th.accent : th.text }}>
                    {quickRequestLoading === request.type ? '...' : `${request.emoji} ${request.label}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SINPE — VISIBILIDAD CONDICIONAL */}
        {isSinpe && isDelivery && (() => {
          const hasReceipt = !!((order as any).sinpe_receipt_url?.length > 5);
          if (isPaymentVerified) return (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
              style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' }}>
              <ShieldCheck size={18} className="text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-400">Pago SINPE verificado ✅</p>
                <p className="text-xs mt-0.5" style={{ color: th.muted }}>Tu pago fue confirmado por el restaurante</p>
              </div>
            </div>
          );
          if (sinpeUploaded || hasReceipt) return (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl border"
              style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--menu-accent) 25%, transparent)' }}>
              <Check size={18} style={{ color: th.accent }} className="flex-shrink-0" />
              <div>
                <p className="text-sm font-bold" style={{ color: th.accent }}>Comprobante enviado</p>
                <p className="text-xs mt-0.5" style={{ color: th.muted }}>Estamos validando tu pago SINPE...</p>
              </div>
            </motion.div>
          );
          return (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5 border-2 space-y-4"
              style={{ backgroundColor: th.surface, borderColor: 'color-mix(in srgb, var(--menu-accent) 40%, transparent)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 15%, transparent)' }}>
                  <span className="text-xl">📸</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: th.text }}>Comprobante SINPE</h3>
                  <p className="text-xs mt-0.5" style={{ color: th.muted }}>Puedes subir la foto ahora o después</p>
                </div>
              </div>
              {order.tenant_id && <SinpeTenantNumber tenantId={order.tenant_id} />}
              {sinpePreview ? (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={sinpePreview} alt="Comprobante" className="w-full max-h-48 object-cover rounded-xl" />
                  <button onClick={() => { setSinpeFile(null); setSinpePreview(''); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white text-xs">✕</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => sinpeCameraInputRef.current?.click()}
                    className="py-5 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all active:scale-95"
                    style={{ borderColor: 'color-mix(in srgb, var(--menu-accent) 40%, transparent)', color: th.accent }}>
                    <Camera size={22} /><span className="text-xs font-semibold">Tomar foto</span>
                  </button>
                  <button onClick={() => sinpeInputRef.current?.click()}
                    className="py-5 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition-all active:scale-95"
                    style={{ borderColor: 'color-mix(in srgb, var(--menu-accent) 40%, transparent)', color: th.accent }}>
                    <span className="text-2xl">🖼️</span><span className="text-xs font-semibold">Desde galería</span>
                  </button>
                </div>
              )}
              <input ref={sinpeInputRef} type="file" accept="image/*" onChange={handleSinpeFileSelect} className="hidden" />
              <input ref={sinpeCameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleSinpeFileSelect} className="hidden" />
              {sinpeFile && (
                <button onClick={handleSinpeUpload} disabled={sinpeUploading}
                  className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.98]"
                  style={{ backgroundColor: th.accent, color: th.accentContrast, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                  {sinpeUploading ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <><ShoppingBag size={18} /> Enviar comprobante</>}
                </button>
              )}
            </motion.div>
          );
        })()}

        {/* CUENTA ABIERTA */}
        {canAddMore && (
          <motion.button onClick={handleAddMore} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: 0.97 }}
            className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
            style={{ backgroundColor: th.accent, color: th.accentContrast, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
            <Plus size={20} />Agregar más platillos
          </motion.button>
        )}

        {/* ESTADO FINAL: ENTREGADO */}
        {isCompleted && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="rounded-2xl p-6 text-center border"
              style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--menu-accent) 8%, var(--menu-surface)), var(--menu-surface))', borderColor: 'color-mix(in srgb, var(--menu-accent) 20%, transparent)' }}>
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.5, repeat: 2 }} className="text-5xl mb-3">🎉</motion.div>
              <h2 className="text-xl font-black mb-1" style={{ color: th.text }}>¡Pedido entregado!</h2>
              <p className="text-sm" style={{ color: th.muted }}>{isDelivery ? 'Tu pedido llegó. ¡Buen provecho!' : 'Gracias por pedir con nosotros. ¡Buen provecho!'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleAddMore}
                className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 12%, transparent)', color: th.accent, border: '1.5px solid color-mix(in srgb, var(--menu-accent) 25%, transparent)' }}>
                <Plus size={15} />Pedir de nuevo
              </button>
              <a href={(() => { const wp = waPhone((order as any).customer_phone); return wp ? `https://wa.me/${wp}` : '#'; })()} target="_blank" rel="noopener noreferrer"
                className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{ backgroundColor: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1.5px solid rgba(37,211,102,0.25)' }}>
                <MessageCircle size={15} />Contactar
              </a>
            </div>
            {order.payment_method === 'sinpe' && isDelivery && (order as any).payment_status !== 'paid' && !isPaymentVerified && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 px-4 py-3 rounded-2xl border"
                style={{ backgroundColor: 'color-mix(in srgb, var(--menu-accent) 8%, transparent)', borderColor: 'color-mix(in srgb, var(--menu-accent) 25%, transparent)' }}>
                <span className="text-lg flex-shrink-0">📱</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: th.accent }}>Pago SINPE pendiente</p>
                  <p className="text-xs mt-0.5" style={{ color: th.muted }}>El restaurante verificará tu comprobante pronto.</p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {isCancelled && (
          <div className="text-center py-6">
            <p className="text-4xl mb-3">❌</p>
            <p className="text-base font-bold text-red-400">Pedido cancelado</p>
            <p className="text-sm mt-1" style={{ color: th.muted }}>Contáctanos si tienes alguna duda.</p>
          </div>
        )}

      </div>

      {/* Smart Bill Footer */}
      {isCompleted && (order as any).payment_status !== 'paid' && !isDelivery && !isTakeout && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4" style={{ background: 'linear-gradient(to top, var(--menu-bg) 60%, transparent)' }}>
          <div className="max-w-lg mx-auto">
            <motion.button onClick={handleRequestBill} disabled={billRequested || billLoading} whileTap={!billRequested ? { scale: 0.97 } : {}}
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all"
              style={{
                backgroundColor: billRequested ? th.surface : th.accent,
                color: billRequested ? th.muted : th.accentContrast,
                boxShadow: billRequested ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.1)',
                cursor: billRequested ? 'default' : 'pointer',
                border: billRequested ? `1px solid ${th.border}` : 'none',
              }}>
              {billLoading ? <><Loader2 size={20} className="animate-spin" /><span>Enviando...</span></>
                : billRequested ? <><span className="text-xl">✅</span><span>El mesero va en camino...</span></>
                : <><span className="text-xl">🛎️</span><span>Pedir la Cuenta</span></>}
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
