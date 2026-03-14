/*
 * MenuItemCard — V10.0 RADICAL REDESIGN
 * Imagen h-56 (grid) / w-40 h-40 (list), nombre text-lg font-black,
 * precio text-xl font-black con color acento, botón pill con texto visible,
 * borde acento al hover, sombra profunda con color.
 */
import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Check, GlassWater, Wine, UtensilsCrossed } from 'lucide-react';
import type { MenuItem, ThemeSettings, SelectedModifier } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import SocialProofBadge from './SocialProofBadge';
import ModifierSelector from './ModifierSelector';
import { supabase } from '@/lib/supabase';

const DRINK_ICON_KEYWORDS = ['bebida', 'drink', 'jugo', 'agua', 'refresco', 'smoothie', 'café', 'coffee', 'té', 'tea'];
const WINE_ICON_KEYWORDS = ['vino', 'wine', 'licor', 'cóctel', 'cocktail', 'cerveza', 'beer', 'destilado'];

const getPlaceholderIcon = (itemName: string, categoryName?: string): React.ReactNode => {
  const combined = `${itemName} ${categoryName || ''}`.toLowerCase();
  if (WINE_ICON_KEYWORDS.some(k => combined.includes(k))) {
    return <Wine size={40} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
  }
  if (DRINK_ICON_KEYWORDS.some(k => combined.includes(k))) {
    return <GlassWater size={40} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
  }
  return <UtensilsCrossed size={40} style={{ color: 'var(--menu-accent)', opacity: 0.4 }} />;
};

interface MenuItemCardProps {
  item: MenuItem;
  theme: ThemeSettings;
  viewMode: 'grid' | 'list';
  allItems?: MenuItem[];
  showBadges?: boolean;
  onOpenDetail?: (item: MenuItem) => void;
}

