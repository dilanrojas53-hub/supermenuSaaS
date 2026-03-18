/**
 * V22.1 — ModifierSelector
 * Modal de personalización de platillos con Modifier Engine.
 * Soporta: included (₡0), free (₡0), extra (+price_delta), discounted (+price_delta).
 * UX: el cliente ve claramente qué está incluido y qué cuesta extra.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import type { MenuItem, ModifierGroup, ModifierOption, SelectedModifier, ModifierPricingType } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { X, Check, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface ModifierGroupWithOptions extends ModifierGroup {
  options: ModifierOption[];
}

interface ModifierSelectorProps {
  item: MenuItem;
  theme: { primary_color: string; accent_color: string };
  onConfirm: (selectedModifiers: SelectedModifier[], modifiersTotal: number) => void;
  onCancel: () => void;
  lang?: 'es' | 'en';
}

// ─── i18n ───
const tr = (key: string, lang: 'es' | 'en') => {
  const map: Record<string, Record<string, string>> = {
    title:          { es: 'Personaliza tu pedido', en: 'Customize your order' },
    optional:       { es: 'Opcional', en: 'Optional' },
    required:       { es: 'Obligatorio', en: 'Required' },
    choose_up_to:   { es: 'Elige hasta', en: 'Choose up to' },
    choose_exact:   { es: 'Elige', en: 'Choose' },
    included_label: { es: 'Incluido', en: 'Included' },
    free_label:     { es: 'Gratis', en: 'Free' },
    discounted_label: { es: 'Precio especial', en: 'Special price' },
    add_to_cart:    { es: 'Agregar al carrito', en: 'Add to cart' },
    cancel:         { es: 'Cancelar', en: 'Cancel' },
    select_required: { es: 'Selecciona al menos', en: 'Select at least' },
    option_in:      { es: 'opción en', en: 'option in' },
    options_in:     { es: 'opciones en', en: 'options in' },
    max_reached:    { es: 'Máximo alcanzado para', en: 'Maximum reached for' },
  };
  return map[key]?.[lang] ?? map[key]?.['es'] ?? key;
};

// ─── Helpers ───
/** Returns the effective price delta for an option (0 for included/free) */
function getEffectiveDelta(opt: ModifierOption): number {
  if (opt.pricing_type === 'extra' || opt.pricing_type === 'discounted') {
    return opt.price_delta ?? 0;
  }
  return 0;
}

/** Returns the price badge label for an option */
function getPriceBadge(opt: ModifierOption, lang: 'es' | 'en', primaryColor: string): { text: string; color: string } {
  const pt: ModifierPricingType = opt.pricing_type ?? 'included';
  if (pt === 'extra') {
    return { text: `+${formatPrice(opt.price_delta ?? 0)}`, color: primaryColor };
  }
  if (pt === 'discounted') {
    return { text: `+${formatPrice(opt.price_delta ?? 0)}`, color: '#a855f7' };
  }
  if (pt === 'free') {
    return { text: tr('free_label', lang), color: '#60a5fa' };
  }
  // included
  return { text: tr('included_label', lang), color: '#4ade80' };
}

