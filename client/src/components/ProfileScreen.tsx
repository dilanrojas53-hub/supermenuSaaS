/**
 * ProfileScreen — v3.0
 * Pantalla completa de perfil con diseño moderno y amigable.
 * Tabs con iconos claros, header con avatar y puntos destacados.
 * Puntos NUNCA se pierden al cerrar/abrir sesión (viven en tenant_customer_stats en Supabase).
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Clock, Heart, MapPin, Shield, LogOut, Loader2, Trash2, Plus, Edit2, Check, Fingerprint, Smartphone, Star, ShoppingBag, Home, UtensilsCrossed, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import type { CustomerTenantEntry } from '@/contexts/CustomerProfileContext';
import { supabase } from '@/lib/supabase';
import type { ThemeSettings, Tenant } from '@/lib/types';

interface Order { id: string; order_number: number; total: number; status: string; created_at: string; items: { name: string; quantity: number }[]; }
interface Favorite { id: string; item_id: string; item_name?: string | null; item_price?: number | null; item_image_url?: string | null; }
interface Address { id: string; label: string; address: string; instructions?: string; is_default: boolean; }
interface LoyaltyReward { id: string; name: string; points_required: number; reward_value: number; }

interface ProfileScreenProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
  onOpenLogin?: () => void;
}

const LEVEL_CONFIG: Record<string, { label: string; color: string; icon: string; min: number; max: number }> = {
  bronze: { label: 'Bronce', color: '#CD7F32', icon: '🥉', min: 0,    max: 500  },
  silver: { label: 'Plata',  color: '#C0C0C0', icon: '🥈', min: 500,  max: 1500 },
  gold:   { label: 'Oro',    color: '#FFD700', icon: '🥇', min: 1500, max: 3000 },
  vip:    { label: 'VIP',    color: '#9B59B6', icon: '💎', min: 3000, max: 9999 },
};

type TabKey = 'overview' | 'history' | 'favorites' | 'my_restaurants' | 'addresses' | 'security';

const TABS: { key: TabKey; label: string; Icon: React.FC<{ size?: number; className?: string }> }[] = [
  { key: 'overview',       label: 'Inicio',        Icon: Home },
  { key: 'history',        label: 'Historial',     Icon: Clock },
  { key: 'favorites',      label: 'Favoritos',     Icon: Heart },
  { key: 'my_restaurants', label: 'Restaurantes',  Icon: UtensilsCrossed },
  { key: 'addresses',      label: 'Direcciones',   Icon: MapPin },
  { key: 'security',       label: 'Seguridad',     Icon: Shield },
];

export default function ProfileScreen({ isOpen, onClose, theme, tenant, onOpenLogin }: ProfileScreenProps) {
  const {
    profile, tenantStats, isLoading: contextLoading,
    logout, logoutAllDevices, setPassword, changePassword,
    updateProfile, refreshTenantStats,
    isWebAuthnSupported, registerPasskey, getPasskeys, deletePasskey,
    loadCustomerTenants,
  } = useCustomerProfile();

  const tenantPoints      = tenantStats?.points ?? 0;
  const tenantLevel       = (tenantStats?.level || 'bronze') as keyof typeof LEVEL_CONFIG;
  const tenantTotalOrders = tenantStats?.total_orders ?? 0;

  const accentColor  = theme.primary_color || '#F59E0B';
  const bgColor      = theme.background_color || '#0a0a0a';
  const textColor    = theme.text_color || '#f5f5f5';
  const surfaceColor = 'rgba(255,255,255,0.05)';

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [customerTenants, setCustomerTenants] = useState<CustomerTenantEntry[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [loading, setLoading] = useState(false);

  // Canje
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemMsg, setRedeemMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Seguridad
  const [pwMode, setPwMode] = useState<'none' | 'set' | 'change'>('none');
  const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState(''); const [oldPw, setOldPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [passkeys, setPasskeys] = useState<{ id: string; credential_id: string; friendly_name: string | null; created_at: string; last_used_at: string | null }[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyMsg, setPasskeyMsg] = useState('');
  const [passkeysLoaded, setPasskeysLoaded] = useState(false);

  // Direcciones
  const [addingAddr, setAddingAddr] = useState(false);
  const [addrLabel, setAddrLabel] = useState(''); const [addrText, setAddrText] = useState('');

  // Edición de datos
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [newBirthday, setNewBirthday] = useState('');

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [ordRes, favRes, addrRes, rewRes] = await Promise.all([
      supabase.from('orders').select('id,order_number,total,status,created_at,items')
        .eq('customer_profile_id', profile.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('customer_favorites').select('id,item_id,item_name,item_price,item_image_url')
        .eq('customer_id', profile.id).eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
      supabase.from('customer_addresses').select('*')
        .eq('customer_id', profile.id).order('is_default', { ascending: false }),
      supabase.from('loyalty_rewards').select('id,name,points_required,reward_value')
        .eq('tenant_id', tenant.id).eq('is_active', true),
    ]);
    setOrders((ordRes.data || []) as Order[]);
    setFavorites((favRes.data || []) as Favorite[]);
    setAddresses((addrRes.data || []) as Address[]);
    setRewards(rewRes.data || []);
    setLoading(false);
  }, [profile, tenant.id]);

  useEffect(() => { if (isOpen && profile) { loadData(); } }, [isOpen, loadData]);

  const profileId = profile?.id;
  useEffect(() => {
    if (activeTab !== 'my_restaurants' || !profileId) return;
    setLoadingTenants(true);
    loadCustomerTenants().then(data => {
      setCustomerTenants(data);
      setLoadingTenants(false);
    });
  }, [activeTab, profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lvl = LEVEL_CONFIG[tenantLevel] || LEVEL_CONFIG.bronze;
  const nextLvlKey = Object.keys(LEVEL_CONFIG)[Object.keys(LEVEL_CONFIG).indexOf(tenantLevel) + 1];
  const nextLvl = nextLvlKey ? LEVEL_CONFIG[nextLvlKey] : null;
  const progress = nextLvl ? Math.min(100, (tenantPoints - lvl.min) / (nextLvl.min - lvl.min) * 100) : 100;

  const handleSavePassword = async () => {
    if (pw1 !== pw2) { setPwMsg('Las contraseñas no coinciden'); return; }
    if (pw1.length < 6) { setPwMsg('Mínimo 6 caracteres'); return; }
    const res = pwMode === 'set' ? await setPassword(pw1) : await changePassword(oldPw, pw1);
    setPwMsg(res.success ? '✅ Contraseña guardada' : res.error || 'Error');
    if (res.success) { setPw1(''); setPw2(''); setOldPw(''); setTimeout(() => { setPwMode('none'); setPwMsg(''); }, 1500); }
  };

  const handleAddAddress = async () => {
    if (!addrText.trim() || !profile) return;
    const { data } = await supabase.from('customer_addresses')
      .insert({ customer_id: profile.id, label: addrLabel || 'Casa', address: addrText, is_default: addresses.length === 0 })
      .select().single();
    if (data) { setAddresses(prev => [...prev, data as Address]); setAddingAddr(false); setAddrLabel(''); setAddrText(''); }
  };

  const handleDeleteAddress = async (id: string) => {
    await supabase.from('customer_addresses').delete().eq('id', id);
    setAddresses(prev => prev.filter(a => a.id !== id));
  };

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    await updateProfile({ name: newName.trim() });
    setEditingName(false);
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim()) return;
    await updateProfile({ email: newEmail.trim() });
    setEditingEmail(false);
  };

  const handleSaveBirthday = async () => {
    if (!newBirthday) return;
    await updateProfile({ birthday: newBirthday });
    setEditingBirthday(false);
  };

  if (!isOpen) return null;

  if (contextLoading) return (
    <motion.div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ backgroundColor: bgColor }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <button onClick={onClose} className="absolute top-12 right-5 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}><X size={20} /></button>
      <Loader2 size={28} className="animate-spin" style={{ color: accentColor }} />
    </motion.div>
  );

  if (!profile) return (
    <motion.div className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-8"
      style={{ backgroundColor: bgColor, color: textColor }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button onClick={onClose} className="absolute top-12 right-5 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}><X size={20} /></button>
      <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl mb-5"
        style={{ background: `${accentColor}22`, border: `2px solid ${accentColor}44` }}>
        👤
      </div>
      <h2 className="text-2xl font-black mb-2">Mi Perfil</h2>
      <p className="text-sm opacity-60 text-center mb-8">Iniciá sesión para ver tu historial, puntos y favoritos.</p>
      <button onClick={onOpenLogin}
        className="w-full max-w-xs px-8 py-4 rounded-2xl font-bold text-base"
        style={{ backgroundColor: accentColor, color: '#000' }}>
        Iniciar sesión
      </button>
      <button onClick={onClose} className="mt-4 text-sm opacity-40">Continuar como invitado</button>
    </motion.div>
  );

  const initials = (profile.name || profile.phone || '?').slice(0, 1).toUpperCase();

  return (
    <motion.div className="fixed inset-0 z-[200] flex flex-col"
      style={{ backgroundColor: bgColor, color: textColor }}
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}>

      {/* HEADER */}
      <div className="shrink-0 px-4 pb-3"
        style={{
          paddingTop: 'max(48px, env(safe-area-inset-top))',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onClose} className="p-2 rounded-full shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X size={20} />
          </button>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-black shrink-0"
            style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}99)`, color: '#000' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  className="flex-1 bg-transparent border-b outline-none text-base font-bold"
                  style={{ borderColor: accentColor, color: textColor }} autoFocus />
                <button onClick={handleSaveName}><Check size={18} style={{ color: accentColor }} /></button>
                <button onClick={() => setEditingName(false)}><X size={16} className="opacity-40" /></button>
              </div>
            ) : (
              <button className="flex items-center gap-1.5 text-left w-full" onClick={() => { setEditingName(true); setNewName(profile.name || ''); }}>
                <span className="font-bold text-base truncate">{profile.name || 'Sin nombre'}</span>
                <Edit2 size={12} className="opacity-30 shrink-0" />
              </button>
            )}
            <p className="text-xs opacity-40 font-mono">{profile.phone}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-black leading-none" style={{ color: accentColor }}>{tenantPoints}</div>
            <div className="text-[10px] opacity-50 leading-none mt-0.5">puntos</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {TABS.map(({ key, label, Icon }) => {
            const isActive = activeTab === key;
            return (
              <button key={key} onClick={() => setActiveTab(key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0"
                style={{
                  backgroundColor: isActive ? accentColor : 'rgba(255,255,255,0.07)',
                  color: isActive ? '#000' : textColor,
                  opacity: isActive ? 1 : 0.75,
                }}>
                <Icon size={13} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto pb-24">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin opacity-40" />
          </div>
        )}

        {/* INICIO */}
        {!loading && activeTab === 'overview' && (
          <div className="p-4 space-y-4">
            {/* Card nivel */}
            <div className="rounded-2xl p-4"
              style={{
                background: `linear-gradient(135deg, ${lvl.color}28 0%, ${lvl.color}10 100%)`,
                border: `1px solid ${lvl.color}40`,
              }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs opacity-50 mb-0.5">Nivel actual</p>
                  <p className="text-2xl font-black">{lvl.icon} {lvl.label}</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black" style={{ color: accentColor }}>{tenantPoints}</p>
                  <p className="text-xs opacity-40">puntos</p>
                </div>
              </div>
              {nextLvl && (
                <>
                  <div className="h-2.5 rounded-full overflow-hidden mb-2" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${lvl.color}, ${lvl.color}cc)` }} />
                  </div>
                  <div className="flex justify-between text-[11px] opacity-50">
                    <span>{tenantPoints} pts</span>
                    <span>{nextLvl.min} pts para {nextLvl.icon} {nextLvl.label}</span>
                  </div>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4 flex flex-col items-center justify-center gap-1"
                style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
                <ShoppingBag size={22} className="opacity-60" />
                <p className="text-2xl font-black">{tenantTotalOrders}</p>
                <p className="text-xs opacity-50">Pedidos</p>
              </div>
              <div className="rounded-2xl p-4 flex flex-col items-center justify-center gap-1"
                style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
                <Star size={22} style={{ color: accentColor }} />
                <p className="text-2xl font-black" style={{ color: accentColor }}>{tenantPoints}</p>
                <p className="text-xs opacity-50">Puntos</p>
              </div>
            </div>

            {/* Recompensas */}
            {rewards.length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-3 opacity-70">Recompensas disponibles</h3>
                <div className="space-y-3">
                  {rewards.map(r => {
                    const canRedeem = tenantPoints >= r.points_required;
                    const isRedeeming = redeemingId === r.id;
                    const anyRedeeming = redeemingId !== null;
                    const msg = redeemMsg?.id === r.id ? redeemMsg : null;
                    return (
                      <div key={r.id} className="rounded-2xl p-4 space-y-2"
                        style={{
                          background: surfaceColor,
                          border: `1px solid ${canRedeem ? accentColor + '40' : 'rgba(255,255,255,0.06)'}`,
                          opacity: canRedeem ? 1 : 0.6,
                        }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{r.name}</p>
                            <p className="text-xs opacity-50 mt-0.5">{r.points_required} puntos • Descuento: ₡{r.reward_value.toLocaleString()}</p>
                          </div>
                          {canRedeem ? (
                            <button
                              disabled={anyRedeeming}
                              onClick={async () => {
                                if (!profile?.id || !tenantStats) return;
                                setRedeemingId(r.id);
                                setRedeemMsg(null);
                                try {
                                  const { data: stats } = await supabase
                                    .from('tenant_customer_stats')
                                    .select('points')
                                    .eq('customer_id', profile.id)
                                    .eq('tenant_id', tenant.id)
                                    .single();
                                  const currentPoints = stats?.points ?? 0;
                                  if (currentPoints < r.points_required) {
                                    setRedeemMsg({ id: r.id, text: 'Puntos insuficientes', ok: false });
                                    return;
                                  }
                                  const newPoints = currentPoints - r.points_required;
                                  const newLevel = newPoints >= 3000 ? 'vip' : newPoints >= 1500 ? 'gold' : newPoints >= 500 ? 'silver' : 'bronze';
                                  await supabase.from('tenant_customer_stats')
                                    .update({ points: newPoints, level: newLevel })
                                    .eq('customer_id', profile.id)
                                    .eq('tenant_id', tenant.id);
                                  const rewardCode = `REWARD-${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
                                  await supabase.from('customer_rewards').insert({
                                    customer_id: profile.id, tenant_id: tenant.id,
                                    type: 'redeemed', amount: r.points_required,
                                    description: `Canje: ${r.name} (código: ${rewardCode})`,
                                  });
                                  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                                  await supabase.from('promotions').insert({
                                    tenant_id: tenant.id, name: `Recompensa: ${r.name}`,
                                    type: 'fixed', value: r.reward_value,
                                    coupon_code: rewardCode, is_active: true,
                                    max_uses: 1, current_uses: 0, min_order_amount: 0,
                                    expires_at: expiresAt,
                                    description: `Cupón generado por canje de ${r.points_required} puntos`,
                                  });
                                  await refreshTenantStats();
                                  setRedeemMsg({ id: r.id, text: `¡Canjeado! Tu código: ${rewardCode}`, ok: true });
                                } catch (err: any) {
                                  setRedeemMsg({ id: r.id, text: 'Error al canjear. Intenta de nuevo.', ok: false });
                                } finally {
                                  setRedeemingId(null);
                                }
                              }}
                              className="shrink-0 text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 transition-opacity"
                              style={{ background: accentColor, color: '#000', opacity: isRedeeming ? 0.6 : 1 }}>
                              {isRedeeming
                                ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-black border-t-transparent rounded-full" /> Canjeando...</>
                                : '¡Canjear!'}
                            </button>
                          ) : (
                            <div className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full"
                              style={{ background: 'rgba(255,255,255,0.06)', color: textColor }}>
                              Faltan {r.points_required - tenantPoints}
                            </div>
                          )}
                        </div>
                        {msg && (
                          <div className="text-xs rounded-xl px-3 py-2 font-semibold"
                            style={{ background: msg.ok ? accentColor + '22' : '#EF444422', color: msg.ok ? accentColor : '#EF4444' }}>
                            {msg.text}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mis datos */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-bold uppercase tracking-widest px-4 pt-4 pb-2 opacity-40">Mis datos</p>
              <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-xs opacity-50 w-20 shrink-0">Nombre</span>
                {editingName ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input value={newName} onChange={e => setNewName(e.target.value)}
                      className="flex-1 bg-transparent border-b outline-none text-sm"
                      style={{ borderColor: accentColor, color: textColor }} autoFocus />
                    <button onClick={handleSaveName}><Check size={16} style={{ color: accentColor }} /></button>
                    <button onClick={() => setEditingName(false)}><X size={16} className="opacity-40" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm flex-1 opacity-80">{profile.name || <span className="opacity-30">Sin nombre</span>}</span>
                    <button onClick={() => { setEditingName(true); setNewName(profile.name || ''); }}>
                      <Edit2 size={13} className="opacity-40" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-xs opacity-50 w-20 shrink-0">Email</span>
                {editingEmail ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                      type="email" placeholder="tu@email.com"
                      className="flex-1 bg-transparent border-b outline-none text-sm"
                      style={{ borderColor: accentColor, color: textColor }} autoFocus />
                    <button onClick={handleSaveEmail}><Check size={16} style={{ color: accentColor }} /></button>
                    <button onClick={() => setEditingEmail(false)}><X size={16} className="opacity-40" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm flex-1 opacity-80">{(profile as any).email || <span className="opacity-30">Sin email</span>}</span>
                    <button onClick={() => { setEditingEmail(true); setNewEmail((profile as any).email || ''); }}>
                      <Edit2 size={13} className="opacity-40" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="text-xs opacity-50 w-20 shrink-0">Cumpleaños</span>
                {editingBirthday ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input value={newBirthday} onChange={e => setNewBirthday(e.target.value)}
                      type="date"
                      className="flex-1 bg-transparent border-b outline-none text-sm"
                      style={{ borderColor: accentColor, color: textColor }} autoFocus />
                    <button onClick={handleSaveBirthday}><Check size={16} style={{ color: accentColor }} /></button>
                    <button onClick={() => setEditingBirthday(false)}><X size={16} className="opacity-40" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm flex-1 opacity-80">{(profile as any).birthday || <span className="opacity-30">Sin fecha</span>}</span>
                    <button onClick={() => { setEditingBirthday(true); setNewBirthday((profile as any).birthday || ''); }}>
                      <Edit2 size={13} className="opacity-40" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button onClick={() => { logout(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        )}

        {/* HISTORIAL */}
        {!loading && activeTab === 'history' && (
          <div className="p-4">
            {orders.length === 0 ? (
              <div className="text-center py-16 opacity-40">
                <Clock size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-base font-semibold">Sin pedidos aún</p>
                <p className="text-sm mt-1 opacity-70">Tus pedidos aparecerán aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs opacity-40 mb-1">{orders.length} pedido{orders.length !== 1 ? 's' : ''}</p>
                {orders.map(o => (
                  <div key={o.id} className="rounded-2xl p-4"
                    style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ShoppingBag size={15} className="opacity-50" />
                        <span className="font-bold text-sm">Pedido #{o.order_number}</span>
                      </div>
                      <span className="text-sm font-black" style={{ color: accentColor }}>₡{o.total?.toLocaleString()}</span>
                    </div>
                    <p className="text-xs opacity-40 mb-2">
                      {new Date(o.created_at).toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-xs opacity-60 leading-relaxed">
                      {Array.isArray(o.items)
                        ? o.items.slice(0, 3).map((it: { name: string; quantity: number }) => `${it.quantity}× ${it.name}`).join(' · ')
                        : ''}
                      {Array.isArray(o.items) && o.items.length > 3 ? ` · +${o.items.length - 3} más` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FAVORITOS */}
        {!loading && activeTab === 'favorites' && (
          <div className="p-4">
            {favorites.length === 0 ? (
              <div className="text-center py-16 opacity-40">
                <Heart size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-base font-semibold">Sin favoritos aún</p>
                <p className="text-sm mt-1 opacity-70">Tocá el ❤️ en cualquier platillo</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {favorites.map(f => (
                  <div key={f.id} className="rounded-2xl overflow-hidden relative"
                    style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
                    {f.item_image_url ? (
                      <img src={f.item_image_url} alt={f.item_name || ''} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center text-3xl"
                        style={{ background: 'rgba(255,255,255,0.04)' }}>🍽️</div>
                    )}
                    <div className="p-2.5">
                      <p className="text-xs font-bold leading-tight truncate">{f.item_name || 'Platillo'}</p>
                      {f.item_price != null && (
                        <p className="text-xs mt-0.5 font-semibold" style={{ color: accentColor }}>₡{f.item_price.toLocaleString()}</p>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        await supabase.from('customer_favorites').delete().eq('id', f.id);
                        setFavorites(prev => prev.filter(x => x.id !== f.id));
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-full"
                      style={{ background: 'rgba(0,0,0,0.5)' }}
                      aria-label="Quitar de favoritos">
                      <Heart size={13} fill="#ef4444" stroke="#ef4444" strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MIS RESTAURANTES */}
        {!loading && activeTab === 'my_restaurants' && (
          <div className="p-4">
            {loadingTenants ? (
              <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin opacity-40" /></div>
            ) : customerTenants.length === 0 ? (
              <div className="text-center py-16 opacity-40">
                <UtensilsCrossed size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-base font-semibold">Aún sin restaurantes</p>
                <p className="text-sm mt-1 opacity-70">Tu cuenta funciona en todos los restaurantes SmartMenu</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs opacity-40 mb-1">Tu cuenta funciona en todos estos restaurantes con los mismos datos.</p>
                {customerTenants.map(t => (
                  <div key={t.tenant_id} className="rounded-2xl p-4 flex items-center gap-3"
                    style={{
                      background: surfaceColor,
                      border: t.tenant_id === tenant.id ? `1px solid ${accentColor}60` : '1px solid rgba(255,255,255,0.06)',
                    }}>
                    {t.tenant_logo_url ? (
                      <img src={t.tenant_logo_url} alt={t.tenant_name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{ background: 'rgba(255,255,255,0.08)' }}>🍽️</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{t.tenant_name}</p>
                      {t.tenant_id === tenant.id && (
                        <p className="text-[10px] mb-0.5" style={{ color: accentColor }}>Restaurante actual</p>
                      )}
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs opacity-60">⭐ {t.points} pts</span>
                        <span className="text-xs opacity-60">🛒 {t.total_orders} pedidos</span>
                      </div>
                    </div>
                    {t.last_seen_at && (
                      <p className="text-[10px] opacity-30 shrink-0">
                        {new Date(t.last_seen_at).toLocaleDateString('es-CR', { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DIRECCIONES */}
        {!loading && activeTab === 'addresses' && (
          <div className="p-4 space-y-3">
            {addresses.length === 0 && !addingAddr && (
              <div className="text-center py-10 opacity-40">
                <MapPin size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">Sin direcciones guardadas</p>
              </div>
            )}
            {addresses.map(a => (
              <div key={a.id} className="flex items-start gap-3 rounded-2xl p-4"
                style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
                <MapPin size={18} className="mt-0.5 shrink-0" style={{ color: accentColor }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{a.label}</span>
                    {a.is_default && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: accentColor + '22', color: accentColor }}>Principal</span>
                    )}
                  </div>
                  <p className="text-xs opacity-60 mt-0.5">{a.address}</p>
                </div>
                <button onClick={() => handleDeleteAddress(a.id)} className="p-1.5 rounded-full opacity-30 hover:opacity-70"
                  style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
            ))}
            {!addingAddr ? (
              <button onClick={() => setAddingAddr(true)}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold"
                style={{ background: surfaceColor, color: accentColor, border: `1px dashed ${accentColor}40` }}>
                <Plus size={16} /> Agregar dirección
              </button>
            ) : (
              <div className="rounded-2xl p-4 space-y-3"
                style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
                <input value={addrLabel} onChange={e => setAddrLabel(e.target.value)}
                  placeholder="Etiqueta (Casa, Trabajo...)"
                  className="w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.15)', color: textColor }} />
                <input value={addrText} onChange={e => setAddrText(e.target.value)}
                  placeholder="Dirección completa"
                  className="w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: 'rgba(255,255,255,0.15)', color: textColor }} />
                <div className="flex gap-2">
                  <button onClick={handleAddAddress}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: accentColor, color: '#000' }}>Guardar</button>
                  <button onClick={() => { setAddingAddr(false); setAddrLabel(''); setAddrText(''); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold opacity-50"
                    style={{ background: 'rgba(255,255,255,0.08)' }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SEGURIDAD */}
        {!loading && activeTab === 'security' && (
          <div className="p-4 space-y-4">
            <div className="rounded-2xl overflow-hidden"
              style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-3">
                  <Shield size={18} style={{ color: accentColor }} />
                  <div>
                    <p className="text-sm font-bold">Contraseña</p>
                    <p className="text-xs opacity-40">{(profile as any).has_password ? 'Configurada' : 'Sin contraseña'}</p>
                  </div>
                </div>
                {pwMode === 'none' && (
                  <button
                    onClick={() => setPwMode((profile as any).has_password ? 'change' : 'set')}
                    className="text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
                    style={{ background: accentColor + '22', color: accentColor }}>
                    <ChevronRight size={12} />
                    {(profile as any).has_password ? 'Cambiar' : 'Crear'}
                  </button>
                )}
              </div>
              {pwMode !== 'none' && (
                <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  {pwMode === 'change' && (
                    <input value={oldPw} onChange={e => setOldPw(e.target.value)}
                      type="password" placeholder="Contraseña actual"
                      className="w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm outline-none mt-3"
                      style={{ borderColor: 'rgba(255,255,255,0.15)', color: textColor }} />
                  )}
                  <input value={pw1} onChange={e => setPw1(e.target.value)}
                    type="password" placeholder="Nueva contraseña"
                    className="w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: 'rgba(255,255,255,0.15)', color: textColor }} />
                  <input value={pw2} onChange={e => setPw2(e.target.value)}
                    type="password" placeholder="Confirmar contraseña"
                    className="w-full bg-transparent border rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ borderColor: 'rgba(255,255,255,0.15)', color: textColor }} />
                  {pwMsg && <p className="text-xs" style={{ color: pwMsg.startsWith('✅') ? '#22c55e' : '#f87171' }}>{pwMsg}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleSavePassword}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: accentColor, color: '#000' }}>Guardar</button>
                    <button onClick={() => { setPwMode('none'); setPw1(''); setPw2(''); setOldPw(''); setPwMsg(''); }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold opacity-50"
                      style={{ background: 'rgba(255,255,255,0.08)' }}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>

            {isWebAuthnSupported() && (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: surfaceColor, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Fingerprint size={18} style={{ color: accentColor }} />
                    <div>
                      <p className="text-sm font-bold">Passkeys</p>
                      <p className="text-xs opacity-40">Huella / Face ID</p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setPasskeyLoading(true); setPasskeyMsg('');
                      const result = await registerPasskey();
                      if (result.success) {
                        const list = await getPasskeys();
                        setPasskeys(list); setPasskeysLoaded(true);
                        setPasskeyMsg('✅ Passkey registrada');
                      } else if (result.error !== 'Operación cancelada') {
                        setPasskeyMsg(result.error || 'Error');
                      }
                      setPasskeyLoading(false);
                    }}
                    disabled={passkeyLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
                    style={{ background: accentColor + '22', color: accentColor }}>
                    {passkeyLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Agregar
                  </button>
                </div>
                {passkeyMsg && (
                  <p className="text-xs px-4 pb-3" style={{ color: passkeyMsg.startsWith('✅') ? '#22c55e' : '#f87171' }}>{passkeyMsg}</p>
                )}
                {!passkeysLoaded && !passkeyLoading && (
                  <button onClick={async () => {
                    setPasskeyLoading(true);
                    const list = await getPasskeys();
                    setPasskeys(list); setPasskeysLoaded(true);
                    setPasskeyLoading(false);
                  }} className="text-xs px-4 pb-4 block" style={{ color: accentColor }}>
                    Ver dispositivos registrados →
                  </button>
                )}
                {passkeysLoaded && passkeys.length > 0 && (
                  <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {passkeys.map(pk => (
                      <div key={pk.id} className="flex items-center justify-between px-4 py-3 border-b last:border-0"
                        style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center gap-2">
                          <Smartphone size={14} className="opacity-40" />
                          <div>
                            <p className="text-xs font-semibold">{pk.friendly_name || 'Dispositivo'}</p>
                            <p className="text-[10px] opacity-40">
                              {pk.last_used_at
                                ? `Último uso: ${new Date(pk.last_used_at).toLocaleDateString('es-CR')}`
                                : `Registrado: ${new Date(pk.created_at).toLocaleDateString('es-CR')}`}
                            </p>
                          </div>
                        </div>
                        <button onClick={async () => {
                          await deletePasskey(pk.credential_id);
                          setPasskeys(prev => prev.filter(p => p.id !== pk.id));
                        }} className="p-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
                          <Trash2 size={13} className="text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {passkeysLoaded && passkeys.length === 0 && (
                  <p className="text-xs px-4 pb-4 opacity-40">No hay dispositivos registrados aún.</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest opacity-40 px-1">Sesión</p>
              <button onClick={() => { logout(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                <LogOut size={16} /> Cerrar sesión en este dispositivo
              </button>
              <button onClick={() => { logoutAllDevices(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.05)', color: '#f87171', border: '1px solid rgba(239,68,68,0.1)' }}>
                <LogOut size={16} /> Cerrar sesión en todos los dispositivos
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
