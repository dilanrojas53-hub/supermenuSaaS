/**
 * ProfileScreen — v2.0
 * Pantalla completa de perfil con módulos funcionales reales:
 * puntos/nivel, historial real de pedidos, favoritos, direcciones, seguridad.
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Clock, Heart, MapPin, Shield, ChevronRight, LogOut, Loader2, Trash2, Plus, Edit2, Check, Fingerprint, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import { supabase } from '@/lib/supabase';
import type { ThemeSettings, Tenant } from '@/lib/types';

interface Order { id: string; order_number: number; total: number; status: string; created_at: string; items: { name: string; quantity: number }[]; }
interface Favorite { id: string; item_id: string; }
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
  bronze:   { label: 'Bronce', color: '#CD7F32', icon: '🥉', min: 0,    max: 500  },
  silver:   { label: 'Plata',  color: '#C0C0C0', icon: '🥈', min: 500,  max: 1500 },
  gold:     { label: 'Oro',    color: '#FFD700', icon: '🥇', min: 1500, max: 3000 },
  vip:      { label: 'VIP',    color: '#9B59B6', icon: '💎', min: 3000, max: 9999 },
};

export default function ProfileScreen({ isOpen, onClose, theme, tenant, onOpenLogin }: ProfileScreenProps) {
  const { profile, tenantStats, isLoading: contextLoading, logout, logoutAllDevices, setPassword, changePassword, updateProfile, refreshProfile, isWebAuthnSupported, registerPasskey, getPasskeys, deletePasskey } = useCustomerProfile();
  const tenantPoints = tenantStats?.points ?? 0;
  const tenantLevel = (tenantStats?.level || 'bronze') as keyof typeof LEVEL_CONFIG;
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'favorites' | 'addresses' | 'security'>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [loading, setLoading] = useState(false);
  // Security
  const [pwMode, setPwMode] = useState<'none' | 'set' | 'change'>('none');
  const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState(''); const [oldPw, setOldPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [passkeys, setPasskeys] = useState<{ id: string; credential_id: string; friendly_name: string | null; created_at: string; last_used_at: string | null }[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyMsg, setPasskeyMsg] = useState('');
  const [passkeysLoaded, setPasskeysLoaded] = useState(false);
  // Address form
  const [addingAddr, setAddingAddr] = useState(false);
  const [addrLabel, setAddrLabel] = useState(''); const [addrText, setAddrText] = useState('');
  // Edit name / email / birthday
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [newBirthday, setNewBirthday] = useState('');

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

  const accentColor = theme.primary_color || '#F59E0B';
  const bgColor = theme.background_color || 'var(--menu-bg)';
  const textColor = theme.text_color || 'var(--menu-text)';

  const loadData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [ordRes, favRes, addrRes, rewRes] = await Promise.all([
      supabase.from('orders').select('id,order_number,total,status,created_at,items')
        .eq('customer_profile_id', profile.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('customer_favorites').select('id,item_id').eq('customer_id', profile.id).eq('tenant_id', tenant.id),
      supabase.from('customer_addresses').select('*').eq('customer_id', profile.id).order('is_default', { ascending: false }),
      supabase.from('loyalty_rewards').select('id,name,points_required,reward_value').eq('tenant_id', tenant.id).eq('is_active', true),
    ]);
    setOrders((ordRes.data || []) as Order[]);
    setFavorites((favRes.data || []) as Favorite[]);
    setAddresses((addrRes.data || []) as Address[]);
    setRewards(rewRes.data || []);
    setLoading(false);
  }, [profile, tenant.id]);

  // Fix: solo cargar datos cuando el panel se abre (isOpen: false→true), no en cada cambio de profile
  useEffect(() => { if (isOpen && profile) { loadData(); } }, [isOpen, loadData]);

  const levelKey = tenantLevel;
  const lvl = LEVEL_CONFIG[levelKey] || LEVEL_CONFIG.bronze;
  const nextLvlKey = Object.keys(LEVEL_CONFIG)[Object.keys(LEVEL_CONFIG).indexOf(levelKey) + 1];
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

  if (!isOpen) return null;
  // Show spinner while context is restoring session (prevents flicker between guest/logged-in states)
  if (contextLoading) return (
    <motion.div className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{ backgroundColor: bgColor }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <button onClick={onClose} className="absolute top-12 right-5 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}><X size={20} /></button>
      <Loader2 size={28} className="animate-spin" style={{ color: accentColor }} />
    </motion.div>
  );
  // Not logged in
  if (!profile) return (
    <motion.div className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-8"
      style={{ backgroundColor: bgColor, color: textColor }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button onClick={onClose} className="absolute top-12 right-5 p-2 rounded-full"
        style={{ background: 'rgba(255,255,255,0.08)' }}><X size={20} /></button>
      <div className="text-6xl mb-4">👤</div>
      <h2 className="text-2xl font-black mb-2" style={{ fontFamily: "'Lora', serif" }}>Mi Perfil</h2>
      <p className="text-sm opacity-60 text-center mb-8">Iniciá sesión para ver tu historial, puntos y favoritos.</p>
      <button onClick={onOpenLogin}
        className="px-8 py-3.5 rounded-xl font-bold"
        style={{ backgroundColor: accentColor, color: '#000' }}>
        Iniciar sesión
      </button>
      <button onClick={onClose} className="mt-4 text-sm opacity-40">Continuar como invitado</button>
    </motion.div>
  );

  const tabs = [
    { key: 'overview',   label: 'Inicio',      icon: '⭐' },
    { key: 'history',    label: 'Historial',   icon: '🕐' },
    { key: 'favorites',  label: 'Favoritos',   icon: '❤️' },
    { key: 'addresses',  label: 'Direcciones', icon: '📍' },
    { key: 'security',   label: 'Seguridad',   icon: '🔒' },
  ] as const;

  return (
    <motion.div className="fixed inset-0 z-[200] flex flex-col"
      style={{ backgroundColor: bgColor, color: textColor }}
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 shrink-0"
        style={{ borderBottom: '1px solid var(--menu-border)', paddingTop: 'max(48px, env(safe-area-inset-top))', paddingBottom: 12 }}>
        <button onClick={onClose} className="p-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <X size={20} />
        </button>
        <div className="flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                className="flex-1 bg-transparent border-b outline-none text-base font-bold"
                style={{ borderColor: accentColor, color: textColor }} autoFocus />
              <button onClick={handleSaveName}><Check size={18} style={{ color: accentColor }} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-bold text-base">{profile.name || 'Mi Perfil'}</span>
              <button onClick={() => { setEditingName(true); setNewName(profile.name || ''); }}>
                <Edit2 size={14} className="opacity-40" />
              </button>
            </div>
          )}
          <p className="text-xs opacity-50">{profile.phone}</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-black" style={{ color: accentColor }}>{tenantPoints}</div>
          <div className="text-[10px] opacity-50">puntos</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 py-2 overflow-x-auto shrink-0" style={{ borderBottom: '1px solid var(--menu-border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
            style={{
              backgroundColor: activeTab === t.key ? accentColor : 'rgba(255,255,255,0.06)',
              color: activeTab === t.key ? '#000' : textColor,
            }}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {loading && <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin opacity-40" /></div>}

        {/* OVERVIEW */}
        {!loading && activeTab === 'overview' && (
          <div className="p-4 space-y-4">
            {/* Level card */}
            <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${lvl.color}22, ${lvl.color}11)`, border: `1px solid ${lvl.color}44` }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs opacity-60 mb-0.5">Nivel actual</div>
                  <div className="text-xl font-black">{lvl.icon} {lvl.label}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black" style={{ color: accentColor }}>{tenantPoints}</div>
                  <div className="text-xs opacity-50">puntos</div>
                </div>
              </div>
              {nextLvl && (
                <>
                  <div className="h-2 rounded-full mb-1.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: lvl.color }} />
                  </div>
                  <div className="flex justify-between text-[10px] opacity-50">
                    <span>{tenantPoints} pts</span>
                    <span>{nextLvl.min} pts para {nextLvl.icon} {nextLvl.label}</span>
                  </div>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Pedidos', value: tenantTotalOrders, icon: '🛒' },
                { label: 'Total gastado', value: `₡${(tenantTotalSpent / 1000).toFixed(0)}k`, icon: '💰' },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--menu-surface)' }}>
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className="text-xl font-black">{s.value}</div>
                  <div className="text-xs opacity-50">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recompensas */}
            {rewards.length > 0 && (
              <div>
                <h3 className="text-sm font-bold mb-2 opacity-70">Recompensas disponibles</h3>
                <div className="space-y-2">
                  {rewards.map(r => {
                    const canRedeem = tenantPoints >= r.points_required;
                    return (
                      <div key={r.id} className="flex items-center justify-between rounded-xl p-3"
                        style={{ background: 'var(--menu-surface)', opacity: canRedeem ? 1 : 0.5 }}>
                        <div>
                          <div className="text-sm font-semibold">{r.name}</div>
                          <div className="text-xs opacity-50">{r.points_required} puntos</div>
                        </div>
                        <div className="text-xs font-bold px-2 py-1 rounded-full"
                          style={{ background: canRedeem ? accentColor + '22' : 'rgba(255,255,255,0.05)', color: canRedeem ? accentColor : textColor }}>
                          {canRedeem ? '¡Canjear!' : `Faltan ${r.points_required - tenantPoints}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Edición de datos del perfil */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--menu-surface)' }}>
              <h3 className="text-sm font-bold opacity-60">Mis datos</h3>
              {/* Email */}
              <div className="flex items-center gap-2">
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
              {/* Cumpleaños */}
              <div className="flex items-center gap-2">
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
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-400"
              style={{ background: 'rgba(239,68,68,0.08)' }}>
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        )}

        {/* HISTORY */}
        {!loading && activeTab === 'history' && (
          <div className="p-4">
            {orders.length === 0 ? (
              <div className="text-center py-12 opacity-40">
                <Clock size={40} className="mx-auto mb-3" />
                <p className="text-sm">No hay pedidos aún</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(o => (
                  <div key={o.id} className="rounded-xl p-3" style={{ background: 'var(--menu-surface)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">Pedido #{o.order_number}</span>
                      <span className="text-xs font-bold" style={{ color: accentColor }}>₡{o.total?.toLocaleString()}</span>
                    </div>
                    <div className="text-xs opacity-50 mb-1.5">
                      {new Date(o.created_at).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <div className="text-xs opacity-60">
                      {Array.isArray(o.items) ? o.items.slice(0, 3).map((it: { name: string; quantity: number }) => `${it.quantity}× ${it.name}`).join(', ') : ''}
                      {Array.isArray(o.items) && o.items.length > 3 ? ` +${o.items.length - 3} más` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FAVORITES */}
        {!loading && activeTab === 'favorites' && (
          <div className="p-4">
            {favorites.length === 0 ? (
              <div className="text-center py-12 opacity-40">
                <Heart size={40} className="mx-auto mb-3" />
                <p className="text-sm">No hay favoritos aún</p>
                <p className="text-xs mt-1">Tocá el ❤️ en cualquier platillo</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {favorites.map(f => (
                  <div key={f.id} className="rounded-xl p-3" style={{ background: 'var(--menu-surface)' }}>
                    <div className="text-sm font-semibold">{f.item_id}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ADDRESSES */}
        {!loading && activeTab === 'addresses' && (
          <div className="p-4">
            <div className="space-y-3 mb-4">
              {addresses.map(a => (
                <div key={a.id} className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'var(--menu-surface)' }}>
                  <MapPin size={18} className="mt-0.5 shrink-0" style={{ color: accentColor }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{a.label}</span>
                      {a.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: accentColor + '22', color: accentColor }}>Principal</span>}
                    </div>
                    <p className="text-xs opacity-60 mt-0.5">{a.address}</p>
                  </div>
                  <button onClick={() => handleDeleteAddress(a.id)} className="p-1 opacity-30 hover:opacity-70">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {!addingAddr ? (
              <button onClick={() => setAddingAddr(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--menu-surface)', color: accentColor }}>
                <Plus size={16} /> Agregar dirección
              </button>
            ) : (
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--menu-surface)' }}>
                <input value={addrLabel} onChange={e => setAddrLabel(e.target.value)} placeholder="Etiqueta (Casa, Trabajo...)"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                  style={{ border: '1px solid var(--menu-border)', color: textColor }} />
                <input value={addrText} onChange={e => setAddrText(e.target.value)} placeholder="Dirección completa"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                  style={{ border: '1px solid var(--menu-border)', color: textColor }} />
                <div className="flex gap-2">
                  <button onClick={() => setAddingAddr(false)} className="flex-1 py-2 rounded-lg text-sm opacity-50">Cancelar</button>
                  <button onClick={handleAddAddress} className="flex-1 py-2 rounded-lg text-sm font-bold"
                    style={{ background: accentColor, color: '#000' }}>Guardar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECURITY */}
        {!loading && activeTab === 'security' && (
          <div className="p-4 space-y-4">

            {/* ── CONTRASEÑA ── */}
            <p className="text-xs font-bold uppercase tracking-widest px-1" style={{ color: textColor, opacity: 0.4 }}>Contraseña</p>
            {[
              { mode: 'set' as const, label: 'Crear contraseña', icon: Shield },
              { mode: 'change' as const, label: 'Cambiar contraseña', icon: Shield },
            ].map(({ mode, label, icon: Icon }) => (
              <div key={mode} className="rounded-xl overflow-hidden" style={{ background: 'var(--menu-surface)' }}>
                <button onClick={() => setPwMode(pwMode === mode ? 'none' : mode)}
                  className="w-full flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Icon size={18} style={{ color: accentColor }} />
                    <span className="text-sm font-semibold" style={{ color: textColor }}>{label}</span>
                  </div>
                  <ChevronRight size={16} className="opacity-40" style={{ color: textColor }} />
                </button>
                <AnimatePresence>
                  {pwMode === mode && (
                    <motion.div className="px-4 pb-4 space-y-2"
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                      {mode === 'change' && (
                        <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)}
                          placeholder="Contraseña actual" className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                          style={{ border: '1px solid var(--menu-border)', color: textColor }} />
                      )}
                      <input type="password" value={pw1} onChange={e => setPw1(e.target.value)}
                        placeholder="Nueva contraseña" className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                        style={{ border: '1px solid var(--menu-border)', color: textColor }} />
                      <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                        placeholder="Confirmar contraseña" className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
                        style={{ border: '1px solid var(--menu-border)', color: textColor }} />
                      {pwMsg && <p className="text-xs" style={{ color: pwMsg.startsWith('✅') ? '#22c55e' : '#f87171' }}>{pwMsg}</p>}
                      <button onClick={handleSavePassword} className="w-full py-2.5 rounded-lg text-sm font-bold"
                        style={{ background: accentColor, color: '#000' }}>Guardar</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* ── ACCESO RÁPIDO (PASSKEYS) ── */}
            <p className="text-xs font-bold uppercase tracking-widest px-1 mt-2" style={{ color: textColor, opacity: 0.4 }}>Acceso rápido (Passkeys)</p>
            {isWebAuthnSupported() ? (
              <div className="rounded-xl" style={{ background: 'var(--menu-surface)' }}>
                <div className="px-4 py-3.5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Fingerprint size={18} style={{ color: accentColor }} />
                      <span className="text-sm font-semibold" style={{ color: textColor }}>Dispositivos de confianza</span>
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                      style={{ background: accentColor + '22', color: accentColor }}>
                      {passkeyLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Agregar
                    </button>
                  </div>
                  {!passkeysLoaded && !passkeyLoading && (
                    <button onClick={async () => {
                      setPasskeyLoading(true);
                      const list = await getPasskeys();
                      setPasskeys(list); setPasskeysLoaded(true);
                      setPasskeyLoading(false);
                    }} className="text-xs mb-2" style={{ color: accentColor }}>Ver dispositivos registrados →</button>
                  )}
                  {passkeyLoading && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin" style={{ color: accentColor }} /></div>}
                  {passkeyMsg && <p className="text-xs mb-2" style={{ color: passkeyMsg.startsWith('✅') ? '#22c55e' : '#f87171' }}>{passkeyMsg}</p>}
                  {passkeysLoaded && passkeys.length > 0 && (
                    <div className="space-y-2">
                      {passkeys.map(pk => (
                        <div key={pk.id} className="flex items-center justify-between py-2 border-t" style={{ borderColor: 'var(--menu-border)' }}>
                          <div className="flex items-center gap-2">
                            <Smartphone size={14} style={{ color: textColor, opacity: 0.5 }} />
                            <div>
                              <p className="text-xs font-semibold" style={{ color: textColor }}>{pk.friendly_name || 'Dispositivo'}</p>
                              <p className="text-[10px]" style={{ color: textColor, opacity: 0.4 }}>
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
                    <p className="text-xs" style={{ color: textColor, opacity: 0.4 }}>No hay dispositivos registrados aún.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl px-4 py-3" style={{ background: 'var(--menu-surface)' }}>
                <p className="text-xs" style={{ color: textColor, opacity: 0.45 }}>Tu navegador no soporta passkeys (WebAuthn). Actualizá Chrome, Safari 16+ o Firefox 119+ para activar esta función.</p>
              </div>
            )}

            {/* ── SESIÓN ── */}
            <p className="text-xs font-bold uppercase tracking-widest px-1 mt-2" style={{ color: textColor, opacity: 0.4 }}>Sesión</p>
            <button onClick={() => { logout(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
              <LogOut size={16} /> Cerrar sesión en este dispositivo
            </button>
            <button onClick={() => { logoutAllDevices(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
              <LogOut size={16} /> Cerrar sesión en todos los dispositivos
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
