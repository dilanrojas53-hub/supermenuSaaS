/**
 * PromosScreen v4.1
 * Pantalla pública de promociones.
 * Cambios clave:
 * 1. Renderiza image_url de promotions como imagen principal de la promo.
 * 2. Usa item.image_url o promo.image_url como respaldo en productos incluidos.
 * 3. Hace más seguro el flujo de aplicar promos tipo combo, 2x1 y descuentos.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Clock, ShoppingBag, ChevronRight, Loader2,
  Check, Lock, Plus, Minus
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import { useCart } from '@/contexts/CartContext';
import type { ThemeSettings, Tenant, MenuItem } from '@/lib/types';

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: string;
  value: number;
  promo_price: number | null;
  min_order_amount: number | null;
  active_from: string | null;
  active_until: string | null;
  active_hours_start: string | null;
  active_hours_end: string | null;
  start_time: string | null;
  end_time: string | null;
  active_days: number[] | null;
  level_required: string | null;
  item_ids: string[] | null;
  image_url: string | null;
  badge_text: string | null;
  is_new_customer: boolean;
  is_reactivation: boolean;
  is_active: boolean;
  usage_limit: number | null;
  used_count: number;
}

interface PromosScreenProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
  allItems?: MenuItem[];
  onPromoSelect?: (promo: { id: string; name: string; type: string; value: number; promo_price?: number | null }) => void;
}

const LEVEL_ORDER = ['bronze', 'silver', 'gold', 'vip'];
const LEVEL_LABELS: Record<string, string> = {
  bronze: '🥉 Bronce',
  silver: '🥈 Plata',
  gold: '🥇 Oro',
  vip: '💎 VIP',
};

const TYPE_CONFIG: Record<string, { label: string; icon: string; badge: string }> = {
  '2x1':      { label: '2×1',             icon: '🎁', badge: '2×1' },
  bogo:       { label: '2×1',             icon: '🎁', badge: '2×1' },
  combo:      { label: 'Combo especial',  icon: '🍱', badge: 'COMBO' },
  percentage: { label: 'Descuento',       icon: '🏷️', badge: '%OFF' },
  fixed:      { label: 'Precio especial', icon: '💵', badge: 'OFERTA' },
  schedule:   { label: 'Happy hour',      icon: '🕐', badge: 'HORA' },
  level:      { label: 'Exclusiva',       icon: '⭐', badge: 'VIP' },
  free_item:  { label: 'Gratis',          icon: '🎉', badge: 'GRATIS' },
  flash:      { label: 'Flash',           icon: '⚡', badge: 'FLASH' },
};

function normalizeAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return url.startsWith('/') ? url : `/${url}`;
}

function timeLeft(until: string | null): string | null {
  if (!until) return null;
  const diff = new Date(until).getTime() - Date.now();
  if (diff <= 0) return 'Expirada';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function isPromoActiveNow(promo: Promotion): boolean {
  const now = new Date();
  if (promo.active_from && new Date(promo.active_from) > now) return false;
  if (promo.active_until && new Date(promo.active_until) < now) return false;

  if (Array.isArray(promo.active_days) && promo.active_days.length > 0) {
    if (!promo.active_days.includes(now.getDay())) return false;
  }

  const timeStart = promo.active_hours_start || promo.start_time;
  const timeEnd = promo.active_hours_end || promo.end_time;
  if (timeStart && timeEnd) {
    const hhmm = now.toTimeString().slice(0, 5);
    const crossesMidnight = timeStart > timeEnd;
    if (crossesMidnight) {
      if (hhmm < timeStart && hhmm > timeEnd) return false;
    } else if (hhmm < timeStart || hhmm > timeEnd) {
      return false;
    }
  }
  return true;
}

export default function PromosScreen({
  isOpen, onClose, theme, tenant, allItems = [], onPromoSelect
}: PromosScreenProps) {
  const { profile, tenantStats } = useCustomerProfile();
  const { addItem, totalPrice } = useCart();

  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPromo, setExpandedPromo] = useState<string | null>(null);
  const [addedPromoIds, setAddedPromoIds] = useState<Set<string>>(new Set());
  const [itemQty, setItemQty] = useState<Record<string, number>>({});

  const accentColor = theme.primary_color || '#F59E0B';
  const bgColor = theme.background_color || '#0a0a0a';
  const textColor = theme.text_color || '#f0f0f0';
  const customerLevel = tenantStats?.level || 'bronze';

  useEffect(() => {
    if (!isOpen || !tenant.id) return;
    setLoading(true);
    setExpandedPromo(null);
    setAddedPromoIds(new Set());
    setItemQty({});

    const now = new Date().toISOString();
    supabase
      .from('promotions')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .or(`active_until.is.null,active_until.gte.${now}`)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading promotions:', error);
          setPromos([]);
        } else {
          setPromos((data || []) as Promotion[]);
        }
      })
      .finally(() => setLoading(false));
  }, [isOpen, tenant.id]);

  const cusIdx = Math.max(0, LEVEL_ORDER.indexOf(customerLevel));
  const availablePromos = promos.filter(p => {
    if (!p.level_required) return true;
    return cusIdx >= LEVEL_ORDER.indexOf(p.level_required);
  });
  const lockedPromos = promos.filter(p => {
    if (!p.level_required) return false;
    return cusIdx < LEVEL_ORDER.indexOf(p.level_required);
  });

  const getPromoItems = useCallback((promo: Promotion): MenuItem[] => {
    if (!promo.item_ids || promo.item_ids.length === 0) return [];
    return allItems.filter(i => promo.item_ids!.includes(i.id));
  }, [allItems]);

  const handleApplyPromo = useCallback((promo: Promotion) => {
    const promoItems = getPromoItems(promo);
    const isBogo = promo.type === '2x1' || promo.type === 'bogo';
    const isCombo = promo.type === 'combo';

    if (isBogo && promoItems.length > 0) {
      const totalSelected = promoItems.reduce((sum, item) => sum + (itemQty[item.id] || 0), 0);
      promoItems.forEach(item => {
        const qty = itemQty[item.id] || (totalSelected === 0 && promoItems.length === 1 ? 1 : 0);
        for (let i = 0; i < qty * 2; i++) addItem(item);
      });
    } else if (promoItems.length > 0) {
      promoItems.forEach(item => {
        const qty = isCombo ? (itemQty[item.id] || 1) : 1;
        for (let i = 0; i < qty; i++) addItem(item);
      });
    }

    if (onPromoSelect) {
      onPromoSelect({
        id: promo.id,
        name: promo.name,
        type: promo.type,
        value: Number(promo.value || 0),
        promo_price: promo.promo_price,
      });
    }

    setAddedPromoIds(prev => {
      const next = new Set(Array.from(prev));
      next.add(promo.id);
      return next;
    });
    setExpandedPromo(null);
    setTimeout(() => onClose(), 600);
  }, [getPromoItems, itemQty, addItem, onPromoSelect, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="promos-screen"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          style={{ background: bgColor, color: textColor }}
        >
          <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b"
            style={{ borderColor: `${textColor}12` }}>
            <div>
              <h1 className="text-xl font-black tracking-tight">🔥 Ofertas</h1>
              <p className="text-xs opacity-50">Promos activas para ti</p>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: `${textColor}10` }}>
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 size={28} className="animate-spin opacity-40" />
                <span className="text-sm opacity-40">Cargando ofertas...</span>
              </div>
            ) : availablePromos.length === 0 && lockedPromos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <span className="text-5xl">🎉</span>
                <div>
                  <div className="font-bold text-base mb-1">Sin promociones activas</div>
                  <div className="text-sm opacity-50">¡Vuelve pronto, habrá sorpresas!</div>
                </div>
              </div>
            ) : (
              <>
                {availablePromos.map(promo => {
                  const cfg = TYPE_CONFIG[promo.type] || TYPE_CONFIG.fixed;
                  const promoItems = getPromoItems(promo);
                  const isExpanded = expandedPromo === promo.id;
                  const isAdded = addedPromoIds.has(promo.id);
                  const remaining = timeLeft(promo.active_until);
                  const isUrgent = remaining && !remaining.includes('d');
                  const active = isPromoActiveNow(promo);
                  const needsMinOrder = promo.min_order_amount && promo.min_order_amount > 0 && totalPrice < promo.min_order_amount;
                  const promoImage = normalizeAssetUrl(promo.image_url);
                  const badgeText = promo.badge_text || cfg.badge;

                  return (
                    <motion.div
                      key={promo.id}
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl overflow-hidden"
                      style={{
                        border: `1.5px solid ${isAdded ? '#22c55e' : isExpanded ? accentColor : `${textColor}12`}`,
                        background: `${textColor}04`,
                      }}
                    >
                      {promoImage && (
                        <button
                          type="button"
                          className="block w-full text-left"
                          onClick={() => setExpandedPromo(isExpanded ? null : promo.id)}
                        >
                          <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#080808' }}>
                            <img
                              src={promoImage}
                              alt={promo.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                            <div className="absolute inset-x-0 bottom-0 p-3"
                              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78), transparent)' }}>
                              <span className="inline-flex text-[10px] font-black px-2 py-0.5 rounded-full"
                                style={{ background: accentColor, color: bgColor }}>
                                {badgeText}
                              </span>
                            </div>
                          </div>
                        </button>
                      )}

                      <button
                        className="w-full text-left"
                        onClick={() => setExpandedPromo(isExpanded ? null : promo.id)}
                      >
                        <div className="relative p-4">
                          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                            style={{ background: accentColor }} />

                          <div className="pl-3 flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                                  style={{ background: accentColor, color: bgColor }}>
                                  {badgeText}
                                </span>
                                {!active && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                                    Fuera de horario
                                  </span>
                                )}
                                {promo.level_required && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full"
                                    style={{ background: `${accentColor}20`, color: accentColor }}>
                                    {LEVEL_LABELS[promo.level_required] || promo.level_required}
                                  </span>
                                )}
                              </div>

                              <div className="font-bold text-base leading-tight">{promo.name}</div>

                              {promo.description && !isExpanded && (
                                <div className="text-xs opacity-60 mt-0.5 line-clamp-2">{promo.description}</div>
                              )}

                              <div className="flex items-center gap-3 flex-wrap mt-2">
                                {promo.min_order_amount && promo.min_order_amount > 0 && (
                                  <span className="flex items-center gap-1 text-[11px] opacity-50">
                                    <ShoppingBag size={10} />
                                    Mín. ₡{promo.min_order_amount.toLocaleString()}
                                  </span>
                                )}
                                {remaining && (
                                  <span className={`flex items-center gap-1 text-[11px] ${isUrgent ? 'text-red-400 font-bold' : 'opacity-50'}`}>
                                    <Clock size={10} />
                                    {remaining}
                                  </span>
                                )}
                                {promoItems.length > 0 && (
                                  <span className="text-[11px] opacity-50">
                                    {promoItems.length} producto{promoItems.length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex-shrink-0 text-right">
                              {promo.promo_price ? (
                                <div>
                                  <div className="text-xl font-black" style={{ color: accentColor }}>
                                    ₡{promo.promo_price.toLocaleString()}
                                  </div>
                                  <div className="text-[10px] opacity-50">precio promo</div>
                                </div>
                              ) : promo.type === 'percentage' ? (
                                <div className="text-2xl font-black" style={{ color: accentColor }}>
                                  {promo.value}%
                                </div>
                              ) : promo.type === 'fixed' ? (
                                <div className="text-xl font-black" style={{ color: accentColor }}>
                                  -₡{promo.value.toLocaleString()}
                                </div>
                              ) : (
                                <div className="text-2xl">{cfg.icon}</div>
                              )}

                              {isAdded ? (
                                <div className="flex items-center gap-1 text-[11px] font-bold text-green-400 mt-1">
                                  <Check size={11} /> Aplicada
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-[11px] font-semibold mt-1"
                                  style={{ color: accentColor }}>
                                  {isExpanded ? 'Cerrar' : 'Ver'}
                                  <ChevronRight size={11} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-1 space-y-3"
                              style={{ borderTop: `1px solid ${textColor}08` }}>

                              {promo.description && (
                                <p className="text-sm opacity-70 pt-2">{promo.description}</p>
                              )}

                              {promo.promo_price && (
                                <div className="rounded-xl p-3 flex items-center justify-between"
                                  style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}30` }}>
                                  <div>
                                    <div className="text-xs opacity-60 font-medium">Precio de la promoción</div>
                                    <div className="text-2xl font-black" style={{ color: accentColor }}>
                                      ₡{promo.promo_price.toLocaleString()}
                                    </div>
                                  </div>
                                  <span className="text-3xl">{cfg.icon}</span>
                                </div>
                              )}

                              {promoItems.length > 0 && (
                                <div>
                                  <div className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">
                                    {promo.type === '2x1' || promo.type === 'bogo'
                                      ? 'Selecciona el producto del 2×1'
                                      : promo.type === 'combo'
                                      ? 'Producto que se agregará al carrito'
                                      : 'Productos de la oferta'}
                                  </div>
                                  <div className="space-y-2">
                                    {promoItems.map(item => {
                                      const itemImage = normalizeAssetUrl(item.image_url) || promoImage;
                                      return (
                                        <div key={item.id}
                                          className="flex items-center gap-3 rounded-xl p-2.5"
                                          style={{ background: `${textColor}06`, border: `1px solid ${textColor}08` }}>
                                          {itemImage && (
                                            <img src={itemImage} alt={item.name}
                                              className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold truncate">{item.name}</div>
                                            <div className="text-xs opacity-50">
                                              ₡{item.price.toLocaleString()} c/u
                                            </div>
                                          </div>
                                          {(promo.type === '2x1' || promo.type === 'bogo') && (
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              <button
                                                onClick={e => { e.stopPropagation(); setItemQty(q => ({ ...q, [item.id]: Math.max(0, (q[item.id] || 0) - 1) })); }}
                                                className="w-7 h-7 rounded-full flex items-center justify-center"
                                                style={{ background: `${textColor}10` }}>
                                                <Minus size={12} />
                                              </button>
                                              <span className="text-sm font-bold w-4 text-center">
                                                {itemQty[item.id] || 0}
                                              </span>
                                              <button
                                                onClick={e => { e.stopPropagation(); setItemQty(q => ({ ...q, [item.id]: (q[item.id] || 0) + 1 })); }}
                                                className="w-7 h-7 rounded-full flex items-center justify-center"
                                                style={{ background: accentColor }}>
                                                <Plus size={12} style={{ color: bgColor }} />
                                              </button>
                                            </div>
                                          )}
                                          {promo.type === 'combo' && (
                                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                                              style={{ background: `${accentColor}20` }}>
                                              <Check size={12} style={{ color: accentColor }} />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="space-y-1.5">
                                {promo.min_order_amount && promo.min_order_amount > 0 && (
                                  <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                                    needsMinOrder ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                                  }`}>
                                    {needsMinOrder ? <Lock size={12} /> : <Check size={12} />}
                                    {needsMinOrder
                                      ? `Necesitas ₡${(promo.min_order_amount - totalPrice).toLocaleString()} más para aplicar`
                                      : `Monto mínimo ₡${promo.min_order_amount.toLocaleString()} ✓`}
                                  </div>
                                )}
                                {(promo.active_hours_start || promo.start_time) && (
                                  <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                                    active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                  }`}>
                                    <Clock size={12} />
                                    {active ? 'Activa ahora' : 'Fuera de horario'} · {promo.active_hours_start || promo.start_time}–{promo.active_hours_end || promo.end_time}
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => handleApplyPromo(promo)}
                                disabled={!!needsMinOrder || !active}
                                className="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                  background: (needsMinOrder || !active) ? `${textColor}10` : accentColor,
                                  color: (needsMinOrder || !active) ? textColor : bgColor,
                                }}>
                                {isAdded ? '✓ Aplicada al carrito' :
                                  needsMinOrder ? `Necesitas ₡${(promo.min_order_amount! - totalPrice).toLocaleString()} más` :
                                  !active ? 'Fuera de horario' :
                                  (promo.type === '2x1' || promo.type === 'bogo') ? 'Agregar 2×1 al carrito' :
                                  promo.type === 'combo' ? 'Agregar promo al carrito' :
                                  'Aplicar oferta al carrito'}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}

                {lockedPromos.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-bold uppercase tracking-wider opacity-40 mb-2 px-1">
                      🔒 Desbloquea con más puntos
                    </div>
                    {lockedPromos.map(promo => {
                      const cfg = TYPE_CONFIG[promo.type] || TYPE_CONFIG.fixed;
                      const promoImage = normalizeAssetUrl(promo.image_url);
                      return (
                        <div key={promo.id}
                          className="rounded-2xl p-4 mb-2 opacity-50 overflow-hidden"
                          style={{ background: `${textColor}06`, border: `1px solid ${textColor}10` }}>
                          {promoImage && (
                            <img src={promoImage} alt={promo.name} className="w-full h-24 object-cover rounded-xl mb-3" />
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{cfg.icon}</span>
                              <div>
                                <div className="font-bold text-sm">{promo.name}</div>
                                <div className="text-xs opacity-60">
                                  {promo.promo_price
                                    ? `₡${promo.promo_price.toLocaleString()}`
                                    : promo.type === 'percentage'
                                    ? `${promo.value}% OFF`
                                    : promo.type === 'fixed'
                                    ? `-₡${promo.value.toLocaleString()}`
                                    : promo.description || promo.name}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                              style={{ background: `${textColor}10` }}>
                              <Lock size={10} />
                              {LEVEL_LABELS[promo.level_required!] || promo.level_required}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!profile && (
                  <div className="rounded-2xl p-4 text-center mt-2"
                    style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}25` }}>
                    <div className="text-sm font-bold mb-1">¡Inicia sesión para más beneficios!</div>
                    <div className="text-xs opacity-60">Acumula puntos y desbloquea promos exclusivas.</div>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}