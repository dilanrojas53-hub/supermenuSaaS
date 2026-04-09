/*
 * MenuItemCard — V11.0 PREMIUM UI PASS
 * Cambios estructurales: imagen h-60 (grid), layout lista rediseñado,
 * precio en badge pill, botón CTA con gradiente y texto grande,
 * card con borde de acento visible, sombra de color.
 */
import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Check, GlassWater, Wine, UtensilsCrossed, Heart } from 'lucide-react';
import type { MenuItem, ThemeSettings, SelectedModifier } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { useCart } from '@/contexts/CartContext';
import { useI18n } from '@/contexts/I18nContext';
import SocialProofBadge from './SocialProofBadge';
import ModifierSelector from './ModifierSelector';
import { supabase } from '@/lib/supabase';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/lib/imageUtils';

const DRINK_ICON_KEYWORDS = ['bebida', 'drink', 'jugo', 'agua', 'refresco', 'smoothie', 'café', 'coffee', 'té', 'tea'];
const WINE_ICON_KEYWORDS = ['vino', 'wine', 'licor', 'cóctel', 'cocktail', 'cerveza', 'beer', 'destilado'];

const getPlaceholderIcon = (itemName: string, categoryName?: string): React.ReactNode => {
  const combined = `${itemName} ${categoryName || ''}`.toLowerCase();
  if (WINE_ICON_KEYWORDS.some(k => combined.includes(k))) {
    return <Wine size={36} style={{ color: 'var(--menu-accent)', opacity: 0.35 }} />;
  }
  if (DRINK_ICON_KEYWORDS.some(k => combined.includes(k))) {
    return <GlassWater size={36} style={{ color: 'var(--menu-accent)', opacity: 0.35 }} />;
  }
  return <UtensilsCrossed size={36} style={{ color: 'var(--menu-accent)', opacity: 0.35 }} />;
};

interface MenuItemCardProps {
  item: MenuItem;
  theme: ThemeSettings;
  viewMode: 'grid' | 'list';
  allItems?: MenuItem[];
  showBadges?: boolean;
  onOpenDetail?: (item: MenuItem) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (item: MenuItem) => void;
}

// Detecta si el tema activo es Clean White (fondo blanco, texto negro)
function isCleanWhiteTheme(theme: ThemeSettings): boolean {
  return theme.theme_preset_key === 'clean_white' ||
    (theme.background_color === '#FFFFFF' && theme.text_color === '#0A0A0A' && theme.primary_color === '#0A0A0A');
}

