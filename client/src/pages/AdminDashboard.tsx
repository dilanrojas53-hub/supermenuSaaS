/*
 * AdminDashboard v2: Panel del propietario con:
 * - Menú CRUD con ImageUpload y toggle de disponibilidad
 * - Categorías CRUD
 * - Configuración con switch Abierto/Cerrado y upload de logo
 * - Tema con Color Picker visual
 * - Pedidos en Vivo (KDS) con cambio de estado
 * - Analítica básica (total vendido, platillo estrella, visitas)
 * - Botón "Descargar mi QR"
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { formatPrice, ORDER_STATUS_CONFIG, ORDER_STATUS_ACTIONS, getPlanFeatures } from '@/lib/types';
import { useKitchenBell } from '@/hooks/useKitchenBell';
import type { Tenant, ThemeSettings, Category, MenuItem, Order, ModifierGroup, ModifierOption } from '@/lib/types';
import ImageUpload from '@/components/ImageUpload';
import ModifiersTab from '@/components/ModifiersTab';
import DeliveryDispatchPanel from '@/components/DeliveryDispatchPanel';
import DeliveryHistoryPanel from '@/components/DeliveryHistoryPanel';
import DeliveryZonesPanel from '@/components/DeliveryZonesPanel';
import DeliveryOpsPanel from '@/components/DeliveryOpsPanel';
import { DeliveryAnalyticsCard } from '@/components/DeliveryAnalyticsCard';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { KeyRound } from 'lucide-react';
import {
  LogOut, Settings, Palette, UtensilsCrossed, Tag, Plus, Pencil, Trash2,
  Save, X, Eye, GripVertical, Star, Zap,
  LayoutGrid, List, ExternalLink, ClipboardList, BarChart3, QrCode,
  Power, PowerOff, ToggleLeft, ToggleRight, Download, RefreshCw, Clock,
  TrendingUp, DollarSign, CheckCircle2, ChefHat, Timer, Scissors, MessageCircle,
  Trophy, AlertCircle, Users, MapPin, Navigation, Bike, UserCheck, ShieldCheck, UserPlus, Lock, Unlock, Link2, Copy, Check, Sliders, ChevronDown, ChevronUp
} from 'lucide-react';
import { waPhone, buildWhatsAppUrl } from '@/lib/phone';
import { useUITheme } from '@/contexts/UIThemeContext';
import { themes, type ThemeKey, RESTAURANT_THEMES, type RestaurantThemePreset, getThemeCategories, getThemePreset, applyRestaurantTheme, isColorDark } from '@/lib/themes';
import { toast } from 'sonner';

// ─── Toggle Switch ───
function ToggleSwitch({ checked, onChange, label, colorOn = '#22C55E', colorOff = '#EF4444' }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; colorOn?: string; colorOff?: string;
}) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-2 group">
      <div className="relative w-11 h-6 rounded-full transition-colors" style={{ backgroundColor: checked ? colorOn : colorOff }}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </div>
      {label && <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{label}</span>}
    </button>
  );
}

// ─── Menu Tab ───
function MenuTab({ tenant, categories, items, onRefresh }: {
  tenant: Tenant; categories: Category[]; items: MenuItem[]; onRefresh: () => void;
}) {
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // V22.1: Modifier groups assigned to the item being edited
  const [itemModifierGroups, setItemModifierGroups] = useState<{ id: string; name: string }[]>([]);
  const [allModifierGroups, setAllModifierGroups] = useState<{ id: string; name: string }[]>([]);
  const [loadingModifiers, setLoadingModifiers] = useState(false);
  // V22.2: Options per assigned group (for inline price editing)
  const [groupOptions, setGroupOptions] = useState<Record<string, { id: string; name: string; pricing_type: string; price_delta: number }[]>>({});
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const fetchGroupOptions = useCallback(async (groupId: string) => {
    const { data } = await supabase
      .from('modifier_options')
      .select('id, name, pricing_type, price_delta')
      .eq('group_id', groupId)
      .order('sort_order');
    setGroupOptions(prev => ({ ...prev, [groupId]: data || [] }));
  }, []);

  const updateOptionPrice = async (optionId: string, groupId: string, pricing_type: string, price_delta: number) => {
    await supabase.from('modifier_options').update({ pricing_type, price_delta }).eq('id', optionId);
    setGroupOptions(prev => ({
      ...prev,
      [groupId]: (prev[groupId] || []).map(o => o.id === optionId ? { ...o, pricing_type, price_delta } : o)
    }));
    toast.success('Precio actualizado');
  };

  const fetchItemModifiers = useCallback(async (itemId: string) => {
    setLoadingModifiers(true);
    try {
      const [{ data: allGroups }, { data: assigned }] = await Promise.all([
        supabase.from('modifier_groups').select('id, name').eq('tenant_id', tenant.id).order('sort_order'),
        supabase.from('product_modifier_groups').select('group_id').eq('product_id', itemId),
      ]);
      setAllModifierGroups(allGroups || []);
      const assignedIds = (assigned || []).map((a: any) => a.group_id);
      const assigned_groups = (allGroups || []).filter((g: any) => assignedIds.includes(g.id));
      setItemModifierGroups(assigned_groups);
      // Pre-fetch options for assigned groups
      assigned_groups.forEach((g: any) => fetchGroupOptions(g.id));
    } catch { /* ignore */ } finally { setLoadingModifiers(false); }
  }, [tenant.id, fetchGroupOptions]);

  const toggleItemModifier = async (groupId: string, isAssigned: boolean) => {
    const itemId = editingItem?.id;
    if (!itemId) return;
    if (isAssigned) {
      await supabase.from('product_modifier_groups').delete().eq('product_id', itemId).eq('group_id', groupId);
      setItemModifierGroups(prev => prev.filter(g => g.id !== groupId));
      if (expandedGroup === groupId) setExpandedGroup(null);
    } else {
      const sortOrder = itemModifierGroups.length;
      await supabase.from('product_modifier_groups').insert({ product_id: itemId, group_id: groupId, sort_order: sortOrder });
      const group = allModifierGroups.find(g => g.id === groupId);
      if (group) {
        setItemModifierGroups(prev => [...prev, group]);
        fetchGroupOptions(groupId);
        setExpandedGroup(groupId); // auto-expand newly assigned group
      }
    }
  };
  const [form, setForm] = useState({
    name: '', description: '', price: '', category_id: '', image_url: '',
    is_available: true, is_featured: false, badge: '' as string,
    upsell_item_id: '', upsell_text: '', sort_order: '0'
  });

  const resetForm = () => {
    setForm({ name: '', description: '', price: '', category_id: categories[0]?.id || '',
      image_url: '', is_available: true, is_featured: false, badge: '',
      upsell_item_id: '', upsell_text: '', sort_order: '0' });
  };

  const startEdit = (item: MenuItem) => {
    try {
      console.log('[V16.5] startEdit fired for item:', item.id, item.name);
      toast.info('Abriendo editor…', { duration: 800 });
    } catch { /* ignore toast errors */ }
    setEditingItem(item);
    setIsCreating(false);
    setForm({
      name: item.name, description: item.description || '', price: String(item.price),
      category_id: item.category_id, image_url: item.image_url || '',
      is_available: item.is_available, is_featured: item.is_featured,
      badge: item.badge || '', upsell_item_id: item.upsell_item_id || '',
      upsell_text: item.upsell_text || '', sort_order: String(item.sort_order)
    });
    // V22.1: Load modifier groups for this item
    fetchItemModifiers(item.id);
  };

  const startCreate = () => { setIsCreating(true); setEditingItem(null); resetForm(); };

  const handleSave = async () => {
    if (!form.name || !form.price || !form.category_id) {
      toast.error('Nombre, precio y categoría son obligatorios');
      return;
    }
    const payload = {
      tenant_id: tenant.id, name: form.name, description: form.description || null,
      price: parseFloat(form.price), category_id: form.category_id,
      image_url: form.image_url || null, is_available: form.is_available,
      is_featured: form.is_featured, badge: form.badge || null,
      upsell_item_id: form.upsell_item_id || null, upsell_text: form.upsell_text || null,
      sort_order: parseInt(form.sort_order) || 0, updated_at: new Date().toISOString()
    };
    if (editingItem) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', editingItem.id);
      if (error) { toast.error('Error al actualizar: ' + error.message); return; }
      toast.success('Platillo actualizado');
    } else {
      const { error } = await supabase.from('menu_items').insert(payload);
      if (error) { toast.error('Error al crear: ' + error.message); return; }
      toast.success('Platillo creado');
    }
    setEditingItem(null); setIsCreating(false); onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este platillo?')) return;
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Platillo eliminado'); onRefresh();
  };

  const handleToggleAvailable = async (item: MenuItem) => {
    // V16.5: try/catch para nunca tener un fallo silencioso
    try {
      console.log('[V16.5] handleToggleAvailable fired for item:', item.id, item.name);
      toast.info('Actualizando disponibilidad…', { duration: 1200 });
      const { error } = await supabase.from('menu_items').update({
        is_available: !item.is_available, updated_at: new Date().toISOString()
      }).eq('id', item.id);
      if (error) throw error;
      toast.success(item.is_available ? 'Marcado como agotado' : 'Marcado como disponible');
      onRefresh();
    } catch (err: any) {
      console.error('[V16.5] handleToggleAvailable error:', err);
      toast.error('Error al cambiar disponibilidad: ' + (err?.message || String(err)));
    }
  };

  const isEditing = editingItem || isCreating;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Platillos ({items.length})</h2>
        <button onClick={startCreate}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors">
          <Plus size={16} /> Nuevo platillo
        </button>
      </div>

      {isEditing && (
        <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-6 mb-6">
          <h3 className="text-white font-bold mb-4">{editingItem ? 'Editar platillo' : 'Nuevo platillo'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Precio (₡) *</label>
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Descripción</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none resize-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Categoría *</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Badge</label>
              <select value={form.badge} onChange={e => setForm({ ...form, badge: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none">
                <option value="">Sin badge</option>
                <option value="mas_pedido">Más pedido</option>
                <option value="se_agota_rapido">Se agota rápido</option>
                <option value="nuevo">Nuevo</option>
                <option value="chef_recomienda">Chef recomienda</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Orden</label>
              <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Upsell (platillo sugerido)</label>
              <select value={form.upsell_item_id} onChange={e => setForm({ ...form, upsell_item_id: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none">
                <option value="">Sin upsell</option>
                {items.filter(i => i.id !== editingItem?.id).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Texto de upsell</label>
              <input value={form.upsell_text} onChange={e => setForm({ ...form, upsell_text: e.target.value })}
                placeholder="Agrega unas papas..." className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            {/* Image Upload */}
            <div className="md:col-span-2">
              <ImageUpload
                bucket="menu-images"
                currentUrl={form.image_url}
                onUpload={(url) => setForm({ ...form, image_url: url })}
                label="Imagen del platillo"
                previewSize="md"
              />
            </div>
            <div className="flex items-center gap-6">
              <ToggleSwitch checked={form.is_available} onChange={(v) => setForm({ ...form, is_available: v })} label="Disponible" />
              <ToggleSwitch checked={form.is_featured} onChange={(v) => setForm({ ...form, is_featured: v })} label="Platillo de la semana" colorOn="#F59E0B" colorOff="#64748B" />
            </div>
          </div>
          {/* V22.2: Modifier Groups assignment with inline option price editor */}
          {editingItem && (
            <div className="mt-5 pt-5 border-t border-slate-600/50">
              <div className="flex items-center gap-2 mb-2">
                <Sliders size={14} className="text-amber-400" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Grupos de modificadores</span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">Activa los grupos y configura el precio de cada opción directamente aquí.</p>
              {loadingModifiers ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-4 h-4 border border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span>Cargando grupos...</span>
                </div>
              ) : allModifierGroups.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Sin grupos creados. Ve a la pestaña <strong className="text-amber-400">Modificadores</strong> para crear grupos.</p>
              ) : (
                <div className="space-y-2">
                  {allModifierGroups.map(group => {
                    const isAssigned = itemModifierGroups.some(g => g.id === group.id);
                    const isExpanded = expandedGroup === group.id;
                    const options = groupOptions[group.id] || [];
                    return (
                      <div key={group.id} className={`rounded-xl border transition-all ${
                        isAssigned ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-700/50 bg-slate-800/30'
                      }`}>
                        {/* Group header row */}
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => toggleItemModifier(group.id, isAssigned)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              isAssigned ? 'bg-amber-500 border-amber-500' : 'border-slate-500 bg-transparent'
                            }`}
                          >
                            {isAssigned && <Check size={11} className="text-white" />}
                          </button>
                          <span className={`text-sm font-medium flex-1 ${
                            isAssigned ? 'text-amber-300' : 'text-slate-400'
                          }`}>{group.name}</span>
                          {isAssigned && options.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-amber-400 transition-colors"
                            >
                              <span>{options.length} opciones</span>
                              <ChevronDown size={12} className={`transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`} />
                            </button>
                          )}
                        </div>
                        {/* Inline option price editor */}
                        {isAssigned && isExpanded && (
                          <div className="px-3 pb-3 space-y-2 border-t border-amber-500/20 pt-2">
                            <p className="text-[10px] text-slate-500 mb-1">Configura el precio de cada opción:</p>
                            {options.map(opt => (
                              <div key={opt.id} className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-2 py-1.5">
                                <span className="text-xs text-slate-300 flex-1 min-w-0 truncate">{opt.name}</span>
                                <select
                                  value={opt.pricing_type}
                                  onChange={e => {
                                    const newType = e.target.value;
                                    const newDelta = (newType === 'included' || newType === 'free') ? 0 : opt.price_delta;
                                    updateOptionPrice(opt.id, group.id, newType, newDelta);
                                  }}
                                  className="text-[11px] bg-slate-700 border border-slate-600 rounded-lg text-white px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                >
                                  <option value="included">Incluido</option>
                                  <option value="free">Gratis</option>
                                  <option value="extra">Extra (+₡)</option>
                                  <option value="discounted">Especial (+₡)</option>
                                </select>
                                {(opt.pricing_type === 'extra' || opt.pricing_type === 'discounted') && (
                                  <input
                                    type="number"
                                    value={opt.price_delta}
                                    min={0}
                                    onChange={e => {
                                      const val = parseInt(e.target.value) || 0;
                                      setGroupOptions(prev => ({
                                        ...prev,
                                        [group.id]: (prev[group.id] || []).map(o => o.id === opt.id ? { ...o, price_delta: val } : o)
                                      }));
                                    }}
                                    onBlur={e => updateOptionPrice(opt.id, group.id, opt.pricing_type, parseInt(e.target.value) || 0)}
                                    className="w-20 text-[11px] bg-slate-700 border border-slate-600 rounded-lg text-white px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                    placeholder="0"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3 mt-5">
            <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors">
              <Save size={16} /> Guardar
            </button>
            <button onClick={() => { setEditingItem(null); setIsCreating(false); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-600 text-white rounded-xl text-sm font-medium hover:bg-slate-500 transition-colors">
              <X size={16} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="space-y-2">
        {categories.map(cat => {
          const catItems = items.filter(i => i.category_id === cat.id);
          if (catItems.length === 0) return null;
          return (
            <div key={cat.id} className="mb-4">
              <h3 className="text-sm font-semibold text-amber-400 mb-2 px-1">{cat.name}</h3>
              {catItems.map(item => (
                <div key={item.id} className={`flex items-center gap-3 bg-slate-800/50 border rounded-xl p-3 mb-2 group hover:border-slate-600 transition-colors ${!item.is_available ? 'opacity-50 border-red-500/20' : 'border-slate-700/50'}`}>
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <UtensilsCrossed size={16} className="text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-white truncate min-w-0 max-w-[140px] sm:max-w-[200px]">{item.name}</span>
                      {item.badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">{item.badge}</span>}
                      {item.is_featured && <Star size={12} className="text-amber-400" />}
                    </div>
                    <span className="text-sm text-amber-400 font-semibold">{formatPrice(item.price)}</span>
                  </div>
                  {/* Quick toggle — V16.5: siempre visible, z-50, pointer-events-auto */}
                  <div className="relative z-50 pointer-events-auto shrink-0">
                    <ToggleSwitch checked={item.is_available} onChange={() => handleToggleAvailable(item)} />
                  </div>
                  {/* Botones Editar/Eliminar — V16.5: siempre visibles (eliminado opacity-0/group-hover que bloqueaba en pantallas táctiles) */}
                  <div className="relative z-50 pointer-events-auto shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => startEdit(item)}
                      className="p-2 hover:bg-slate-700 active:bg-slate-600 rounded-lg transition-colors"
                      title="Editar platillo"
                    >
                      <Pencil size={14} className="text-slate-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 hover:bg-red-500/10 active:bg-red-500/20 rounded-lg transition-colors"
                      title="Eliminar platillo"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Categories Tab ───
function CategoriesTab({ tenant, categories, onRefresh }: {
  tenant: Tenant; categories: Category[]; onRefresh: () => void;
}) {
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', sort_order: '0', is_active: true });

  const startEdit = (cat: Category) => {
    setEditingCat(cat); setIsCreating(false);
    setForm({ name: cat.name, description: cat.description || '', sort_order: String(cat.sort_order), is_active: cat.is_active });
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('El nombre es obligatorio'); return; }
    const payload = {
      tenant_id: tenant.id, name: form.name, description: form.description || null,
      sort_order: parseInt(form.sort_order) || 0, is_active: form.is_active,
      updated_at: new Date().toISOString()
    };
    if (editingCat) {
      const { error } = await supabase.from('categories').update(payload).eq('id', editingCat.id);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Categoría actualizada');
    } else {
      const { error } = await supabase.from('categories').insert(payload);
      if (error) { toast.error('Error: ' + error.message); return; }
      toast.success('Categoría creada');
    }
    setEditingCat(null); setIsCreating(false); onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta categoría y todos sus platillos?')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Categoría eliminada'); onRefresh();
  };

  const isEditing = editingCat || isCreating;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">Categorías ({categories.length})</h2>
        <button onClick={() => { setIsCreating(true); setEditingCat(null); setForm({ name: '', description: '', sort_order: '0', is_active: true }); }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors">
          <Plus size={16} /> Nueva categoría
        </button>
      </div>

      {isEditing && (
        <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Orden</label>
              <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Descripción</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <ToggleSwitch checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Activa" />
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600">
              <Save size={16} /> Guardar
            </button>
            <button onClick={() => { setEditingCat(null); setIsCreating(false); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-600 text-white rounded-xl text-sm font-medium hover:bg-slate-500">
              <X size={16} /> Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 group hover:border-slate-600 transition-colors">
            <GripVertical size={16} className="text-slate-600" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{cat.name}</span>
                {!cat.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">Inactiva</span>}
              </div>
              {cat.description && <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>}
            </div>
            <span className="text-xs text-slate-500">Orden: {cat.sort_order}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => startEdit(cat)} className="p-2 hover:bg-slate-700 rounded-lg"><Pencil size={14} className="text-slate-400" /></button>
              <button onClick={() => handleDelete(cat.id)} className="p-2 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} className="text-red-400" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Delivery Tab with History + Ops (Fases 2-5) ───
function DeliveryTabWithHistory({ tenant }: { tenant: Tenant }) {
  const [view, setView] = useState<'ops' | 'dispatch' | 'history'>('ops');
  const TABS = [
    { key: 'ops' as const,      label: '🟢 Operaciones' },
    { key: 'dispatch' as const, label: '🛵 Despacho' },
    { key: 'history' as const,  label: '📋 Historial' },
  ];
  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              view === t.key
                ? 'bg-blue-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {view === 'ops'      && <DeliveryOpsPanel      tenant={tenant} />}
      {view === 'dispatch' && <DeliveryDispatchPanel  tenant={tenant} />}
      {view === 'history'  && <DeliveryHistoryPanel   tenant={tenant} />}
    </div>
  );
}

// ─── Settings Tab ───
function SettingsTab({ tenant, onRefresh }: { tenant: Tenant; onRefresh: () => void }) {
  const [form, setForm] = useState({
    name: tenant.name, description: tenant.description || '', logo_url: tenant.logo_url || '',
    phone: tenant.phone || '', whatsapp_number: tenant.whatsapp_number || '',
    address: tenant.address || '', sinpe_number: tenant.sinpe_number || '',
    sinpe_owner: tenant.sinpe_owner || '', is_open: tenant.is_open ?? true
  });
  const [saving, setSaving] = useState(false);

  const handleToggleOpen = async () => {
    const newVal = !form.is_open;
    setForm({ ...form, is_open: newVal });
    const { error } = await supabase.from('tenants').update({ is_open: newVal, updated_at: new Date().toISOString() }).eq('id', tenant.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(newVal ? '¡Restaurante abierto!' : 'Restaurante cerrado');
    onRefresh();
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('tenants').update({
      name: form.name, description: form.description || null, logo_url: form.logo_url || null,
      phone: form.phone || null, whatsapp_number: form.whatsapp_number || null,
      address: form.address || null, sinpe_number: form.sinpe_number || null,
      sinpe_owner: form.sinpe_owner || null, is_open: form.is_open,
      updated_at: new Date().toISOString()
    }).eq('id', tenant.id);
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Configuración guardada'); onRefresh();
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-6">Configuración del Restaurante</h2>

      {/* Open/Closed toggle - prominent */}
      <div className={`rounded-2xl p-5 mb-6 border-2 transition-colors ${form.is_open ? 'bg-green-500/5 border-green-500/30' : 'bg-red-500/5 border-red-500/30'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {form.is_open ? <Power size={24} className="text-green-400" /> : <PowerOff size={24} className="text-red-400" />}
            <div>
              <h3 className="text-base font-bold text-white">{form.is_open ? 'Restaurante Abierto' : 'Restaurante Cerrado'}</h3>
              <p className="text-xs text-slate-400">{form.is_open ? 'Los clientes pueden hacer pedidos' : 'Los pedidos están desactivados'}</p>
            </div>
          </div>
          <ToggleSwitch checked={form.is_open} onChange={handleToggleOpen} colorOn="#22C55E" colorOff="#EF4444" />
        </div>
      </div>

      <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre del restaurante *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div>
            <ImageUpload bucket="logos" currentUrl={form.logo_url} onUpload={(url) => setForm({ ...form, logo_url: url })} label="Logo del restaurante" previewSize="sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Descripción</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Teléfono</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">WhatsApp (con código de país)</label>
            <input value={form.whatsapp_number} onChange={e => setForm({ ...form, whatsapp_number: e.target.value })}
              placeholder="50688881111" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Dirección</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div className="md:col-span-2 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center"><Zap size={12} className="text-green-400" /></div>
              <h3 className="text-sm font-bold text-white">SINPE Móvil</h3>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Número SINPE</label>
            <input value={form.sinpe_number} onChange={e => setForm({ ...form, sinpe_number: e.target.value })}
              placeholder="8888-1111" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Titular SINPE</label>
            <input value={form.sinpe_owner} onChange={e => setForm({ ...form, sinpe_owner: e.target.value })}
              placeholder="Nombre del titular" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors mt-6 disabled:opacity-50">
          <Save size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <ChangePasswordCard />

      {/* V26.0: Modo Operativo */}
      <OperativeModeCard tenant={tenant} onRefresh={onRefresh} />

      {/* Fase 1: Configuración de Delivery */}
      <DeliverySettingsCard tenant={tenant} />
    </div>
  );
}

// ─── Operative Mode Card — V26.0 ───
function OperativeModeCard({ tenant, onRefresh }: { tenant: Tenant; onRefresh: () => void }) {
  const [mode, setMode] = useState<'shared' | 'exclusive'>((tenant as any).assignment_mode || 'shared');
  const [timeout, setTimeout_] = useState<number>((tenant as any).claim_timeout_minutes || 30);
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('tenants').update({ assignment_mode: mode, claim_timeout_minutes: timeout }).eq('id', tenant.id);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Modo operativo guardado'); onRefresh(); }
    setSaving(false);
  };
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Users size={16} className="text-blue-400" />
        <h3 className="text-sm font-black text-white">Modo Operativo del Equipo</h3>
      </div>
      <p className="text-xs text-slate-400">Define cómo se asignan los pedidos entre los meseros.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { key: 'shared', label: 'Operación Compartida', desc: 'Cualquier mesero puede tomar y atender cualquier pedido. Ideal para equipos pequeños.', icon: '👥' },
          { key: 'exclusive', label: 'Mesa Asignada', desc: 'Cada mesero tiene sus mesas. Solo él ve y gestiona los pedidos de sus mesas.', icon: '📍' },
        ].map(opt => (
          <button key={opt.key} onClick={() => setMode(opt.key as any)}
            className="text-left p-4 rounded-xl border-2 transition-all"
            style={mode === opt.key ? { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' } : { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{opt.icon}</span>
              <span className="text-sm font-black" style={{ color: mode === opt.key ? '#F59E0B' : '#e2e8f0' }}>{opt.label}</span>
              {mode === opt.key && <span className="ml-auto text-[10px] font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">Activo</span>}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">{opt.desc}</p>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs text-slate-400 flex-shrink-0">Timeout de claim (minutos):</label>
        <input type="number" min={5} max={120} value={timeout} onChange={e => setTimeout_(Number(e.target.value))}
          className="w-20 px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
        <span className="text-[11px] text-slate-500">Si un pedido no se atiende en este tiempo, se libera automáticamente</span>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: '#000' }}>
        <Save size={14} /> {saving ? 'Guardando...' : 'Guardar modo operativo'}
      </button>
    </div>
  );
}

// ─── Change Password Card ───
function ChangePasswordCard() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [mismatch, setMismatch] = useState(false);

  const handleChange = (field: 'current' | 'next' | 'confirm', value: string) => {
    const updated = { ...form, [field]: value };
    setForm(updated);
    if (field === 'confirm' || field === 'next') {
      setMismatch(updated.confirm.length > 0 && updated.next !== updated.confirm);
    }
  };

  const isDisabled = !form.current || !form.next || !form.confirm || saving;

  const handleSubmit = async () => {
    if (form.next !== form.confirm) { setMismatch(true); return; }
    if (form.next.length < 6) { toast.error('La nueva contraseña debe tener al menos 6 caracteres'); return; }
    setSaving(true);
    try {
      // Re-authenticate by signing in with current password to verify it
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { toast.error('No se pudo obtener el usuario actual'); setSaving(false); return; }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: form.current,
      });
      if (signInError) { toast.error('La contraseña actual es incorrecta'); setSaving(false); return; }
      // Update password
      const { error } = await supabase.auth.updateUser({ password: form.next });
      if (error) { toast.error('Error al actualizar: ' + error.message); setSaving(false); return; }
      toast.success('Contraseña actualizada correctamente');
      setForm({ current: '', next: '', confirm: '' });
      setMismatch(false);
    } catch (e: any) {
      toast.error('Error inesperado: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
          <KeyRound size={16} className="text-amber-400" />
        </div>
        <h3 className="text-base font-bold text-white">Cambiar Contraseña</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 max-w-md">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Contraseña actual</label>
          <input
            type="password"
            value={form.current}
            onChange={e => handleChange('current', e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Nueva contraseña <span className="text-slate-500">(mín. 6 caracteres)</span></label>
          <input
            type="password"
            value={form.next}
            onChange={e => handleChange('next', e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Confirmar nueva contraseña</label>
          <input
            type="password"
            value={form.confirm}
            onChange={e => handleChange('confirm', e.target.value)}
            autoComplete="new-password"
            className={`w-full px-3 py-2 bg-slate-800 border rounded-lg text-white text-sm focus:ring-2 focus:outline-none ${
              mismatch ? 'border-red-500 focus:ring-red-500/50' : 'border-slate-600 focus:ring-amber-500/50'
            }`}
          />
          {mismatch && (
            <p className="text-xs text-red-400 mt-1">Las contraseñas no coinciden</p>
          )}
        </div>
      </div>
      <button
        onClick={handleSubmit}
        disabled={isDisabled || mismatch}
        className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <KeyRound size={15} /> {saving ? 'Actualizando...' : 'Actualizar Contraseña'}
      </button>
    </div>
  );
}

// ─── Delivery Settings Card — Fase 1 ───
function DeliverySettingsCard({ tenant }: { tenant: Tenant }) {
  const [settings, setSettings] = useState<{
    delivery_enabled: boolean;
    coverage_radius_km: number;
    restaurant_lat: number | null;
    restaurant_lon: number | null;
    base_eta_minutes: number;
    delivery_fee: number;
    min_order_amount: number;
    // F9: Políticas de commit
    commit_buffer_pct: number;
    max_wait_minutes: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    supabase
      .from('delivery_settings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            delivery_enabled: data.delivery_enabled ?? false,
            coverage_radius_km: data.coverage_radius_km ?? 5,
            restaurant_lat: data.restaurant_lat ?? null,
            restaurant_lon: data.restaurant_lon ?? null,
            base_eta_minutes: data.base_eta_minutes ?? 30,
            delivery_fee: data.delivery_fee ?? 0,
            min_order_amount: data.min_order_amount ?? 0,
            commit_buffer_pct: data.commit_buffer_pct ?? 80,
            max_wait_minutes: data.max_wait_minutes ?? 20,
          });
        } else {
          setSettings({
            delivery_enabled: false,
            coverage_radius_km: 5,
            restaurant_lat: null,
            restaurant_lon: null,
            base_eta_minutes: 30,
            delivery_fee: 0,
            min_order_amount: 0,
            commit_buffer_pct: 80,
            max_wait_minutes: 20,
          });
        }
        setLoading(false);
      });
  }, [tenant.id]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const payload = {
      tenant_id: tenant.id,
      delivery_enabled: settings.delivery_enabled,
      coverage_radius_km: settings.coverage_radius_km,
      restaurant_lat: settings.restaurant_lat,
      restaurant_lon: settings.restaurant_lon,
      base_eta_minutes: settings.base_eta_minutes,
      delivery_fee: settings.delivery_fee,
      min_order_amount: settings.min_order_amount,
      // F9: Políticas de commit
      commit_buffer_pct: settings.commit_buffer_pct,
      max_wait_minutes: settings.max_wait_minutes,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('delivery_settings')
      .upsert(payload, { onConflict: 'tenant_id' });
    setSaving(false);
    if (error) toast.error('Error: ' + error.message);
    else toast.success('Configuración de delivery guardada ✅');
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocalización no disponible'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings(prev => prev ? { ...prev, restaurant_lat: pos.coords.latitude, restaurant_lon: pos.coords.longitude } : prev);
        setLocating(false);
        toast.success('Ubicación del restaurante capturada ✅');
      },
      () => { setLocating(false); toast.error('No se pudo obtener la ubicación'); }
    );
  };

  if (loading || !settings) return null;

  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5 space-y-5 mt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bike size={18} className="text-orange-400" />
          <h3 className="text-sm font-black text-white">Delivery a Domicilio</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">FASE 1</span>
        </div>
        <ToggleSwitch
          checked={settings.delivery_enabled}
          onChange={(v) => setSettings({ ...settings, delivery_enabled: v })}
          colorOn="#F97316"
        />
      </div>

      {settings.delivery_enabled && (
        <div className="space-y-4 pt-1">
          {/* Ubicación del restaurante */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">📍 Ubicación del restaurante (punto de origen)</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Latitud</label>
                <input
                  type="number" step="0.000001"
                  value={settings.restaurant_lat ?? ''}
                  onChange={e => setSettings({ ...settings, restaurant_lat: parseFloat(e.target.value) || null })}
                  placeholder="9.9281"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Longitud</label>
                <input
                  type="number" step="0.000001"
                  value={settings.restaurant_lon ?? ''}
                  onChange={e => setSettings({ ...settings, restaurant_lon: parseFloat(e.target.value) || null })}
                  placeholder="-84.0907"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
                />
              </div>
            </div>
            <button
              onClick={handleDetectLocation}
              disabled={locating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: '#F97316' }}
            >
              <Navigation size={13} />
              {locating ? 'Detectando...' : 'Detectar mi ubicación actual'}
            </button>
            {settings.restaurant_lat && settings.restaurant_lon && (
              <p className="text-[10px] text-green-400 mt-1.5">✅ Coordenadas guardadas: {settings.restaurant_lat.toFixed(5)}, {settings.restaurant_lon.toFixed(5)}</p>
            )}
          </div>

          {/* Radio de cobertura */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">🗺️ Radio de cobertura</label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={1} max={30} step={0.5}
                value={settings.coverage_radius_km}
                onChange={e => setSettings({ ...settings, coverage_radius_km: parseFloat(e.target.value) })}
                className="flex-1 accent-orange-500"
              />
              <span className="text-sm font-bold text-orange-400 w-16 text-right">{settings.coverage_radius_km} km</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Solo se aceptarán pedidos dentro de este radio desde el restaurante</p>
          </div>

          {/* ETA base y tarifa */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">⏱️ ETA base (min)</label>
              <input
                type="number" min={5} max={120}
                value={settings.base_eta_minutes}
                onChange={e => setSettings({ ...settings, base_eta_minutes: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">💰 Tarifa delivery</label>
              <input
                type="number" min={0} step={100}
                value={settings.delivery_fee}
                onChange={e => setSettings({ ...settings, delivery_fee: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">🛒 Mínimo pedido</label>
              <input
                type="number" min={0} step={500}
                value={settings.min_order_amount}
                onChange={e => setSettings({ ...settings, min_order_amount: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* F9: Políticas de commit — buffer y auto-promoción */}
          <div
            className="mt-4 pt-4 border-t space-y-4"
            style={{ borderColor: 'rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sliders size={13} className="text-purple-400" />
              <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wide">Políticas de Orquestación (F9)</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  🛡️ Buffer de capacidad (%)
                </label>
                <input
                  type="number" min={50} max={100} step={5}
                  value={settings.commit_buffer_pct}
                  onChange={e => setSettings({ ...settings, commit_buffer_pct: parseInt(e.target.value) || 80 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  No commitear si la capacidad supera este %. Default: 80%
                </p>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  ⏱️ Espera máxima (min)
                </label>
                <input
                  type="number" min={5} max={120} step={5}
                  value={settings.max_wait_minutes}
                  onChange={e => setSettings({ ...settings, max_wait_minutes: parseInt(e.target.value) || 20 })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Pedidos en waitlist se auto-promueven después de este tiempo. Default: 20 min
                </p>
              </div>
            </div>
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-[10px]"
              style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}
            >
              <Zap size={11} className="text-purple-400 shrink-0 mt-0.5" />
              <span className="text-slate-400 leading-relaxed">
                <strong className="text-purple-300">Buffer P1:</strong> Si la capacidad está al {settings.commit_buffer_pct}% o más, los nuevos pedidos van a waitlist aunque haya un slot libre. &nbsp;
                <strong className="text-purple-300">Auto-promoción P4:</strong> Pedidos en espera más de {settings.max_wait_minutes} minutos se promueven automáticamente.
              </span>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg,#F97316,#EF4444)', color: '#fff' }}
      >
        <Save size={14} /> {saving ? 'Guardando...' : 'Guardar configuración de delivery'}
      </button>

      {/* ── Zonas de cobertura ── */}
      {settings.delivery_enabled && (
        <div className="mt-6 pt-6 border-t border-slate-700/50">
          <DeliveryZonesPanel tenant={tenant} />
        </div>
      )}
    </div>
  );
}
// ─── Theme Tab ────
function ThemeTab({ tenant, theme, onRefresh }: { tenant: Tenant; theme: ThemeSettings; onRefresh: () => void }) {
  const { uiTheme, setUiTheme } = useUITheme();
  // V18.0: Estado de 5 colores del menú público + tema preset
  const [form, setForm] = useState({
    primary_color:    theme.primary_color    || '#c6a75e',
    secondary_color:  theme.secondary_color  || '#1d2958',
    accent_color:     theme.accent_color     || '#c6a75e',
    background_color: theme.background_color || '#0a0a0a',
    text_color:       theme.text_color       || '#f5f5f5',
    surface_color:    (theme as any).surface_color  || '#161616',
    badge_color:      (theme as any).badge_color    || theme.primary_color || '#c6a75e',
    font_family:      theme.font_family      || 'Inter',
    view_mode:        theme.view_mode        || 'grid',
    hero_image_url:   theme.hero_image_url   || '',
    wordmark_url:     theme.wordmark_url      || '',
    wordmark_max_width: theme.wordmark_max_width ?? 280,
    wordmark_align:   theme.wordmark_align    || 'left',
    theme_preset_key: (theme as any).theme_preset_key || '',
  });
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(getThemeCategories()[0]);

  // Preview en vivo: aplicar colores al DOM mientras el admin edita
  const handleColorChange = (key: string, value: string) => {
    const newForm = { ...form, [key]: value };
    setForm(newForm);
    applyRestaurantTheme({
      background: newForm.background_color,
      surface:    newForm.surface_color,
      text:       newForm.text_color,
      primary:    newForm.primary_color,
      badge:      newForm.badge_color,
    });
  };

  // Aplicar preset: cargar colores recomendados del tema seleccionado
  const handlePresetSelect = (preset: RestaurantThemePreset) => {
    const newForm = {
      ...form,
      background_color: preset.recommended.background,
      surface_color:    preset.recommended.surface,
      text_color:       preset.recommended.text,
      primary_color:    preset.recommended.primary,
      accent_color:     preset.recommended.primary,
      badge_color:      preset.recommended.badge,
      theme_preset_key: preset.key,
    };
    setForm(newForm);
    applyRestaurantTheme({
      background: newForm.background_color,
      surface:    newForm.surface_color,
      text:       newForm.text_color,
      primary:    newForm.primary_color,
      badge:      newForm.badge_color,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      primary_color:    form.primary_color,
      secondary_color:  form.secondary_color,
      accent_color:     form.accent_color,
      background_color: form.background_color,
      text_color:       form.text_color,
      surface_color:    form.surface_color,
      badge_color:      form.badge_color,
      font_family:      form.font_family,
      view_mode:        form.view_mode,
      hero_image_url:   form.hero_image_url || null,
      wordmark_url:     form.wordmark_url || null,
      wordmark_max_width: form.wordmark_max_width || 280,
      wordmark_align:   form.wordmark_align || 'left',
      theme_preset_key: form.theme_preset_key || null,
      updated_at:       new Date().toISOString(),
    };
    const { error } = await supabase.from('theme_settings').update(payload).eq('tenant_id', tenant.id);
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Tema actualizado');
    onRefresh();
  };

  const fonts = ['Georgia', 'Poppins', 'Montserrat', 'Inter', 'Lora', 'Nunito'];
  const themeCategories = getThemeCategories();
  const isDark = isColorDark(form.background_color);

  return (
    <div>
      <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Personalización del Tema</h2>

      {/* ── PANEL DE APARIENCIA DEL ADMIN ── */}
      <div className="rounded-2xl p-6 mb-6 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🎨</span>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Apariencia del Panel de Administración</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Elige el tema visual del panel. El cambio es instantáneo.</p>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Selección rápida:</label>
          <select value={uiTheme} onChange={e => setUiTheme(e.target.value as ThemeKey)}
            className="px-3 py-1.5 rounded-lg text-sm border cursor-pointer"
            style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}>
            {Object.entries(themes).map(([key, def]) => (
              <option key={key} value={key}>{def.emoji} {def.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(themes) as [ThemeKey, typeof themes[ThemeKey]][]).map(([key, def]) => {
            const isActive = uiTheme === key;
            return (
              <button key={key} onClick={() => setUiTheme(key)}
                className="relative flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left"
                style={{
                  backgroundColor: def.vars['--bg-surface'],
                  borderColor: isActive ? def.vars['--accent'] : 'transparent',
                  boxShadow: isActive ? `0 0 0 1px ${def.vars['--accent']}40` : 'none',
                }}>
                <div className="w-full h-6 rounded-md mb-2" style={{ backgroundColor: def.vars['--bg-page'] }} />
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{def.emoji}</span>
                  <span className="text-xs font-bold" style={{ color: def.vars['--text-primary'] }}>{def.name}</span>
                </div>
                <span className="text-[10px] mt-0.5" style={{ color: def.vars['--text-secondary'] }}>{def.description}</span>
                {isActive && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black"
                    style={{ backgroundColor: def.vars['--accent'], color: def.vars['--accent-contrast'] }}>✓</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TEMAS DEL MENÚ PÚBLICO V18.0 ── */}
      <div className="rounded-2xl p-6 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base">🍽️</span>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Apariencia del Menú Público</h3>
        </div>
        <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
          Elige un tema base para tu tipo de restaurante y personaliza los colores. Los cambios se aplican en tiempo real.
        </p>

        {/* Selector de categoría de tema */}
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Tipo de restaurante</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {themeCategories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                backgroundColor: activeCategory === cat ? 'var(--accent)' : 'var(--bg-page)',
                color: activeCategory === cat ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${activeCategory === cat ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Grid de temas de la categoría activa */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {RESTAURANT_THEMES.filter(t => t.category === activeCategory).map(preset => {
            const isSelected = form.theme_preset_key === preset.key;
            return (
              <button key={preset.key} onClick={() => handlePresetSelect(preset)}
                className="relative flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left overflow-hidden"
                style={{
                  backgroundColor: preset.recommended.background,
                  borderColor: isSelected ? preset.recommended.primary : 'transparent',
                  boxShadow: isSelected ? `0 0 0 1px ${preset.recommended.primary}60` : '0 2px 8px rgba(0,0,0,0.15)',
                }}>
                {/* Preview de superficie */}
                <div className="w-full h-8 rounded-lg mb-2 flex items-center justify-between px-2"
                  style={{ backgroundColor: preset.recommended.surface, border: `1px solid ${preset.recommended.primary}20` }}>
                  <span className="text-[9px] font-bold" style={{ color: preset.recommended.text }}>Platillo</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold text-white" style={{ backgroundColor: preset.recommended.primary }}>+</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{preset.emoji}</span>
                  <span className="text-xs font-bold" style={{ color: preset.recommended.text }}>{preset.name}</span>
                </div>
                <span className="text-[10px] mt-0.5 leading-tight" style={{ color: preset.isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>
                  {preset.description}
                </span>
                {/* Swatches de colores */}
                <div className="flex gap-1 mt-2">
                  {[preset.recommended.background, preset.recommended.surface, preset.recommended.primary, preset.recommended.badge].map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: c }} />
                  ))}
                </div>
                {isSelected && (
                  <span className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: preset.recommended.primary, color: '#fff' }}>✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Nota de paleta del tema seleccionado */}
        {form.theme_preset_key && (() => {
          const preset = getThemePreset(form.theme_preset_key);
          return preset ? (
            <div className="mb-5 px-4 py-3 rounded-xl text-xs" style={{ backgroundColor: `${form.primary_color}15`, color: form.primary_color, border: `1px solid ${form.primary_color}30` }}>
              💡 <strong>{preset.name}:</strong> {preset.paletteNote}
            </div>
          ) : null;
        })()}

        {/* ── 4 COLOR PICKERS ── */}
        <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Personalizar colores</p>
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { key: 'background_color', label: 'Fondo',      desc: 'Color de fondo general',      icon: '🎨' },
            { key: 'surface_color',    label: 'Superficie',  desc: 'Tarjetas, modales y nav',      icon: '📋' },
            { key: 'text_color',       label: 'Texto',       desc: 'Textos principales',           icon: '✍️' },
            { key: 'primary_color',    label: 'Principal',   desc: 'Botones y precios',            icon: '✨' },
            { key: 'badge_color',      label: 'Badges',      desc: 'Categorías y etiquetas',       icon: '🏷️' },
          ].map(({ key, label, desc, icon }) => (
            <div key={key} className="flex items-center gap-3">
              <input type="color" value={(form as any)[key] || '#000000'}
                onChange={e => handleColorChange(key, e.target.value)}
                className="w-12 h-12 rounded-xl border-2 cursor-pointer bg-transparent flex-shrink-0"
                style={{ borderColor: 'var(--border)' }}
              />
              <div>
                <p className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                  <span>{icon}</span> {label}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                <p className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{(form as any)[key]}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tipografía */}
        <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Tipografía</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
          {fonts.map(f => (
            <button key={f} onClick={() => setForm({ ...form, font_family: f })}
              className="px-3 py-2.5 rounded-xl text-sm border transition-all"
              style={{
                fontFamily: `'${f}', sans-serif`,
                backgroundColor: form.font_family === f ? `${form.primary_color}20` : 'var(--bg-page)',
                borderColor: form.font_family === f ? form.primary_color : 'var(--border)',
                color: form.font_family === f ? form.primary_color : 'var(--text-secondary)',
              }}>
              {f}
            </button>
          ))}
        </div>

        {/* Modo de vista */}
        <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Modo de vista</h3>
        <div className="flex gap-3 mb-6">
          {[{ v: 'grid', icon: '⊞', label: 'Cuadrícula' }, { v: 'list', icon: '☰', label: 'Lista' }].map(({ v, icon, label }) => (
            <button key={v} onClick={() => setForm({ ...form, view_mode: v as 'grid' | 'list' })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all"
              style={{
                backgroundColor: form.view_mode === v ? `${form.primary_color}20` : 'var(--bg-page)',
                borderColor: form.view_mode === v ? form.primary_color : 'var(--border)',
                color: form.view_mode === v ? form.primary_color : 'var(--text-secondary)',
              }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Imagen Hero */}
        <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Imagen Hero</h3>
        <ImageUpload bucket="menu-images" currentUrl={form.hero_image_url}
          onUpload={(url) => setForm({ ...form, hero_image_url: url })} label="" previewSize="lg" />

        {/* Wordmark / Nombre visual */}
        <h3 className="text-xs font-semibold mt-6 mb-1" style={{ color: 'var(--text-secondary)' }}>Nombre visual / Wordmark</h3>
        <p className="text-[11px] mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>PNG transparente con el nombre tipográfico del restaurante. Se muestra en el hero en lugar del texto plano.</p>
        <ImageUpload bucket="logos" currentUrl={form.wordmark_url}
          onUpload={(url) => setForm({ ...form, wordmark_url: url })} label="" previewSize="md" />
        {form.wordmark_url && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: form.background_color, padding: '20px 16px' }}>
              <img
                src={form.wordmark_url}
                alt="Wordmark preview"
                style={{
                  maxWidth: `${form.wordmark_max_width}px`,
                  maxHeight: '80px',
                  objectFit: 'contain',
                  display: 'block',
                  marginLeft: form.wordmark_align === 'center' ? 'auto' : form.wordmark_align === 'right' ? 'auto' : '0',
                  marginRight: form.wordmark_align === 'center' ? 'auto' : form.wordmark_align === 'right' ? '0' : 'auto',
                }}
              />
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Ancho máximo (px)</label>
                <input
                  type="number" min={80} max={600} step={10}
                  value={form.wordmark_max_width}
                  onChange={e => setForm({ ...form, wordmark_max_width: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] mb-1" style={{ color: 'var(--text-secondary)' }}>Alineación</label>
                <div className="flex gap-1">
                  {(['left','center','right'] as const).map(a => (
                    <button key={a} onClick={() => setForm({ ...form, wordmark_align: a })}
                      className="flex-1 py-2 rounded-lg text-xs font-medium border transition-all"
                      style={{
                        backgroundColor: form.wordmark_align === a ? `${form.primary_color}25` : 'var(--bg-surface)',
                        borderColor: form.wordmark_align === a ? form.primary_color : 'var(--border)',
                        color: form.wordmark_align === a ? form.primary_color : 'var(--text-secondary)',
                      }}>
                      {a === 'left' ? '⬅' : a === 'center' ? '↔' : '➡'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Preview */}
        <div className="mt-6 p-5 rounded-2xl border" style={{ backgroundColor: form.background_color, borderColor: `${form.text_color}20` }}>
          <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: form.text_color, opacity: 0.4 }}>Vista previa del menú</p>
          <h3 className="text-lg font-bold mb-1" style={{ color: form.text_color, fontFamily: `'${form.font_family}', sans-serif` }}>{tenant.name}</h3>
          {/* Nav de categorías */}
          <div className="flex gap-2 mb-3 overflow-hidden">
            <span className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: form.badge_color }}>Entradas</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${form.badge_color}20`, color: form.badge_color }}>Platos</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${form.badge_color}20`, color: form.badge_color }}>Bebidas</span>
          </div>
          {/* Card de platillo */}
          <div className="p-3 rounded-xl" style={{ backgroundColor: form.surface_color, border: `1px solid ${form.text_color}10` }}>
            <p className="text-sm font-semibold" style={{ color: form.text_color }}>Platillo de ejemplo</p>
            <p className="text-xs mt-0.5" style={{ color: form.text_color, opacity: 0.6 }}>Descripción del platillo...</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-bold" style={{ color: form.primary_color }}>₡5 500</span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: form.primary_color }}>+ Agregar</span>
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors mt-6 disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast)' }}>
          <Save size={16} /> {saving ? 'Guardando...' : 'Guardar tema del menú'}
        </button>
      </div>
    </div>
  );
}
// ─── Orders Tab — Kanban V3 (sub-tabs + badges) ───
type OrderSubTab = 'DINE_IN' | 'DELIVERY' | 'TAKEOUT';
type PaymentTab = 'pending' | 'paid';

function OrdersTab({ tenant }: { tenant: Tenant }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptViewerUrl, setReceiptViewerUrl] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<OrderSubTab>('DINE_IN');
  const [paymentTab, setPaymentTab] = useState<PaymentTab>('pending');
  const prevOrderCountRef = useRef(0);
  const { playBell } = useKitchenBell();

  const QUICK_REQUEST_LABELS: Record<'water_ice' | 'napkins' | 'help', string> = {
    water_ice: '💧 Agua / Hielo',
    napkins: '🧻 Servilletas',
    help: '🆘 Ayuda',
  };

  const fetchOrders = useCallback(async () => {
    // V17.2: Traer tanto activos como entregados (para el tab Cobrados)
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .not('status', 'in', '(cancelado)')
      .order('created_at', { ascending: false })
      .limit(100);
    const newOrders = (data as Order[]) || [];
    // Campana solo para pedidos activos nuevos
    const activeCount = newOrders.filter(o => o.status !== 'entregado').length;
    if (prevOrderCountRef.current > 0 && activeCount > prevOrderCountRef.current) {
      playBell();
      toast.success('🔔 ¡Nuevo pedido recibido!', { duration: 6000 });
    }
    prevOrderCountRef.current = activeCount;
    setOrders(newOrders);
    setLoading(false);
  }, [tenant.id, playBell]);

  // V17.2: Marcar orden como pagada
  const handleMarkPaid = async (orderId: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('✅ Marcado como pagado');
    // ── WhatsApp contextual: solo al verificar pago SINPE ──
    const order = orders.find(o => o.id === orderId);
    if (order && order.payment_method === 'sinpe') {
      const customerPhone = (order as any).delivery_phone || order.customer_phone;
      if (customerPhone) {
        const name = order.customer_name || 'Cliente';
        const shortId = String(order.order_number);
        let waMsg: string;
        if (order.status === 'entregado') {
          waMsg =
            `¡Hola ${name}! Tu pago por SINPE ha sido verificado con éxito ✅.\n` +
            `Esperamos que estés disfrutando tu pedido #${shortId}. ¡Buen provecho! 🍽️`;
        } else if (order.status === 'listo') {
          waMsg =
            `¡Hola ${name}! Tu pago por SINPE ha sido verificado con éxito ✅.\n` +
            `Tu pedido #${shortId} ya está listo y viene en camino a tu mesa.`;
        } else {
          waMsg =
            `¡Hola ${name}! Tu pago por SINPE ha sido verificado con éxito ✅.\n` +
            `Tu pedido #${shortId} ya está siendo preparado en cocina.`;
        }
        const waUrl = buildWhatsAppUrl(customerPhone, waMsg);
        if (waUrl) setTimeout(() => window.open(waUrl, '_blank'), 500);
      }
    }
    fetchOrders();
  };

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    const interval = setInterval(fetchOrders, 12000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    const channel = supabase
      .channel(`admin-quick-requests-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          // Silent visual refresh only (no bell for admin)
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant.id, fetchOrders]);

  const markQuickRequestSeenByAdmin = async (orderId: string) => {
    await supabase
      .from('orders')
      .update({ quick_request_seen_by_admin: true, updated_at: new Date().toISOString() })
      .eq('id', orderId);
    fetchOrders();
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const now = new Date().toISOString();
    const extra: Record<string, any> = { updated_at: now, has_new_items: false };
    if (newStatus === 'en_cocina') extra.accepted_at = now;
    if (newStatus === 'listo') extra.ready_at = now;
    if (newStatus === 'entregado') extra.completed_at = now;
    const { error } = await supabase.from('orders').update({ status: newStatus, ...extra }).eq('id', orderId);
    if (error) { toast.error('Error: ' + error.message); return; }
    const label = ORDER_STATUS_CONFIG[newStatus]?.label || newStatus;
    toast.success(`✅ ${label}`);
    fetchOrders();

    // ── Automatización WhatsApp ──
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const customerPhone = (order as any).delivery_phone || order.customer_phone;
    if (!customerPhone) return;

    const name = order.customer_name || 'Cliente';
    const shortId = String(order.order_number);
    const deliveryType = (order as any).delivery_type || 'dine_in';

    let waMsg: string | null = null;

    if (newStatus === 'listo') {
      const suffix =
        deliveryType === 'delivery'
          ? 'El motorizado va en camino hacia tu dirección.'
          : deliveryType === 'takeout'
          ? 'Ya puedes pasar por él al local.'
          : 'Te lo estamos llevando a tu mesa.';
      waMsg = `¡Buenas noticias ${name}! Tu pedido #${shortId} ya está LISTO 🎉.\n${suffix}`;
    } else if (newStatus === 'entregado') {
      // Recordatorio amable de pago al entregar — contextual según método
      const payMethod = order.payment_method || 'efectivo';
      const payReminder =
        payMethod === 'sinpe'
          ? 'Cuando termines, recuerda enviar tu comprobante de SINPE si aún no lo has hecho. 📱'
          : payMethod === 'tarjeta'
          ? 'Cuando termines, puedes pagar con tarjeta en caja. 💳'
          : 'Cuando termines, puedes pagar en efectivo en caja. 💵';
      waMsg =
        `¡Hola ${name}! Tu pedido #${shortId} ya fue entregado. ¡Buen provecho! 🍽️\n${payReminder}`;
    }

    if (waMsg) {
      const waUrl = buildWhatsAppUrl(customerPhone, waMsg);
      if (waUrl) setTimeout(() => window.open(waUrl, '_blank'), 500);
    }
  };

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  const elapsedMin = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);

  // ── Normaliza delivery_type para comparación case-insensitive ──
  const getDeliveryType = (o: Order): string =>
    ((o as any).delivery_type || 'DINE_IN').toUpperCase();

  // ── V17.2: Separar activos vs entregados ──
  const activeOrders = orders.filter(o => o.status !== 'entregado');
  const deliveredOrders = orders.filter(o => o.status === 'entregado');

  // ── Pedidos filtrados por sub-tab activa (solo activos para el Kanban) ──
  const filteredOrders = activeOrders.filter(o => getDeliveryType(o) === activeSubTab);

  // ── Columnas Kanban según sub-tab ──
  const nuevos = filteredOrders.filter(o =>
    o.status === 'pendiente' || o.status === 'pago_en_revision'
  );
  const enCocina = filteredOrders.filter(o => o.status === 'en_cocina');
  const listos = filteredOrders.filter(o => o.status === 'listo');
  const deliveryActivos = filteredOrders; // para la columna Delivery (sub-tab DELIVERY)

  // ── V17.2: Por Cobrar = entregados con payment_status pending; Cobrados = payment_status paid ──
  const porCobrar = deliveredOrders.filter(o => (o as any).payment_status !== 'paid');
  const cobrados = deliveredOrders.filter(o => (o as any).payment_status === 'paid');

  // ── Badges: tareas pendientes por sub-tab ──
  const badgeCount = (subTab: OrderSubTab): number => {
    const tabOrders = activeOrders.filter(o => getDeliveryType(o) === subTab);
    return tabOrders.filter(o =>
      o.status === 'pendiente' ||
      o.status === 'pago_en_revision'
    ).length;
  };

  const KanbanCard = ({ order, showPayBtn = false }: { order: Order; showPayBtn?: boolean }) => {
    const elapsed = elapsedMin(order.status === 'en_cocina' && order.accepted_at ? order.accepted_at : order.created_at);
    const isUrgent = elapsed > 20;
    const hasNewItems = (order as any).has_new_items === true;
    const isSinpe = order.payment_method === 'sinpe';
    const isEfectivoOrTarjeta = order.payment_method === 'efectivo' || order.payment_method === 'tarjeta';
    const isSinpePending = isSinpe && (order.status === 'pendiente' || order.status === 'pago_en_revision');
    // V17.2: Timer de alerta para mesas entregadas sin pagar
    const isDelivered = order.status === 'entregado';
    const isPaid = (order as any).payment_status === 'paid';
    const deliveredAt = (order as any).completed_at || order.updated_at;
    const deliveredElapsed = deliveredAt ? elapsedMin(deliveredAt) : 0;
    const isDeliveredUnpaid = isDelivered && !isPaid;
    const isDeliveredUrgent = isDeliveredUnpaid && deliveredElapsed >= 10;
    // For SINPE pending orders: only show Aprobar/Rechazar, block 'A Cocina' directly
    const actions = ORDER_STATUS_ACTIONS[order.status] || [];
    const isDelivery = (order as any).delivery_type === 'delivery';
    const isTomorrow = (order as any).scheduled_date === 'tomorrow';
    const scheduledTime = (order as any).scheduled_time;
    const deliveryAddress = (order as any).delivery_address;
    const deliveryPhone = (order as any).delivery_phone;
    const quickRequestType = (order as any).quick_request_type as 'water_ice' | 'napkins' | 'help' | null;
    const quickRequestPendingForAdmin = !!quickRequestType && (order as any).quick_request_seen_by_admin !== true;

    // Extraer el link de Google Maps de la cadena delivery_address si existe
    const extractGoogleMapsLink = (addr: string): string | null => {
      if (!addr) return null;
      const match = addr.match(/(https?:\/\/(?:maps\.google\.com|goo\.gl|maps\.app\.goo\.gl)[^\s|]+)/);
      return match ? match[1] : null;
    };
    const googleMapsLink = deliveryAddress ? extractGoogleMapsLink(deliveryAddress) : null;
    const hasNavigationLink = !!googleMapsLink || (deliveryAddress && deliveryAddress.includes('http'));
    const isGoogleMapsLink = !!googleMapsLink;

    const handleWaze = () => {
      if (!deliveryAddress) return;
      if (googleMapsLink) {
        // Extraer lat/lon del link de Google Maps para Waze
        const coordMatch = googleMapsLink.match(/q=([\d.-]+),([\d.-]+)/);
        if (coordMatch) {
          window.open(`https://waze.com/ul?ll=${coordMatch[1]},${coordMatch[2]}&navigate=yes`, '_blank');
        } else {
          window.open(`https://waze.com/ul?q=${encodeURIComponent(googleMapsLink)}&navigate=yes`, '_blank');
        }
      } else {
        // Dirección de texto — solo navegar si tiene texto válido
        window.open(`https://waze.com/ul?q=${encodeURIComponent(deliveryAddress)}&navigate=yes`, '_blank');
      }
    };

    const handleGoogleMaps = () => {
      if (googleMapsLink) {
        window.open(googleMapsLink, '_blank');
      } else if (deliveryAddress) {
        window.open(`https://maps.google.com/?q=${encodeURIComponent(deliveryAddress)}`, '_blank');
      }
    };

    const handleWhatsAppDelivery = () => {
      if (!deliveryPhone) return;
      const gpsLine = googleMapsLink ? `\n🗺️ ${googleMapsLink}` : '';
      const msg =
        `🛵 *Pedido #${order.order_number}* listo para entrega\n` +
        `📍 ${deliveryAddress || ''}${gpsLine}\n` +
        `⏰ ${isTomorrow ? 'Mañana' : 'Hoy'} ${scheduledTime || ''}\n` +
        `💰 Total: ${formatPrice(order.total)}`;
      const url = buildWhatsAppUrl(deliveryPhone, msg);
      if (url) window.open(url, '_blank');
    };

    return (
      <div className={`rounded-2xl p-4 border transition-all ${
        hasNewItems ? 'bg-amber-500/10 border-amber-500/50 animate-pulse' :
        isDeliveredUrgent ? 'bg-red-500/8 border-red-500/50' :
        isDeliveredUnpaid ? 'bg-yellow-500/8 border-yellow-500/40' :
        isPaid ? 'bg-emerald-500/5 border-emerald-500/20 opacity-70' :
        isUrgent ? 'bg-red-500/5 border-red-500/30' : 'bg-slate-800/60 border-slate-700/50'
      }`}>
        {/* ¡NUEVOS ITEMS! alert badge */}
        {hasNewItems && (
          <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40">
            <span className="text-amber-400 text-xs font-black uppercase tracking-wider animate-pulse">
              🆕 ¡NUEVOS ITEMS!
            </span>
          </div>
        )}

        {/* ── SINPE: Bloqueo de pago pendiente ── */}
        {isSinpePending && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-purple-500/15 border border-purple-500/40">
            <span className="text-purple-300 text-xs font-black uppercase tracking-wider animate-pulse">⚠️ PENDIENTE VERIFICAR</span>
          </div>
        )}

        {/* ── Efectivo/Tarjeta: Badge de cobro ── */}
        {isEfectivoOrTarjeta && order.status === 'pendiente' && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/30">
            <span className="text-green-300 text-xs font-bold">
              {order.payment_method === 'efectivo' ? '💵 COBRAR EN MESA / CAJA' : '💳 COBRAR CON TARJETA'}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-bold text-white">#{order.order_number}</span>
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            isUrgent ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-400'
          }`}>
            <Timer size={10} /> {elapsed}m
          </div>
        </div>
        {(order.customer_name || order.customer_table) && (
          <div className="text-xs text-slate-400 mb-2 flex gap-2">
            {order.customer_name && <span>👤 {order.customer_name}</span>}
            {order.customer_table && <span>🪑 {order.customer_table}</span>}
          </div>
        )}

        {quickRequestType && (
          <div className="mb-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-xs font-bold">
              {QUICK_REQUEST_LABELS[quickRequestType]}
            </div>
            {quickRequestPendingForAdmin && (
              <button
                onClick={() => markQuickRequestSeenByAdmin(order.id)}
                className="mt-2 text-[11px] px-2.5 py-1 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600"
              >
                Marcar solicitud como vista
              </button>
            )}
          </div>
        )}
        <div className="space-y-0.5 mb-3">
          {(order.items as any[]).map((item: any, i: number) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-slate-300">{item.quantity}× {item.name}</span>
              <span className="text-slate-500 text-xs">{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
        {order.notes && <div className="text-xs text-amber-400/80 italic mb-2">📝 {order.notes}</div>}

        {/* ── Delivery / Takeout info ── */}
        {(isDelivery || (order as any).delivery_type === 'takeout') && (
          <div className="mb-2 px-2.5 py-2 rounded-lg space-y-1" style={{ backgroundColor: isDelivery ? '#3B82F610' : '#10B98110', border: `1px solid ${isDelivery ? '#3B82F630' : '#10B98130'}` }}>
            {isTomorrow && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-orange-400 uppercase tracking-wider">⏰ MAÑANA</span>
                {scheduledTime && <span className="text-xs text-orange-300">{scheduledTime}</span>}
              </div>
            )}
            {!isTomorrow && scheduledTime && (
              <div className="flex items-center gap-1.5">
                <Clock size={11} className="text-slate-400" />
                {/* V4.0: mostrar 'ASAP' como 'Lo antes posible' en el Kanban */}
                <span className="text-xs text-slate-300">
                  {scheduledTime === 'ASAP' ? '🛵 Lo antes posible' : `Hoy ${scheduledTime}`}
                </span>
              </div>
            )}
            {isDelivery && deliveryAddress && (
              <div className="space-y-1">
                {isGoogleMapsLink ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-blue-300 bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 rounded-full">
                      📍 Ubicación de Google Maps
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <MapPin size={11} className="text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-slate-300 leading-tight">{deliveryAddress}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {order.sinpe_receipt_url && (
          <button
            onClick={() => setReceiptViewerUrl(order.sinpe_receipt_url!)}
            className="w-full flex items-center justify-center gap-2 py-2 mb-2 rounded-xl text-sm font-bold transition-all active:scale-[0.97] touch-manipulation bg-purple-500/20 text-purple-300 border-2 border-purple-500/40 hover:bg-purple-500/30">
            🧻 Ver Comprobante
          </button>
        )}

        {/* ── Waze + Google Maps + WhatsApp for delivery ── */}
        {/* Waze y Google Maps SOLO si la dirección contiene un link GPS */}
        {isDelivery && (
          <div className="flex gap-2 mb-2">
            {hasNavigationLink && (
              <>
                <button
                  onClick={handleWaze}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97] touch-manipulation"
                  style={{ backgroundColor: '#06B6D420', color: '#06B6D4', border: '2px solid #06B6D440' }}
                  title="Navegar con Waze"
                >
                  <Navigation size={13} /> Waze
                </button>
                <button
                  onClick={handleGoogleMaps}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97] touch-manipulation"
                  style={{ backgroundColor: '#4285F420', color: '#4285F4', border: '2px solid #4285F440' }}
                  title="Abrir en Google Maps"
                >
                  <MapPin size={13} /> Maps
                </button>
              </>
            )}
            {deliveryPhone && (
              <button
                onClick={handleWhatsAppDelivery}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97] touch-manipulation"
                style={{ backgroundColor: '#25D36620', color: '#25D366', border: '2px solid #25D36640' }}
              >
                <MessageCircle size={13} /> WhatsApp
              </button>
            )}
          </div>
        )}

        {/* V17.2: Timer de alerta — mesa entregada sin pagar */}
        {isDeliveredUnpaid && (
          <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border ${
            isDeliveredUrgent
              ? 'bg-red-500/20 border-red-500/50 animate-pulse'
              : 'bg-yellow-500/15 border-yellow-500/40'
          }`}>
            <Timer size={13} className={isDeliveredUrgent ? 'text-red-400' : 'text-yellow-400'} />
            <span className={`text-xs font-black uppercase tracking-wider ${
              isDeliveredUrgent ? 'text-red-300' : 'text-yellow-300'
            }`}>
              {isDeliveredUrgent ? '⚠️ COBRAR YA' : '⏰ PENDIENTE COBRO'}
            </span>
            <span className="ml-auto text-xs font-bold text-slate-400">
              Entregado hace {deliveredElapsed}m
            </span>
          </div>
        )}

        {/* V17.2: Badge pagado */}
        {isPaid && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span className="text-emerald-300 text-xs font-bold">PAGADO</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50 mb-3">
          <span className="font-bold text-amber-400">{formatPrice(order.total)}</span>
          <div className="flex items-center gap-2">
            {isDelivery && <Bike size={12} className="text-blue-400" />}
            <span className="text-[10px] text-slate-600 uppercase">{order.payment_method}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {/* V17.2: Botón Marcar como Pagado — visible en Por Cobrar */}
          {showPayBtn && !isPaid && (
            <button
              onClick={() => handleMarkPaid(order.id)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all active:scale-[0.97] touch-manipulation"
              style={{ backgroundColor: '#10B98120', color: '#10B981', border: '2px solid #10B98140' }}
            >
              <CheckCircle2 size={16} /> Marcar como Pagado
            </button>
          )}
          <div className="flex gap-2">
            {actions.map((action: any) => (
              <button key={action.nextStatus}
                onClick={() => handleStatusChange(order.id, action.nextStatus)}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97] touch-manipulation"
                style={{ backgroundColor: `${action.color}20`, color: action.color, border: `2px solid ${action.color}40` }}>
                <span>{action.icon}</span> {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const KanbanColumn = ({ title, icon, color, orders: colOrders, emptyMsg }: {
    title: string; icon: React.ReactNode; color: string; orders: Order[]; emptyMsg: string;
  }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <h3 className="font-bold text-white text-sm">{title}</h3>
        <span className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: color }}>{colOrders.length}</span>
      </div>
      <div className="space-y-3">
        {colOrders.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-xs border-2 border-dashed border-slate-700/50 rounded-2xl">{emptyMsg}</div>
        ) : colOrders.map(o => <KanbanCard key={o.id} order={o} />)}
      </div>
    </div>
  );

  // ── Sub-tab config ──
  const subTabs: { key: OrderSubTab; label: string; icon: string; color: string; activeColor: string }[] = [
    { key: 'DINE_IN',  label: 'Comer Aquí', icon: '🍽️', color: '#F59E0B', activeColor: 'bg-amber-500/20 border-amber-500/60 text-amber-300' },
    { key: 'DELIVERY', label: 'Delivery',    icon: '🛵', color: '#3B82F6', activeColor: 'bg-blue-500/20 border-blue-500/60 text-blue-300' },
    { key: 'TAKEOUT',  label: 'Por Encargo', icon: '🛍️', color: '#10B981', activeColor: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Pedidos en Vivo</h2>
          <p className="text-xs text-slate-500">{activeOrders.length} activo{activeOrders.length !== 1 ? 's' : ''} · {porCobrar.length} por cobrar</p>
        </div>
        <button onClick={fetchOrders}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600 transition-colors">
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

      {/* V17.2: Tabs principales Por Cobrar / Cobrados */}
      <div className="flex gap-2 mb-4 p-1 bg-slate-800/60 rounded-2xl border border-slate-700/50">
        <button
          onClick={() => setPaymentTab('pending')}
          className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
            paymentTab === 'pending'
              ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-300'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
          }`}
        >
          💰 Por Cobrar
          {porCobrar.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black px-1 shadow-lg animate-pulse">
              {porCobrar.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setPaymentTab('paid')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
            paymentTab === 'paid'
              ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
          }`}
        >
          ✅ Cobrados ({cobrados.length})
        </button>
      </div>

      {/* V17.2: Vista Por Cobrar — lista de entregados sin pagar */}
      {paymentTab === 'paid' && (
        <div className="space-y-3 mb-6">
          {cobrados.length === 0 ? (
            <div className="text-center py-12 text-slate-600 text-xs border-2 border-dashed border-slate-700/50 rounded-2xl">Sin pedidos cobrados hoy</div>
          ) : cobrados.map(o => <KanbanCard key={o.id} order={o} showPayBtn={false} />)}
        </div>
      )}

      {paymentTab === 'pending' && (
        <>
          {/* Por Cobrar: lista de entregados sin pagar */}
          {porCobrar.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>💰</span> Cuentas pendientes de cobro ({porCobrar.length})
              </h3>
              <div className="space-y-3">
                {porCobrar.map(o => <KanbanCard key={o.id} order={o} showPayBtn={true} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Sub-navegación: Comer Aquí / Delivery / Por Encargo ── */}
      <div className="flex gap-2 mb-5 p-1 bg-slate-800/60 rounded-2xl border border-slate-700/50">
        {subTabs.map(tab => {
          const count = badgeCount(tab.key);
          const isActive = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all border ${
                isActive
                  ? tab.activeColor
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black px-1 shadow-lg animate-pulse">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-16"><div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" /></div>
      ) : (
        <>
        {/* Kanban: columnas según sub-tab activa */}
        {activeSubTab === 'DELIVERY' ? (
          /* Vista Delivery: Dispatch + Historial — Fases 2-4 */
          <DeliveryTabWithHistory tenant={tenant} />
        ) : (
          /* Vista Comer Aquí / Por Encargo: 3 columnas estándar */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KanbanColumn
              title="Nuevos"
              icon={<AlertCircle size={14} />}
              color="#F59E0B"
              orders={nuevos}
              emptyMsg="Sin pedidos nuevos"
            />
            <KanbanColumn
              title="En Preparación"
              icon={<ChefHat size={14} />}
              color="#3B82F6"
              orders={enCocina}
              emptyMsg="Cocina libre"
            />
            <KanbanColumn
              title="Listos para Entregar"
              icon={<CheckCircle2 size={14} />}
              color="#10B981"
              orders={listos}
              emptyMsg="Sin pedidos listos"
            />
          </div>
        )}
        </>
      )}

      {/* ─── Receipt Lightbox Modal ─── */}
      {receiptViewerUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setReceiptViewerUrl(null)}
        >
          <div
            className="relative max-w-lg w-[90vw] max-h-[85vh] bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                🧾 Comprobante SINPE
              </span>
              <button
                onClick={() => setReceiptViewerUrl(null)}
                className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {/* Image */}
            <div className="p-4 flex items-center justify-center overflow-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
              <img
                src={receiptViewerUrl}
                alt="Comprobante SINPE"
                className="max-w-full max-h-full rounded-lg object-contain"
                style={{ maxHeight: '70vh' }}
              />
            </div>
            {/* Footer */}
            <div className="px-4 py-3 bg-slate-800/80 border-t border-slate-700 flex gap-2">
              <a
                href={receiptViewerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition-colors"
              >
                <ExternalLink size={14} /> Abrir en nueva pestaña
              </a>
              <button
                onClick={() => setReceiptViewerUrl(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Analytics Tab — Dashboard Premium V2 ───
type AnalyticsFilter = 'today' | 'yesterday' | 'week' | 'month';
const analyticsFilterLabels: Record<AnalyticsFilter, string> = {
  today: 'Hoy', yesterday: 'Ayer', week: 'Esta semana', month: 'Este mes',
};

function AnalyticsTab({ tenant, items, orders }: { tenant: Tenant; items: MenuItem[]; orders: Order[] }) {
  const [corteVisible, setCorteVisible] = useState(false);
  const [analyticsFilter, setAnalyticsFilter] = useState<AnalyticsFilter>('today');

  // ── Core stats ──
  const stats = useMemo(() => {
    const valid = orders.filter(o => o.status !== 'cancelado');
    const month = valid.filter(o => {
      const d = new Date(o.created_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const totalRevenue = month.reduce((s, o) => s + o.total, 0);
    const totalOrders = month.length;

    // Upsell tracking: total (AI + static)
    const upsellOrders = month.filter(o => (o as any).upsell_revenue && (o as any).upsell_revenue > 0);
    const upsellRevenue = upsellOrders.reduce((s, o) => s + ((o as any).upsell_revenue || 0), 0);
    const upsellRate = totalOrders > 0 ? Math.round((upsellOrders.length / totalOrders) * 100) : 0;

    // AI-specific upsell revenue (from ai_upsell_revenue field OR items with upsell_source='ai')
    const aiUpsellRevenue = month.reduce((s, o) => {
      // Prefer the dedicated field if available
      if ((o as any).ai_upsell_revenue != null) return s + ((o as any).ai_upsell_revenue || 0);
      // Fallback: sum items with upsell_source='ai'
      const aiItems = ((o.items || []) as any[]).filter((i: any) => i.upsell_source === 'ai');
      return s + aiItems.reduce((acc: number, i: any) => acc + (i.price * i.quantity), 0);
    }, 0);
    const staticUpsellRevenue = upsellRevenue - aiUpsellRevenue;

    // Item counts
    const itemCounts: Record<string, { name: string; count: number; revenue: number }> = {};
    valid.forEach(o => {
      (o.items as any[]).forEach((item: any) => {
        if (!itemCounts[item.id || item.name]) itemCounts[item.id || item.name] = { name: item.name, count: 0, revenue: 0 };
        itemCounts[item.id || item.name].count += item.quantity;
        itemCounts[item.id || item.name].revenue += item.price * item.quantity;
      });
    });
    const sortedItems = Object.values(itemCounts).sort((a, b) => b.count - a.count);
    const top5 = sortedItems.slice(0, 5);

    // Hourly distribution (last 7 days)
    const hourCounts: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourCounts[h] = 0;
    const week = valid.filter(o => Date.now() - new Date(o.created_at).getTime() < 7 * 86400000);
    week.forEach(o => { const h = new Date(o.created_at).getHours(); hourCounts[h]++; });
    const hourlyData = Array.from({ length: 24 }, (_, h) => ({
      hour: h < 10 ? `0${h}h` : `${h}h`,
      pedidos: hourCounts[h]
    })).filter((_, h) => h >= 6 && h <= 23);

    // Revenue trend (last 7 days)
    const dayRevenue: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('es-CR', { weekday: 'short' });
      dayRevenue[key] = 0;
    }
    valid.filter(o => Date.now() - new Date(o.created_at).getTime() < 7 * 86400000).forEach(o => {
      const key = new Date(o.created_at).toLocaleDateString('es-CR', { weekday: 'short' });
      if (dayRevenue[key] !== undefined) dayRevenue[key] += o.total;
    });
    const trendData = Object.entries(dayRevenue).map(([day, total]) => ({ day, total }));

    // timeBlocks and top3 are computed separately based on analyticsFilter
    return { totalRevenue, totalOrders, upsellRevenue, upsellRate, upsellOrders: upsellOrders.length,
      aiUpsellRevenue, staticUpsellRevenue,
      top5, hourlyData, trendData,
      avgTicket: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      visits: tenant.visit_count || 0 };
  }, [orders, tenant]);

  // ── Filtered stats for Picos de Venta and Top 3 ──
  const filteredStats = useMemo(() => {
    const now = new Date();
    const valid = orders.filter(o => o.status !== 'cancelado');
    let filtered: Order[];
    if (analyticsFilter === 'today') {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      filtered = valid.filter(o => new Date(o.created_at) >= start);
    } else if (analyticsFilter === 'yesterday') {
      const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(0, 0, 0, 0);
      filtered = valid.filter(o => { const d = new Date(o.created_at); return d >= start && d < end; });
    } else if (analyticsFilter === 'week') {
      filtered = valid.filter(o => Date.now() - new Date(o.created_at).getTime() < 7 * 86400000);
    } else {
      filtered = valid.filter(o => {
        const d = new Date(o.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
    }

    const timeBlocks = {
      manana: filtered.filter(o => new Date(o.created_at).getHours() < 12).length,
      tarde: filtered.filter(o => { const h = new Date(o.created_at).getHours(); return h >= 12 && h < 17; }).length,
      noche: filtered.filter(o => new Date(o.created_at).getHours() >= 17).length,
    };

    const itemCounts: Record<string, { name: string; count: number }> = {};
    filtered.forEach(o => {
      (o.items as any[]).forEach((item: any) => {
        if (!itemCounts[item.id || item.name]) itemCounts[item.id || item.name] = { name: item.name, count: 0 };
        itemCounts[item.id || item.name].count += item.quantity;
      });
    });
    const top3 = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 3);

    return { timeBlocks, top3, filteredCount: filtered.length };
  }, [orders, analyticsFilter]);

  // ── Staff Performance ──
  const staffStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // All non-cancelled orders with a staff member assigned
    const staffOrders = orders.filter(o =>
      o.status !== 'cancelado' &&
      (o as any).handled_by_name &&
      new Date(o.created_at) >= today
    );
    // Group by staff name
    const byStaff: Record<string, {
      name: string;
      completed: number;   // entregado
      cobrados: number;    // payment_status paid
      totalRevenue: number;
      avgTimeMin: number;  // avg accepted→completed
      orders: Order[];
    }> = {};
    staffOrders.forEach(o => {
      const name = (o as any).handled_by_name as string;
      if (!byStaff[name]) byStaff[name] = { name, completed: 0, cobrados: 0, totalRevenue: 0, avgTimeMin: 0, orders: [] };
      byStaff[name].orders.push(o);
      if (o.status === 'entregado') byStaff[name].completed++;
      if ((o as any).payment_status === 'paid') { byStaff[name].cobrados++; byStaff[name].totalRevenue += o.total; }
    });
    // Calculate avg time accepted→completed
    Object.values(byStaff).forEach(s => {
      const timed = s.orders.filter(o => (o as any).accepted_at && (o as any).completed_at);
      if (timed.length > 0) {
        const totalMs = timed.reduce((acc, o) => {
          return acc + (new Date((o as any).completed_at).getTime() - new Date((o as any).accepted_at).getTime());
        }, 0);
        s.avgTimeMin = Math.round(totalMs / timed.length / 60000);
      }
    });
    return Object.values(byStaff).sort((a, b) => b.completed - a.completed);
  }, [orders]);

  // ── Corte Z ──
  const corteStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = orders.filter(o => o.status !== 'cancelado' && new Date(o.created_at) >= today);
    const byMethod: Record<string, number> = { sinpe: 0, efectivo: 0, tarjeta: 0 };
    todayOrders.forEach(o => {
      const m = (o.payment_method || 'efectivo').toLowerCase();
      if (m.includes('sinpe')) byMethod.sinpe += o.total;
      else if (m.includes('tarjeta') || m.includes('card')) byMethod.tarjeta += o.total;
      else byMethod.efectivo += o.total;
    });
    return { total: todayOrders.reduce((s, o) => s + o.total, 0), count: todayOrders.length, byMethod, orders: todayOrders };
  }, [orders]);

  const handleDownloadCorte = () => {
    const now = new Date().toLocaleString('es-CR');
    const lines = [
      `CORTE Z DIARIO — ${tenant.name}`,
      `Fecha: ${now}`,
      `${'='.repeat(40)}`,
      `Total de pedidos: ${corteStats.count}`,
      ``,
      `SINPE Móvil:  ${formatPrice(corteStats.byMethod.sinpe)}`,
      `Efectivo:     ${formatPrice(corteStats.byMethod.efectivo)}`,
      `Tarjeta:      ${formatPrice(corteStats.byMethod.tarjeta)}`,
      `${'='.repeat(40)}`,
      `TOTAL DEL DÍA:  ${formatPrice(corteStats.total)}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `corte-z-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Corte Z descargado');
  };

  const handleWhatsAppCorte = () => {
    const now = new Date().toLocaleString('es-CR');
    // FIX V3.0: construir el mensaje primero como string, luego usar buildWhatsAppUrl
    // para evitar doble-encoding y caracteres corruptos
    const mensajeCorte =
      `*CORTE Z \u2014 ${tenant.name}*\n${now}\n\n` +
      `Pedidos: ${corteStats.count}\n` +
      `SINPE: ${formatPrice(corteStats.byMethod.sinpe)}\n` +
      `Efectivo: ${formatPrice(corteStats.byMethod.efectivo)}\n` +
      `Tarjeta: ${formatPrice(corteStats.byMethod.tarjeta)}\n` +
      `*TOTAL: ${formatPrice(corteStats.total)}*`;
    const waUrl = buildWhatsAppUrl(tenant.whatsapp_number || tenant.phone, mensajeCorte);
    // Si no hay teléfono configurado, abrir sin destinatario
    if (waUrl) {
      window.open(waUrl, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(mensajeCorte.normalize('NFC'))}`, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-black" style={{ color: 'var(--text-primary)' }}>Dashboard</h2>

      {/* ── ROI / Upsell Module Premium V9.0 ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-green-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Prueba de ROI — Este Mes</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: <DollarSign size={16} />, color: '#F59E0B', label: 'Ventas Totales', value: formatPrice(stats.totalRevenue), sub: `${stats.totalOrders} pedidos`, bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
            { icon: <Zap size={16} />, color: '#34d399', label: 'Revenue por IA ✨', value: formatPrice(stats.aiUpsellRevenue), sub: 'generado por GPT', bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)' },
            { icon: <TrendingUp size={16} />, color: '#4ade80', label: 'Upsell Estático', value: formatPrice(stats.staticUpsellRevenue), sub: `${stats.upsellOrders} pedidos con upsell`, bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.2)' },
            { icon: <Users size={16} />, color: '#60a5fa', label: 'Tasa de Éxito', value: `${stats.upsellRate}%`, sub: 'de clientes aceptaron', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)' },
          ].map((card, i) => (
            <div key={i} className="rounded-2xl p-5 transition-all hover:scale-[1.01]" style={{ backgroundColor: card.bg, border: `1px solid ${card.border}`, boxShadow: `0 4px 20px ${card.bg}` }}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ color: card.color }}>{card.icon}</span>
                <p className="text-[11px] text-slate-400 font-bold">{card.label}</p>
              </div>
              <p className="text-2xl font-black" style={{ color: card.color }}>{card.value}</p>
              <p className="text-[11px] text-slate-600 mt-1.5 font-medium">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Revenue trend chart */}
        {stats.trendData.length > 0 && (
          <div className="mt-3 bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
            <p className="text-xs text-slate-400 mb-3">Tendencia de ventas — últimos 7 días</p>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={stats.trendData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(v: any) => [formatPrice(v), 'Ventas']} />
                <Area type="monotone" dataKey="total" stroke="#F59E0B" strokeWidth={2} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: 'Ticket Promedio', value: formatPrice(stats.avgTicket), icon: <DollarSign size={15} />, color: 'text-amber-400', bg: 'from-amber-500/10 to-amber-600/5 border-amber-500/20' },
          { label: 'Pedidos este mes', value: stats.totalOrders, icon: <ClipboardList size={15} />, color: 'text-white', bg: 'from-slate-700/30 to-slate-800/20 border-slate-600/30' },
          { label: 'Visitas al menú', value: stats.visits, icon: <Eye size={15} />, color: 'text-white', bg: 'from-slate-700/30 to-slate-800/20 border-slate-600/30' },
          { label: 'Conversión', value: stats.visits > 0 ? `${Math.round((stats.totalOrders / stats.visits) * 100)}%` : '0%', icon: <TrendingUp size={15} />, color: 'text-green-400', bg: 'from-green-500/10 to-green-600/5 border-green-500/20' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} className={`bg-gradient-to-br ${bg} border rounded-[2rem] p-5 shadow-xl`}>
            <div className="flex items-center gap-1.5 mb-2 text-slate-500">{icon}<p className="text-xs font-semibold">{label}</p></div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Picos de Venta + Top 3 con filtro dinámico ── */}
      <div className="bg-gray-900/80 border border-slate-700/50 rounded-3xl p-5 shadow-xl space-y-5">
        {/* Filtro de tiempo */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Picos de Venta</h3>
            <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{filteredStats.filteredCount} pedidos</span>
          </div>
          <div className="flex gap-1">
            {(Object.keys(analyticsFilterLabels) as AnalyticsFilter[]).map(f => (
              <button key={f} onClick={() => setAnalyticsFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  analyticsFilter === f ? 'bg-amber-500 text-black' : 'bg-slate-700/60 text-slate-400 hover:bg-slate-600'
                }`}>
                {analyticsFilterLabels[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Bloques horarios */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Mañana', sublabel: 'antes 12pm', count: filteredStats.timeBlocks.manana, color: '#F59E0B', emoji: '🌅' },
            { label: 'Tarde', sublabel: '12pm – 5pm', count: filteredStats.timeBlocks.tarde, color: '#3B82F6', emoji: '☀️' },
            { label: 'Noche', sublabel: 'después 5pm', count: filteredStats.timeBlocks.noche, color: '#8B5CF6', emoji: '🌙' },
          ].map(({ label, sublabel, count, color, emoji }) => {
            const total = filteredStats.timeBlocks.manana + filteredStats.timeBlocks.tarde + filteredStats.timeBlocks.noche;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={label} className="bg-slate-800/60 rounded-2xl p-4 text-center border border-slate-700/40">
                <div className="text-2xl mb-1">{emoji}</div>
                <p className="text-xs text-slate-400 font-semibold">{label}</p>
                <p className="text-[10px] text-slate-600 mb-2">{sublabel}</p>
                <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                <p className="text-[10px] text-slate-500 mt-1">{pct}%</p>
              </div>
            );
          })}
        </div>

        {/* Top 3 Platillos */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={14} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Top 3 Platillos Más Vendidos</h3>
          </div>
          {filteredStats.top3.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">Sin datos en este período</p>
          ) : (
            <div className="space-y-3">
              {filteredStats.top3.map((item: { name: string; count: number }, i: number) => {
                const medals = ['🥇', '🥈', '🥉'];
                const maxCount = filteredStats.top3[0].count;
                return (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="text-xl w-7 flex-shrink-0">{medals[i]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-white truncate max-w-[160px]">{item.name}</span>
                        <span className="text-xs font-bold text-amber-400 ml-2 flex-shrink-0">{item.count} uds.</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${(item.count / maxCount) * 100}%`, backgroundColor: ['#F59E0B', '#94A3B8', '#CD7F32'][i] }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Top 5 + Horas Pico ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top 5 Platillos */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={14} className="text-amber-400" />
            <h3 className="text-sm font-bold text-white">Top 5 Platillos</h3>
          </div>
          {stats.top5.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">Sin datos aún</p>
          ) : (
            <div className="space-y-2">
              {stats.top5.map((item, i) => {
                const maxCount = stats.top5[0].count;
                return (
                  <div key={item.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 w-4">#{i + 1}</span>
                        <span className="text-sm text-white truncate max-w-[140px]">{item.name}</span>
                      </div>
                      <span className="text-xs text-slate-400">{item.count} uds.</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${(item.count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Horas Pico */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-blue-400" />
            <h3 className="text-sm font-bold text-white">Horas Pico (7 días)</h3>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={stats.hourlyData} barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: '#64748B', fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
              <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                formatter={(v: any) => [v, 'Pedidos']} />
              <Bar dataKey="pedidos" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Rendimiento del Equipo ── */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck size={15} className="text-blue-400" />
          <h3 className="text-sm font-bold text-white">Rendimiento del Equipo — Hoy</h3>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            {staffStats.reduce((s, m) => s + m.completed, 0)} pedidos completados
          </span>
        </div>
        {staffStats.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">Sin actividad de meseros hoy</p>
        ) : (
          <div className="space-y-3">
            {staffStats.map(member => (
              <div key={member.name} className="bg-slate-900/60 border border-slate-700/30 rounded-xl p-4">
                {/* Staff header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-bold text-white">{member.name}</span>
                  </div>
                  <span className="text-xs font-bold text-amber-400">{formatPrice(member.totalRevenue)}</span>
                </div>
                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-white">{member.completed}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Completados</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-green-400">{member.cobrados}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Cobrados</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-blue-400">
                      {member.avgTimeMin > 0 ? `${member.avgTimeMin}m` : '—'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Tiempo prom.</p>
                  </div>
                </div>
                {/* Order list */}
                {member.orders.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {member.orders.map(o => (
                      <div key={o.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-700/20 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">#{o.order_number}</span>
                          <span className="text-slate-500">{o.customer_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'entregado' ? 'bg-green-500/20 text-green-400' :
                            o.status === 'listo' ? 'bg-blue-500/20 text-blue-400' :
                            o.status === 'en_cocina' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {o.status === 'entregado' ? 'Entregado' :
                             o.status === 'listo' ? 'Listo' :
                             o.status === 'en_cocina' ? 'En cocina' : o.status}
                          </span>
                          {(o as any).payment_status === 'paid' && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">Cobrado</span>
                          )}
                          <span className="text-slate-400 font-medium">{formatPrice(o.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Corte Z ── */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scissors size={14} className="text-purple-400" />
            <h3 className="text-sm font-bold text-white">Corte Z Diario</h3>
            <span className="text-xs text-slate-500">(hoy)</span>
          </div>
          <button onClick={() => setCorteVisible(!corteVisible)}
            className="text-xs text-slate-400 hover:text-white transition-colors">
            {corteVisible ? 'Ocultar' : 'Ver detalle'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Total del día', value: formatPrice(corteStats.total), color: 'text-amber-400', bold: true },
            { label: 'SINPE Móvil', value: formatPrice(corteStats.byMethod.sinpe), color: 'text-purple-400', bold: false },
            { label: 'Efectivo', value: formatPrice(corteStats.byMethod.efectivo), color: 'text-green-400', bold: false },
            { label: 'Tarjeta', value: formatPrice(corteStats.byMethod.tarjeta), color: 'text-blue-400', bold: false },
          ].map(({ label, value, color, bold }) => (
            <div key={label} className="bg-slate-900/50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`${bold ? 'text-lg' : 'text-base'} font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {corteVisible && corteStats.orders.length > 0 && (
          <div className="mb-4 max-h-48 overflow-y-auto space-y-1">
            {corteStats.orders.map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-700/30">
                <span className="text-slate-400">#{o.order_number} — {new Date(o.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 capitalize">{o.payment_method}</span>
                  <span className="text-white font-medium">{formatPrice(o.total)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleDownloadCorte}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-xs font-medium hover:bg-slate-600 transition-colors">
            <Download size={13} /> Descargar TXT
          </button>
          <button onClick={handleWhatsAppCorte}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600/20 text-green-400 border border-green-600/30 rounded-xl text-xs font-medium hover:bg-green-600/30 transition-colors">
            <MessageCircle size={13} /> Enviar por WhatsApp
          </button>
        </div>
      </div>

      {/* ── Delivery Analytics ── */}
      <DeliveryAnalyticsCard orders={orders as any} filter={analyticsFilter} />
    </div>
  );
}

// ─── History Tab — Panel de Inteligencia Financiera ───
type HistoryFilter = 'today' | 'yesterday' | 'week' | 'month';

function HistoryTab({ tenant }: { tenant: Tenant }) {
  const [filter, setFilter] = useState<HistoryFilter>('today');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const getDateRange = (f: HistoryFilter): { from: Date; to: Date } => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (f) {
      case 'today': return { from: today, to: now };
      case 'yesterday': {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return { from: y, to: today };
      }
      case 'week': {
        const w = new Date(today); w.setDate(w.getDate() - 6);
        return { from: w, to: now };
      }
      case 'month': {
        const m = new Date(today); m.setDate(1);
        return { from: m, to: now };
      }
    }
  };

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(filter);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .not('status', 'eq', 'cancelado')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error) setOrders((data as Order[]) || []);
    setLoading(false);
  }, [tenant.id, filter]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const kpis = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
    const aiUpsellRevenue = orders.reduce((s, o) => s + ((o as any).ai_upsell_revenue || 0), 0);
    const count = orders.length;
    return { totalRevenue, aiUpsellRevenue, count };
  }, [orders]);

  const filterLabels: Record<HistoryFilter, string> = {
    today: 'Hoy', yesterday: 'Ayer', week: 'Esta Semana', month: 'Este Mes'
  };

  const deliveryLabel = (o: Order) => {
    if ((o as any).delivery_type === 'delivery') return '🛵 Delivery';
    if ((o as any).delivery_type === 'takeout') return '🥡 Takeout';
    return '🪑 Mesa';
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Historial de Pedidos</h2>
        <button onClick={fetchHistory} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600 transition-colors">
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(filterLabels) as HistoryFilter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === f ? 'bg-amber-500 text-black' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}>
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-[2rem] p-5 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={15} className="text-amber-400" />
            <p className="text-xs text-slate-400 font-semibold">Ingresos Totales</p>
          </div>
          <p className="text-2xl font-bold text-amber-400">{formatPrice(kpis.totalRevenue)}</p>
          <p className="text-xs text-slate-500 mt-1.5">{filterLabels[filter]}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/10 to-rose-500/10 border border-rose-500/20 rounded-[2rem] p-5 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={15} className="text-emerald-400" />
            <p className="text-xs text-slate-300 font-bold">Revenue por IA ✨</p>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{formatPrice(kpis.aiUpsellRevenue)}</p>
          <p className="text-xs text-rose-400/70 mt-1.5 font-medium">generado por GPT</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-[2rem] p-5 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={15} className="text-blue-400" />
            <p className="text-xs text-slate-400 font-semibold">Volumen de Pedidos</p>
          </div>
          <p className="text-2xl font-bold text-blue-400">{kpis.count}</p>
          <p className="text-xs text-slate-500 mt-1.5">pedidos completados</p>
        </div>
      </div>

      {/* Orders table */}
      {loading ? (
        <div className="text-center py-12"><div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">Sin pedidos en este período</div>
      ) : (
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-6 px-4 py-2 border-b border-slate-700/50 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>#</span><span>Cliente</span><span>Tipo</span><span>Total</span><span>Mesero</span><span>Detalle</span>
          </div>
          <div className="divide-y divide-slate-700/30">
            {orders.map(o => (
              <div key={o.id}>
                <div className="grid grid-cols-2 sm:grid-cols-6 items-center px-4 py-3 hover:bg-slate-700/20 transition-colors">
                  <span className="text-sm font-bold text-white">#{o.order_number}</span>
                  <span className="text-sm text-slate-300 truncate">{o.customer_name || '—'}</span>
                  <span className="text-xs text-slate-400 hidden sm:block">{deliveryLabel(o)}</span>
                  <span className="text-sm font-bold text-amber-400">{formatPrice(o.total)}</span>
                  <span className="text-xs flex items-center gap-1">
                    {(o as any).handled_by_name ? <><UserCheck size={10} className="text-blue-400" /><span className="text-blue-300 font-semibold">{(o as any).handled_by_name}</span></> : <span className="text-slate-600">—</span>}
                  </span>
                  <button
                    onClick={() => setExpandedOrderId(expandedOrderId === o.id ? null : o.id)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors text-left sm:text-center">
                    {expandedOrderId === o.id ? 'Ocultar' : 'Ver Detalle'}
                  </button>
                </div>
                {expandedOrderId === o.id && (
                  <div className="px-4 pb-3 bg-slate-900/40">
                    <div className="text-xs text-slate-500 mb-1">
                      {new Date(o.created_at).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {(o as any).scheduled_date && (
                        <span className="ml-2 text-orange-400">⏰ Programado: {(o as any).scheduled_date === 'tomorrow' ? 'Mañana' : 'Hoy'} {(o as any).scheduled_time}</span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {((o.items || []) as any[]).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-400">{item.quantity}× {item.name}</span>
                          <span className="text-slate-500">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    {(o as any).delivery_address && (
                      <p className="text-xs text-slate-400 mt-1">📍 {(o as any).delivery_address}</p>
                    )}
                    {(o as any).delivery_phone && (
                      <p className="text-xs text-slate-400">📱 {(o as any).delivery_phone}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QR Tab ───
function QRTab({ tenant }: { tenant: Tenant }) {
  const menuUrl = `${window.location.origin}/${tenant.slug}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(menuUrl)}&bgcolor=FFFFFF&color=000000&format=png`;

  const handleDownload = async () => {
    try {
      const response = await fetch(qrApiUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-${tenant.slug}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('QR descargado');
    } catch {
      toast.error('Error al descargar el QR');
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-6">Código QR del Menú</h2>
      <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-6 text-center max-w-sm mx-auto">
        <div className="bg-white rounded-2xl p-6 mb-4 inline-block">
          <img src={qrApiUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
        </div>
        <p className="text-sm text-slate-300 mb-1 font-semibold">{tenant.name}</p>
        <p className="text-xs text-slate-500 mb-4 font-mono">{menuUrl}</p>
        <button onClick={handleDownload}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors mx-auto">
          <Download size={16} /> Descargar QR
        </button>
        <p className="text-[10px] text-slate-600 mt-3">Imprime este QR y colócalo en las mesas de tu restaurante</p>
      </div>
    </div>
  );
}

// ─── Staff Tab ───
interface StaffMember {
  id: string;
  tenant_id: string;
  name: string;
  username: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

function StaffTab({ tenant, onRefresh }: { tenant: Tenant; onRefresh: () => void }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'staff' | 'kitchen'>('staff');
  const [saving, setSaving] = useState(false);
  const [adminPin, setAdminPin] = useState((tenant as any).admin_pin || '');
  const [savingPin, setSavingPin] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLink = (member: StaffMember) => {
    const path = member.role === 'kitchen' ? 'kitchen' : 'staff';
    const url = `${window.location.origin}/${path}/${tenant.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(member.id);
      toast.success('Enlace copiado al portapapeles');
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => toast.error('No se pudo copiar el enlace'));
  };

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('staff').select('*').eq('tenant_id', tenant.id).order('created_at');
    setStaff(data || []);
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleCreateStaff = async () => {
    if (!newName.trim() || !newUsername.trim() || !newPassword.trim()) {
      toast.error('Completa todos los campos'); return;
    }
    if (newPassword.length < 4) { toast.error('La contraseña debe tener al menos 4 caracteres'); return; }
    setSaving(true);
    // Simple hash: btoa for demo (in production use bcrypt via edge function)
    const password_hash = btoa(newPassword);
    const { error } = await supabase.from('staff').insert({
      tenant_id: tenant.id,
      name: newName.trim(),
      username: newUsername.trim().toLowerCase(),
      password_hash,
      role: newRole,
      is_active: true,
    });
    const roleLabel = newRole === 'kitchen' ? 'Usuario de cocina' : 'Mesero';
    if (error) { toast.error('Error: ' + (error.message.includes('unique') ? 'Ese username ya existe' : error.message)); }
    else { toast.success(`${roleLabel} creado`); setNewName(''); setNewUsername(''); setNewPassword(''); setNewRole('staff'); setShowForm(false); fetchStaff(); }
    setSaving(false);
  };

  const handleToggleActive = async (member: StaffMember) => {
    await supabase.from('staff').update({ is_active: !member.is_active }).eq('id', member.id);
    fetchStaff();
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('¿Eliminar este mesero?')) return;
    await supabase.from('staff').delete().eq('id', id);
    fetchStaff();
  };

  const handleSavePin = async () => {
    if (adminPin.length !== 4 || !/^\d{4}$/.test(adminPin)) {
      toast.error('El PIN debe ser exactamente 4 dígitos numéricos'); return;
    }
    setSavingPin(true);
    const { error } = await supabase.from('tenants').update({ admin_pin: adminPin }).eq('id', tenant.id);
    if (error) toast.error('Error al guardar PIN');
    else { toast.success('PIN de seguridad guardado'); onRefresh(); }
    setSavingPin(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><Users size={20} className="text-blue-400" /> Equipo / Personal</h2>
          <p className="text-xs text-slate-400 mt-0.5">Gestiona los meseros y cajeros de tu restaurante</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
          <UserPlus size={14} /> Agregar Usuario
        </button>
      </div>

      {/* Admin PIN config */}
      <div className="bg-slate-800/40 border border-yellow-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-yellow-400" />
          <h3 className="text-sm font-bold text-yellow-400">PIN de Seguridad del Admin</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">Este PIN de 4 dígitos se requerirá cuando un mesero intente cancelar una orden.</p>
        <div className="flex items-center gap-3">
          <input
            type="password"
            maxLength={4}
            value={adminPin}
            onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            className="w-24 px-3 py-2 bg-slate-900 border border-slate-600 rounded-xl text-center text-lg font-bold text-white tracking-widest focus:outline-none focus:border-yellow-500"
          />
          <button onClick={handleSavePin} disabled={savingPin}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-black rounded-xl text-sm font-bold hover:bg-yellow-400 transition-colors disabled:opacity-50">
            <Save size={14} /> {savingPin ? 'Guardando...' : 'Guardar PIN'}
          </button>
          {(tenant as any).admin_pin && (
            <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> PIN configurado</span>
          )}
        </div>
      </div>

      {/* Create staff form */}
      {showForm && (
        <div className="bg-slate-800/60 border border-slate-600/40 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><UserPlus size={14} /> Nuevo Usuario</h3>
          {/* Role selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewRole('staff')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                newRole === 'staff'
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
              }`}
            >
              <UtensilsCrossed size={12} /> Mesero
            </button>
            <button
              type="button"
              onClick={() => setNewRole('kitchen')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                newRole === 'kitchen'
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
              }`}
            >
              <ChefHat size={12} /> Cocina
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nombre completo</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Juan Pérez"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Username (para login)</label>
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="juan"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Contraseña</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateStaff} disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                newRole === 'kitchen' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'
              }`}>
              <Save size={14} /> {saving ? 'Creando...' : newRole === 'kitchen' ? 'Crear Usuario Cocina' : 'Crear Mesero'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-700 text-slate-300 rounded-xl text-sm hover:bg-slate-600 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" /></div>
      ) : staff.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay meseros registrados</p>
          <p className="text-xs mt-1">Agrega tu primer mesero para que puedan usar el panel de staff</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map(member => (
            <div key={member.id} className="flex items-center justify-between p-4 bg-slate-800/40 border border-slate-700/40 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                    member.role === 'kitchen'
                      ? 'bg-gradient-to-br from-orange-500 to-red-600'
                      : 'bg-gradient-to-br from-blue-500 to-purple-600'
                  }`}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{member.name}</p>
                  <p className="text-xs text-slate-400">@{member.username} · {member.role === 'kitchen' ? '🍳 Cocina' : 'Mesero'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${member.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/40 text-slate-500'}`}>
                  {member.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => handleToggleActive(member)}
                  className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-slate-300">
                  {member.is_active ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <button
                  onClick={() => handleCopyLink(member)}
                  title={member.role === 'kitchen' ? 'Copiar enlace de acceso para cocina' : 'Copiar enlace de acceso para mesero'}
                  className={`p-2 rounded-lg transition-colors ${
                    copiedId === member.id
                      ? 'bg-green-500/20 text-green-400'
                      : member.role === 'kitchen'
                        ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400'
                        : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400'
                  }`}>
                  {copiedId === member.id ? <Check size={14} /> : <Link2 size={14} />}
                </button>
                <button onClick={() => handleDeleteStaff(member.id)}
                  className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Login URLs info */}
      <div className="bg-slate-800/40 border border-slate-600/20 rounded-2xl p-4 space-y-2">
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Eye size={12} /> Meseros inician sesión en: <span className="text-blue-400 font-mono">/staff/{tenant.slug}</span>
        </p>
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <ChefHat size={12} className="text-orange-400" /> Cocina accede en: <span className="text-orange-400 font-mono">/kitchen/{tenant.slug}</span>
        </p>
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Bike size={12} className="text-amber-400" /> Riders acceden en: <span className="text-amber-400 font-mono">/rider/{tenant.slug}</span>
        </p>
      </div>

      {/* ── Riders de Delivery ── */}
      <div className="mt-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
          <Bike size={20} className="text-amber-400" /> Riders de Delivery
        </h2>
        <p className="text-xs text-slate-400 mb-4">Gestiona los repartidores. Cada rider accede con su PIN desde <span className="text-amber-400 font-mono">/rider/{tenant.slug}</span></p>
        <DeliveryDispatchPanel tenant={tenant} />
      </div>
    </div>
  );
}

// ─── Staff Analytics Tab — V26.0 ───
function StaffAnalyticsTab({ tenant }: { tenant: Tenant }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'today' | 'week' | 'month'>('today');
  const fmtTime = (sec: number) => { if (!sec) return '—'; if (sec < 60) return `${sec}s`; return `${Math.round(sec/60)}m`; };
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    let since: Date;
    if (filter === 'today') { since = new Date(now); since.setHours(0,0,0,0); }
    else if (filter === 'week') { since = new Date(now); since.setDate(now.getDate() - 7); }
    else { since = new Date(now); since.setDate(now.getDate() - 30); }
    const { data } = await supabase.from('staff_events').select('*').eq('tenant_id', tenant.id).gte('created_at', since.toISOString()).order('created_at', { ascending: false });
    setEvents(data || []);
    setLoading(false);
  }, [tenant.id, filter]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  const staffMetrics = useMemo(() => {
    const byStaff: Record<string, { name: string; ordersAccepted: number; ordersDelivered: number; quickRequests: number; acceptTimes: number[]; deliverTimes: number[]; avgAcceptTimeSec: number; avgDeliverTimeSec: number; }> = {};
    events.forEach(e => {
      if (!byStaff[e.staff_name]) byStaff[e.staff_name] = { name: e.staff_name, ordersAccepted: 0, ordersDelivered: 0, quickRequests: 0, acceptTimes: [], deliverTimes: [], avgAcceptTimeSec: 0, avgDeliverTimeSec: 0 };
      const s = byStaff[e.staff_name];
      if (e.event_type === 'order_accepted') { s.ordersAccepted++; if (e.response_time_seconds) s.acceptTimes.push(e.response_time_seconds); }
      if (e.event_type === 'order_delivered') { s.ordersDelivered++; if (e.response_time_seconds) s.deliverTimes.push(e.response_time_seconds); }
      if (e.event_type === 'quick_request_attended') s.quickRequests++;
    });
    Object.values(byStaff).forEach(s => {
      if (s.acceptTimes.length) s.avgAcceptTimeSec = Math.round(s.acceptTimes.reduce((a,b)=>a+b,0)/s.acceptTimes.length);
      if (s.deliverTimes.length) s.avgDeliverTimeSec = Math.round(s.deliverTimes.reduce((a,b)=>a+b,0)/s.deliverTimes.length);
    });
    return Object.values(byStaff).sort((a,b) => b.ordersDelivered - a.ordersDelivered);
  }, [events]);
  const insights = useMemo(() => {
    const result: { type: 'good' | 'warn' | 'info'; text: string }[] = [];
    if (staffMetrics.length === 0) { result.push({ type: 'info', text: 'Sin actividad registrada en este período' }); return result; }
    const top = staffMetrics[0];
    if (top) result.push({ type: 'good', text: `🏆 ${top.name} lideró con ${top.ordersDelivered} pedidos entregados` });
    const slowAccept = staffMetrics.find(s => s.avgAcceptTimeSec > 180 && s.acceptTimes.length >= 2);
    if (slowAccept) result.push({ type: 'warn', text: `⚠️ ${slowAccept.name} tarda en promedio ${Math.round(slowAccept.avgAcceptTimeSec/60)}m en aceptar pedidos` });
    const fastAccept = staffMetrics.find(s => s.avgAcceptTimeSec > 0 && s.avgAcceptTimeSec < 60);
    if (fastAccept) result.push({ type: 'good', text: `⚡ ${fastAccept.name} acepta pedidos en menos de 1 minuto en promedio` });
    const qrChamp = [...staffMetrics].sort((a,b)=>b.quickRequests-a.quickRequests)[0];
    if (qrChamp && qrChamp.quickRequests > 0) result.push({ type: 'info', text: `🔔 ${qrChamp.name} atendió ${qrChamp.quickRequests} solicitudes rápidas` });
    return result;
  }, [staffMetrics]);
  const filterLabels = { today: 'Hoy', week: 'Últimos 7 días', month: 'Últimos 30 días' };
  const eventLabels: Record<string, { label: string; color: string }> = {
    order_accepted: { label: 'Pedido aceptado', color: '#3b82f6' },
    order_ready: { label: 'Pedido listo', color: '#f59e0b' },
    order_delivered: { label: 'Pedido entregado', color: '#22c55e' },
    quick_request_attended: { label: 'Solicitud atendida', color: '#a78bfa' },
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2"><TrendingUp size={20} className="text-amber-400" /> Rendimiento del Equipo</h2>
          <p className="text-xs text-slate-400 mt-0.5">Métricas operativas en tiempo real por mesero</p>
        </div>
        <div className="flex gap-1.5">
          {(Object.keys(filterLabels) as (keyof typeof filterLabels)[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={filter === f ? { background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: '#000' } : { backgroundColor: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
              {filterLabels[f]}
            </button>
          ))}
        </div>
      </div>
      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ backgroundColor: ins.type === 'good' ? 'rgba(34,197,94,0.08)' : ins.type === 'warn' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)', border: `1px solid ${ins.type === 'good' ? 'rgba(34,197,94,0.2)' : ins.type === 'warn' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}` }}>
              <p className="text-sm text-slate-200">{ins.text}</p>
            </div>
          ))}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>
      ) : staffMetrics.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <UserCheck size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Sin actividad registrada</p>
          <p className="text-xs mt-1 text-slate-600">Los eventos se registran cuando los meseros aceptan o entregan pedidos</p>
        </div>
      ) : (
        <div className="space-y-4">
          {staffMetrics.map((member, idx) => (
            <div key={member.name} className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                    style={{ background: idx === 0 ? 'linear-gradient(135deg,#F59E0B,#F97316)' : idx === 1 ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">{member.name}</p>
                    {idx === 0 && <span className="text-[10px] font-bold text-amber-400">🏆 Top performer</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-white">{member.ordersDelivered}</p>
                  <p className="text-[10px] text-slate-500">entregados</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                {[
                  { label: 'Aceptados', value: member.ordersAccepted, color: '#3b82f6' },
                  { label: 'Entregados', value: member.ordersDelivered, color: '#22c55e' },
                  { label: 'T. aceptación', value: fmtTime(member.avgAcceptTimeSec), color: member.avgAcceptTimeSec > 180 ? '#ef4444' : '#f59e0b' },
                  { label: 'Solicitudes', value: member.quickRequests, color: '#a78bfa' },
                ].map(m => (
                  <div key={m.label} className="px-4 py-3 text-center" style={{ backgroundColor: 'rgba(15,23,42,0.6)' }}>
                    <p className="text-xl font-black" style={{ color: m.color }}>{m.value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest">Últimos eventos</h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {events.slice(0, 20).map(e => {
              const ev = eventLabels[e.event_type] || { label: e.event_type, color: '#64748b' };
              return (
                <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div>
                      <p className="text-xs font-bold text-slate-200">{e.staff_name}</p>
                      <p className="text-[10px] text-slate-500">{ev.label}{e.order_number ? ` — #${e.order_number}` : ''}{e.table_number ? ` · Mesa ${e.table_number}` : ''}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    {e.response_time_seconds && <p className="text-[10px] text-slate-500">{fmtTime(e.response_time_seconds)}</p>}
                    <p className="text-[10px] text-slate-600">{new Date(e.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───
type TabKey = 'menu' | 'categories' | 'modifiers' | 'settings' | 'theme' | 'orders' | 'analytics' | 'history' | 'qr' | 'staff' | 'performance';

export default function AdminDashboard() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { isAuthenticated, role, logout } = useAdminAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>('menu');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || (role !== 'admin' && role !== 'superadmin')) {
      navigate(`/admin/${slug}/login`);
    }
  }, [isAuthenticated, role, navigate, slug]);

  const fetchData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const { data: t } = await supabase.from('tenants').select('*').eq('slug', slug).single();
    if (!t) { setLoading(false); return; }
    setTenant(t);
    const [themeRes, catRes, itemsRes, ordersRes] = await Promise.all([
      supabase.from('theme_settings').select('*').eq('tenant_id', t.id).single(),
      supabase.from('categories').select('*').eq('tenant_id', t.id).order('sort_order'),
      supabase.from('menu_items').select('*').eq('tenant_id', t.id).order('sort_order'),
      supabase.from('orders').select('*').eq('tenant_id', t.id).order('created_at', { ascending: false }).limit(100),
    ]);
    setTheme(themeRes.data);
    setCategories(catRes.data || []);
    setItems(itemsRes.data || []);
    setOrders((ordersRes.data as Order[]) || []);
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-page)' }}>
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!tenant || !theme) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-page)' }}>
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Restaurante no encontrado</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>El slug "{slug}" no existe en la base de datos.</p>
        </div>
      </div>
    );
  }

  const planFeatures = getPlanFeatures(tenant.plan_tier || 'premium');

  const allTabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'orders', label: 'Pedidos', icon: <ClipboardList size={14} /> },
    { key: 'history', label: 'Historial', icon: <Clock size={14} /> },
    { key: 'menu', label: 'Menú', icon: <UtensilsCrossed size={14} /> },
    { key: 'categories', label: 'Categorías', icon: <Tag size={14} /> },
    { key: 'modifiers', label: 'Mods', icon: <Sliders size={14} /> },
    { key: 'settings', label: 'Config', icon: <Settings size={14} /> },
    { key: 'theme', label: 'Tema', icon: <Palette size={14} /> },
    { key: 'analytics', label: 'Analítica', icon: <BarChart3 size={14} /> },
    { key: 'performance', label: 'Rendimiento', icon: <TrendingUp size={14} /> },
    { key: 'qr', label: 'QR', icon: <QrCode size={14} /> },
    { key: 'staff', label: 'Equipo', icon: <UserCheck size={14} /> },
  ];

  // Feature flagging: filter tabs based on plan tier
  const tabs = allTabs.filter(tab => {
    if (tab.key === 'orders' && !planFeatures.kds) return false;
    if (tab.key === 'analytics' && !planFeatures.analytics) return false;
    return true;
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <header className="backdrop-blur-xl border-b sticky top-0 z-40" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)', borderColor: 'var(--border)', boxShadow: '0 2px 16px rgba(0,0,0,0.4)' }}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)', boxShadow: '0 6px 18px rgba(245,158,11,0.45)' }}>
              <UtensilsCrossed size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{tenant.name}</h1>
                <span className={`flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-full ${
                  tenant.is_open
                    ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${tenant.is_open ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  {tenant.is_open ? 'Abierto' : 'Cerrado'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">/{slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/${slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all hover:brightness-110"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Eye size={13} /> Ver menú <ExternalLink size={11} />
            </a>
            <button onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all hover:bg-red-500/15 hover:text-red-400"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <LogOut size={13} /> Salir
            </button>
          </div>
        </div>
      </header>

      <div className="border-b sticky top-[69px] z-30 backdrop-blur-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 90%, transparent)', borderColor: 'var(--border)', boxShadow: '0 1px 8px rgba(0,0,0,0.2)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex overflow-x-auto scrollbar-hide whitespace-nowrap gap-0.5 px-3 py-2">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-black transition-all duration-200 whitespace-nowrap flex-shrink-0"
                style={activeTab === tab.key ? {
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.22), rgba(249,115,22,0.18))',
                  color: '#F59E0B',
                  border: '1.5px solid rgba(245,158,11,0.4)',
                  boxShadow: '0 4px 12px rgba(245,158,11,0.2)',
                } : {
                  color: 'var(--text-secondary)',
                  border: '1.5px solid rgba(255,255,255,0.06)',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === 'orders' && <OrdersTab tenant={tenant} />}
        {activeTab === 'menu' && <MenuTab tenant={tenant} categories={categories} items={items} onRefresh={fetchData} />}
        {activeTab === 'categories' && <CategoriesTab tenant={tenant} categories={categories} onRefresh={fetchData} />}
        {activeTab === 'modifiers' && <ModifiersTab tenant={tenant} items={items} />}
        {activeTab === 'settings' && <SettingsTab tenant={tenant} onRefresh={fetchData} />}
        {activeTab === 'theme' && <ThemeTab tenant={tenant} theme={theme} onRefresh={fetchData} />}
        {activeTab === 'analytics' && <AnalyticsTab tenant={tenant} items={items} orders={orders} />}
        {activeTab === 'history' && <HistoryTab tenant={tenant} />}
        {activeTab === 'qr' && <QRTab tenant={tenant} />}
        {activeTab === 'staff' && <StaffTab tenant={tenant} onRefresh={fetchData} />}
        {activeTab === 'performance' && <StaffAnalyticsTab tenant={tenant} />}
      </main>
    </div>
  );
}