export default function MenuItemCard({ item, theme, viewMode, allItems, showBadges = true, onOpenDetail }: MenuItemCardProps) {
  const { addItem, addItemAdvanced } = useCart();
  const { t } = useI18n();
  const [justAdded, setJustAdded] = useState(false);
  const [showModifiers, setShowModifiers] = useState(false);
  const [hasModifiers, setHasModifiers] = useState<boolean | null>(null);

  const checkAndAdd = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasModifiers === false) {
      addItem(item);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1400);
      return;
    }
    const { data } = await supabase
      .from('product_modifier_groups')
      .select('id')
      .eq('product_id', item.id)
      .limit(1);
    const hasAny = (data?.length ?? 0) > 0;
    setHasModifiers(hasAny);
    if (hasAny) {
      setShowModifiers(true);
    } else {
      addItem(item);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1400);
    }
  }, [addItem, item, hasModifiers]);

  const handleModifierConfirm = useCallback((selectedModifiers: SelectedModifier[], modifiersTotal: number) => {
    setShowModifiers(false);
    addItemAdvanced(item, { selectedModifiers, modifiersTotal });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1400);
  }, [addItemAdvanced, item]);

  const handleQuickAdd = checkAndAdd;

  const handleOpenDetail = useCallback(() => {
    if (onOpenDetail) onOpenDetail(item);
  }, [onOpenDetail, item]);

  const hasImage = Boolean(item.image_url);

  // ── LIST VIEW — Horizontal card con imagen grande cuadrada ──
  if (viewMode === 'list') {
    return (
      <>
      {showModifiers && (
        <ModifierSelector
          item={item}
          theme={{ primary_color: theme.primary_color, accent_color: theme.accent_color }}
          onConfirm={handleModifierConfirm}
          onCancel={() => setShowModifiers(false)}
        />
      )}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className="relative cursor-pointer group"
        onClick={handleOpenDetail}
        style={{
          backgroundColor: 'var(--menu-surface)',
          border: '1.5px solid rgba(255,255,255,0.08)',
          borderRadius: '1.5rem',
          overflow: 'hidden',
          transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}
        whileHover={{ scale: 1.01, y: -2 }}
      >
        <div className="flex gap-0">
          {/* Imagen cuadrada grande */}
          <div className="relative flex-shrink-0 overflow-hidden" style={{ width: '9rem', height: '9rem', borderRadius: '1.5rem 0 0 1.5rem' }}>
            {hasImage ? (
              <img
                src={item.image_url!}
                alt={item.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                {getPlaceholderIcon(item.name)}
              </div>
            )}
            {/* Badge */}
            {showBadges && item.badge && (
              <div className="absolute top-2 left-2 z-10">
                <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
              </div>
            )}
          </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0 flex flex-col justify-between p-4">
            <div>
              <h3
                className="text-base font-black leading-tight mb-1.5"
                style={{ color: 'var(--menu-text)', letterSpacing: '-0.02em' }}
              >
                {item.name}
              </h3>
              {item.description && (
                <p
                  className="text-xs leading-relaxed line-clamp-2"
                  style={{ color: 'var(--menu-text)', opacity: 0.5 }}
                >
                  {item.description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between mt-3">
              <span
                className="text-lg font-black"
                style={{ color: 'var(--menu-accent)', letterSpacing: '-0.03em' }}
              >
                {formatPrice(item.price)}
              </span>
              <button
                onClick={handleQuickAdd}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all duration-200 active:scale-95"
                style={{
                  backgroundColor: justAdded ? '#22c55e' : 'var(--menu-accent)',
                  color: '#fff',
                  boxShadow: justAdded
                    ? '0 4px 16px rgba(34,197,94,0.5)'
                    : '0 4px 16px rgba(0,0,0,0.4)',
                  minWidth: '5.5rem',
                  justifyContent: 'center',
                }}
              >
                <AnimatePresence mode="wait">
                  {justAdded ? (
                    <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1.5">
                      <Check size={14} /> Listo
                    </motion.span>
                  ) : (
                    <motion.span key="add" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1.5">
                      <Plus size={14} /> Agregar
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      </>
    );
  }

  // ── GRID VIEW — Card vertical con imagen grande y CTA prominente ──
  return (
    <>
    {showModifiers && (
      <ModifierSelector
        item={item}
        theme={{ primary_color: theme.primary_color, accent_color: theme.accent_color }}
        onConfirm={handleModifierConfirm}
        onCancel={() => setShowModifiers(false)}
      />
    )}
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden cursor-pointer group"
      style={{
        backgroundColor: 'var(--menu-surface)',
        border: '1.5px solid rgba(255,255,255,0.08)',
        borderRadius: '1.5rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        transition: 'transform 0.25s, box-shadow 0.25s',
      }}
      whileHover={{ scale: 1.03, y: -4 }}
    >
      {/* Imagen — altura generosa */}
      <div
        className="relative w-full overflow-hidden"
        onClick={handleOpenDetail}
        style={{ height: '13rem', borderRadius: '1.5rem 1.5rem 0 0' }}
      >
        {hasImage ? (
          <>
            <img
              src={item.image_url!}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-600 group-hover:scale-110"
              loading="lazy"
            />
            {/* Gradiente oscuro en la parte inferior de la imagen */}
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
            }} />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {getPlaceholderIcon(item.name)}
          </div>
        )}

        {/* Badge sobre la imagen */}
        {showBadges && item.badge && (
          <div className="absolute top-3 left-3 z-10">
            <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
          </div>
        )}

        {/* Precio flotando sobre la imagen (esquina inferior izquierda) */}
        {hasImage && (
          <div className="absolute bottom-3 left-3 z-10">
            <span
              className="text-xl font-black"
              style={{
                color: 'var(--menu-accent)',
                textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                letterSpacing: '-0.03em',
              }}
            >
              {formatPrice(item.price)}
            </span>
          </div>
        )}
      </div>

      {/* Contenido de texto */}
      <div className="p-4" onClick={handleOpenDetail}>
        <h3
          className="text-base font-black leading-tight mb-1"
          style={{ color: 'var(--menu-text)', letterSpacing: '-0.02em' }}
        >
          {item.name}
        </h3>
        {item.description && (
          <p
            className="text-xs leading-relaxed line-clamp-2"
            style={{ color: 'var(--menu-text)', opacity: 0.5 }}
          >
            {item.description}
          </p>
        )}
        {/* Precio cuando no hay imagen */}
        {!hasImage && (
          <p className="text-lg font-black mt-2" style={{ color: 'var(--menu-accent)', letterSpacing: '-0.03em' }}>
            {formatPrice(item.price)}
          </p>
        )}
      </div>

      {/* Botón CTA — ancho completo, prominente */}
      <div className="px-4 pb-4">
        <button
          onClick={handleQuickAdd}
          className="w-full py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]"
          style={{
            backgroundColor: justAdded ? '#22c55e' : 'var(--menu-accent)',
            color: '#fff',
            boxShadow: justAdded
              ? '0 4px 20px rgba(34,197,94,0.5)'
              : '0 4px 20px rgba(0,0,0,0.4)',
            letterSpacing: '-0.01em',
          }}
        >
          <AnimatePresence mode="wait">
            {justAdded ? (
              <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-2">
                <Check size={16} /> ¡Agregado!
              </motion.span>
            ) : (
              <motion.span key="add" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-2">
                <Plus size={16} /> Agregar al pedido
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.div>
    </>
  );
}
