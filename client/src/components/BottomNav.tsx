/**
 * BottomNav — Barra de navegación inferior móvil
 * 5 tabs: Menú / Pedido / Promos / Historial / Perfil
 * Fix: tab 'order' muestra badge de carrito O indicador de pedido activo.
 * El click en 'order' abre el carrito si hay items, o navega al tracking si hay pedido activo.
 */
import { ShoppingCart, UtensilsCrossed, Tag, Clock, User, ChefHat } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';
import { useLocation } from 'wouter';

export type BottomNavTab = 'menu' | 'order' | 'promos' | 'history' | 'profile';

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
  onCartOpen?: () => void;
  accentColor?: string;
  bgColor?: string;
  textColor?: string;
  activeOrderData?: { orderId: string; orderNumber: number; status: string } | null;
}

export default function BottomNav({
  activeTab,
  onTabChange,
  onCartOpen,
  accentColor = '#F59E0B',
  bgColor = 'var(--menu-surface)',
  textColor = 'var(--menu-text)',
  activeOrderData,
}: BottomNavProps) {
  const { totalItems } = useCart();
  const { profile } = useCustomerProfile();
  const [, navigate] = useLocation();

  const statusEmoji: Record<string, string> = {
    pendiente: '⏳', pago_en_revision: '⏳', en_cocina: '🔥', listo: '✅', entregado: '📦',
  };

  const tabs = [
    { key: 'menu' as const,    label: 'Menú',      Icon: UtensilsCrossed },
    {
      key: 'order' as const,
      label: 'Pedido',
      Icon: totalItems > 0 ? ShoppingCart : (activeOrderData ? ChefHat : ShoppingCart),
      badge: totalItems > 0 ? totalItems : undefined,
      // Indicador de pedido activo cuando carrito está vacío
      activeDot: !totalItems && !!activeOrderData,
      activeEmoji: activeOrderData ? (statusEmoji[activeOrderData.status] || '🍳') : undefined,
    },
    { key: 'promos' as const,  label: 'Promos',    Icon: Tag },
    { key: 'history' as const, label: 'Historial', Icon: Clock },
    { key: 'profile' as const, label: 'Perfil',    Icon: User, dot: !!profile },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t"
      style={{
        backgroundColor: bgColor,
        borderColor: 'var(--menu-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.12)',
        maxWidth: '480px',
        left: '50%',
        right: 'auto',
        transform: 'translateX(-50%)',
        width: '100%',
      }}
    >
      {tabs.map(({ key, label, Icon, badge, dot, activeDot, activeEmoji }: any) => {
        const isActive = activeTab === key;
        const handleClick = () => {
          if (key === 'order') {
            if (totalItems > 0 && onCartOpen) {
              // Hay items en carrito → abrir carrito
              onCartOpen();
            } else if (!totalItems && activeOrderData) {
              // No hay carrito pero hay pedido activo → ir al tracking
              navigate(`/order-status/${activeOrderData.orderId}`);
            } else if (onCartOpen) {
              // Carrito vacío y sin pedido activo → abrir carrito (estado vacío)
              onCartOpen();
            }
            onTabChange('order');
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
