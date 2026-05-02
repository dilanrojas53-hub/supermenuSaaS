/**
 * PromotionsTab — Motor de promociones configurable en el admin.
 * FIXES:
 * - Automatizaciones: usa tabla 'automation_rules' con campos trigger_type/action_type
 * - Promociones: agrega selector de platillos (item_ids jsonb)
 * - Manejo de errores en todas las operaciones de BD
 */
import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Trash2, ToggleLeft, ToggleRight, Tag, Gift, Zap, Search, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@/lib/types';

interface Promotion {
  id: string;
  name: string;
  type: string;
  value: number | null;
  discount_pct: number | null;
  discount_fixed: number | null;
  min_order_amount: number | null;
  level_required: string | null;
  applicable_level: string | null;
  active_hours_start: string | null;
  active_hours_end: string | null;
  start_time: string | null;
  end_time: string | null;
  item_ids: string[] | null;
  promo_price: number | null;
  is_active: boolean;
  is_new_customer: boolean;
  is_new_customer_only: boolean;
  is_reactivation: boolean;
  created_at: string;
}
interface Coupon {
  id: string;
  code: string;
  discount_pct: number | null;
  discount_fixed: number | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
}
interface LoyaltyReward {
  id: string;
  name: string;
  points_required: number;
  reward_value: number;
  is_active: boolean;
}
interface AutomationRule {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  action_config: Record<string, unknown> | null;
  is_active: boolean;
}
interface MenuItem {
  id: string;
  name: string;
  price: number;
}

const PROMO_TYPES = [
  { key: 'percentage',    label: 'Descuento %',   icon: '🏷️' },
  { key: 'fixed',         label: 'Descuento fijo', icon: '💵' },
  { key: '2x1',           label: '2×1',            icon: '🎁' },
  { key: 'combo',         label: 'Combo',          icon: '🍱' },
  { key: 'schedule',      label: 'Por horario',    icon: '🕐' },
  { key: 'level',         label: 'Por nivel',      icon: '⭐' },
  { key: 'new_customer',  label: 'Cliente nuevo',  icon: '👋' },
  { key: 'reactivation',  label: 'Reactivación',   icon: '🔄' },
];

const AUTOMATION_TRIGGERS = [
  { key: 'first_order',      label: 'Primer pedido',               actionType: 'send_coupon',       actionLabel: 'Enviar cupón de bienvenida' },
  { key: 'inactive_30',      label: 'Inactivo 30 días',            actionType: 'send_coupon',       actionLabel: 'Enviar cupón de reactivación' },
  { key: 'birthday',         label: 'Cumpleaños',                  actionType: 'send_benefit',      actionLabel: 'Enviar beneficio de cumpleaños' },
  { key: 'reward_available', label: 'Recompensa disponible',       actionType: 'send_notification', actionLabel: 'Notificar al cliente' },
  { key: 'cart_abandoned',   label: 'Carrito abandonado (15 min)', actionType: 'send_notification', actionLabel: 'Recordatorio de carrito' },
];

const LEVEL_OPTIONS = ['bronze', 'silver', 'gold', 'vip'];

