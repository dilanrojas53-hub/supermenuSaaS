/**
 * CategoryFullScreen
 * Pantalla completa de una categoría: buscador, grid 2 col, detalle de producto.
 * Se abre como overlay/modal full-screen desde el MenuPage.
 * NO reemplaza el flujo existente — es aditivo.
 */
import { useState, useMemo } from 'react';
import { ArrowLeft, Search, X, Grid2X2, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuItem, Category, ThemeSettings } from '@/lib/types';
import type { Tenant } from '@/lib/types';
import MenuItemCard from '@/components/MenuItemCard';
import ProductDetailModal from '@/components/ProductDetailModal';

interface CategoryFullScreenProps {
  category: Category;
  items: MenuItem[];
  theme: ThemeSettings;
  tenant: Tenant;
  allItems: MenuItem[];
  showBadges?: boolean;
  onClose: () => void;
}

export default function CategoryFullScreen({
  category,
  items,
  theme,
  tenant,
  allItems,
  showBadges = false,
  onClose,
}: CategoryFullScreenProps) {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q)
    );
  }, [items, query]);

  const handleOpenDetail = (item: MenuItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex flex-col"
        style={{ backgroundColor: 'var(--menu-bg)', color: 'var(--menu-text)' }}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
          style={{
            backgroundColor: 'var(--menu-surface)',
            borderColor: 'var(--menu-border)',
            paddingTop: 'max(12px, env(safe-area-inset-top))',
          }}
        >
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full transition-all active:scale-90"
            style={{ backgroundColor: 'var(--menu-bg)' }}
          >
            <ArrowLeft size={20} style={{ color: 'var(--menu-text)' }} />
          </button>
          <div className="flex-1 min-w-0">
            <h1
              className="text-lg font-black leading-tight truncate"
              style={{ fontFamily: "'Lora', serif", color: 'var(--menu-text)' }}
            >
              {category.name}
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--menu-text)', opacity: 0.5 }}>
              {filtered.length} producto{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          {/* Toggle vista */}
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ backgroundColor: 'var(--menu-bg)' }}>
            <button
              onClick={() => setViewMode('grid')}
              className="p-1.5 rounded-md transition-all"
              style={{
                backgroundColor: viewMode === 'grid' ? 'var(--menu-accent)' : 'transparent',
                color: viewMode === 'grid' ? '#fff' : 'var(--menu-text)',
                opacity: viewMode === 'grid' ? 1 : 0.4,
              }}
            >
              <Grid2X2 size={15} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className="p-1.5 rounded-md transition-all"
              style={{
                backgroundColor: viewMode === 'list' ? 'var(--menu-accent)' : 'transparent',
                color: viewMode === 'list' ? '#fff' : 'var(--menu-text)',
                opacity: viewMode === 'list' ? 1 : 0.4,
              }}
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Buscador */}
        <div className="px-4 py-2 flex-shrink-0" style={{ backgroundColor: 'var(--menu-surface)', borderBottom: '1px solid var(--menu-border)' }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ backgroundColor: 'var(--menu-bg)', border: '1px solid var(--menu-border)' }}
          >
            <Search size={14} style={{ color: 'var(--menu-text)', opacity: 0.4 }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Buscar en ${category.name}...`}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--menu-text)' }}
            />
            {query && (
              <button onClick={() => setQuery('')}>
                <X size={14} style={{ color: 'var(--menu-text)', opacity: 0.4 }} />
              </button>
            )}
          </div>
        </div>

        {/* Descripción de categoría */}
        {category.description && (
          <div className="px-4 py-2 flex-shrink-0" style={{ backgroundColor: 'var(--menu-surface)' }}>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--menu-text)', opacity: 0.6 }}>
              {category.description}
            </p>
          </div>
        )}

        {/* Grid de productos */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--menu-text)', opacity: 0.5 }}>
                Sin resultados para "{query}"
              </p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
              {filtered.map(item => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  theme={theme}
                  viewMode={viewMode}
                  allItems={allItems}
                  showBadges={showBadges}
                  onOpenDetail={handleOpenDetail}
                />
              ))}
            </div>
          )}
        </div>

        {/* Product Detail Modal */}
        <ProductDetailModal
          item={detailItem}
          isOpen={detailOpen}
          onClose={() => setDetailOpen(false)}
          theme={theme}
          tenant={tenant}
        />
      </motion.div>
    </AnimatePresence>
  );
}
