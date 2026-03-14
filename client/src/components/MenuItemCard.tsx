/*
 * MenuItemCard — V9.0 Premium UI Pass
 * Jerarquía visual mejorada, imagen más grande (h-48 grid / w-32 list),
 * CTA refinado con pill más elegante, sombras más profundas,
 * micro-interacciones más fluidas, badges más visibles.
 * 4 CSS vars: --menu-bg, --menu-surface, --menu-text, --menu-accent
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
      setTimeout(() => setJustAdded(false), 1200);
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
      setTimeout(() => setJustAdded(false), 1200);
    }
  }, [addItem, item, hasModifiers]);

  const handleModifierConfirm = useCallback((selectedModifiers: SelectedModifier[], modifiersTotal: number) => {
    setShowModifiers(false);
    addItemAdvanced(item, { selectedModifiers, modifiersTotal });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  }, [addItemAdvanced, item]);

  const handleQuickAdd = checkAndAdd;

  const handleOpenDetail = useCallback(() => {
    if (onOpenDetail) onOpenDetail(item);
  }, [onOpenDetail, item]);

  const hasImage = Boolean(item.image_url);

  // ── LIST VIEW ──
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
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative cursor-pointer transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.99]"
        onClick={handleOpenDetail}
        style={{
          backgroundColor: 'var(--menu-surface)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.45), 0 8px 32px rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '1.25rem',
          overflow: 'hidden',
        }}
      >
        {/* Subtle inner glow top */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 40%)',
          borderRadius: '1.25rem',
        }} />

        {/* Content */}
        <div className="relative z-10 flex gap-0 p-0">
          {/* Image — square, larger */}
          <div className="relative w-32 h-32 flex-shrink-0 overflow-hidden" style={{ borderRadius: '1.25rem 0 0 1.25rem' }}>
            {hasImage ? (
              <img
                src={item.image_url!}
                alt={item.name}
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                {getPlaceholderIcon(item.name)}
              </div>
            )}
            {/* Badge floats on image */}
            {showBadges && item.badge && (
              <div className="absolute top-2 left-2 z-10">
                <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
              </div>
            )}
          </div>

          {/* Text + CTA */}
          <div className="flex-1 min-w-0 flex flex-col justify-between p-3.5">
            <div>
              <h3
                className="text-base font-bold leading-snug mb-1"
                style={{ color: 'var(--menu-text)', letterSpacing: '-0.01em' }}
              >
                {item.name}
              </h3>
              {item.description && (
                <p
                  className="text-xs leading-relaxed line-clamp-2"
                  style={{ color: 'var(--menu-text)', opacity: 0.55 }}
                >
                  {item.description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between mt-2.5">
              <span
                className="text-base font-black tracking-tight"
                style={{ color: 'var(--menu-accent)' }}
              >
                {formatPrice(item.price)}
              </span>
              <button
                onClick={handleQuickAdd}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 hover:scale-105 hover:brightness-110 active:scale-95"
                style={{
                  backgroundColor: justAdded ? '#22c55e' : 'var(--menu-accent)',
                  color: justAdded ? '#fff' : 'var(--menu-accent-contrast, #fff)',
                  boxShadow: justAdded
                    ? '0 4px 14px rgba(34,197,94,0.4)'
                    : '0 4px 14px rgba(0,0,0,0.35)',
                }}
              >
                <AnimatePresence mode="wait">
                  {justAdded ? (
                    <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                      <Check size={13} /><span>{t('menu.added')}</span>
                    </motion.span>
                  ) : (
                    <motion.span key="add" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1">
                      <Plus size={13} /><span>{t('menu.add')}</span>
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

  // ── GRID VIEW ──
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl overflow-hidden relative cursor-pointer transition-all duration-300 hover:scale-[1.025] hover:-translate-y-0.5"
      style={{
        backgroundColor: 'var(--menu-surface)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.50), 0 12px 40px rgba(0,0,0,0.30)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Inner glow top */}
      <div className="absolute inset-0 pointer-events-none z-[1]" style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 35%)',
      }} />

      {/* Image */}
      {hasImage && (
        <div
          className="relative z-10 w-full overflow-hidden"
          onClick={handleOpenDetail}
          style={{ height: '11rem', borderRadius: '1rem 1rem 0 0' }}
        >
          <img
            src={item.image_url!}
            alt={item.name}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
            loading="lazy"
          />
          {/* Gradient overlay on image bottom */}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 55%)',
          }} />
          {/* Badge floats on image corner */}
          {showBadges && item.badge && (
            <div className="absolute top-2.5 left-2.5 z-10">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
            </div>
          )}
        </div>
      )}

      {/* Placeholder */}
      {!hasImage && (
        <div
          className="relative z-10 w-full flex items-center justify-center cursor-pointer"
          onClick={handleOpenDetail}
          style={{
            height: '11rem',
            backgroundColor: 'rgba(255,255,255,0.03)',
            borderRadius: '1rem 1rem 0 0',
          }}
        >
          {getPlaceholderIcon(item.name)}
          {showBadges && item.badge && (
            <div className="absolute top-2.5 left-2.5 z-10">
              <SocialProofBadge badge={item.badge} theme={theme} itemId={item.id} compact />
            </div>
          )}
        </div>
      )}

      {/* Text content */}
      <div className="relative z-10 p-3.5" onClick={handleOpenDetail}>
        <h3
          className="text-sm font-bold leading-snug mb-1"
          style={{ color: 'var(--menu-text)', letterSpacing: '-0.01em' }}
        >
          {item.name}
        </h3>
        {item.description && (
          <p
            className="text-xs leading-relaxed mb-3 line-clamp-2"
            style={{ color: 'var(--menu-text)', opacity: 0.52 }}
          >
            {item.description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <span
            className="text-base font-black tracking-tight"
            style={{ color: 'var(--menu-accent)' }}
          >
            {formatPrice(item.price)}
          </span>
          {/* CTA — circle button */}
          <button
            onClick={handleQuickAdd}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: justAdded ? '#22c55e' : 'var(--menu-accent)',
              color: justAdded ? '#fff' : 'var(--menu-accent-contrast, #fff)',
              boxShadow: justAdded
                ? '0 4px 14px rgba(34,197,94,0.45)'
                : '0 4px 14px rgba(0,0,0,0.40)',
            }}
          >
            <AnimatePresence mode="wait">
              {justAdded ? (
                <motion.div key="check" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                  <Check size={16} />
                </motion.div>
              ) : (
                <motion.div key="plus" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Plus size={16} />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>
    </motion.div>
    </>
  );
}
