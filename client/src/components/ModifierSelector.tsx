/**
 * V22.0 — ModifierSelector
 * Modal que aparece cuando el cliente agrega un producto con modifier groups.
 * Permite seleccionar guarniciones, extras, opciones, etc.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import type { MenuItem, ModifierGroup, ModifierOption, SelectedModifier } from '@/lib/types';
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

const t = (key: string, lang: 'es' | 'en') => {
  const translations: Record<string, Record<string, string>> = {
    'title': { es: 'Personaliza tu pedido', en: 'Customize your order' },
    'optional': { es: 'Opcional', en: 'Optional' },
    'required': { es: 'Obligatorio', en: 'Required' },
    'choose_up_to': { es: 'Elige hasta', en: 'Choose up to' },
    'choose_min': { es: 'Elige al menos', en: 'Choose at least' },
    'included': { es: 'Incluido', en: 'Included' },
    'add_to_cart': { es: 'Agregar al carrito', en: 'Add to cart' },
    'cancel': { es: 'Cancelar', en: 'Cancel' },
    'select_required': { es: 'Debes seleccionar al menos', en: 'You must select at least' },
    'option_in': { es: 'opción en', en: 'option in' },
    'options_in': { es: 'opciones en', en: 'options in' },
    'max_reached': { es: 'Máximo alcanzado para', en: 'Maximum reached for' },
  };
  return translations[key]?.[lang] ?? translations[key]?.['es'] ?? key;
};

export default function ModifierSelector({ item, theme, onConfirm, onCancel, lang = 'es' }: ModifierSelectorProps) {
  const [groups, setGroups] = useState<ModifierGroupWithOptions[]>([]);
  const [loading, setLoading] = useState(true);
  // Map: group_id -> selected option IDs
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const fetchModifiers = async () => {
      setLoading(true);
      try {
        // Get assigned groups for this product
        const { data: assignments } = await supabase
          .from('product_modifier_groups')
          .select('group_id, sort_order')
          .eq('product_id', item.id)
          .order('sort_order');

        if (!assignments || assignments.length === 0) {
          // No modifiers — confirm immediately with empty selections
          onConfirm([], 0);
          return;
        }

        const groupIds = assignments.map((a: any) => a.group_id);

        // Get groups with options
        const { data: groupsData } = await supabase
          .from('modifier_groups')
          .select('*, options:modifier_options(*)')
          .in('id', groupIds);

        if (!groupsData) { onConfirm([], 0); return; }

        // Sort by assignment order
        const sorted = groupIds
          .map((gid: string) => groupsData.find((g: any) => g.id === gid))
          .filter(Boolean)
          .map((g: any) => ({
            ...g,
            options: (g.options || [])
              .filter((o: ModifierOption) => o.is_available)
              .sort((a: ModifierOption, b: ModifierOption) => a.sort_order - b.sort_order),
          }));

        setGroups(sorted);

        // Pre-select first option for required groups with min >= 1
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
        // Deselect
        return { ...prev, [group.id]: current.filter(id => id !== optionId) };
      }
      // Select — check max
      if (current.length >= group.max_selections) {
        if (group.max_selections === 1) {
          // Radio behavior: replace
          return { ...prev, [group.id]: [optionId] };
        }
        toast.error(`${t('max_reached', lang)} "${group.name}" (máx ${group.max_selections})`);
        return prev;
      }
      return { ...prev, [group.id]: [...current, optionId] };
    });
  };

  const handleConfirm = () => {
    // Validate required groups
    for (const group of groups) {
      const selected = selections[group.id] || [];
      if (selected.length < group.min_selections) {
        const needed = group.min_selections - selected.length;
        toast.error(`${t('select_required', lang)} ${needed} ${needed === 1 ? t('option_in', lang) : t('options_in', lang)} "${group.name}"`);
        return;
      }
    }

    // Build SelectedModifier array
    const selectedModifiers: SelectedModifier[] = [];
    let modifiersTotal = 0;

    groups.forEach(group => {
      const selectedIds = selections[group.id] || [];
      selectedIds.forEach(optId => {
        const opt = group.options.find(o => o.id === optId);
        if (opt) {
          selectedModifiers.push({
            group_id: group.id,
            group_name: group.name,
            option_id: opt.id,
            option_name: opt.name,
            price_adjustment: opt.price_adjustment,
          });
          modifiersTotal += opt.price_adjustment;
        }
      });
    });

    onConfirm(selectedModifiers, modifiersTotal);
  };

  // Calculate extra cost from current selections
  const currentExtra = groups.reduce((total, group) => {
    const selectedIds = selections[group.id] || [];
    return total + selectedIds.reduce((sum, optId) => {
      const opt = group.options.find(o => o.id === optId);
      return sum + (opt?.price_adjustment ?? 0);
    }, 0);
  }, 0);

  const totalPrice = item.price + currentExtra;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      >
        <motion.div
          className="w-full sm:max-w-md bg-slate-900 rounded-t-3xl sm:rounded-3xl overflow-hidden"
          style={{ maxHeight: '90vh', border: `1px solid ${theme.primary_color}30` }}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h2 className="text-base font-black text-white">{t('title', lang)}</h2>
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">{item.name}</p>
            </div>
            <button onClick={onCancel}
              className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto px-5 pb-2" style={{ maxHeight: 'calc(90vh - 160px)' }}>
            <div className="space-y-5">
              {groups.map(group => {
                const selectedIds = selections[group.id] || [];
                const isComplete = selectedIds.length >= group.min_selections;
                const isMaxed = selectedIds.length >= group.max_selections;

                return (
                  <div key={group.id}>
                    {/* Group header */}
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-bold text-white">{group.name}</span>
                        {group.min_selections > 0 && !isComplete && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full font-bold">
                            {t('required', lang)}
                          </span>
                        )}
                        {group.min_selections === 0 && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded-full">
                            {t('optional', lang)}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {selectedIds.length}/{group.max_selections}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-2">
                      {group.max_selections === 1
                        ? lang === 'es' ? 'Elige 1 opción' : 'Choose 1 option'
                        : `${t('choose_up_to', lang)} ${group.max_selections}`}
                      {group.min_selections > 0 && ` · ${t('choose_min', lang)} ${group.min_selections}`}
                    </p>

                    {/* Options */}
                    <div className="space-y-1.5">
                      {group.options.map(opt => {
                        const isSelected = selectedIds.includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            onClick={() => toggleOption(group, opt.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all border"
                            style={{
                              backgroundColor: isSelected ? `${theme.primary_color}15` : '#0f172a',
                              borderColor: isSelected ? `${theme.primary_color}60` : '#334155',
                            }}
                          >
                            {/* Checkbox / Radio */}
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                              style={{
                                backgroundColor: isSelected ? theme.primary_color : 'transparent',
                                border: `2px solid ${isSelected ? theme.primary_color : '#475569'}`,
                              }}
                            >
                              {isSelected && <Check size={11} className="text-white" />}
                            </div>

                            {/* Name */}
                            <span className="flex-1 text-sm font-medium" style={{ color: isSelected ? '#fff' : '#CBD5E1' }}>
                              <span>{opt.name}</span>
                            </span>

                            {/* Price */}
                            {opt.price_adjustment > 0 ? (
                              <span className="text-xs font-bold" style={{ color: theme.primary_color }}>
                                <span>+{formatPrice(opt.price_adjustment)}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-green-400 font-medium">
                                <span>{t('included', lang)}</span>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-800">
            <button
              onClick={handleConfirm}
              className="w-full py-4 rounded-2xl font-black text-base transition-all active:scale-95 flex items-center justify-between px-5"
              style={{ backgroundColor: theme.primary_color, color: '#fff', boxShadow: `0 4px 20px ${theme.primary_color}40` }}
            >
              <span>{t('add_to_cart', lang)}</span>
              <div className="flex items-center gap-2">
                <span className="font-black">{formatPrice(totalPrice)}</span>
                {currentExtra > 0 && (
                  <span className="text-xs opacity-75">(+{formatPrice(currentExtra)})</span>
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
