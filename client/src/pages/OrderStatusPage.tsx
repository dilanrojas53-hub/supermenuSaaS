/*
 * OrderStatusPage — Live Tracking + Cuenta Abierta
 * Design: "Warm Craft" dark card with animated status steps.
 * Supabase Realtime subscription for live status updates.
 * Route: /order-status/:orderId
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Flame, CheckCircle2, Package, XCircle, Plus, ShoppingBag, MessageCircle, MapPin, Bike, Camera, Loader2, Check } from 'lucide-react';
import { buildWhatsAppUrl } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import type { Order, OrderStatus } from '@/lib/types';
import { formatPrice, ORDER_STATUS_CONFIG } from '@/lib/types';
import { useAnimationConfig } from '@/contexts/AnimationContext';
import { applyTheme, getStoredTheme } from '@/lib/themes';
import { toast } from 'sonner';

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
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // FASE 3 V4.0: Aplicar tema B2B desde localStorage al cargar el tracking
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

  // Fetch order initially
  const fetchOrder = useCallback(async () => {
    if (!params.orderId) return;
    const { data, error: fetchErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', params.orderId)
      .single();

    if (fetchErr || !data) {
      setError('No se encontró la orden');
      setLoading(false);
      return;
    }
    setOrder(data as Order);
    setLoading(false);
  }, [params.orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!params.orderId) return;

    const channel = supabase
      .channel(`order-${params.orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${params.orderId}`,
        },
        (payload) => {
          console.log('[OrderStatus] Realtime update:', payload.new);
          setOrder(payload.new as Order);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.orderId]);

  // Save active order to localStorage for FAB
  useEffect(() => {
    if (order && order.status !== 'entregado' && order.status !== 'cancelado') {
      const slug = window.location.pathname.split('/')[1]; // best effort
      localStorage.setItem('active_order', JSON.stringify({
        orderId: order.id,
        orderNumber: order.order_number,
        tenantSlug: localStorage.getItem('last_tenant_slug') || '',
        status: order.status,
      }));
    } else if (order && (order.status === 'entregado' || order.status === 'cancelado')) {
      localStorage.removeItem('active_order');
    }
  }, [order]);

  const currentStepIdx = order ? getStepIndex(order.status) : -1;
  const isCancelled = order?.status === 'cancelado';
  const isCompleted = order?.status === 'entregado';
  const canAddMore = order && !isCancelled && !isCompleted && order.status !== 'listo';
  const isDelivery = (order as any)?.delivery_type === 'delivery';
  const isTakeout = (order as any)?.delivery_type === 'takeout';
  const scheduledDate = (order as any)?.scheduled_date;
  const scheduledTime = (order as any)?.scheduled_time;
  const deliveryAddress = (order as any)?.delivery_address;
  const deliveryPhone = (order as any)?.delivery_phone;

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

        {/* ─── ORDER DETAILS ─── */}
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800/50">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Detalle del pedido</h2>
          <div className="space-y-1.5">
            {(order.items as any[]).map((item: any, i: number) => (
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
              <button
                onClick={() => sinpeInputRef.current?.click()}
                className="w-full py-6 rounded-xl border-2 border-dashed border-purple-500/40 flex flex-col items-center gap-2 text-purple-300 hover:bg-purple-500/10 transition-all"
              >
                <Camera size={24} />
                <span className="text-sm font-medium">Tomar foto o subir comprobante</span>
              </button>
            )}
            <input
              ref={sinpeInputRef}
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
    </div>
  );
}
