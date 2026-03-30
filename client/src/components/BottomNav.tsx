/**
 * BottomNav — Barra de navegación inferior móvil
 * 5 tabs: Menú / Pedido / Promos / Historial / Perfil
 * Solo visible en la vista del cliente (MenuPage).
 * No afecta admin, staff ni kitchen.
 */
import { ShoppingCart, UtensilsCrossed, Tag, Clock, User } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';

export type BottomNavTab = 'menu' | 'order' | 'promos' | 'history' | 'profile';

interface BottomNavProps {
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
  onCartOpen?: () => void;
  accentColor?: string;
  bgColor?: string;
  textColor?: string;
}

export default function BottomNav({
  activeTab,
  onTabChange,
  onCartOpen,
  accentColor = '#F59E0B',
  bgColor = 'var(--menu-surface)',
  textColor = 'var(--menu-text)',
}: BottomNavProps) {
  const { totalItems } = useCart();
  const { profile } = useCustomerProfile();

  const tabs = [
    { key: 'menu' as const,    label: 'Menú',      Icon: UtensilsCrossed },
    { key: 'order' as const,   label: 'Pedido',    Icon: ShoppingCart,   badge: totalItems > 0 ? totalItems : undefined },
    { key: 'promos' as const,  label: 'Promos',    Icon: Tag },
    { key: 'history' as const, label: 'Historial', Icon: Clock },
    { key: 'profile' as const, label: 'Perfil',    Icon: User,           dot: !!profile },
  ];

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
      {tabs.map(({ key, label, Icon, badge, dot }) => {
        const isActive = activeTab === key;
        const handleClick = () => {
          if (key === 'order' && onCartOpen) {
            onCartOpen();
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
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              {badge !== undefined && (
                <span
                  className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white text-[9px] font-black px-0.5"
                  style={{ backgroundColor: accentColor }}
                >
                  {badge}
                </span>
              )}
              {dot && !badge && (
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
