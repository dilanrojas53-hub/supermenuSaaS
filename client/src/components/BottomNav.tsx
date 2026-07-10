/**
 * BottomNav — Barra de navegación inferior móvil
 * Feature-aware: oculta tabs según menu_config del restaurante.
 * Tabs: Menú / Pedido / Promos / Historial / Perfil
 */
import { ShoppingCart, UtensilsCrossed, Tag, Clock, User, ChefHat, Globe } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import { useLocation } from 'wouter';

export type BottomNavTab = 'menu' | 'order' | 'promos' | 'history' | 'profile' | 'restaurante';

interface MenuConfig {
  enable_profiles?: boolean;
  enable_history?: boolean;
  enable_promotions?: boolean;
  enable_landing?: boolean;
  [key: string]: any;
}

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
  onCartOpen?: () => void;
  accentColor?: string;
  bgColor?: string;
  textColor?: string;
  activeOrderData?: { orderId: string; orderNumber: number; status: string } | null;
  menuConfig?: MenuConfig;
  /** slug del restaurante para navegar a la landing */
  tenantSlug?: string;
}

export default function BottomNav({
  activeTab,
  onTabChange,
  onCartOpen,
  accentColor = '#F59E0B',
  bgColor = 'var(--menu-surface)',
  textColor = 'var(--menu-text)',
  activeOrderData,
  menuConfig,
  tenantSlug,
}: BottomNavProps) {
  const { totalItems } = useCart();
  const { profile } = useCustomerProfile();
  const [, navigate] = useLocation();

  const statusEmoji: Record<string, string> = {
    pendiente: '⏳', pago_en_revision: '⏳', en_cocina: '🔥', listo: '✅', entregado: '📦',
  };

  const showPromos  = !menuConfig || menuConfig.enable_promotions !== false;
  const showHistory = !menuConfig || menuConfig.enable_history !== false;
  const showProfile = !menuConfig || menuConfig.enable_profiles !== false;

  // La landing sigue accesible desde otros puntos, pero no ocupa una sexta
  // posición en la navegación principal del menú móvil.
  const showRestaurante = false;

  const allTabs = [
    { key: 'menu' as const, label: 'Menú', Icon: UtensilsCrossed, visible: true },
    {
      key: 'order' as const,
      label: 'Pedido',
      Icon: totalItems > 0 ? ShoppingCart : (activeOrderData ? ChefHat : ShoppingCart),
      badge: totalItems > 0 ? totalItems : undefined,
      activeDot: !totalItems && !!activeOrderData,
      activeEmoji: activeOrderData ? (statusEmoji[activeOrderData.status] || '🍳') : undefined,
      visible: true,
    },
    { key: 'promos' as const, label: 'Promos', Icon: Tag, visible: showPromos },
    { key: 'history' as const, label: 'Historial', Icon: Clock, visible: showHistory },
    { key: 'profile' as const, label: 'Perfil', Icon: User, dot: !!profile, visible: showProfile },
    { key: 'restaurante' as const, label: 'Restaurante', Icon: Globe, visible: showRestaurante },
  ];
  const tabs = allTabs.filter(t => t.visible);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t"
      style={{
        backgroundColor: bgColor,
        borderColor: 'var(--menu-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
      }}
    >
      {tabs.map(({ key, label, Icon, badge, dot, activeDot, activeEmoji }: any) => {
        const isActive = activeTab === key;
        const handleClick = () => {
          if (key === 'order') {
            if (totalItems > 0 && onCartOpen) {
              onCartOpen();
            } else if (!totalItems && activeOrderData) {
              navigate(`/order-status/${activeOrderData.orderId}`);
            } else if (onCartOpen) {
              onCartOpen();
            }
            onTabChange('order');
          } else if (key === 'restaurante' && tenantSlug) {
            navigate(`/${tenantSlug}/restaurante`);
            onTabChange('restaurante');
          } else {
            onTabChange(key);
          }
        };
        return (
          <button
            key={key}
            onClick={handleClick}
            className="relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all active:scale-95"
            style={{ color: isActive ? accentColor : textColor, opacity: isActive ? 1 : 0.55 }}
          >
            <div className="relative">
              {activeDot && activeEmoji ? (
                <span className="text-base leading-none">{activeEmoji}</span>
              ) : (
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              )}
              {badge !== undefined && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white text-[9px] font-black px-0.5"
                  style={{ backgroundColor: accentColor }}
                >
                  {badge}
                </span>
              )}
              {(dot || activeDot) && !badge && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2"
                  style={{ backgroundColor: accentColor, borderColor: bgColor }}
                />
              )}
            </div>
            <span className="text-[10px] font-semibold leading-none">{label}</span>
            {isActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