export default function MenuItemCard({ item, theme, viewMode, allItems, showBadges = true, onOpenDetail, isFavorite = false, onToggleFavorite }: MenuItemCardProps) {
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
  const accentColor = 'var(--menu-accent)';
  const cleanWhite = isCleanWhiteTheme(theme);

  const handleToggleFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) onToggleFavorite(item);
  }, [onToggleFavorite, item]);

  // ── LIST VIEW V11.0 ──
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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="relative cursor-pointer group"
        onClick={handleOpenDetail}
        style={cleanWhite ? {
          backgroundColor: '#FFFFFF',
          borderRadius: '0',
          overflow: 'hidden',
          boxShadow: 'none',
          border: 'none',
          borderBottom: '1px solid #F0F0F0',
        } : {
          backgroundColor: 'var(--menu-surface)',
          borderRadius: '1.25rem',
          overflow: 'hidden',
          boxShadow: '0 2px 16px rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
        whileTap={{ scale: 0.99 }}
      >
        {/* Accent left stripe - solo en temas oscuros */}
        {!cleanWhite && <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: 'var(--menu-accent)', opacity: justAdded ? 1 : 0.5 }} />}

        <div className="flex gap-0 pl-1">
          {/* Imagen cuadrada o circular según tema */}
          <div className="relative flex-shrink-0" style={{ width: '6.5rem', height: '6.5rem', padding: cleanWhite ? '8px' : '0' }}>
            {hasImage ? (
              <img
                src={getOptimizedImageUrl(item.image_url, IMAGE_SIZES.thumbnail.width, IMAGE_SIZES.thumbnail.quality, IMAGE_SIZES.thumbnail.height)}
                alt={item.name}
                className="w-full h-full object-cover"
                style={{ borderRadius: cleanWhite ? '50%' : '0.75rem' }}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: cleanWhite ? '#F5F5F5' : 'rgba(255,255,255,0.04)', borderRadius: cleanWhite ? '50%' : '0.75rem' }}>
                {getPlaceholderIcon(item.name)}
              </div>
            )}
          {/* Badge */}
          {showBadges && item.badge && (
            <div className="absolute top-1.5 left-1.5 z-10">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
            </div>
          )}
          {/* Botón favorito — list view */}
          {onToggleFavorite && (
            <button
              onClick={handleToggleFavorite}
              className="absolute top-1.5 right-1.5 z-10 p-1.5 rounded-full transition-all duration-150 active:scale-90"
              style={{ background: isFavorite ? 'rgba(239,68,68,0.18)' : cleanWhite ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.35)' }}
              aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            >
              <Heart
                size={14}
                fill={isFavorite ? '#ef4444' : 'none'}
                stroke={isFavorite ? '#ef4444' : cleanWhite ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)'}
                strokeWidth={2.5}
              />
            </button>
          )}
        </div>

          {/* Contenido */}
          <div className="flex-1 min-w-0 flex flex-col justify-between py-3 px-3">
            <div>
              <h3
                className="text-[15px] font-black leading-snug"
                style={{ color: 'var(--menu-text)', letterSpacing: '-0.02em' }}
              >
                {item.name}
              </h3>
              {item.description && (
                <p
                  className="text-[12px] leading-relaxed line-clamp-2 mt-0.5"
                  style={{ color: 'var(--menu-text)', opacity: 0.45 }}
                >
                  {item.description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between mt-2.5">
              {/* Precio */}
              <span
                className="text-[15px] font-black px-2.5 py-1 rounded-lg"
                style={cleanWhite ? {
                  color: '#0A0A0A',
                  backgroundColor: 'transparent',
                  letterSpacing: '-0.02em',
                } : {
                  color: 'var(--menu-accent)',
                  backgroundColor: 'rgba(var(--menu-accent-rgb,230,57,70),0.12)',
                  letterSpacing: '-0.02em',
                }}
              >
                {formatPrice(item.price)}
              </span>
              {/* Botón agregar */}
              <button
                onClick={handleQuickAdd}
                className="flex items-center gap-1.5 transition-all duration-150 active:scale-95"
                style={cleanWhite ? {
                  // Clean White: botón "+" circular minimalista
                  background: justAdded ? '#22c55e' : '#0A0A0A',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '2rem',
                  height: '2rem',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'none',
                  minWidth: 'unset',
                } : {
                  background: justAdded
                    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                    : 'var(--menu-accent)',
                  color: justAdded ? '#fff' : 'var(--menu-accent-contrast)',
                  borderRadius: '0.75rem',
                  padding: '8px 14px',
                  boxShadow: justAdded ? '0 4px 12px rgba(34,197,94,0.4)' : '0 4px 12px rgba(0,0,0,0.35)',
                  minWidth: '5rem',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: '900',
                }}
              >
                <AnimatePresence mode="wait">
                  {justAdded ? (
                    <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                      {cleanWhite ? <Check size={14} /> : <><Check size={13} /> Listo</>}
                    </motion.span>
                  ) : (
                    <motion.span key="add" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                      {cleanWhite ? <Plus size={14} /> : <><Plus size={13} /> Agregar</>}
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

  // ── GRID VIEW V11.0 ──
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative overflow-hidden cursor-pointer group flex flex-col"
      style={{
        backgroundColor: 'var(--menu-surface)',
        borderRadius: '1.25rem',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Imagen — aspect-ratio 4:3 para que escale bien en cualquier ancho */}
      <div
        className="relative w-full overflow-hidden flex-shrink-0"
        onClick={handleOpenDetail}
        style={{ aspectRatio: '4/3', borderRadius: '1.25rem 1.25rem 0 0' }}
      >
        {hasImage ? (
          <>
            <img
              src={getOptimizedImageUrl(item.image_url, IMAGE_SIZES.card.width, IMAGE_SIZES.card.quality, IMAGE_SIZES.card.height)}
              alt={item.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
            {/* Gradiente oscuro */}
            <div className="absolute inset-0" style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.05) 45%, transparent 100%)',
            }} />
            {/* Precio flotando */}
            <div className="absolute bottom-2.5 left-3 z-10">
              <span
                className="text-[17px] font-black"
                style={{
                  color: '#fff',
                  textShadow: '0 1px 8px rgba(0,0,0,0.9)',
                  letterSpacing: '-0.03em',
                }}
              >
                {formatPrice(item.price)}
              </span>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {getPlaceholderIcon(item.name)}
          </div>
        )}

        {/* Badge */}
        {showBadges && item.badge && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
          </div>
        )}
        {/* Botón favorito — grid view */}
        {onToggleFavorite && (
          <button
            onClick={handleToggleFavorite}
            className="absolute top-2.5 right-2.5 z-10 p-2 rounded-full transition-all duration-150 active:scale-90"
            style={{ background: isFavorite ? 'rgba(239,68,68,0.22)' : cleanWhite ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.45)' }}
            aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          >
            <Heart
              size={16}
              fill={isFavorite ? '#ef4444' : 'none'}
              stroke={isFavorite ? '#ef4444' : cleanWhite ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)'}
              strokeWidth={2.5}
            />
          </button>
        )}
      </div>

      {/* Contenido */}
      <div className="flex flex-col flex-1 px-3 pt-2.5 pb-3" onClick={handleOpenDetail}>
        <h3
          className="text-[14px] font-black leading-snug"
          style={{ color: 'var(--menu-text)', letterSpacing: '-0.02em' }}
        >
          {item.name}
        </h3>
        {item.description && (
          <p
            className="text-[11px] leading-relaxed line-clamp-2 mt-1"
            style={{ color: 'var(--menu-text)', opacity: 0.42 }}
          >
            {item.description}
          </p>
        )}
        {/* Precio cuando no hay imagen */}
        {!hasImage && (
          <p className="text-[16px] font-black mt-1.5" style={{ color: 'var(--menu-accent)', letterSpacing: '-0.03em' }}>
            {formatPrice(item.price)}
          </p>
        )}
      </div>

      {/* Botón CTA — ancho completo, prominente */}
      <div className="px-3 pb-3">
        <button
          onClick={handleQuickAdd}
          className="w-full py-2.5 rounded-xl text-[13px] font-black flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.97]"
          style={{
            background: justAdded
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : 'var(--menu-accent)',
            color: justAdded ? '#fff' : 'var(--menu-accent-contrast)',
            boxShadow: justAdded ? '0 4px 16px rgba(34,197,94,0.45)' : '0 4px 16px rgba(0,0,0,0.4)',
            letterSpacing: '-0.01em',
          }}
        >
          <AnimatePresence mode="wait">
            {justAdded ? (
              <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1.5">
                <Check size={14} /> ¡Agregado!
              </motion.span>
            ) : (
              <motion.span key="add" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1.5">
                <Plus size={14} /> Agregar al pedido
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.div>
    </>
  );
}
