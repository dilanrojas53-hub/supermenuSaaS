/**
 * PromosScreen v3.0 — Todas las promos son interactivas.
 * - percentage / fixed: aplican descuento monetario al carrito
 * - bogo / free_item: se marcan en el pedido como promo activa (sin descuento monetario)
 * - Al tocar una promo disponible → se aplica y se abre el carrito
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag, Clock, Percent, Gift, Zap, ChevronRight, Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import type { ThemeSettings, Tenant } from '@/lib/types';

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: 'percentage' | 'fixed' | 'bogo' | 'free_item' | string;
  value: number;
  min_order_amount: number | null;
  active_from: string | null;
  active_until: string | null;
  level_required: string | null;
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
  onPromoSelect?: (promo: { id: string; name: string; type: string; value: number }) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  percentage: <Percent size={18} />,
  fixed: <Tag size={18} />,
  bogo: <Gift size={18} />,
  free_item: <Gift size={18} />,
  flash: <Zap size={18} />,
};

const LEVEL_LABELS: Record<string, string> = {
  bronze: '🥉 Bronce',
  silver: '🥈 Plata',
  gold: '🥇 Oro',
  vip: '💎 VIP',
};

function formatValue(promo: Promotion): string {
  if (promo.type === 'percentage') return `${promo.value}% de descuento`;
  if (promo.type === 'fixed') return `₡${promo.value.toLocaleString()} de descuento`;
  if (promo.type === 'bogo') return '2x1 — paga uno, lleva dos';
  if (promo.type === 'free_item') return 'Producto gratis incluido';
  return promo.description || promo.name;
}

function timeLeft(until: string | null): string | null {
  if (!until) return null;
  const diff = new Date(until).getTime() - Date.now();
  if (diff <= 0) return 'Expirada';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h restantes`;
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m restantes`;
  return `${mins}m restantes`;
}

export default function PromosScreen({ isOpen, onClose, theme, tenant, onPromoSelect }: PromosScreenProps) {
  const { profile, tenantStats } = useCustomerProfile();
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);

  const accentColor = theme.primary_color || '#F59E0B';
  const bgColor = theme.background_color || '#0a0a0a';
  const textColor = theme.text_color || '#f0f0f0';
  const customerLevel = tenantStats?.level || 'bronze';

  useEffect(() => {
    if (!isOpen || !tenant.id) return;
    setLoading(true);
    setSelectedPromoId(null);
    const now = new Date().toISOString();
    supabase
      .from('promotions')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .or(`active_until.is.null,active_until.gte.${now}`)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPromos((data || []) as Promotion[]);
        setLoading(false);
      });
  }, [isOpen, tenant.id]);

  const LEVEL_ORDER = ['bronze', 'silver', 'gold', 'vip'];
  const visiblePromos = promos.filter(p => {
    if (!p.level_required) return true;
    const reqIdx = LEVEL_ORDER.indexOf(p.level_required);
    const cusIdx = LEVEL_ORDER.indexOf(customerLevel);
    return cusIdx >= reqIdx;
  });

  const lockedPromos = promos.filter(p => {
    if (!p.level_required) return false;
    const reqIdx = LEVEL_ORDER.indexOf(p.level_required);
    const cusIdx = LEVEL_ORDER.indexOf(customerLevel);
    return cusIdx < reqIdx;
  });

  // Todas las promos son aplicables si hay callback
  const isApplicable = (promo: Promotion) => !!onPromoSelect;

  const handlePromoClick = (promo: Promotion) => {
    if (!onPromoSelect) return;
    setSelectedPromoId(promo.id);
    setTimeout(() => {
      onPromoSelect({ id: promo.id, name: promo.name, type: promo.type, value: promo.value });
      onClose();
    }, 350);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed inset-0 z-[200] flex flex-col overflow-hidden"
          style={{ backgroundColor: bgColor, color: textColor }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-12 pb-4"
            style={{ borderBottom: `1px solid ${textColor}12` }}>
            <div className="flex items-center gap-2">
              <Tag size={20} style={{ color: accentColor }} />
              <h1 className="text-lg font-black">Promociones</h1>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: `${textColor}12` }}>
              <X size={18} />
            </button>
          </div>

          {/* Hint */}
          {onPromoSelect && visiblePromos.length > 0 && (
            <div className="px-4 py-2.5 text-xs text-center font-medium"
              style={{ color: `${textColor}60`, background: `${accentColor}08` }}>
              👆 Toca una promoción para aplicarla a tu carrito
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={28} className="animate-spin" style={{ color: accentColor }} />
              </div>
            ) : visiblePromos.length === 0 && lockedPromos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-4">🎁</div>
                <div className="font-bold text-base mb-1">Sin promociones activas</div>
                <div className="text-sm opacity-50">Vuelve pronto, ¡habrá sorpresas!</div>
              </div>
            ) : (
              <>
                {visiblePromos.length > 0 && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider opacity-50 mb-3">
                      Disponibles para ti
                    </div>
                    <div className="space-y-3">
                      {visiblePromos.map(promo => {
                        const remaining = timeLeft(promo.active_until);
                        const isUrgent = remaining && remaining.includes('m restantes');
                        const canApply = isApplicable(promo);
                        const isSelected = selectedPromoId === promo.id;
                        return (
                          <motion.div
                            key={promo.id}
                            whileTap={canApply ? { scale: 0.97 } : {}}
                            className={`rounded-2xl p-4 relative overflow-hidden transition-all ${canApply ? 'cursor-pointer' : ''}`}
                            style={{
                              background: isSelected ? `${accentColor}28` : `${accentColor}12`,
                              border: `1.5px solid ${isSelected ? accentColor : `${accentColor}28`}`,
                            }}
                            onClick={canApply ? () => handlePromoClick(promo) : undefined}
                          >
                            {/* Accent stripe */}
                            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
                              style={{ backgroundColor: accentColor }} />
                            <div className="pl-3">
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <div className="flex items-center gap-2">
                                  <span style={{ color: accentColor }}>{TYPE_ICONS[promo.type] || <Tag size={18} />}</span>
                                  <span className="font-black text-sm">{promo.name}</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {promo.level_required && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                      style={{ background: `${accentColor}20`, color: accentColor }}>
                                      {LEVEL_LABELS[promo.level_required] || promo.level_required}
                                    </span>
                                  )}
                                  {canApply && (
                                    isSelected
                                      ? <Check size={16} style={{ color: accentColor }} />
                                      : <ChevronRight size={16} style={{ color: `${textColor}40` }} />
                                  )}
                                </div>
                              </div>
                              <div className="text-sm font-bold mb-1.5" style={{ color: accentColor }}>
                                {formatValue(promo)}
                              </div>
                              {promo.description && (
                                <div className="text-xs opacity-60 mb-2">{promo.description}</div>
                              )}
                              <div className="flex items-center gap-3 flex-wrap">
                                {promo.min_order_amount && promo.min_order_amount > 0 && (
                                  <span className="text-[11px] opacity-50">
                                    Mínimo ₡{promo.min_order_amount.toLocaleString()}
                                  </span>
                                )}
                                {remaining && (
                                  <span className="flex items-center gap-1 text-[11px]"
                                    style={{ color: isUrgent ? '#EF4444' : `${textColor}50` }}>
                                    <Clock size={11} />
                                    {remaining}
                                  </span>
                                )}
                                {promo.usage_limit && (
                                  <span className="text-[11px] opacity-50">
                                    {promo.usage_limit - promo.used_count} usos restantes
                                  </span>
                                )}
                                {canApply && !isSelected && (
                                  <span className="text-[11px] font-bold" style={{ color: accentColor }}>
                                    Toca para aplicar →
                                  </span>
                                )}
                                {isSelected && (
                                  <span className="text-[11px] font-bold text-green-400">
                                    ✓ Aplicada — abriendo carrito...
                                  </span>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {lockedPromos.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-bold uppercase tracking-wider opacity-50 mb-2">
                      Desbloquea con más puntos
                    </div>
                    <div className="space-y-2">
                      {lockedPromos.map(promo => (
                        <div key={promo.id}
                          className="rounded-2xl p-4 relative overflow-hidden opacity-40"
                          style={{ background: `${textColor}06`, border: `1px solid ${textColor}10` }}>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-bold text-sm mb-0.5">{promo.name}</div>
                              <div className="text-xs opacity-60">{formatValue(promo)}</div>
                            </div>
                            <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full flex-shrink-0"
                              style={{ background: `${textColor}10` }}>
                              🔒 {LEVEL_LABELS[promo.level_required!] || promo.level_required}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!profile && (
                  <div className="mt-4 rounded-2xl p-4 text-center"
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
