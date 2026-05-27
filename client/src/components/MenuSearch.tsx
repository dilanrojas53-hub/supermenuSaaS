import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, ChefHat } from 'lucide-react';
import type { MenuItem, Category } from '@/lib/types';

interface MenuSearchProps {
  items: MenuItem[];
  categories: Category[];
  onSelectItem: (item: MenuItem) => void;
  theme: {
    primary_color: string;
    badge_color?: string;
    text_color: string;
    bg_color?: string;
  };
  cleanWhiteTheme?: boolean;
}

export default function MenuSearch({ items, categories, onSelectItem, theme, cleanWhiteTheme }: MenuSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const accentColor = (theme as any).badge_color || theme.primary_color || '#c6a75e';

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Search logic
  const results = useCallback(() => {
    if (!debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase().trim();
    const catMap = Object.fromEntries(categories.map(c => [c.id, c.name?.toLowerCase() || '']));
    return items
      .filter(item => item.is_available !== false)
      .filter(item => {
        const name = (item.name || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const cat = catMap[item.category_id] || '';
        return name.includes(q) || desc.includes(q) || cat.includes(q);
      })
      .slice(0, 12);
  }, [debouncedQuery, items, categories])();

  const handleSelect = (item: MenuItem) => {
    setOpen(false);
    onSelectItem(item);
  };

  const formatPrice = (price: number) => {
    if (!price) return '';
    return `₡${price.toLocaleString('es-CR')}`;
  };

  const getCatName = (catId: string) => categories.find(c => c.id === catId)?.name || '';

  return (
    <>
      {/* ── Lupa trigger ── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Buscar en el menú"
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 active:scale-95"
        style={{
          backgroundColor: cleanWhiteTheme ? '#F5F5F5' : 'var(--menu-surface)',
          border: cleanWhiteTheme ? '1px solid #E5E5E5' : '1px solid var(--menu-border)',
          color: cleanWhiteTheme ? '#0A0A0A' : 'var(--menu-text)',
        }}
      >
        <Search size={16} strokeWidth={2.5} />
      </button>

      {/* ── Overlay backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        >
          {/* ── Search panel ── */}
          <div
            ref={overlayRef}
            className="mx-auto w-full max-w-lg mt-16 mx-4 rounded-2xl overflow-hidden shadow-2xl"
            style={{
              backgroundColor: cleanWhiteTheme ? '#FFFFFF' : 'var(--menu-bg)',
              border: cleanWhiteTheme ? '1px solid #E5E5E5' : '1px solid var(--menu-border)',
              margin: '64px 16px 0',
              maxWidth: 'calc(100% - 32px)',
            }}
          >
            {/* Input row */}
            <div
              className="flex items-center gap-3 px-4 py-3.5"
              style={{
                borderBottom: cleanWhiteTheme ? '1px solid #E5E5E5' : '1px solid var(--menu-border)',
              }}
            >
              <Search
                size={18}
                strokeWidth={2.5}
                style={{ color: accentColor, flexShrink: 0 }}
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar platillos, bebidas, ingredientes…"
                className="flex-1 bg-transparent outline-none text-base font-medium placeholder:font-normal"
                style={{
                  color: cleanWhiteTheme ? '#0A0A0A' : 'var(--menu-text)',
                  caretColor: accentColor,
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-opacity"
                  style={{ backgroundColor: cleanWhiteTheme ? '#E5E5E5' : 'rgba(255,255,255,0.1)' }}
                >
                  <X size={12} style={{ color: cleanWhiteTheme ? '#666' : 'var(--menu-text)' }} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex-shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{
                  color: cleanWhiteTheme ? '#666' : 'rgba(255,255,255,0.5)',
                  backgroundColor: 'transparent',
                }}
              >
                Cancelar
              </button>
            </div>

            {/* Results */}
            <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
              {/* Empty state — no query */}
              {!debouncedQuery.trim() && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: `${accentColor}18` }}
                  >
                    <Search size={24} style={{ color: accentColor }} />
                  </div>
                  <p className="text-sm font-medium" style={{ color: cleanWhiteTheme ? '#999' : 'rgba(255,255,255,0.4)' }}>
                    Escribe para buscar en el menú
                  </p>
                </div>
              )}

              {/* No results */}
              {debouncedQuery.trim() && results.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: cleanWhiteTheme ? '#F5F5F5' : 'rgba(255,255,255,0.06)' }}
                  >
                    <ChefHat size={24} style={{ color: cleanWhiteTheme ? '#CCC' : 'rgba(255,255,255,0.2)' }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: cleanWhiteTheme ? '#0A0A0A' : 'var(--menu-text)' }}>
                    Sin resultados para "{debouncedQuery}"
                  </p>
                  <p className="text-xs" style={{ color: cleanWhiteTheme ? '#999' : 'rgba(255,255,255,0.4)' }}>
                    Intenta con otro nombre o ingrediente
                  </p>
                </div>
              )}

              {/* Results list */}
              {results.length > 0 && (
                <div className="py-2">
                  <p
                    className="px-4 pb-2 pt-1 text-[11px] font-bold uppercase tracking-widest"
                    style={{ color: cleanWhiteTheme ? '#999' : 'rgba(255,255,255,0.3)' }}
                  >
                    {results.length} resultado{results.length !== 1 ? 's' : ''}
                  </p>
                  {results.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 active:scale-[0.99]"
                      style={{
                        borderBottom: cleanWhiteTheme ? '1px solid #F5F5F5' : '1px solid rgba(255,255,255,0.05)',
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = cleanWhiteTheme ? '#FAFAFA' : 'rgba(255,255,255,0.04)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* Thumbnail */}
                      <div
                        className="w-14 h-14 rounded-xl flex-shrink-0 overflow-hidden"
                        style={{
                          backgroundColor: cleanWhiteTheme ? '#F5F5F5' : 'rgba(255,255,255,0.06)',
                        }}
                      >
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ChefHat size={20} style={{ color: cleanWhiteTheme ? '#CCC' : 'rgba(255,255,255,0.15)' }} />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-bold truncate"
                          style={{ color: cleanWhiteTheme ? '#0A0A0A' : 'var(--menu-text)' }}
                        >
                          {item.name}
                        </p>
                        {item.description && (
                          <p
                            className="text-xs mt-0.5 line-clamp-1"
                            style={{ color: cleanWhiteTheme ? '#888' : 'rgba(255,255,255,0.45)' }}
                          >
                            {item.description}
                          </p>
                        )}
                        <p
                          className="text-[11px] mt-1 font-medium"
                          style={{ color: cleanWhiteTheme ? '#AAA' : 'rgba(255,255,255,0.3)' }}
                        >
                          {getCatName(item.category_id)}
                        </p>
                      </div>

                      {/* Price */}
                      <div className="flex-shrink-0 text-right">
                        <span
                          className="text-sm font-black"
                          style={{ color: accentColor }}
                        >
                          {formatPrice(item.price)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
