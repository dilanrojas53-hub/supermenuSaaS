/**
 * ProfileScreen
 * Pantalla "Mi Perfil" del cliente — se muestra como overlay desde el BottomNav.
 * Módulos: puntos/nivel, historial de pedidos, favoritos, direcciones guardadas.
 * Si el usuario no está logueado, muestra el PhoneLoginSheet.
 */
import { useState, useEffect } from 'react';
import { X, Star, Clock, Heart, MapPin, LogOut, ChevronRight, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import { supabase } from '@/lib/supabase';
import PhoneLoginSheet from '@/components/PhoneLoginSheet';
import type { ThemeSettings, Tenant } from '@/lib/types';

interface ProfileScreenProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeSettings;
  tenant: Tenant;
}

const LEVEL_CONFIG: Record<string, { label: string; color: string; icon: string; nextAt: number }> = {
  bronze:   { label: 'Bronce',    color: '#CD7F32', icon: '🥉', nextAt: 500  },
  silver:   { label: 'Plata',     color: '#C0C0C0', icon: '🥈', nextAt: 1500 },
  gold:     { label: 'Oro',       color: '#FFD700', icon: '🥇', nextAt: 5000 },
  platinum: { label: 'Platino',   color: '#E5E4E2', icon: '💎', nextAt: 99999 },
};

