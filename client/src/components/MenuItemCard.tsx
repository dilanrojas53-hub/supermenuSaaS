/*
 * MenuItemCard — V6.1 CORRECCIÓN TOTAL
 * - Fondo de tarjeta: usa theme.background_color con ligera elevación (no rgba blanco)
 * - Texto: color forzado oscuro/claro según el fondo del tema
 * - SocialProofBadge: se renderiza UNA sola vez (solo como badge absoluto compacto)
 * - Barra de popularidad y badge de escasez: ELIMINADOS (causaban ruido visual)
 * - Hover: Tailwind puro sin Framer Motion en contenedores
 */
import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Check } from 'lucide-react';
import type { MenuItem, ThemeSettings } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import SocialProofBadge from './SocialProofBadge';
import { type ThemePreset } from '@/lib/themes';

interface MenuItemCardProps {
  item: MenuItem;
  theme: ThemeSettings;
  viewMode: 'grid' | 'list';
  allItems?: MenuItem[];
  showBadges?: boolean;
  onOpenDetail?: (item: MenuItem) => void;
  preset?: ThemePreset;
}

export default function MenuItemCard({ item, theme, viewMode, allItems, showBadges = true, onOpenDetail, preset }: MenuItemCardProps) {
  const { addItem } = useCart();
  const { t } = useI18n();
  const [justAdded, setJustAdded] = useState(false);

  const handleQuickAdd = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    addItem(item);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }, [addItem, item]);

  const handleOpenDetail = useCallback(() => {
    if (onOpenDetail) onOpenDetail(item);
  }, [onOpenDetail, item]);

  const hasImage = Boolean(item.image_url);

  // Calcular colores de tarjeta basados en el tema real del restaurante
  const bgColor = theme.background_color || '#0a0a0a';
  const textColor = theme.text_color || '#ffffff';
  const primaryColor = theme.primary_color || '#E63946';

  // Determinar si el tema es oscuro o claro para ajustar la tarjeta
  const isDarkTheme = (() => {
    const hex = bgColor.replace('#', '');
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance < 0.5;
    }
    return true;
  })();

  // Colores de tarjeta que SIEMPRE contrastan con el fondo
  const cardBg = isDarkTheme
    ? 'rgba(255,255,255,0.06)'
    : 'rgba(0,0,0,0.03)';
  const cardBorder = isDarkTheme
    ? '1px solid rgba(255,255,255,0.10)'
    : '1px solid rgba(0,0,0,0.08)';
  const cardShadow = isDarkTheme
    ? '0 2px 12px rgba(0,0,0,0.5)'
    : '0 2px 12px rgba(0,0,0,0.08)';

  // Texto: usar el color del tema directamente
  const nameColor = textColor;
  const descColor = textColor;

  if (viewMode === 'list') {
    return (
      <div
        className="flex gap-3 p-3 md:p-4 relative cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
        onClick={handleOpenDetail}
        style={{
          background: preset?.cardBackground || cardBg,
          border: preset?.cardBorder || cardBorder,
          boxShadow: preset?.cardShadow || cardShadow,
          fontFamily: preset?.fontFamily,
          borderRadius: '1.5rem',
        }}
      >
        {/* Badge: solo UNA vez, compacto, posición absoluta */}
        {showBadges && item.badge && (
          <div className="absolute -top-3 left-3 z-10">
            <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
          </div>
        )}

        {hasImage && (
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-2xl overflow-hidden flex-shrink-0">
            <img src={item.image_url!} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}

        <div className={`flex-1 min-w-0 flex flex-col justify-between ${!hasImage ? 'w-full' : ''}`}>
          <div>
            <h3
              className="text-base font-semibold leading-tight mb-1"
              style={{ color: nameColor }}
            >
              {item.name}
            </h3>
            {item.description && (
              <p
                className="text-sm leading-relaxed mb-2 line-clamp-2"
                style={{ color: descColor, opacity: 0.7 }}
              >
                {item.description}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-auto pt-1">
            <span
              className="text-lg font-bold"
              style={{ color: primaryColor }}
            >
              {formatPrice(item.price)}
            </span>
            <button
              onClick={handleQuickAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-transform duration-150 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: justAdded ? '#38A169' : primaryColor,
                color: '#fff',
              }}
            >
              <AnimatePresence mode="wait">
                {justAdded ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-1"
                  >
                    <Check size={16} />
                    {t('menu.added')}
                  </motion.span>
                ) : (
                  <motion.span
                    key="add"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="flex items-center gap-1"
                  >
                    <Plus size={16} />
                    {t('menu.add')}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div
      className="overflow-hidden relative cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{
        background: preset?.cardBackground || cardBg,
        border: preset?.cardBorder || cardBorder,
        boxShadow: preset?.cardShadow || cardShadow,
        fontFamily: preset?.fontFamily,
        borderRadius: '1.5rem',
      }}
    >
      {/* Badge: solo UNA vez, compacto, posición absoluta */}
      {showBadges && item.badge && (
        <div className="absolute top-2 left-2 z-10">
          <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
        </div>
      )}

      {hasImage && (
        <div
          className="w-full h-40 relative overflow-hidden"
          onClick={handleOpenDetail}
        >
          <img src={item.image_url!} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      <div className="p-4" onClick={!hasImage ? handleOpenDetail : undefined}>
        <div onClick={hasImage ? handleOpenDetail : undefined}>
          <h3
            className="text-sm font-semibold leading-tight mb-1"
            style={{ color: nameColor }}
          >
            {item.name}
          </h3>
          {item.description && (
            <p
              className="text-xs leading-relaxed mb-2 line-clamp-2"
              style={{ color: descColor, opacity: 0.6 }}
            >
              {item.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span
            className="text-base font-bold"
            style={{ color: primaryColor }}
          >
            {formatPrice(item.price)}
          </span>
          <button
            onClick={handleQuickAdd}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-150 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: justAdded ? '#38A169' : primaryColor,
              color: '#fff',
            }}
          >
            <AnimatePresence mode="wait">
              {justAdded ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                >
                  <Check size={18} />
                </motion.div>
              ) : (
                <motion.div
                  key="plus"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Plus size={18} />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </div>
  );
}