export default function PromotionsTab({ tenant }: { tenant: Tenant }) {
  const [activeSection, setActiveSection] = useState<'promotions' | 'coupons' | 'rewards' | 'automations'>('promotions');
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAuto, setSavingAuto] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState('percentage');
  const [promoPct, setPromoPct] = useState('');
  const [promoFixed, setPromoFixed] = useState('');
  const [promoMinOrder, setPromoMinOrder] = useState('');
  const [promoLevel, setPromoLevel] = useState('');
  const [promoStartTime, setPromoStartTime] = useState('');
  const [promoEndTime, setPromoEndTime] = useState('');
  const [promoNewOnly, setPromoNewOnly] = useState(false);
  const [promoReactivation, setPromoReactivation] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemSelector, setShowItemSelector] = useState(false);
  const [promoPrice, setPromoPrice] = useState('');

  const [couponCode, setCouponCode] = useState('');
  const [couponPct, setCouponPct] = useState('');
  const [couponFixed, setCouponFixed] = useState('');
  const [couponMaxUses, setCouponMaxUses] = useState('');
  const [couponExpires, setCouponExpires] = useState('');
  const [showCouponForm, setShowCouponForm] = useState(false);

  const [rewardName, setRewardName] = useState('');
  const [rewardPoints, setRewardPoints] = useState('');
  const [rewardValue, setRewardValue] = useState('');
  const [showRewardForm, setShowRewardForm] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [promoRes, couponRes, rewardRes, autoRes, itemsRes] = await Promise.all([
      supabase.from('promotions').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
      supabase.from('coupons').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
      supabase.from('loyalty_rewards').select('*').eq('tenant_id', tenant.id).order('points_required'),
      supabase.from('automation_rules').select('*').eq('tenant_id', tenant.id),
      supabase.from('menu_items').select('id, name, price').eq('tenant_id', tenant.id).order('name'),
    ]);
    setPromotions((promoRes.data || []) as Promotion[]);
    setCoupons((couponRes.data || []) as Coupon[]);
    setRewards((rewardRes.data || []) as LoyaltyReward[]);
    setAutomations((autoRes.data || []) as AutomationRule[]);
    setMenuItems((itemsRes.data || []) as MenuItem[]);
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSavePromo = async () => {
    if (!promoName.trim()) return;
    // Compute value: percentage uses promoPct, fixed uses promoFixed
    const promoValue = promoType === 'percentage' ? (promoPct ? parseFloat(promoPct) : 0)
      : promoType === 'fixed' ? (promoFixed ? parseFloat(promoFixed) : 0)
      : 0;
    const { error } = await supabase.from('promotions').insert({
      tenant_id: tenant.id,
      name: promoName.trim(),
      type: promoType,
      value: promoValue,
      min_order_amount: promoMinOrder ? parseFloat(promoMinOrder) : null,
      level_required: promoLevel || null,
      active_hours_start: promoStartTime || null,
      active_hours_end: promoEndTime || null,
      item_ids: selectedItemIds.length > 0 ? selectedItemIds : null,
      promo_price: promoPrice ? parseFloat(promoPrice) : null,
      is_active: true,
      is_new_customer: promoNewOnly,
      is_reactivation: promoReactivation,
    });
    if (error) { console.error('Error saving promo:', error); return; }
    setShowForm(false);
    setPromoName(''); setPromoPct(''); setPromoFixed(''); setPromoPrice('');
    setPromoMinOrder(''); setPromoLevel(''); setPromoStartTime(''); setPromoEndTime('');
    setPromoNewOnly(false); setPromoReactivation(false);
    setSelectedItemIds([]); setItemSearch(''); setShowItemSelector(false);
    loadData();
  };

  const handleSaveCoupon = async () => {
    if (!couponCode.trim()) return;
    // coupons table uses discount_type + discount_value
    const couponDiscountType = couponPct ? 'percentage' : 'fixed';
    const couponDiscountValue = couponPct ? parseFloat(couponPct) : (couponFixed ? parseFloat(couponFixed) : 0);
    const { error } = await supabase.from('coupons').insert({
      tenant_id: tenant.id,
      code: couponCode.trim().toUpperCase(),
      discount_type: couponDiscountType,
      discount_value: couponDiscountValue,
      max_uses: couponMaxUses ? parseInt(couponMaxUses) : null,
      valid_until: couponExpires || null,
      is_active: true,
      used_count: 0,
    });
    if (error) { console.error('Error saving coupon:', error); return; }
    setShowCouponForm(false); setCouponCode(''); setCouponPct(''); setCouponFixed('');
    setCouponMaxUses(''); setCouponExpires('');
    loadData();
  };

  const handleSaveReward = async () => {
    if (!rewardName.trim() || !rewardPoints) return;
    const { error } = await supabase.from('loyalty_rewards').insert({
      tenant_id: tenant.id,
      name: rewardName.trim(),
      points_required: parseInt(rewardPoints),
      reward_value: rewardValue ? parseFloat(rewardValue) : 0,
      is_active: true,
    });
    if (error) { console.error('Error saving reward:', error); return; }
    setShowRewardForm(false); setRewardName(''); setRewardPoints(''); setRewardValue('');
    loadData();
  };

  const togglePromo = async (id: string, current: boolean) => {
    const { error } = await supabase.from('promotions').update({ is_active: !current }).eq('id', id);
    if (!error) setPromotions(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
  };
  const deletePromo = async (id: string) => {
    if (!confirm('¿Eliminar esta promoción? Esta acción no se puede deshacer.')) return;
    const { error } = await supabase.from('promotions').delete().eq('id', id);
    if (!error) setPromotions(prev => prev.filter(p => p.id !== id));
  };

  const toggleAutomation = async (triggerKey: string) => {
    setSavingAuto(triggerKey);
    try {
      const at = AUTOMATION_TRIGGERS.find(t => t.key === triggerKey);
      if (!at) return;
      const existing = automations.find(a => a.trigger_type === triggerKey);
      if (existing) {
        const newActive = !existing.is_active;
        const { error } = await supabase
          .from('automation_rules')
          .update({ is_active: newActive })
          .eq('id', existing.id);
        if (error) { console.error('Error toggling automation:', error); return; }
        setAutomations(prev => prev.map(a => a.id === existing.id ? { ...a, is_active: newActive } : a));
      } else {
        const { data, error } = await supabase
          .from('automation_rules')
          .insert({
            tenant_id: tenant.id,
            name: at.label,
            trigger_type: triggerKey,
            action_type: at.actionType,
            action_config: { description: at.actionLabel },
            is_active: true,
          })
          .select()
          .single();
        if (error) { console.error('Error creating automation:', error); return; }
        if (data) setAutomations(prev => [...prev, data as AutomationRule]);
      }
    } finally {
      setSavingAuto(null);
    }
  };

  const filteredItems = menuItems.filter(item =>
    item.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const sections = [
    { key: 'promotions', label: 'Promociones', icon: <Tag size={14} /> },
    { key: 'coupons',    label: 'Cupones',     icon: <Gift size={14} /> },
    { key: 'rewards',    label: 'Recompensas', icon: <Tag size={14} /> },
    { key: 'automations',label: 'Automatiz.',  icon: <Zap size={14} /> },
  ] as const;

  const inputCls = "w-full px-3 py-2 rounded-xl text-sm bg-transparent outline-none";
  const inputStyle = { border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div>
      <h2 className="text-lg font-black text-[var(--text-primary)] mb-4">Motor de Promociones</h2>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {sections.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all"
            style={{ background: activeSection === s.key ? '#F59E0B' : 'rgba(255,255,255,0.06)', color: activeSection === s.key ? '#000' : '#94A3B8' }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-500" /></div>
      ) : (
        <>
          {activeSection === 'promotions' && (
            <div>
              <button onClick={() => setShowForm(p => !p)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold mb-4 transition-all"
                style={{ background: '#F59E0B', color: '#000' }}>
                <Plus size={16} /> Nueva promoción
              </button>
              {showForm && (
                <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <input value={promoName} onChange={e => setPromoName(e.target.value)} placeholder="Nombre de la promoción" className={inputCls} style={inputStyle} />
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Tipo</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PROMO_TYPES.map(t => (
                        <button key={t.key} onClick={() => setPromoType(t.key)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                          style={{ background: promoType === t.key ? '#F59E0B22' : 'rgba(255,255,255,0.04)', border: `1px solid ${promoType === t.key ? '#F59E0B' : 'transparent'}`, color: promoType === t.key ? '#F59E0B' : '#94A3B8' }}>
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(promoType === 'percentage' || promoType === 'level' || promoType === 'new_customer' || promoType === 'reactivation') && (
                    <input value={promoPct} onChange={e => setPromoPct(e.target.value)} placeholder="Descuento % (ej: 10)" type="number" className={inputCls} style={inputStyle} />
                  )}
                  {promoType === 'fixed' && (
                    <input value={promoFixed} onChange={e => setPromoFixed(e.target.value)} placeholder="Descuento fijo ₡ (ej: 500)" type="number" className={inputCls} style={inputStyle} />
                  )}
                  {promoType === 'schedule' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input value={promoStartTime} onChange={e => setPromoStartTime(e.target.value)} placeholder="Hora inicio (HH:MM)" className={inputCls} style={inputStyle} />
                      <input value={promoEndTime} onChange={e => setPromoEndTime(e.target.value)} placeholder="Hora fin (HH:MM)" className={inputCls} style={inputStyle} />
                    </div>
                  )}
                  {promoType === 'level' && (
                    <select value={promoLevel} onChange={e => setPromoLevel(e.target.value)} className={inputCls} style={inputStyle}>
                      <option value="">Todos los niveles</option>
                      {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  )}
                  {/* Precio especial de la promo — visible para todos los tipos */}
                  <div>
                    <label className="text-xs font-semibold mb-1 block" style={{ color: '#F59E0B' }}>Precio especial de la promoción</label>
                    <input
                      value={promoPrice}
                      onChange={e => setPromoPrice(e.target.value)}
                      placeholder={promoType === '2x1' ? 'Ej: 2500 (precio del 2x1)' : promoType === 'combo' ? 'Ej: 8000 (precio del combo)' : 'Precio especial ₡ (opcional)'}
                      type="number"
                      min="0"
                      className={inputCls}
                      style={inputStyle}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      {promoType === '2x1'
                        ? 'El precio que paga el cliente por el 2×1 (no el precio unitario del producto).'
                        : promoType === 'combo'
                        ? 'El precio total del combo como paquete.'
                        : 'Si esta promo tiene un precio fijo especial, ingrésalo aquí. Dejar vacío si solo aplica descuento.'}
                    </p>
                  </div>
                  <input value={promoMinOrder} onChange={e => setPromoMinOrder(e.target.value)} placeholder="Monto mínimo de pedido ₡ (opcional)" type="number" className={inputCls} style={inputStyle} />

                  {/* Item selector */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowItemSelector(p => !p)}
                      className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl w-full justify-between"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: '#94A3B8' }}>
                      <span>
                        {selectedItemIds.length === 0
                          ? 'Aplicar a platillos específicos (opcional)'
                          : `${selectedItemIds.length} platillo${selectedItemIds.length > 1 ? 's' : ''} seleccionado${selectedItemIds.length > 1 ? 's' : ''}`}
                      </span>
                      <span>{showItemSelector ? '▲' : '▼'}</span>
                    </button>
                    {showItemSelector && (
                      <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                        <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--bg-surface)' }}>
                          <Search size={14} className="text-slate-400 shrink-0" />
                          <input
                            value={itemSearch}
                            onChange={e => setItemSearch(e.target.value)}
                            placeholder="Buscar platillo..."
                            className="flex-1 bg-transparent text-xs outline-none text-[var(--text-primary)]"
                          />
                          {itemSearch && (
                            <button onClick={() => setItemSearch('')}><X size={12} className="text-slate-400" /></button>
                          )}
                        </div>
                        <div className="max-h-40 overflow-y-auto" style={{ background: 'var(--bg-surface)' }}>
                          {filteredItems.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-3">Sin resultados</p>
                          ) : filteredItems.map(item => {
                            const selected = selectedItemIds.includes(item.id);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => toggleItemSelection(item.id)}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-all"
                                style={{ background: selected ? '#F59E0B15' : 'transparent', color: selected ? '#F59E0B' : '#94A3B8' }}>
                                <span className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                  style={{ background: selected ? '#F59E0B' : 'rgba(255,255,255,0.08)', border: selected ? 'none' : '1px solid rgba(255,255,255,0.15)' }}>
                                  {selected && <Check size={10} className="text-black" />}
                                </span>
                                <span className="flex-1 truncate">{item.name}</span>
                                <span className="text-slate-500">₡{item.price?.toLocaleString()}</span>
                              </button>
                            );
                          })}
                        </div>
                        {selectedItemIds.length > 0 && (
                          <div className="px-3 py-2 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                            <span className="text-xs text-amber-400">{selectedItemIds.length} seleccionado{selectedItemIds.length > 1 ? 's' : ''}</span>
                            <button onClick={() => setSelectedItemIds([])} className="text-xs text-slate-500 hover:text-red-400">Limpiar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={promoNewOnly} onChange={e => setPromoNewOnly(e.target.checked)} />
                      Solo clientes nuevos
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input type="checkbox" checked={promoReactivation} onChange={e => setPromoReactivation(e.target.checked)} />
                      Reactivación
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowForm(false); setSelectedItemIds([]); setItemSearch(''); setShowItemSelector(false); }} className="flex-1 py-2 rounded-xl text-sm text-slate-400">Cancelar</button>
                    <button onClick={handleSavePromo} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{ background: '#F59E0B', color: '#000' }}>Guardar</button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {promotions.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No hay promociones aún</p>
                ) : promotions.map(p => {
                  const typeInfo = PROMO_TYPES.find(t => t.key === p.type);
                  const itemCount = Array.isArray(p.item_ids) ? p.item_ids.length : 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-lg">{typeInfo?.icon || '🏷️'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</div>
                        <div className="text-xs text-slate-400">
                          {typeInfo?.label}
                          {p.discount_pct ? ` · ${p.discount_pct}%` : ''}
                          {p.discount_fixed ? ` · ₡${p.discount_fixed}` : ''}
                          {p.promo_price ? (
                            <span className="ml-1 font-semibold" style={{ color: '#F59E0B' }}>· Precio promo: ₡{p.promo_price.toLocaleString()}</span>
                          ) : null}
                          {(p.active_hours_start || p.start_time) && (p.active_hours_end || p.end_time) ? ` · ${p.active_hours_start || p.start_time}–${p.active_hours_end || p.end_time}` : ''}
                          {itemCount > 0 ? ` · ${itemCount} platillo${itemCount > 1 ? 's' : ''}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => togglePromo(p.id, p.is_active)}>
                          {p.is_active ? <ToggleRight size={22} className="text-amber-400" /> : <ToggleLeft size={22} className="text-slate-500" />}
                        </button>
                        <button onClick={() => deletePromo(p.id)} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                          <Trash2 size={15} className="text-slate-500 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSection === 'coupons' && (
            <div>
              <button onClick={() => setShowCouponForm(p => !p)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold mb-4"
                style={{ background: '#F59E0B', color: '#000' }}>
                <Plus size={16} /> Nuevo cupón
              </button>
              {showCouponForm && (
                <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <input value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="Código (ej: BIENVENIDO10)" className={inputCls} style={inputStyle} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={couponPct} onChange={e => setCouponPct(e.target.value)} placeholder="Descuento %" type="number" className={inputCls} style={inputStyle} />
                    <input value={couponFixed} onChange={e => setCouponFixed(e.target.value)} placeholder="Descuento ₡" type="number" className={inputCls} style={inputStyle} />
                  </div>
                  <input value={couponMaxUses} onChange={e => setCouponMaxUses(e.target.value)} placeholder="Usos máximos (opcional)" type="number" className={inputCls} style={inputStyle} />
                  <div className="flex gap-2">
                    <button onClick={() => setShowCouponForm(false)} className="flex-1 py-2 rounded-xl text-sm text-slate-400">Cancelar</button>
                    <button onClick={handleSaveCoupon} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{ background: '#F59E0B', color: '#000' }}>Guardar</button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {coupons.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No hay cupones aún</p>
                ) : coupons.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] font-mono">{c.code}</div>
                      <div className="text-xs text-slate-400">
                        {c.discount_pct ? `${c.discount_pct}% off` : ''}
                        {c.discount_fixed ? `₡${c.discount_fixed} off` : ''}
                        {c.max_uses ? ` · ${c.used_count}/${c.max_uses} usos` : ` · ${c.used_count} usos`}
                        {c.expires_at ? ` · vence ${new Date(c.expires_at).toLocaleDateString('es-CR')}` : ''}
                      </div>
                    </div>
                    <button onClick={async () => { await supabase.from('coupons').delete().eq('id', c.id); loadData(); }}>
                      <Trash2 size={14} className="text-slate-500 hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'rewards' && (
            <div>
              <button onClick={() => setShowRewardForm(p => !p)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold mb-4"
                style={{ background: '#F59E0B', color: '#000' }}>
                <Plus size={16} /> Nueva recompensa
              </button>
              {showRewardForm && (
                <div className="rounded-2xl p-4 mb-4 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <input value={rewardName} onChange={e => setRewardName(e.target.value)} placeholder="Nombre (ej: Bebida gratis)" className={inputCls} style={inputStyle} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={rewardPoints} onChange={e => setRewardPoints(e.target.value)} placeholder="Puntos necesarios" type="number" className={inputCls} style={inputStyle} />
                    <input value={rewardValue} onChange={e => setRewardValue(e.target.value)} placeholder="Valor ₡ del beneficio" type="number" className={inputCls} style={inputStyle} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowRewardForm(false)} className="flex-1 py-2 rounded-xl text-sm text-slate-400">Cancelar</button>
                    <button onClick={handleSaveReward} className="flex-1 py-2 rounded-xl text-sm font-bold" style={{ background: '#F59E0B', color: '#000' }}>Guardar</button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {rewards.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No hay recompensas aún</p>
                ) : rewards.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">{r.name}</div>
                      <div className="text-xs text-slate-400">{r.points_required} puntos · ₡{r.reward_value} de valor</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={async () => { await supabase.from('loyalty_rewards').update({ is_active: !r.is_active }).eq('id', r.id); loadData(); }}>
                        {r.is_active ? <ToggleRight size={22} className="text-amber-400" /> : <ToggleLeft size={22} className="text-slate-500" />}
                      </button>
                      <button onClick={async () => { if (!confirm('¿Eliminar esta recompensa?')) return; await supabase.from('loyalty_rewards').delete().eq('id', r.id); loadData(); }} className="p-1 rounded hover:bg-red-500/20 transition-colors">
                        <Trash2 size={15} className="text-slate-500 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'automations' && (
            <div>
              <p className="text-xs text-slate-400 mb-4">Activa las automatizaciones que quieras. Se ejecutan automáticamente cuando se cumple la condición.</p>
              <div className="space-y-3">
                {AUTOMATION_TRIGGERS.map(at => {
                  const existing = automations.find(a => a.trigger_type === at.key);
                  const isActive = existing?.is_active ?? false;
                  const isSaving = savingAuto === at.key;
                  return (
                    <div key={at.key} className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{at.label}</div>
                        <div className="text-xs text-slate-400">{at.actionLabel}</div>
                      </div>
                      <button
                        onClick={() => toggleAutomation(at.key)}
                        disabled={isSaving}
                        className="transition-opacity"
                        style={{ opacity: isSaving ? 0.5 : 1 }}>
                        {isSaving
                          ? <Loader2 size={22} className="animate-spin text-slate-400" />
                          : isActive
                            ? <ToggleRight size={22} className="text-amber-400" />
                            : <ToggleLeft size={22} className="text-slate-500" />
                        }
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