export default function ProfileScreen({ isOpen, onClose, theme, tenant }: ProfileScreenProps) {
  const { profile, logout } = useCustomerProfile();
  const [loginOpen, setLoginOpen] = useState(false);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [activeModule, setActiveModule] = useState<'overview' | 'history' | 'favorites' | 'addresses'>('overview');

  const accentColor = theme.primary_color || '#F59E0B';
  const bgColor = theme.background_color || '#1a1a1a';
  const textColor = theme.text_color || '#ffffff';

  useEffect(() => {
    if (!profile || !isOpen) return;
    // Cargar historial de pedidos
    supabase.from('orders').select('id, created_at, total_amount, status, delivery_type')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { if (data) setOrderHistory(data); });
    // Cargar favoritos
    supabase.from('customer_favorites').select('id, item_id, menu_items(name, price, image_url)')
      .eq('customer_id', profile.id)
      .limit(20)
      .then(({ data }) => { if (data) setFavorites(data); });
    // Cargar direcciones
    supabase.from('customer_addresses').select('*')
      .eq('customer_id', profile.id)
      .then(({ data }) => { if (data) setAddresses(data); });
  }, [profile, isOpen, tenant.id]);

  const levelData = LEVEL_CONFIG[profile?.level || 'bronze'];
  const progressPct = profile ? Math.min(100, (profile.points / levelData.nextAt) * 100) : 0;

  const statusLabel: Record<string, string> = {
    pendiente: 'Pendiente', en_cocina: 'En preparación', listo: 'Listo',
    entregado: 'Entregado', cancelado: 'Cancelado',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[190] flex flex-col"
          style={{ backgroundColor: bgColor, color: textColor }}
          initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
            style={{ borderColor: 'var(--menu-border)', paddingTop: 'max(12px, env(safe-area-inset-top))' }}
          >
            <h1 className="text-lg font-black" style={{ fontFamily: "'Lora', serif" }}>Mi Perfil</h1>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ backgroundColor: 'var(--menu-surface)' }}>
              <X size={18} />
            </button>
          </div>

          {!profile ? (
            /* Estado sin sesión */
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <div className="text-6xl mb-4">👤</div>
              <h2 className="text-xl font-black mb-2" style={{ fontFamily: "'Lora', serif" }}>Identificate</h2>
              <p className="text-sm mb-6" style={{ opacity: 0.6 }}>
                Guardá tu historial, acumulá puntos y gestioná tus pedidos favoritos.
              </p>
              <button
                onClick={() => setLoginOpen(true)}
                className="w-full max-w-xs py-3.5 rounded-xl font-bold text-white transition-all active:scale-98"
                style={{ backgroundColor: accentColor }}
              >
                Ingresar con teléfono
              </button>
              <button onClick={onClose} className="mt-3 text-sm" style={{ opacity: 0.4 }}>
                Continuar como invitado
              </button>
              <PhoneLoginSheet
                isOpen={loginOpen}
                onClose={() => setLoginOpen(false)}
                tenantId={tenant.id}
                accentColor={accentColor}
                bgColor={bgColor}
                textColor={textColor}
              />
            </div>
          ) : (
            /* Estado con sesión */
            <div className="flex-1 overflow-y-auto">
              {/* Avatar + nombre */}
              <div className="px-4 pt-5 pb-4 flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0"
                  style={{ backgroundColor: accentColor + '25', color: accentColor }}
                >
                  {profile.name ? profile.name[0].toUpperCase() : '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-black leading-tight truncate" style={{ fontFamily: "'Lora', serif" }}>
                    {profile.name || 'Cliente'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ opacity: 0.5 }}>📱 {profile.phone}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-sm">{levelData.icon}</span>
                    <span className="text-xs font-bold" style={{ color: levelData.color }}>{levelData.label}</span>
                  </div>
                </div>
                <button
                  onClick={() => { logout(); onClose(); }}
                  className="p-2 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: 'var(--menu-surface)' }}
                >
                  <LogOut size={16} style={{ opacity: 0.5 }} />
                </button>
              </div>

              {/* Puntos + barra de progreso */}
              <div className="mx-4 mb-4 p-4 rounded-2xl" style={{ backgroundColor: 'var(--menu-surface)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Star size={14} style={{ color: accentColor }} />
                    <span className="text-sm font-bold">{profile.points} puntos</span>
                  </div>
                  <span className="text-xs" style={{ opacity: 0.5 }}>
                    {levelData.nextAt - profile.points} para {LEVEL_CONFIG[profile.level === 'bronze' ? 'silver' : profile.level === 'silver' ? 'gold' : 'platinum']?.label || 'siguiente nivel'}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--menu-bg)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${progressPct}%`, backgroundColor: accentColor }}
                  />
                </div>
              </div>

              {/* Módulos de navegación */}
              <div className="grid grid-cols-3 gap-2 mx-4 mb-4">
                {[
                  { key: 'history',   icon: Clock,   label: 'Historial', count: orderHistory.length },
                  { key: 'favorites', icon: Heart,   label: 'Favoritos', count: favorites.length },
                  { key: 'addresses', icon: MapPin,  label: 'Direcciones', count: addresses.length },
                ].map(({ key, icon: Icon, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setActiveModule(activeModule === key as any ? 'overview' : key as any)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-all active:scale-95"
                    style={{
                      backgroundColor: activeModule === key ? accentColor + '20' : 'var(--menu-surface)',
                      border: activeModule === key ? `1.5px solid ${accentColor}` : '1.5px solid transparent',
                    }}
                  >
                    <Icon size={18} style={{ color: activeModule === key ? accentColor : textColor, opacity: activeModule === key ? 1 : 0.5 }} />
                    <span className="text-[11px] font-semibold" style={{ color: activeModule === key ? accentColor : textColor }}>{label}</span>
                    {count > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: accentColor + '30', color: accentColor }}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Contenido del módulo activo */}
              <div className="px-4 pb-24">
                {activeModule === 'history' && (
                  <div>
                    <h3 className="text-sm font-bold mb-3" style={{ opacity: 0.6 }}>Últimos pedidos</h3>
                    {orderHistory.length === 0 ? (
                      <div className="text-center py-8">
                        <Package size={32} className="mx-auto mb-2" style={{ opacity: 0.3 }} />
                        <p className="text-sm" style={{ opacity: 0.4 }}>Sin pedidos aún</p>
                      </div>
                    ) : orderHistory.map(order => (
                      <div key={order.id} className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--menu-border)' }}>
                        <div>
                          <p className="text-sm font-semibold">Pedido #{order.id.slice(-4).toUpperCase()}</p>
                          <p className="text-xs mt-0.5" style={{ opacity: 0.5 }}>
                            {new Date(order.created_at).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">₡{order.total_amount?.toLocaleString()}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: accentColor }}>{statusLabel[order.status] || order.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeModule === 'favorites' && (
                  <div>
                    <h3 className="text-sm font-bold mb-3" style={{ opacity: 0.6 }}>Mis favoritos</h3>
                    {favorites.length === 0 ? (
                      <div className="text-center py-8">
                        <Heart size={32} className="mx-auto mb-2" style={{ opacity: 0.3 }} />
                        <p className="text-sm" style={{ opacity: 0.4 }}>Sin favoritos aún</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {favorites.map((fav: any) => (
                          <div key={fav.id} className="p-3 rounded-2xl" style={{ backgroundColor: 'var(--menu-surface)' }}>
                            {fav.menu_items?.image_url && (
                              <img src={fav.menu_items.image_url} alt="" className="w-full h-20 object-cover rounded-xl mb-2" />
                            )}
                            <p className="text-xs font-bold leading-tight">{fav.menu_items?.name}</p>
                            <p className="text-xs mt-1" style={{ color: accentColor }}>₡{fav.menu_items?.price?.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeModule === 'addresses' && (
                  <div>
                    <h3 className="text-sm font-bold mb-3" style={{ opacity: 0.6 }}>Mis direcciones</h3>
                    {addresses.length === 0 ? (
                      <div className="text-center py-8">
                        <MapPin size={32} className="mx-auto mb-2" style={{ opacity: 0.3 }} />
                        <p className="text-sm" style={{ opacity: 0.4 }}>Sin direcciones guardadas</p>
                      </div>
                    ) : addresses.map((addr: any) => (
                      <div key={addr.id} className="flex items-start gap-3 py-3 border-b" style={{ borderColor: 'var(--menu-border)' }}>
                        <MapPin size={16} style={{ color: accentColor, marginTop: 2 }} />
                        <div className="flex-1">
                          <p className="text-sm font-semibold capitalize">{addr.label}</p>
                          <p className="text-xs mt-0.5" style={{ opacity: 0.55 }}>{addr.address}</p>
                          {addr.instructions && <p className="text-xs mt-0.5 italic" style={{ opacity: 0.4 }}>{addr.instructions}</p>}
                        </div>
                        {addr.is_default && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: accentColor + '25', color: accentColor }}>
                            Principal
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
