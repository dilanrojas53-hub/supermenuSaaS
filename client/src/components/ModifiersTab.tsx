/**
 * V22.1 — ModifiersTab
 * Panel admin para gestionar Modifier Groups con pricing_type y price_delta.
 * Soporta: included, free, extra, discounted por opción.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Tenant, MenuItem, ModifierGroup, ModifierOption, ModifierPricingType } from '@/lib/types';
import { formatPrice } from '@/lib/types';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, Sliders, Check
} from 'lucide-react';

// ─── Helpers ───
const PRICING_TYPE_LABELS: Record<ModifierPricingType, { label: string; color: string }> = {
  included: { label: 'Incluido', color: 'text-green-400' },
  free:     { label: 'Gratis',   color: 'text-blue-400' },
  extra:    { label: 'Extra',    color: 'text-amber-400' },
  discounted: { label: 'Especial', color: 'text-purple-400' },
};

function getPriceLabel(opt: ModifierOption): string {
  if (opt.pricing_type === 'extra' || opt.pricing_type === 'discounted') {
    return `+${formatPrice(opt.price_delta)}`;
  }
  return '';
}

// ─── Types ───
interface ModifierGroupWithOptions extends ModifierGroup {
  options: ModifierOption[];
  assignedProducts?: string[];
}

interface ProductAssignment {
  product_id: string;
  group_id: string;
  sort_order: number;
}

// ─── ModifiersTab ───
export default function ModifiersTab({ tenant, items }: { tenant: Tenant; items: MenuItem[] }) {
  const [groups, setGroups] = useState<ModifierGroupWithOptions[]>([]);
  const [assignments, setAssignments] = useState<ProductAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // ─── Group form ───
  const [editingGroup, setEditingGroup] = useState<ModifierGroupWithOptions | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({
    name: '', min_selections: '0', max_selections: '1', is_required: false
  });

  // ─── Option form ───
  const [editingOption, setEditingOption] = useState<{ groupId: string; option: ModifierOption | null } | null>(null);
  const [optionForm, setOptionForm] = useState<{
    name: string;
    pricing_type: ModifierPricingType;
    price_delta: string;
    is_available: boolean;
  }>({ name: '', pricing_type: 'included', price_delta: '0', is_available: true });

  // ─── Fetch ───
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: groupsData, error: gErr } = await supabase
        .from('modifier_groups')
        .select('*, options:modifier_options(*)')
        .eq('tenant_id', tenant.id)
        .order('sort_order');
      if (gErr) throw gErr;

      const { data: assignData, error: aErr } = await supabase
        .from('product_modifier_groups')
        .select('product_id, group_id, sort_order');
      if (aErr) throw aErr;

      const groupsWithAssignments = (groupsData || []).map((g: any) => ({
        ...g,
        options: (g.options || []).sort((a: ModifierOption, b: ModifierOption) => a.sort_order - b.sort_order),
        assignedProducts: (assignData || [])
          .filter((a: ProductAssignment) => a.group_id === g.id)
          .map((a: ProductAssignment) => a.product_id),
      }));

      setGroups(groupsWithAssignments);
      setAssignments(assignData || []);
    } catch (err: any) {
      toast.error('Error al cargar modificadores: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [tenant.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Group CRUD ───
  const startCreateGroup = () => {
    setIsCreatingGroup(true);
    setEditingGroup(null);
    setGroupForm({ name: '', min_selections: '0', max_selections: '1', is_required: false });
  };

  const startEditGroup = (g: ModifierGroupWithOptions) => {
    setEditingGroup(g);
    setIsCreatingGroup(false);
    setGroupForm({
      name: g.name,
      min_selections: String(g.min_selections),
      max_selections: String(g.max_selections),
      is_required: g.is_required,
    });
  };

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) { toast.error('El nombre del grupo es obligatorio'); return; }
    const min = parseInt(groupForm.min_selections) || 0;
    const max = parseInt(groupForm.max_selections) || 1;
    if (max < min) { toast.error('El máximo debe ser mayor o igual al mínimo'); return; }

    const payload = {
      tenant_id: tenant.id,
      name: groupForm.name.trim(),
      min_selections: min,
      max_selections: max,
      is_required: groupForm.is_required,
      sort_order: editingGroup?.sort_order ?? groups.length,
      updated_at: new Date().toISOString(),
    };

    if (editingGroup) {
      const { error } = await supabase.from('modifier_groups').update(payload).eq('id', editingGroup.id);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Grupo actualizado');
    } else {
      const { error } = await supabase.from('modifier_groups').insert(payload);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Grupo creado');
    }
    setEditingGroup(null);
    setIsCreatingGroup(false);
    fetchData();
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('¿Eliminar este grupo y todas sus opciones?')) return;
    const { error } = await supabase.from('modifier_groups').delete().eq('id', groupId);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Grupo eliminado');
    fetchData();
  };

  // ─── Option CRUD ───
  const startCreateOption = (groupId: string) => {
    setEditingOption({ groupId, option: null });
    setOptionForm({ name: '', pricing_type: 'included', price_delta: '0', is_available: true });
  };

  const startEditOption = (groupId: string, option: ModifierOption) => {
    setEditingOption({ groupId, option });
    setOptionForm({
      name: option.name,
      pricing_type: option.pricing_type ?? 'included',
      price_delta: String(option.price_delta ?? 0),
      is_available: option.is_available,
    });
  };

  const handleSaveOption = async () => {
    if (!editingOption) return;
    if (!optionForm.name.trim()) { toast.error('El nombre de la opción es obligatorio'); return; }

    const group = groups.find(g => g.id === editingOption.groupId);
    const pricingType = optionForm.pricing_type;
    const priceDelta = (pricingType === 'extra' || pricingType === 'discounted')
      ? (parseInt(optionForm.price_delta) || 0)
      : 0;

    const payload = {
      group_id: editingOption.groupId,
      name: optionForm.name.trim(),
      pricing_type: pricingType,
      price_delta: priceDelta,
      is_available: optionForm.is_available,
      sort_order: editingOption.option?.sort_order ?? (group?.options.length ?? 0),
    };

    if (editingOption.option) {
      const { error } = await supabase.from('modifier_options').update(payload).eq('id', editingOption.option.id);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Opción actualizada');
    } else {
      const { error } = await supabase.from('modifier_options').insert(payload);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Opción agregada');
    }
    setEditingOption(null);
    fetchData();
  };

  const handleDeleteOption = async (optionId: string) => {
    if (!confirm('¿Eliminar esta opción?')) return;
    const { error } = await supabase.from('modifier_options').delete().eq('id', optionId);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Opción eliminada');
    fetchData();
  };

  // ─── Product Assignment ───
  const toggleProductAssignment = async (groupId: string, productId: string, isAssigned: boolean) => {
    if (isAssigned) {
      const { error } = await supabase
        .from('product_modifier_groups')
        .delete()
        .eq('group_id', groupId)
        .eq('product_id', productId);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Producto desasignado');
    } else {
      const currentCount = assignments.filter(a => a.group_id === groupId).length;
      const { error } = await supabase
        .from('product_modifier_groups')
        .insert({ group_id: groupId, product_id: productId, sort_order: currentCount });
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Producto asignado');
    }
    fetchData();
  };

  // ─── Render ───
  const isEditingGroup = editingGroup || isCreatingGroup;
  const showPriceDeltaField = optionForm.pricing_type === 'extra' || optionForm.pricing_type === 'discounted';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sliders size={20} className="text-amber-400" />
            <span>Modificadores</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Guarniciones, extras, toppings y opciones configurables por platillo</p>
        </div>
        <button onClick={startCreateGroup}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors">
          <Plus size={16} /><span>Nuevo grupo</span>
        </button>
      </div>

      {/* Group Form */}
      {isEditingGroup && (
        <div className="bg-slate-700/50 border border-amber-500/30 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4">{editingGroup ? 'Editar grupo' : 'Nuevo grupo de modificadores'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Nombre del grupo *</label>
              <input
                value={groupForm.name}
                onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                placeholder="Ej: Guarniciones, Salsas, Tipo de cocción..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Selección mínima</label>
              <input
                type="number" min="0"
                value={groupForm.min_selections}
                onChange={e => setGroupForm({ ...groupForm, min_selections: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Selección máxima</label>
              <input
                type="number" min="1"
                value={groupForm.max_selections}
                onChange={e => setGroupForm({ ...groupForm, max_selections: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button
                onClick={() => setGroupForm({ ...groupForm, is_required: !groupForm.is_required })}
                className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${groupForm.is_required ? 'bg-amber-500' : 'bg-slate-600'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${groupForm.is_required ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
              <span className="text-sm text-slate-300">Selección obligatoria (el cliente no puede omitir)</span>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSaveGroup}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition-colors">
              <Save size={14} /><span>Guardar</span>
            </button>
            <button onClick={() => { setEditingGroup(null); setIsCreatingGroup(false); }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-slate-300 rounded-xl text-sm hover:bg-slate-500 transition-colors">
              <X size={14} /><span>Cancelar</span>
            </button>
          </div>
        </div>
      )}

      {/* Groups List */}
      {groups.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Sliders size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin grupos de modificadores</p>
          <p className="text-sm mt-1">Crea tu primer grupo para agregar guarniciones, extras u opciones a tus platillos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <div key={group.id} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
              {/* Group Header */}
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
                  className="flex-1 flex items-center gap-3 text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <Sliders size={14} className="text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{group.name}</span>
                      {group.is_required && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full font-bold">Obligatorio</span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded-full">
                        {group.min_selections === 0 ? 'Opcional' : `Mín ${group.min_selections}`} · Máx {group.max_selections}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {group.options.length} opción{group.options.length !== 1 ? 'es' : ''} · {group.assignedProducts?.length ?? 0} platillo{(group.assignedProducts?.length ?? 0) !== 1 ? 's' : ''} asignado{(group.assignedProducts?.length ?? 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="ml-auto text-slate-500">
                    {expandedGroup === group.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>
                <button onClick={() => startEditGroup(group)}
                  className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDeleteGroup(group.id)}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Expanded Content */}
              {expandedGroup === group.id && (
                <div className="border-t border-slate-700/50 p-4 space-y-4">
                  {/* Options */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Opciones</h4>
                      <button onClick={() => startCreateOption(group.id)}
                        className="flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-amber-500/20 hover:text-amber-400 transition-colors">
                        <Plus size={11} /><span>Agregar opción</span>
                      </button>
                    </div>

                    {/* Option Form */}
                    {editingOption?.groupId === group.id && (
                      <div className="bg-slate-700/50 border border-slate-600/50 rounded-xl p-3 mb-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label className="block text-[11px] text-slate-400 mb-1">Nombre *</label>
                            <input
                              value={optionForm.name}
                              onChange={e => setOptionForm({ ...optionForm, name: e.target.value })}
                              placeholder="Ej: Papas fritas, Arroz, Vegetales..."
                              className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs focus:ring-1 focus:ring-amber-500/50 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Tipo de precio</label>
                            <select
                              value={optionForm.pricing_type}
                              onChange={e => setOptionForm({ ...optionForm, pricing_type: e.target.value as ModifierPricingType, price_delta: '0' })}
                              className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs focus:ring-1 focus:ring-amber-500/50 focus:outline-none"
                            >
                              <option value="included">Incluido en el plato</option>
                              <option value="free">Gratis (opcional)</option>
                              <option value="extra">Extra (costo adicional)</option>
                              <option value="discounted">Precio especial</option>
                            </select>
                          </div>
                          {showPriceDeltaField && (
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">
                                {optionForm.pricing_type === 'extra' ? 'Precio adicional (₡)' : 'Precio especial (₡)'}
                              </label>
                              <input
                                type="number" min="0"
                                value={optionForm.price_delta}
                                onChange={e => setOptionForm({ ...optionForm, price_delta: e.target.value })}
                                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs focus:ring-1 focus:ring-amber-500/50 focus:outline-none"
                              />
                            </div>
                          )}
                          <div className={showPriceDeltaField ? '' : 'flex items-end'}>
                            <label className="flex items-center gap-2 cursor-pointer mt-1">
                              <div
                                onClick={() => setOptionForm({ ...optionForm, is_available: !optionForm.is_available })}
                                className={`w-8 h-5 rounded-full transition-colors relative ${optionForm.is_available ? 'bg-green-500' : 'bg-slate-600'}`}
                              >
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${optionForm.is_available ? 'left-[14px]' : 'left-0.5'}`} />
                              </div>
                              <span className="text-[11px] text-slate-400">Disponible</span>
                            </label>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={handleSaveOption}
                            className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors">
                            <Save size={11} /><span>Guardar</span>
                          </button>
                          <button onClick={() => setEditingOption(null)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-600 text-slate-300 rounded-lg text-xs hover:bg-slate-500 transition-colors">
                            <X size={11} /><span>Cancelar</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Options List */}
                    {group.options.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-2">Sin opciones. Agrega la primera opción.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {group.options.map(opt => {
                          const pt = PRICING_TYPE_LABELS[opt.pricing_type ?? 'included'];
                          const priceLabel = getPriceLabel(opt);
                          return (
                            <div key={opt.id} className="flex items-center gap-2 px-3 py-2 bg-slate-700/40 rounded-xl">
                              <div className="flex-1 min-w-0">
                                <span className="text-sm text-white font-medium">{opt.name}</span>
                                <span className={`ml-2 text-xs font-semibold ${pt.color}`}>
                                  {pt.label}{priceLabel ? ` ${priceLabel}` : ''}
                                </span>
                                {!opt.is_available && (
                                  <span className="ml-2 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">No disponible</span>
                                )}
                              </div>
                              <button onClick={() => startEditOption(group.id, opt)}
                                className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => handleDeleteOption(opt.id)}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Product Assignment */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Platillos asignados</h4>
                    <p className="text-[11px] text-slate-500 mb-2">Selecciona los platillos que deben mostrar este grupo de modificadores:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {items.map(item => {
                        const isAssigned = group.assignedProducts?.includes(item.id) ?? false;
                        return (
                          <button
                            key={item.id}
                            onClick={() => toggleProductAssignment(group.id, item.id, isAssigned)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left text-xs transition-all border ${
                              isAssigned
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-slate-700/30 border-slate-600/30 text-slate-400 hover:border-slate-500/50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${isAssigned ? 'bg-amber-500' : 'bg-slate-600'}`}>
                              {isAssigned && <Check size={10} className="text-white" />}
                            </div>
                            <span className="truncate font-medium">{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