export default function ModifierSelector({ item, theme, onConfirm, onCancel, lang = 'es' }: ModifierSelectorProps) {
  const [groups, setGroups] = useState<ModifierGroupWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  // Map: group_id -> selected option IDs
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const fetchModifiers = async () => {
      setLoading(true);
      try {
        const { data: assignments } = await supabase
          .from('product_modifier_groups')
          .select('group_id, sort_order')
          .eq('product_id', item.id)
          .order('sort_order');

        if (!assignments || assignments.length === 0) {
          onConfirm([], 0);
          return;
        }

        const groupIds = assignments.map((a: any) => a.group_id);

        const { data: groupsData } = await supabase
          .from('modifier_groups')
          .select('*, options:modifier_options(*)')
          .in('id', groupIds);

        if (!groupsData) { onConfirm([], 0); return; }

        const sorted = groupIds
          .map((gid: string) => groupsData.find((g: any) => g.id === gid))
          .filter(Boolean)
          .map((g: any) => ({
            ...g,
            options: (g.options || [])
              .filter((o: ModifierOption) => o.is_available)
              .sort((a: ModifierOption, b: ModifierOption) => a.sort_order - b.sort_order),
          }))
          // Solo incluir grupos que tengan al menos una opción disponible
          .filter((g: any) => g.options.length > 0);

        // Si después de filtrar no hay grupos con opciones, agregar directamente sin modal
        if (sorted.length === 0) {
          onConfirm([], 0);
          return;
        }

        setGroups(sorted);

        const initialSelections: Record<string, string[]> = {};
        sorted.forEach((g: ModifierGroupWithOptions) => {
          initialSelections[g.id] = [];
        });
        setSelections(initialSelections);
      } catch (err) {
        console.error('ModifierSelector fetch error:', err);
        onConfirm([], 0);
      } finally {
        setLoading(false);
      }
    };
    fetchModifiers();
  }, [item.id]);

  const toggleOption = (group: ModifierGroupWithOptions, optionId: string) => {
    setSelections(prev => {
      const current = prev[group.id] || [];
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter(id => id !== optionId) };
      }
      if (current.length >= group.max_selections) {
        if (group.max_selections === 1) {
          // Radio behavior
          return { ...prev, [group.id]: [optionId] };
        }
        toast.error(`${tr('max_reached', lang)} "${group.name}" (máx ${group.max_selections})`);
        return prev;
      }
      return { ...prev, [group.id]: [...current, optionId] };
    });
  };

  const handleConfirm = () => {
    for (const group of groups) {
      const selected = selections[group.id] || [];
      if (selected.length < group.min_selections) {
        const needed = group.min_selections - selected.length;
        toast.error(`${tr('select_required', lang)} ${needed} ${needed === 1 ? tr('option_in', lang) : tr('options_in', lang)} "${group.name}"`);
        return;
      }
    }

    const selectedModifiers: SelectedModifier[] = [];
    let modifiersTotal = 0;

    groups.forEach(group => {
      const selectedIds = selections[group.id] || [];
      selectedIds.forEach(optId => {
        const opt = group.options.find(o => o.id === optId);
        if (opt) {
          const delta = getEffectiveDelta(opt);
          selectedModifiers.push({
            group_id: group.id,
            group_name: group.name,
            option_id: opt.id,
            option_name: opt.name,
            pricing_type: opt.pricing_type ?? 'included',
            price_delta: delta,
          });
          modifiersTotal += delta;
        }
      });
    });

    onConfirm(selectedModifiers, modifiersTotal);
  };

  // Live price calculation
  const currentExtra = groups.reduce((total, group) => {
    const selectedIds = selections[group.id] || [];
    return total + selectedIds.reduce((sum, optId) => {
      const opt = group.options.find(o => o.id === optId);
      return sum + getEffectiveDelta(opt!);
    }, 0);
  }, 0);

  const totalPrice = item.price + currentExtra;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" style={{ borderColor: theme.primary_color }} />
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      >
        <motion.div
          className="w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl overflow-hidden"
          style={{ maxHeight: '92vh', border: `1px solid ${theme.primary_color}30` }}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-base font-black text-[var(--text-primary)]">{tr('title', lang)}</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate max-w-[230px]">{item.name}</p>
            </div>
            <button onClick={onCancel}
              className="w-8 h-8 rounded-full bg-[var(--bg-surface)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Scrollable groups */}
          <div className="overflow-y-auto px-5 pb-2" style={{ maxHeight: 'calc(92vh - 160px)' }}>
            <div className="space-y-6">
              {groups.map(group => {
                const selectedIds = selections[group.id] || [];
                const isComplete = selectedIds.length >= group.min_selections;

                return (
                  <div key={group.id}>
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--text-primary)]">{group.name}</span>
                        {group.min_selections > 0 && !isComplete ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full font-bold">
                            {tr('required', lang)}
                          </span>
                        ) : group.min_selections === 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-full">
                            {tr('optional', lang)}
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-full font-bold">✓</span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                        {selectedIds.length}/{group.max_selections}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mb-2.5">
                      {group.min_selections === group.max_selections && group.min_selections > 0
                        ? `${tr('choose_exact', lang)} ${group.max_selections}`
                        : `${tr('choose_up_to', lang)} ${group.max_selections}`}
                      {group.min_selections > 0 && group.min_selections !== group.max_selections && ` · mín ${group.min_selections}`}
                    </p>

                    {/* Options */}
                    <div className="space-y-2">
                      {group.options.map(opt => {
                        const isSelected = selectedIds.includes(opt.id);
                        const badge = getPriceBadge(opt, lang, theme.primary_color);
                        const isExtra = (opt.pricing_type === 'extra' || opt.pricing_type === 'discounted') && (opt.price_delta ?? 0) > 0;

                        return (
                          <button
                            key={opt.id}
                            onClick={() => toggleOption(group, opt.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all border"
                            style={{
                              backgroundColor: isSelected ? `${theme.primary_color}18` : '#0f172a',
                              borderColor: isSelected ? `${theme.primary_color}60` : '#1e293b',
                            }}
                          >
                            {/* Checkbox / Radio indicator */}
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                              style={{
                                backgroundColor: isSelected ? theme.primary_color : 'transparent',
                                border: `2px solid ${isSelected ? theme.primary_color : '#475569'}`,
                              }}
                            >
                              {isSelected && <Check size={11} className="text-[var(--text-primary)]" />}
                            </div>

                            {/* Option name */}
                            <span
                              className="flex-1 text-sm font-medium"
                              style={{ color: isSelected ? '#fff' : '#94a3b8' }}
                            >
                              <span>{opt.name}</span>
                            </span>

                            {/* Price badge */}
                            <span
                              className="text-xs font-bold flex-shrink-0"
                              style={{ color: isExtra && isSelected ? badge.color : badge.color, opacity: isSelected || !isExtra ? 1 : 0.7 }}
                            >
                              <span>{badge.text}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer — sticky CTA */}
          <div className="px-5 py-4 border-t border-slate-800">
            <button
              onClick={handleConfirm}
              className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 flex items-center justify-between px-5"
              style={{
                backgroundColor: theme.primary_color,
                color: '#fff',
                boxShadow: `0 4px 24px ${theme.primary_color}50`,
              }}
            >
              <span>{tr('add_to_cart', lang)}</span>
              <div className="flex items-center gap-2">
                <span className="font-black">{formatPrice(totalPrice)}</span>
                {currentExtra > 0 && (
                  <span className="text-xs opacity-75"><span>(+{formatPrice(currentExtra)})</span></span>
                )}
                <ChevronRight size={18} />
              </div>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
