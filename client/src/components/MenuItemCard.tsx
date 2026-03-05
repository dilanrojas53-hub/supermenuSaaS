/*
 * V5.0 ÉPICA UI PREMIUM — TAREA 2 + TAREA 4
 * TAREA 2: Micro-interacciones con Tailwind puro (sin Framer Motion en tarjetas/botones)
 *   - motion.div → div en tarjetas (Framer inyecta transform:none que bloquea hover de Tailwind)
 *   - motion.button → button en botón Agregar (mismo motivo)
 *   - hover:-translate-y-1 hover:shadow-xl en tarjetas
 *   - hover:scale-105 active:scale-95 en botones
 * TAREA 4: Empty States elegantes sin foto
 *   - Si no hay imagen: ocultar contenedor, texto y precio al 100% del ancho
 *
 * Smart Cart behavior:
 * - Clicking photo/text → opens ProductDetailModal (with AI upsell)
 * - Clicking + button → Quick Add (no modal)
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

  if (viewMode === 'list') {
    return (
      <div
        className="flex gap-3 p-3 md:p-4 relative cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
        onClick={handleOpenDetail}
        style={{
          background: preset?.cardBackground || 'rgba(255,255,255,0.05)',
          border: preset?.cardBorder || '1px solid rgba(255,255,255,0.08)',
          boxShadow: preset?.cardShadow || '0 2px 16px rgba(0,0,0,0.4)',
          fontFamily: preset?.fontFamily,
          borderRadius: '1.5rem',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        }}
      >
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

        <div className={`flex-1 min-w-0 ${!hasImage ? 'w-full' : ''}`}>
          <h3
            className="text-base font-semibold leading-tight mb-1"
            style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
          >
            {item.name}
          </h3>
          {item.description && (
            <p
              className="text-sm leading-relaxed mb-2 line-clamp-2 opacity-70"
              style={{ color: theme.text_color }}
            >
              {item.description}
            </p>
          )}

          {showBadges && item.badge && (
            <div className="mb-1">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} />
            </div>
          )}

          {/* V6.0 5A — Barra de popularidad animada */}
          {item.badge && (
            <div style={{ width: '100%', marginBottom: '6px', marginTop: '4px' }}>
              <div style={{
                height: '3px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.08)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(((item as any).order_count || 60) / 100 * 100, 94)}%`,
                  background: `linear-gradient(90deg, ${theme.primary_color}cc, ${theme.primary_color})`,
                  borderRadius: '999px',
                  transition: 'width 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
                }} />
              </div>
            </div>
          )}

          {/* V6.0 5B — Badge de escasez */}
          {(item as any).stock !== null &&
           (item as any).stock !== undefined &&
           (item as any).stock <= 5 &&
           (item as any).stock > 0 && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#ef4444',
              marginTop: '4px',
              animation: 'pulse-soft 2s infinite',
            }}>
              🔥 Solo quedan {(item as any).stock}
            </div>
          )}

          <div className="flex items-center justify-between mt-auto">
            <span
              className="text-lg font-bold"
              style={{ fontFamily: "'Lora', serif", color: preset?.priceColor !== 'inherit' ? preset?.priceColor : theme.primary_color }}
            >
              {formatPrice(item.price)}
            </span>
            <button
              onClick={handleQuickAdd}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-transform duration-150 hover:scale-105 active:scale-95"
              style={{
                backgroundColor: justAdded ? '#38A169' : theme.primary_color,
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
        background: preset?.cardBackground || 'rgba(255,255,255,0.05)',
        border: preset?.cardBorder || '1px solid rgba(255,255,255,0.08)',
        boxShadow: preset?.cardShadow || '0 2px 16px rgba(0,0,0,0.4)',
        fontFamily: preset?.fontFamily,
        borderRadius: '1.5rem',
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      {showBadges && item.badge && (
        <div className="absolute top-2 left-2 z-10">
          <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
        </div>
      )}

      {hasImage && (
        <div
          className="w-full h-40 relative"
          style={{ backgroundColor: `${theme.primary_color}08`, overflow: 'hidden' }}
          onClick={handleOpenDetail}
        >
          {/* V6.0 5C — Shimmer en imagen grid */}
          <img src={item.image_url!} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)',
            animation: 'shimmer-slide 3s infinite',
            pointerEvents: 'none',
          }} />
        </div>
      )}

      <div className="p-4" onClick={!hasImage ? handleOpenDetail : undefined}>
        <div onClick={hasImage ? handleOpenDetail : undefined}>
          <h3
            className="text-sm font-semibold leading-tight mb-1"
            style={{ fontFamily: "'Lora', serif", color: theme.text_color }}
          >
            {item.name}
          </h3>
          {item.description && (
            <p
              className="text-xs leading-relaxed mb-2 line-clamp-2 opacity-60"
              style={{ color: theme.text_color }}
            >
              {item.description}
            </p>
          )}
        </div>

        {showBadges && item.badge && (
          <div className="mb-2">
            <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} />
          </div>
        )}

        {/* V6.0 5A — Barra de popularidad animada (grid) */}
        {item.badge && (
          <div style={{ width: '100%', marginBottom: '6px', marginTop: '4px' }}>
            <div style={{
              height: '3px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(((item as any).order_count || 60) / 100 * 100, 94)}%`,
                background: `linear-gradient(90deg, ${theme.primary_color}cc, ${theme.primary_color})`,
                borderRadius: '999px',
                transition: 'width 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
              }} />
            </div>
          </div>
        )}

        {/* V6.0 5B — Badge de escasez (grid) */}
        {(item as any).stock !== null &&
         (item as any).stock !== undefined &&
         (item as any).stock <= 5 &&
         (item as any).stock > 0 && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#ef4444',
            marginTop: '4px',
            animation: 'pulse-soft 2s infinite',
          }}>
            🔥 Solo quedan {(item as any).stock}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span
            className="text-base font-bold"
            style={{ fontFamily: "'Lora', serif", color: preset?.priceColor !== 'inherit' ? preset?.priceColor : theme.primary_color }}
          >
            {formatPrice(item.price)}
          </span>
          <button
            onClick={handleQuickAdd}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-150 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: justAdded ? '#38A169' : theme.primary_color,
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
