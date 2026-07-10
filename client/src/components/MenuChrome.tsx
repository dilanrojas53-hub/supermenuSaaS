import type { ReactNode } from 'react';
import { Clock3, Menu as MenuIcon, ShoppingBag, Tag, UserRound } from 'lucide-react';
import SmartImage from './SmartImage';
import type { BottomNavTab } from './BottomNav';

interface MenuChromeProps {
  restaurantName: string;
  restaurantDescription?: string | null;
  logoUrl?: string | null;
  activeTab: BottomNavTab;
  onTabChange: (tab: BottomNavTab) => void;
  onCartOpen: () => void;
  searchControl: ReactNode;
  languageControl: ReactNode;
}

const navItems: Array<{ key: BottomNavTab; label: string; icon: typeof MenuIcon }> = [
  { key: 'menu', label: 'Menú', icon: MenuIcon },
  { key: 'order', label: 'Pedido', icon: ShoppingBag },
  { key: 'promos', label: 'Promos', icon: Tag },
  { key: 'history', label: 'Historial', icon: Clock3 },
  { key: 'profile', label: 'Perfil', icon: UserRound },
];

export default function MenuChrome({
  restaurantName,
  restaurantDescription,
  logoUrl,
  activeTab,
  onTabChange,
  onCartOpen,
  searchControl,
  languageControl,
}: MenuChromeProps) {
  const restaurantIdentity = (
    <div className="menu-chrome__identity">
      <SmartImage
        src={logoUrl}
        alt={restaurantName}
        className="menu-chrome__logo"
        fallbackClassName="menu-chrome__logo"
      />
      <div className="menu-chrome__identity-copy">
        <strong>{restaurantName}</strong>
        {restaurantDescription && <span>{restaurantDescription}</span>}
      </div>
    </div>
  );

  return (
    <>
      <aside className="menu-chrome__sidebar" aria-label="Navegación principal">
        {restaurantIdentity}
        <nav className="menu-chrome__nav">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className="menu-chrome__nav-item"
              data-active={activeTab === key}
              onClick={() => key === 'order' ? onCartOpen() : onTabChange(key)}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="menu-chrome__brand-mark" aria-hidden="true" />
      </aside>

      <header className="menu-chrome__desktop-header">
        <div className="menu-chrome__search">{searchControl}</div>
        <div className="menu-chrome__utilities">
          {languageControl}
          <button type="button" onClick={() => onTabChange('profile')} className="menu-chrome__utility">
            <UserRound size={20} />
            <span>Mi cuenta</span>
          </button>
          <button type="button" onClick={onCartOpen} className="menu-chrome__utility menu-chrome__cart">
            <ShoppingBag size={21} />
            <span>Pedido</span>
          </button>
        </div>
      </header>

      <header className="menu-chrome__mobile-header">
        {restaurantIdentity}
        <div className="menu-chrome__mobile-actions">
          {searchControl}
          {languageControl}
          <button type="button" onClick={onCartOpen} className="menu-chrome__mobile-action" aria-label="Abrir pedido">
            <ShoppingBag size={21} />
          </button>
        </div>
      </header>
    </>
  );
}
