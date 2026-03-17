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
import { buildWhatsAppUrl } from '@/lib/phone';
import { buildMapsLink } from '@/lib/maps';
import { supabase } from '@/lib/supabase';
import type { Order, OrderStatus } from '@/lib/types';
import { formatPrice, ORDER_STATUS_CONFIG } from '@/lib/types';
import { useAnimationConfig } from '@/contexts/AnimationContext';
import { applyTheme, getStoredTheme } from '@/lib/themes';
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
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-purple-500/10 border border-purple-500/25">
      <div>
        <p className="text-xs text-slate-400 mb-0.5">Número SINPE del local</p>
        <p className="text-lg font-black text-purple-200 tracking-wider">{sinpeNumber}</p>
        {sinpeOwner && <p className="text-xs text-slate-500">A nombre de: {sinpeOwner}</p>}
      </div>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
        style={{ backgroundColor: copied ? '#38A16920' : '#6C63FF20', color: copied ? '#38A169' : '#A78BFA' }}
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
    <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50 space-y-4">
      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
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
                <p className="text-slate-400 text-xs">Te notificaremos cuando haya disponibilidad</p>
              </div>
            </div>
          )}
          {logisticStatus === 'soft_reserve' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)' }}>
              <span className="text-lg">✔️</span>
              <div>
                <p className="text-blue-300 text-sm font-bold">Disponibilidad confirmada</p>
                <p className="text-slate-400 text-xs">Tu pedido está siendo procesado</p>
              </div>
            </div>
          )}
          {logisticStatus === 'kitchen_commit' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}>
              <span className="text-lg">👨‍🍳</span>
              <div>
                <p className="text-purple-300 text-sm font-bold">Cocina preparando tu pedido</p>
                <p className="text-slate-400 text-xs">Pronto asignaremos un repartidor</p>
              </div>
            </div>
          )}
          {logisticStatus === 'ready_for_pickup' && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}>
              <span className="text-lg">📦</span>
              <div>
                <p className="text-yellow-300 text-sm font-bold">¡Pedido listo!</p>
                <p className="text-slate-400 text-xs">Esperando que el repartidor lo recoja</p>
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
                      background: isDone ? 'rgba(34,197,94,0.2)' : isActive ? `${step.color}25` : 'rgba(255,255,255,0.04)',
                      border: `1.5px solid ${isDone ? '#22C55E' : isActive ? step.color : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {isDone ? '✓' : step.icon}
                  </div>
                  <span className="text-sm" style={{ color: isDone ? '#22C55E' : isActive ? step.color : '#475569' }}>
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
                    background: isDone ? 'rgba(34,197,94,0.2)' : isActive ? `${step.color}25` : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${isDone ? '#22C55E' : isActive ? step.color : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  {isDone ? '✓' : step.icon}
                </div>
                <span
                  className="text-sm font-semibold transition-all"
                  style={{ color: isDone ? '#22C55E' : isActive ? step.color : '#475569' }}
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
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-slate-800/50">
          <MapPin size={13} className="text-orange-400 mt-0.5 flex-shrink-0" />
          <p className="text-slate-300 text-xs leading-snug">{order.delivery_formatted_address}</p>
        </div>
      )}

      {/* ETA */}
      {order.delivery_eta_minutes && deliveryStatus !== 'delivered' && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock size={12} />
          <span>ETA estimado: <strong className="text-white">{order.delivery_eta_minutes} min</strong></span>
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

  // FASE 3 V4.0: Aplicar tema B2B desde localStorage al cargar el trackingg
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  // Push animation config to global context
  const { setAnimationConfig } = useAnimationConfig();
  useEffect(() => {
    if (!order) return;
    (async () => {
      const { data: themeData } = await supabase
        .from('theme_settings')
        .select('primary_color, secondary_color, background_color, theme_animation')
        .eq('tenant_id', order.tenant_id)
        .single();
      if (themeData) {
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
    const isSinpePending = order.payment_method === 'sinpe' && paymentStatus !== 'paid';
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
  const isCompleted = order?.status === 'entregado';
  const canAddMore = order && !isCancelled && !isCompleted && order.status !== 'listo';
  const isDelivery = (order as any)?.delivery_type === 'delivery';
  // SINPE payment verification state
  const isSinpe = order?.payment_method === 'sinpe';
  const isPaymentVerified = (order as any)?.payment_verified === true;
  const isPaymentPending = isSinpe && !isPaymentVerified && order?.status === 'pendiente';
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white px-6">
        <XCircle size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-bold mb-2">Orden no encontrada</h2>
        <p className="text-sm text-slate-400 mb-6">{error || 'La orden no existe o fue eliminada.'}</p>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 rounded-full bg-amber-500 text-black font-bold text-sm"
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: 'transparent' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/60 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center"
          >
            <ArrowLeft size={18} className="text-slate-400" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold" style={{ fontFamily: "'Lora', serif" }}>
              Pedido #{order.order_number}
            </h1>
            <p className="text-xs text-slate-500">
              {new Date(order.created_at).toLocaleString('es-CR', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </p>
          </div>
          <div
            className="px-3 py-1 rounded-full text-xs font-bold"
            style={{
              backgroundColor: ORDER_STATUS_CONFIG[order.status]?.bgColor || '#F3F4F6',
              color: ORDER_STATUS_CONFIG[order.status]?.color || '#6B7280',
            }}
          >
            {ORDER_STATUS_CONFIG[order.status]?.label || order.status}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* ─── STATUS TRACKER ─── */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5">Estado del pedido</h2>

          {isCancelled ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-6"
            >
              <XCircle size={48} className="text-red-400 mx-auto mb-3" />
              <p className="text-lg font-bold text-red-400">Pedido cancelado</p>
              <p className="text-sm text-slate-500 mt-1">Este pedido fue cancelado por el restaurante.</p>
            </motion.div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-slate-800" />

              {/* ── Paso especial: Verificación de pago SINPE ── */}
              {isSinpe && (
                <div className="relative flex items-start gap-4 mb-6">
                  <motion.div
                    animate={isPaymentPending ? { scale: [1, 1.15, 1] } : {}}
                    transition={isPaymentPending ? { duration: 1.5, repeat: Infinity } : {}}
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all"
                    style={{
                      backgroundColor: isPaymentVerified ? '#10B98120' : isPaymentPending ? '#8B5CF620' : '#1e293b',
                      color: isPaymentVerified ? '#10B981' : isPaymentPending ? '#A78BFA' : '#475569',
                    }}
                  >
                    {isPaymentVerified
                      ? <CheckCircle2 size={20} className="text-emerald-500" />
                      : <ShieldCheck size={20} className={isPaymentPending ? 'animate-pulse' : ''} />
                    }
                  </motion.div>
                  <div className="pt-2">
                    <p className={`text-sm font-bold ${
                      isPaymentVerified ? 'text-emerald-400' :
                      isPaymentPending ? 'text-purple-300' : 'text-slate-600'
                    }`}>
                      {isPaymentVerified ? 'Pago SINPE confirmado ✅' : 'Verificando pago SINPE...'}
                    </p>
                    {isPaymentPending && (
                      <p className="text-xs text-purple-400/70 mt-0.5 animate-pulse">
                        ⏳ El restaurante está revisando tu comprobante
                      </p>
                    )}
                    {isPaymentVerified && (
                      <p className="text-xs text-emerald-400/60 mt-0.5">
                        Tu pago fue verificado por el restaurante
                      </p>
                    )}
                  </div>
                </div>
              )}

              {STATUS_STEPS.map((step, idx) => {
                const isActive = idx === currentStepIdx;
                const isDone = idx < currentStepIdx;
                const isFuture = idx > currentStepIdx;

                return (
                  <div key={step.key} className="relative flex items-start gap-4 mb-6 last:mb-0">
                    {/* Circle */}
                    <motion.div
                      animate={isActive ? { scale: [1, 1.15, 1] } : {}}
                      transition={isActive ? { duration: 1.5, repeat: Infinity } : {}}
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-all ${
                        isDone ? 'bg-emerald-500/20' :
                        isActive ? 'ring-2 ring-offset-2 ring-offset-slate-900' :
                        'bg-slate-800'
                      }`}
                      style={{
                        backgroundColor: isDone ? '#10B98120' : isActive ? `${step.color}20` : undefined,
                        color: isDone ? '#10B981' : isActive ? step.color : '#475569',
                        // @ts-ignore ring color via Tailwind
                        '--tw-ring-color': isActive ? step.color : undefined,
                      } as React.CSSProperties}
                    >
                      {isDone ? (
                        <CheckCircle2 size={20} className="text-emerald-500" />
                      ) : (
                        <span className={isActive ? step.animClass : ''}>{step.icon}</span>
                      )}
                    </motion.div>

                    {/* Text */}
                    <div className={`pt-2 ${isFuture ? 'opacity-30' : ''}`}>
                      <p className={`text-sm font-bold ${isActive ? 'text-white' : isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                        {step.label}
                      </p>
                      {isActive && step.key === 'pendiente' && (
                        <p className="text-xs text-amber-400/70 mt-0.5">El restaurante está revisando tu pedido...</p>
                      )}
                      {isActive && step.key === 'en_cocina' && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="text-xs text-orange-400/70 mt-0.5"
                        >
                          🔥 Tu pedido se está preparando ahora mismo
                        </motion.p>
                      )}
                      {isActive && step.key === 'listo' && (
                        <motion.p
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-xs text-emerald-400/70 mt-0.5"
                        >
                          ✅ ¡Puedes pasar a recoger tu pedido!
                        </motion.p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── DELIVERY TRACKING BLOCK — Fase 2 ─── */}
        {isDelivery && <DeliveryTrackingBlock orderId={order.id} order={order as any} />}

        {/* ─── ORDER DETAILS ─── */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Detalle del pedido</h2>
          <div className="space-y-1.5">
            {((order.items as any[]) || []).map((item: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-300">
                  {item.quantity}× {item.name}
                </span>
                <span className="text-slate-500">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3 mt-3 border-t border-slate-800 font-bold">
            <span className="text-amber-400">Total</span>
            <span className="text-amber-400">{formatPrice(order.total)}</span>
          </div>
          {order.customer_name && (
            <div className="mt-3 pt-3 border-t border-slate-800/50 text-xs text-slate-500 space-y-0.5">
              <p>👤 {order.customer_name}</p>
              {order.customer_table && <p>🪑 Mesa: {order.customer_table}</p>}
              {order.payment_method && <p>💳 {order.payment_method.toUpperCase()}</p>}
            </div>
          )}
        </div>

        {/* ─── TABLE QUICK REQUESTS ─── */}
        {order.customer_table && order.status !== 'cancelado' && (
          <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">¿Necesitas algo en la mesa?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TABLE_QUICK_REQUESTS.map((request) => {
                const isActive = activeQuickRequest === request.type;
                const isSending = quickRequestLoading === request.type;
                return (
                  <button
                    key={request.type}
                    onClick={() => handleQuickRequest(request.type)}
                    disabled={!!quickRequestLoading}
                    className="rounded-xl px-3 py-3 text-sm font-bold border transition-all disabled:opacity-60"
                    style={{
                      backgroundColor: isActive ? '#F59E0B20' : '#0f172a',
                      borderColor: isActive ? '#F59E0B70' : '#334155',
                      color: isActive ? '#FCD34D' : '#CBD5E1',
                    }}
                  >
                    {isSending ? 'Enviando…' : `${request.emoji} ${request.label}`}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">
              Estas solicitudes avisan al staff en tiempo real y al admin con alerta visual.
            </p>
          </div>
        )}

        {/* ─── DELIVERY INFO CARD ─── */}
        {(isDelivery || isTakeout) && (
          <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50 space-y-3">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              {isDelivery ? '🛕 Información de Delivery' : '🥡 Información de Takeout'}
            </h2>
            {scheduledDate && (
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-amber-400" />
                <span className="text-slate-300">
                  {scheduledDate === 'tomorrow' ? (
                    <span className="font-bold text-orange-400">⏰ Mañana</span>
                  ) : 'Hoy'}
                  {scheduledTime && ` a las ${scheduledTime}`}
                </span>
              </div>
            )}
            {deliveryAddress && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <span className="text-slate-300">{deliveryAddress}</span>
              </div>
            )}
            {/* Mapa de la ubicación de entrega */}
            {isDelivery && deliveryLat && deliveryLon && (
              <div className="rounded-xl overflow-hidden border border-slate-700/60">
                <iframe
                  title="Mapa de entrega"
                  width="100%"
                  height="160"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(deliveryLon)-0.005},${Number(deliveryLat)-0.005},${Number(deliveryLon)+0.005},${Number(deliveryLat)+0.005}&layer=mapnik&marker=${deliveryLat},${deliveryLon}`}
                />
                <a
                  href={`https://www.google.com/maps?q=${deliveryLat},${deliveryLon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800/80 hover:bg-slate-700/80 transition-colors"
                >
                  <MapPin size={12} className="text-blue-400" />
                  <span className="text-xs text-blue-400 font-semibold">Ver en Google Maps</span>
                </a>
              </div>
            )}
            {isDelivery && deliveryPhone && (
              <div className="space-y-3">
                {/* Botón GPS */}
                {!gpsLink ? (
                  <button
                    onClick={handleGetGPS}
                    disabled={gpsLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] touch-manipulation"
                    style={{
                      backgroundColor: gpsLoading ? '#16A34A10' : '#16A34A20',
                      color: gpsLoading ? '#86EFAC' : '#4ADE80',
                      border: '2px solid #16A34A40',
                      opacity: gpsLoading ? 0.7 : 1,
                    }}
                  >
                    <MapPin size={16} />
                    {gpsLoading ? 'Obteniendo ubicación...' : '📍 Usar mi ubicación GPS actual'}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-500/10 border border-green-500/30">
                    <MapPin size={14} className="text-green-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-green-400">Ubicación GPS capturada ✅</p>
                      <p className="text-[10px] text-slate-500 truncate">Se adjuntará al mensaje de WhatsApp</p>
                    </div>
                    <button
                      onClick={() => setGpsLink(null)}
                      className="text-slate-500 hover:text-slate-300 transition-colors text-xs"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Error GPS */}
                {gpsError && (
                  <p className="text-[11px] text-red-400 text-center px-1">⚠️ {gpsError}</p>
                )}

                {/* Botón WhatsApp */}
                <button
                  onClick={handleWhatsAppDelivery}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] touch-manipulation"
                  style={{ backgroundColor: '#25D36620', color: '#25D366', border: '2px solid #25D36640' }}
                >
                  <MessageCircle size={16} />
                  {gpsLink ? 'Enviar pedido y GPS por WhatsApp' : 'Coordinar entrega por WhatsApp'}
                </button>

                {!gpsLink && (
                  <p className="text-[11px] text-slate-500 text-center leading-relaxed px-1">
                    ℹ️ Usa el botón GPS para compartir tu ubicación exacta automáticamente.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── V17.2: SINPE ASYNC DROPZONE ─── */}
        {order.payment_method === 'sinpe' && !sinpeUploaded && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/60 rounded-2xl p-5 border-2 border-purple-500/40 space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">📸</span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Comprobante SINPE</h2>
                <p className="text-xs text-slate-400 mt-0.5">Puedes subir la foto ahora o después de comer</p>
              </div>
            </div>

            {/* Número SINPE del local */}
            {order.tenant_id && (
              <SinpeTenantNumber tenantId={order.tenant_id} />
            )}

            {/* Dropzone / Preview */}
            {sinpePreview ? (
              <div className="relative">
                <img src={sinpePreview} alt="Comprobante" className="w-full h-40 object-cover rounded-xl" />
                <button
                  onClick={() => { setSinpeFile(null); setSinpePreview(''); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-red-500 rounded-full flex items-center justify-center"
                >
                  <XCircle size={14} className="text-white" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {/* Botón cámara */}
                <button
                  onClick={() => sinpeCameraInputRef.current?.click()}
                  className="py-5 rounded-xl border-2 border-dashed border-purple-500/40 flex flex-col items-center gap-2 text-purple-300 hover:bg-purple-500/10 transition-all"
                >
                  <Camera size={22} />
                  <span className="text-xs font-semibold">Tomar foto</span>
                </button>
                {/* Botón galería */}
                <button
                  onClick={() => sinpeInputRef.current?.click()}
                  className="py-5 rounded-xl border-2 border-dashed border-purple-500/40 flex flex-col items-center gap-2 text-purple-300 hover:bg-purple-500/10 transition-all"
                >
                  <span className="text-2xl">🖼️</span>
                  <span className="text-xs font-semibold">Desde galería</span>
                </button>
              </div>
            )}
            {/* Input galería (sin capture) */}
            <input
              ref={sinpeInputRef}
              type="file"
              accept="image/*"
              onChange={handleSinpeFileSelect}
              className="hidden"
            />
            {/* Input cámara (con capture) */}
            <input
              ref={sinpeCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleSinpeFileSelect}
              className="hidden"
            />

            {sinpeFile && (
              <button
                onClick={handleSinpeUpload}
                disabled={sinpeUploading}
                className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                style={{ backgroundColor: '#6C63FF', color: '#fff', boxShadow: '0 4px 16px rgba(108,99,255,0.35)' }}
              >
                {sinpeUploading ? (
                  <><Loader2 size={18} className="animate-spin" /> Enviando comprobante...</>
                ) : (
                  <><ShoppingBag size={18} /> Enviar comprobante al restaurante</>
                )}
              </button>
            )}
          </motion.div>
        )}

        {/* Comprobante ya enviado */}
        {order.payment_method === 'sinpe' && sinpeUploaded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-purple-500/15 border border-purple-500/40"
          >
            <Check size={18} className="text-purple-300 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-purple-200">Comprobante enviado ✅</p>
              <p className="text-xs text-slate-400">El restaurante verificará tu pago SINPE.</p>
            </div>
          </motion.div>
        )}

        {/* ─── CUENTA ABIERTA: ADD MORE BUTTON ─── */}
        {canAddMore && (
          <motion.button
            onClick={handleAddMore}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all"
            style={{
              backgroundColor: '#F59E0B',
              color: '#000',
              boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
            }}
          >
            <Plus size={20} />
            Agregar más platillos / bebidas
          </motion.button>
        )}

        {/* Completed state */}
        {isCompleted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            {/* Mensaje principal */}
            <div className="text-center py-4">
              <p className="text-6xl mb-3">🍽️</p>
              <p className="text-lg font-bold" style={{ fontFamily: "'Lora', serif" }}>¡Buen provecho!</p>
              <p className="text-sm text-slate-400 mt-1">Gracias por tu pedido. ¡Esperamos que lo disfrutes!</p>
            </div>
            {/* Recordatorio de pago contextual */}
            {order.payment_method === 'sinpe' && (order as any).payment_status !== 'paid' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-purple-500/10 border border-purple-500/30"
              >
                <span className="text-xl flex-shrink-0">📱</span>
                <div>
                  <p className="text-sm font-bold text-purple-200">Recuerda tu pago por SINPE</p>
                  <p className="text-xs text-slate-400 mt-0.5">Cuando termines de comer, envía tu comprobante de SINPE si aún no lo has hecho.</p>
                </div>
              </motion.div>
            )}
            {order.payment_method === 'sinpe' && (order as any).payment_status === 'paid' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30"
              >
                <span className="text-xl">✅</span>
                <p className="text-sm font-bold text-emerald-300">Pago verificado. ¡Todo en orden!</p>
              </motion.div>
            )}
            {order.payment_method === 'efectivo' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30"
              >
                <span className="text-xl flex-shrink-0">💵</span>
                <div>
                  <p className="text-sm font-bold text-amber-200">Pago en efectivo</p>
                  <p className="text-xs text-slate-400 mt-0.5">Cuando termines de comer, puedes pagar en caja.</p>
                </div>
              </motion.div>
            )}
            {order.payment_method === 'tarjeta' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/30"
              >
                <span className="text-xl flex-shrink-0">💳</span>
                <div>
                  <p className="text-sm font-bold text-blue-200">Pago con tarjeta</p>
                  <p className="text-xs text-slate-400 mt-0.5">Cuando termines de comer, puedes pagar con tarjeta en caja.</p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      {/* ─── V21.0: SMART BILL — Sticky Footer ─── */}
      {/* Mostrar si el pedido fue entregado y el pago está pendiente */}
      {isCompleted && (order as any).payment_status !== 'paid' && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 p-4"
          style={{
            background: 'linear-gradient(to top, rgba(2,6,23,0.98) 60%, transparent)',
          }}
        >
          <div className="max-w-lg mx-auto">
            <motion.button
              onClick={handleRequestBill}
              disabled={billRequested || billLoading}
              whileTap={!billRequested ? { scale: 0.97 } : {}}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all"
              style={{
                backgroundColor: billRequested ? '#1e293b' : '#F59E0B',
                color: billRequested ? '#94a3b8' : '#000',
                boxShadow: billRequested ? 'none' : '0 4px 24px rgba(245,158,11,0.45)',
                cursor: billRequested ? 'default' : 'pointer',
                border: billRequested ? '1px solid #334155' : 'none',
              }}
            >
              {billLoading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span>Enviando solicitud...</span>
                </>
              ) : billRequested ? (
                <>
                  <span className="text-xl">✅</span>
                  <span>El mesero va en camino con tu cuenta...</span>
                </>
              ) : (
                <>
                  <span className="text-xl">🛎️</span>
                  <span>Pedir la Cuenta</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
