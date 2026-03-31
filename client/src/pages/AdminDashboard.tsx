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
import { DeliveryOS } from '@/components/DeliveryOS';
import DeliveryFeeAdjuster from '@/components/DeliveryFeeAdjuster';
import TablesMapPanel from '@/components/TablesMapPanel';
import CustomersTab from '@/pages/CustomersTab';
import PromotionsTab from '@/pages/PromotionsTab';
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
  Trophy, AlertCircle, Users, MapPin, Navigation, Bike, UserCheck, ShieldCheck, UserPlus, Lock, Unlock, Link2, Copy, Check, Sliders, ChevronDown, ChevronUp, ChevronRight, Menu as MenuIcon,
  Loader2
} from 'lucide-react';
import { waPhone, buildWhatsAppUrl } from '@/lib/phone';
import { AdminSidebar } from '@/components/AdminSidebar';
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
      {label && <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">{label}</span>}
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
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Platillos ({items.length})</h2>
        <button onClick={startCreate}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors">
          <Plus size={16} /> Nuevo platillo
        </button>
      </div>

      {isEditing && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <h3 className="text-[var(--text-primary)] font-bold mb-4">{editingItem ? 'Editar platillo' : 'Nuevo platillo'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Nombre *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Precio (₡) *</label>
              <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Descripción</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                rows={2} className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none resize-none" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Categoría *</label>
              <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none">
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Badge</label>
              <select value={form.badge} onChange={e => setForm({ ...form, badge: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none">
                <option value="">Sin badge</option>
                <option value="mas_pedido">Más pedido</option>
                <option value="se_agota_rapido">Se agota rápido</option>
                <option value="nuevo">Nuevo</option>
                <option value="chef_recomienda">Chef recomienda</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Orden</label>
              <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Upsell (platillo sugerido)</label>
              <select value={form.upsell_item_id} onChange={e => setForm({ ...form, upsell_item_id: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none">
                <option value="">Sin upsell</option>
                {items.filter(i => i.id !== editingItem?.id).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Texto de upsell</label>
              <input value={form.upsell_text} onChange={e => setForm({ ...form, upsell_text: e.target.value })}
                placeholder="Agrega unas papas..." className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
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
            <div className="mt-5 pt-5 border-t border-[var(--border)]">
              <div className="flex items-center gap-2 mb-2">
                <Sliders size={14} className="text-amber-400" />
                <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Grupos de modificadores</span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mb-3">Activa los grupos y configura el precio de cada opción directamente aquí.</p>
              {loadingModifiers ? (
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <div className="w-4 h-4 border border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span>Cargando grupos...</span>
                </div>
              ) : allModifierGroups.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] italic">Sin grupos creados. Ve a la pestaña <strong className="text-amber-400">Modificadores</strong> para crear grupos.</p>
              ) : (
                <div className="space-y-2">
                  {allModifierGroups.map(group => {
                    const isAssigned = itemModifierGroups.some(g => g.id === group.id);
                    const isExpanded = expandedGroup === group.id;
                    const options = groupOptions[group.id] || [];
                    return (
                      <div key={group.id} className={`rounded-xl border transition-all ${
                        isAssigned ? 'border-amber-500/40 bg-amber-500/5' : 'border-[var(--border)] bg-[var(--bg-surface)]'
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
                            {isAssigned && <Check size={11} className="text-[var(--text-primary)]" />}
                          </button>
                          <span className={`text-sm font-medium flex-1 ${
                            isAssigned ? 'text-amber-300' : 'text-[var(--text-secondary)]'
                          }`}>{group.name}</span>
                          {isAssigned && options.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                              className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-amber-400 transition-colors"
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
                            <p className="text-[10px] text-[var(--text-secondary)] mb-1">Configura el precio de cada opción:</p>
                            {options.map(opt => (
                              <div key={opt.id} className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-lg px-2 py-1.5">
                                <span className="text-xs text-[var(--text-secondary)] flex-1 min-w-0 truncate">{opt.name}</span>
                                <select
                                  value={opt.pricing_type}
                                  onChange={e => {
                                    const newType = e.target.value;
                                    const newDelta = (newType === 'included' || newType === 'free') ? 0 : opt.price_delta;
                                    updateOptionPrice(opt.id, group.id, newType, newDelta);
                                  }}
                                  className="text-[11px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
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
                                    className="w-20 text-[11px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
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
            <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors">
              <Save size={16} /> Guardar
            </button>
            <button onClick={() => { setEditingItem(null); setIsCreating(false); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-600 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-slate-500 transition-colors">
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
                <div key={item.id} className={`flex items-center gap-3 bg-[var(--bg-surface)] border rounded-xl p-3 mb-2 group hover:border-[var(--border)] transition-colors ${!item.is_available ? 'opacity-50 border-red-500/20' : 'border-[var(--border)]'}`}>
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[var(--bg-surface)] flex items-center justify-center flex-shrink-0">
                      <UtensilsCrossed size={16} className="text-[var(--text-secondary)]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate min-w-0 max-w-[140px] sm:max-w-[200px]">{item.name}</span>
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
                      className="p-2 hover:bg-[var(--bg-surface)] active:bg-slate-600 rounded-lg transition-colors"
                      title="Editar platillo"
                    >
                      <Pencil size={14} className="text-[var(--text-secondary)]" />
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
  const [form, setForm] = useState({ name: '', description: '', sort_order: '0', is_active: true, is_drink: false });

  const startEdit = (cat: Category) => {
    setEditingCat(cat); setIsCreating(false);
    setForm({ name: cat.name, description: cat.description || '', sort_order: String(cat.sort_order), is_active: cat.is_active, is_drink: cat.is_drink ?? false });
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('El nombre es obligatorio'); return; }
    const payload = {
      tenant_id: tenant.id, name: form.name, description: form.description || null,
      sort_order: parseInt(form.sort_order) || 0, is_active: form.is_active, is_drink: form.is_drink,
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
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Categorías ({categories.length})</h2>
            <button onClick={() => { setIsCreating(true); setEditingCat(null); setForm({ name: '', description: '', sort_order: '0', is_active: true, is_drink: false }); }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors">
          <Plus size={16} /> Nueva categoría
        </button>
      </div>

      {isEditing && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Nombre *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Orden</label>
              <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Descripción</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
            </div>
            <ToggleSwitch checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Activa" />
            <ToggleSwitch checked={form.is_drink} onChange={(v) => setForm({ ...form, is_drink: v })} label="Es categoría de Bebidas 🍹" />
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-amber-600">
              <Save size={16} /> Guardar
            </button>
            <button onClick={() => { setEditingCat(null); setIsCreating(false); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-600 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-slate-500">
              <X size={16} /> Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-4 group hover:border-[var(--border)] transition-colors">
            <GripVertical size={16} className="text-[var(--text-secondary)]" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">{cat.name}</span>
                {!cat.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">Inactiva</span>}
                {cat.is_drink && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">🍹 Bebida</span>}
              </div>
              {cat.description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{cat.description}</p>}
            </div>
            <span className="text-xs text-[var(--text-secondary)]">Orden: {cat.sort_order}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => startEdit(cat)} className="p-2 hover:bg-[var(--bg-surface)] rounded-lg"><Pencil size={14} className="text-[var(--text-secondary)]" /></button>
              <button onClick={() => handleDelete(cat.id)} className="p-2 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} className="text-red-400" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Menu Sections Manager (Franjas Horarias) ───
function MenuSectionsManager({ tenant, categories, items }: { tenant: Tenant; categories: Category[]; items: MenuItem[] }) {
  const [sections, setSections] = useState<{ id: string; name: string; description: string | null; icon: string; sort_order: number; is_active: boolean }[]>([]);
  const [sectionItems, setSectionItems] = useState<{ section_id: string; item_id: string }[]>([]);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', icon: '🍽️', sort_order: '0', is_active: true });
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Search filter per section
  const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});

  const fetchSections = useCallback(async () => {
    const { data: sData } = await supabase.from('menu_sections').select('*').eq('tenant_id', tenant.id).order('sort_order');
    // Fetch section items filtered by sections belonging to this tenant
    const sectionIds = (sData || []).map((s: any) => s.id);
    let siData: any[] = [];
    if (sectionIds.length > 0) {
      const { data } = await supabase.from('menu_section_items').select('*').in('section_id', sectionIds);
      siData = data || [];
    }
    setSections(sData || []);
    setSectionItems(siData);
  }, [tenant.id]);

  useEffect(() => { fetchSections(); }, [fetchSections]);

  const handleSaveSection = async () => {
    if (!form.name) { toast.error('El nombre es obligatorio'); return; }
    setSaving(true);
    const payload = { tenant_id: tenant.id, name: form.name, description: form.description || null, icon: form.icon || '🍽️', sort_order: parseInt(form.sort_order) || 0, is_active: form.is_active, updated_at: new Date().toISOString() };
    if (editingSection) {
      const { error } = await supabase.from('menu_sections').update(payload).eq('id', editingSection);
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return; }
      toast.success('Sección actualizada');
    } else {
      const { error } = await supabase.from('menu_sections').insert(payload);
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return; }
      toast.success('Sección creada');
    }
    setEditingSection(null); setIsCreating(false); setSaving(false); fetchSections();
  };

  const handleDeleteSection = async (id: string) => {
    if (!confirm('¿Eliminar esta sección? Los platillos no se eliminarán.')) return;
    await supabase.from('menu_section_items').delete().eq('section_id', id);
    await supabase.from('menu_sections').delete().eq('id', id);
    toast.success('Sección eliminada'); fetchSections();
  };

  const toggleItemInSection = async (sectionId: string, itemId: string) => {
    const exists = sectionItems.some(si => si.section_id === sectionId && si.item_id === itemId);
    if (exists) {
      const { error } = await supabase.from('menu_section_items').delete().eq('section_id', sectionId).eq('item_id', itemId);
      if (error) { toast.error('Error: ' + error.message); return; }
      setSectionItems(prev => prev.filter(si => !(si.section_id === sectionId && si.item_id === itemId)));
    } else {
      const { error } = await supabase.from('menu_section_items').insert({ section_id: sectionId, item_id: itemId });
      if (error) { toast.error('Error: ' + error.message); return; }
      setSectionItems(prev => [...prev, { section_id: sectionId, item_id: itemId }]);
    }
  };

  const ICONS = ['🍽️', '🌅', '☀️', '🌙', '🍳', '🥗', '🍖', '🍷', '☕', '🎉', '🌮', '🍜'];

  return (
    <div className="mt-8 border-t border-[var(--border)] pt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-[var(--text-primary)]">Franjas Horarias del Menú</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Asigna platillos individuales a secciones como Desayunos, Almuerzos o Cenas. El cliente verá un selector adicional.</p>
        </div>
        <button onClick={() => { setIsCreating(true); setEditingSection(null); setForm({ name: '', description: '', icon: '🍽️', sort_order: '0', is_active: true }); }}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 text-white rounded-xl text-xs font-medium hover:bg-indigo-600 transition-colors">
          <Plus size={14} /> Nueva franja
        </button>
      </div>

      {(isCreating || editingSection) && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Nombre *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Desayunos, Almuerzos Ejecutivos, Cenas"
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Orden</label>
              <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Descripción (opcional)</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-indigo-500/50 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-2">Ícono</label>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(icon => (
                  <button key={icon} onClick={() => setForm({ ...form, icon })}
                    className={`text-xl p-1.5 rounded-lg transition-all ${form.icon === icon ? 'bg-indigo-500/30 ring-2 ring-indigo-500' : 'hover:bg-[var(--bg-surface)]'}`}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <ToggleSwitch checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Activa" />
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSaveSection} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-xl text-sm font-medium hover:bg-indigo-600 disabled:opacity-50">
              <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={() => { setEditingSection(null); setIsCreating(false); }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-xl text-sm font-medium hover:bg-slate-500">
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {sections.length === 0 && !isCreating && (
        <div className="text-center py-8 text-[var(--text-secondary)] text-sm border border-dashed border-[var(--border)] rounded-2xl">
          <p className="text-2xl mb-2">🕐</p>
          <p>No hay franjas horarias configuradas.</p>
          <p className="text-xs mt-1 opacity-70">Crea una para separar tu menú por horario.</p>
        </div>
      )}

      <div className="space-y-3">
        {sections.map(section => {
          const assignedItemIds = sectionItems.filter(si => si.section_id === section.id).map(si => si.item_id);
          const isExpanded = expandedSection === section.id;
          const query = (searchQuery[section.id] || '').toLowerCase();
          return (
            <div key={section.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <span className="text-2xl">{section.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{section.name}</span>
                    {!section.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">Inactiva</span>}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">{assignedItemIds.length} platillos</span>
                  </div>
                  {section.description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{section.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs hover:bg-indigo-500/20 transition-colors">
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isExpanded ? 'Cerrar' : 'Asignar platillos'}
                  </button>
                  <button onClick={() => { setEditingSection(section.id); setIsCreating(false); setForm({ name: section.name, description: section.description || '', icon: section.icon, sort_order: String(section.sort_order), is_active: section.is_active }); }}
                    className="p-2 hover:bg-[var(--bg-surface)] rounded-lg"><Pencil size={14} className="text-[var(--text-secondary)]" /></button>
                  <button onClick={() => handleDeleteSection(section.id)}
                    className="p-2 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} className="text-red-400" /></button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-[var(--border)] p-4 bg-[var(--bg-surface)]/50">
                  <p className="text-xs text-[var(--text-secondary)] mb-3">Selecciona los platillos que pertenecen a esta franja horaria:</p>
                  {/* Search filter */}
                  <input
                    type="text"
                    placeholder="Buscar platillo..."
                    value={searchQuery[section.id] || ''}
                    onChange={e => setSearchQuery(prev => ({ ...prev, [section.id]: e.target.value }))}
                    className="w-full mb-3 px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-xs focus:ring-2 focus:ring-indigo-500/50 focus:outline-none"
                  />
                  {/* Items grouped by category */}
                  <div className="space-y-4">
                    {categories.map(cat => {
                      const catItems = items.filter(i => i.category_id === cat.id && (!query || i.name.toLowerCase().includes(query)));
                      if (catItems.length === 0) return null;
                      const allCatAssigned = catItems.every(i => assignedItemIds.includes(i.id));
                      return (
                        <div key={cat.id}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{cat.name}</span>
                            <button
                              onClick={async () => {
                                if (allCatAssigned) {
                                  // Deselect all in category
                                  for (const item of catItems) {
                                    if (assignedItemIds.includes(item.id)) await toggleItemInSection(section.id, item.id);
                                  }
                                } else {
                                  // Select all in category
                                  for (const item of catItems) {
                                    if (!assignedItemIds.includes(item.id)) await toggleItemInSection(section.id, item.id);
                                  }
                                }
                              }}
                              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                                allCatAssigned
                                  ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                                  : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-indigo-500/50'
                              }`}>
                              {allCatAssigned ? 'Quitar todos' : 'Seleccionar todos'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {catItems.map(item => {
                              const isAssigned = assignedItemIds.includes(item.id);
                              return (
                                <button key={item.id} onClick={() => toggleItemInSection(section.id, item.id)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                                    isAssigned
                                      ? 'bg-indigo-500 text-white shadow-sm'
                                      : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-indigo-500/50'
                                  }`}>
                                  {isAssigned && <Check size={10} />}
                                  {item.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Delivery Tab with History + Ops (Fases 2-5) ───
function DeliveryTabWithHistory({ tenant, kanbanNode, pendingCount }: { tenant: Tenant; kanbanNode?: React.ReactNode; pendingCount?: number }) {
  const [view, setView] = useState<'kanban' | 'dispatch' | 'ops' | 'history'>('kanban');
  const TABS = [
    { key: 'kanban'   as const, label: '📦 Pedidos',     badge: pendingCount },
    { key: 'dispatch' as const, label: '🛵 Despacho',    badge: undefined },
    { key: 'ops'      as const, label: '🟢 Operaciones', badge: undefined },
    { key: 'history'  as const, label: '📋 Historial',   badge: undefined },
  ];
  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`relative px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              view === t.key
                ? 'bg-blue-500 text-[var(--text-primary)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-[var(--text-primary)] text-[10px] font-black px-1 shadow-lg animate-pulse">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      {view === 'kanban'   && (kanbanNode ?? <div className="text-center py-12 text-[var(--text-secondary)] text-sm">Sin pedidos delivery activos</div>)}
      {view === 'dispatch' && <DeliveryDispatchPanel  tenant={tenant} />}
      {view === 'ops'      && <DeliveryOpsPanel      tenant={tenant} />}
      {view === 'history'  && <DeliveryHistoryPanel   tenant={tenant} />}
    </div>
  );
}

// ─── Tables Config Section ───
function TablesConfigSection({ tenant }: { tenant: Tenant }) {
  const [tables, setTables] = useState<{ id: string; table_number: string; label: string; capacity: string; sort_order: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTable, setNewTable] = useState({ table_number: '', label: '', capacity: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [bulkCount, setBulkCount] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  const fetchTables = useCallback(async () => {
    const { data } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, label, capacity, sort_order, is_active')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('table_number', { ascending: true });
    setTables((data || []).map((t: any) => ({ ...t, capacity: String(t.capacity || '') })));
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  const handleAddTable = async () => {
    if (!newTable.table_number.trim()) { toast.error('El número de mesa es obligatorio'); return; }
    setSaving(true);
    const { error } = await supabase.from('restaurant_tables').insert({
      tenant_id: tenant.id,
      table_number: newTable.table_number.trim(),
      label: newTable.label.trim() || null,
      capacity: parseInt(newTable.capacity) || null,
      is_active: true,
      is_occupied: false,
      sort_order: tables.length,
    });
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Mesa agregada');
    setNewTable({ table_number: '', label: '', capacity: '' });
    setShowAdd(false);
    fetchTables();
  };

  const handleBulkCreate = async () => {
    const count = parseInt(bulkCount);
    if (!count || count < 1 || count > 50) { toast.error('Ingresa un número entre 1 y 50'); return; }
    setSaving(true);
    const existingNumbers = new Set(tables.map(t => t.table_number));
    const toInsert = [];
    let num = 1;
    while (toInsert.length < count) {
      const numStr = String(num);
      if (!existingNumbers.has(numStr)) {
        toInsert.push({
          tenant_id: tenant.id,
          table_number: numStr,
          label: null,
          capacity: null,
          is_active: true,
          is_occupied: false,
          sort_order: tables.length + toInsert.length,
        });
      }
      num++;
    }
    const { error } = await supabase.from('restaurant_tables').insert(toInsert);
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(`${count} mesas creadas`);
    setBulkCount('');
    setShowBulk(false);
    fetchTables();
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm('¿Eliminar esta mesa?')) return;
    const { error } = await supabase.from('restaurant_tables').update({ is_active: false }).eq('id', id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Mesa eliminada');
    fetchTables();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <UtensilsCrossed size={16} className="text-amber-400" />
          <h3 className="text-sm font-black text-[var(--text-primary)]">Mesas del Restaurante</h3>
          <span className="text-xs text-[var(--text-secondary)]">({tables.length} configuradas)</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowBulk(!showBulk); setShowAdd(false); }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors"
          >
            Crear en lote
          </button>
          <button
            onClick={() => { setShowAdd(!showAdd); setShowBulk(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            <Plus size={12} /> Agregar mesa
          </button>
        </div>
      </div>

      {/* Creación en lote */}
      {showBulk && (
        <div className="mb-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
          <p className="text-xs text-slate-400 mb-3">Crea múltiples mesas numeradas automáticamente (Mesa 1, Mesa 2, etc.)</p>
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={50}
              value={bulkCount}
              onChange={e => setBulkCount(e.target.value)}
              placeholder="¿Cuántas mesas?"
              className="flex-1 px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
            />
            <button
              onClick={handleBulkCreate}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {/* Formulario agregar mesa individual */}
      {showAdd && (
        <div className="mb-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div>
              <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Número *</label>
              <input
                value={newTable.table_number}
                onChange={e => setNewTable({ ...newTable, table_number: e.target.value })}
                placeholder="Ej: 5"
                className="w-full px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Etiqueta</label>
              <input
                value={newTable.label}
                onChange={e => setNewTable({ ...newTable, label: e.target.value })}
                placeholder="Ej: Terraza"
                className="w-full px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Capacidad</label>
              <input
                type="number" min={1}
                value={newTable.capacity}
                onChange={e => setNewTable({ ...newTable, capacity: e.target.value })}
                placeholder="Ej: 4"
                className="w-full px-2 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddTable} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {saving ? 'Guardando...' : 'Agregar'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border)] hover:opacity-80 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de mesas */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="text-amber-400 animate-spin" />
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-8">
          <UtensilsCrossed size={28} className="text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-[var(--text-secondary)]">No hay mesas configuradas. Agrega mesas para activar el sistema de ocupación.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {tables.map(table => (
            <div key={table.id}
              className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">Mesa {table.table_number}</p>
                {table.label && <p className="text-[10px] text-[var(--text-secondary)]">{table.label}</p>}
                {table.capacity && <p className="text-[10px] text-[var(--text-secondary)] opacity-70">{table.capacity} pax</p>}
              </div>
              <button
                onClick={() => handleDeleteTable(table.id)}
                className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Eliminar mesa"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
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
      <h2 className="text-lg font-bold text-[var(--text-primary)] mb-6">Configuración del Restaurante</h2>

      {/* Open/Closed toggle - prominent */}
      <div className={`rounded-2xl p-5 mb-6 border-2 transition-colors ${form.is_open ? 'bg-green-500/5 border-green-500/30' : 'bg-red-500/5 border-red-500/30'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {form.is_open ? <Power size={24} className="text-green-400" /> : <PowerOff size={24} className="text-red-400" />}
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">{form.is_open ? 'Restaurante Abierto' : 'Restaurante Cerrado'}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{form.is_open ? 'Los clientes pueden hacer pedidos' : 'Los pedidos están desactivados'}</p>
            </div>
          </div>
          <ToggleSwitch checked={form.is_open} onChange={handleToggleOpen} colorOn="#22C55E" colorOff="#EF4444" />
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Nombre del restaurante *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div>
            <ImageUpload bucket="logos" currentUrl={form.logo_url} onUpload={(url) => setForm({ ...form, logo_url: url })} label="Logo del restaurante" previewSize="sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Descripción</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none resize-none" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Teléfono</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">WhatsApp (con código de país)</label>
            <input value={form.whatsapp_number} onChange={e => setForm({ ...form, whatsapp_number: e.target.value })}
              placeholder="50688881111" className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Dirección</label>
            <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div className="md:col-span-2 mt-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center"><Zap size={12} className="text-green-400" /></div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">SINPE Móvil</h3>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Número SINPE</label>
            <input value={form.sinpe_number} onChange={e => setForm({ ...form, sinpe_number: e.target.value })}
              placeholder="8888-1111" className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Titular SINPE</label>
            <input value={form.sinpe_owner} onChange={e => setForm({ ...form, sinpe_owner: e.target.value })}
              placeholder="Nombre del titular" className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors mt-6 disabled:opacity-50">
          <Save size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <ChangePasswordCard />

      {/* V26.0: Modo Operativo */}
      <OperativeModeCard tenant={tenant} onRefresh={onRefresh} />

      {/* Fase 1: Configuración de Delivery */}
      <DeliverySettingsCard tenant={tenant} />

      {/* Herramienta de limpieza de pedidos */}
      <OrderCleanupCard tenantId={tenant.id} />
      {/* Configuración del Menú del Cliente */}
      <MenuConfigCard tenant={tenant} />
    </div>
  );
}

// ─── MenuConfigCard — Configuración del menú del cliente ───
function MenuConfigCard({ tenant }: { tenant: Tenant }) {
  const [config, setConfig] = useState<Record<string, any>>({
    enable_profiles: false, enable_phone_login: false, enable_points: false,
    enable_favorites: false, enable_history: false, enable_addresses: false,
    category_preview_horizontal: true, category_preview_count: 3,
    show_view_all_cta: true, show_product_description: true,
    category_view_mode: 'grid',
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.from('menu_config').select('*').eq('tenant_id', tenant.id).maybeSingle()
      .then(({ data }) => {
        if (data) setConfig((prev: any) => ({ ...prev, ...data }));
        setLoaded(true);
      });
  }, [tenant.id]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('menu_config').upsert(
      { ...config, tenant_id: tenant.id, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' }
    );
    setSaving(false);
    if (error) toast.error('Error: ' + error.message);
    else toast.success('Configuración del menú guardada');
  };

  const toggle = (key: string) => setConfig((prev: any) => ({ ...prev, [key]: !prev[key] }));

  if (!loaded) return null;

  return (
    <div className="mt-6 p-5 rounded-2xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
      <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>📱 Configuración del Menú del Cliente</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Personalizá cómo ven el menú tus clientes en el celular.</p>
      <div className="space-y-3">
        <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-page)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>PERFILES DE CLIENTE</p>
          {([
            { key: 'enable_profiles',    label: 'Activar perfiles de cliente' },
            { key: 'enable_phone_login', label: 'Login rápido por teléfono' },
            { key: 'enable_points',      label: 'Sistema de puntos y recompensas' },
            { key: 'enable_favorites',   label: 'Favoritos' },
            { key: 'enable_history',     label: 'Historial de pedidos' },
            { key: 'enable_addresses',   label: 'Direcciones guardadas' },
          ] as {key:string;label:string}[]).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
              <ToggleSwitch checked={!!config[key]} onChange={() => toggle(key)} label="" />
            </div>
          ))}
        </div>
        <div className="p-3 rounded-xl" style={{ backgroundColor: 'var(--bg-page)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>PRESENTACIÓN DEL MENÚ</p>
          {([
            { key: 'category_preview_horizontal', label: 'Preview horizontal por categoría' },
            { key: 'show_view_all_cta',           label: 'Botón “Ver todo” por categoría' },
            { key: 'show_product_description',    label: 'Mostrar descripción de categoría' },
          ] as {key:string;label:string}[]).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
              <ToggleSwitch checked={!!config[key]} onChange={() => toggle(key)} label="" />
            </div>
          ))}
          <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Platillos en preview</span>
            <div className="flex items-center gap-2">
              {[2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setConfig((prev: any) => ({ ...prev, category_preview_count: n }))}
                  className="w-8 h-8 rounded-lg text-sm font-bold transition-all"
                  style={{ backgroundColor: config.category_preview_count === n ? 'var(--accent)' : 'var(--border)', color: config.category_preview_count === n ? '#fff' : 'var(--text-secondary)' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Vista por defecto</span>
            <div className="flex items-center gap-2">
              {['grid', 'list'].map(v => (
                <button key={v} onClick={() => setConfig((prev: any) => ({ ...prev, category_view_mode: v }))}
                  className="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                  style={{ backgroundColor: config.category_view_mode === v ? 'var(--accent)' : 'var(--border)', color: config.category_view_mode === v ? '#fff' : 'var(--text-secondary)' }}>
                  {v === 'grid' ? '🔲 Grid' : '☰ Lista'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors mt-4 disabled:opacity-50">
        <Save size={16} /> {saving ? 'Guardando...' : 'Guardar configuración'}
      </button>
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
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Users size={16} className="text-blue-400" />
        <h3 className="text-sm font-black text-[var(--text-primary)]">Modo Operativo del Equipo</h3>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">Define cómo se asignan los pedidos entre los meseros.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { key: 'shared', label: 'Operación Compartida', desc: 'Cualquier mesero puede tomar y atender cualquier pedido. Ideal para equipos pequeños.', icon: '👥' },
          { key: 'exclusive', label: 'Mesa Asignada', desc: 'Cada mesero tiene sus mesas. Solo él ve y gestiona los pedidos de sus mesas.', icon: '📍' },
        ].map(opt => (
          <button key={opt.key} onClick={() => setMode(opt.key as any)}
            className="text-left p-4 rounded-xl border-2 transition-all"
            style={mode === opt.key ? { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' } : { borderColor: 'hsl(var(--border))', backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{opt.icon}</span>
              <span className="text-sm font-black" style={{ color: mode === opt.key ? '#F59E0B' : '#e2e8f0' }}>{opt.label}</span>
              {mode === opt.key && <span className="ml-auto text-[10px] font-black text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">Activo</span>}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{opt.desc}</p>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs text-[var(--text-secondary)] flex-shrink-0">Timeout de claim (minutos):</label>
        <input type="number" min={5} max={120} value={timeout} onChange={e => setTimeout_(Number(e.target.value))}
          className="w-20 px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
        <span className="text-[11px] text-[var(--text-secondary)]">Si un pedido no se atiende en este tiempo, se libera automáticamente</span>
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
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 mt-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
          <KeyRound size={16} className="text-amber-400" />
        </div>
        <h3 className="text-base font-bold text-[var(--text-primary)]">Cambiar Contraseña</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 max-w-md">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Contraseña actual</label>
          <input
            type="password"
            value={form.current}
            onChange={e => handleChange('current', e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Nueva contraseña <span className="text-[var(--text-secondary)]">(mín. 6 caracteres)</span></label>
          <input
            type="password"
            value={form.next}
            onChange={e => handleChange('next', e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Confirmar nueva contraseña</label>
          <input
            type="password"
            value={form.confirm}
            onChange={e => handleChange('confirm', e.target.value)}
            autoComplete="new-password"
            className={`w-full px-3 py-2 bg-[var(--bg-surface)] border rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:outline-none ${
              mismatch ? 'border-red-500 focus:ring-red-500/50' : 'border-[var(--border)] focus:ring-amber-500/50'
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
        className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
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
    // Delivery pricing
    base_km: number;
    fee_variability_msg: string;
    fee_presets: number[];
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
            base_km: data.base_km ?? 3,
            fee_variability_msg: data.fee_variability_msg ?? '',
            fee_presets: data.fee_presets ?? [1000, 1500, 2000, 2500, 3000],
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
            base_km: 3,
            fee_variability_msg: '',
            fee_presets: [1000, 1500, 2000, 2500, 3000],
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
      // Delivery pricing
      base_km: settings.base_km,
      fee_variability_msg: settings.fee_variability_msg || null,
      fee_presets: settings.fee_presets,
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
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-5 mt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bike size={18} className="text-orange-400" />
          <h3 className="text-sm font-black text-[var(--text-primary)]">Delivery a Domicilio</h3>
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
            <label className="block text-xs text-[var(--text-secondary)] mb-2">📍 Ubicación del restaurante (punto de origen)</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Latitud</label>
                <input
                  type="number" step="0.000001"
                  value={settings.restaurant_lat ?? ''}
                  onChange={e => setSettings({ ...settings, restaurant_lat: parseFloat(e.target.value) || null })}
                  placeholder="9.9281"
                  className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Longitud</label>
                <input
                  type="number" step="0.000001"
                  value={settings.restaurant_lon ?? ''}
                  onChange={e => setSettings({ ...settings, restaurant_lon: parseFloat(e.target.value) || null })}
                  placeholder="-84.0907"
                  className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
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
            <label className="block text-xs text-[var(--text-secondary)] mb-1">🗺️ Radio de cobertura</label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={1} max={30} step={0.5}
                value={settings.coverage_radius_km}
                onChange={e => setSettings({ ...settings, coverage_radius_km: parseFloat(e.target.value) })}
                className="flex-1 accent-orange-500"
              />
              <span className="text-sm font-bold text-orange-400 w-16 text-right">{settings.coverage_radius_km} km</span>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">Solo se aceptarán pedidos dentro de este radio desde el restaurante</p>
          </div>

          {/* ETA base y tarifa */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">⏱️ ETA base (min)</label>
              <input
                type="number" min={5} max={120}
                value={settings.base_eta_minutes}
                onChange={e => setSettings({ ...settings, base_eta_minutes: parseInt(e.target.value) || 30 })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">💰 Tarifa base delivery</label>
              <input
                type="number" min={0} step={100}
                value={settings.delivery_fee}
                onChange={e => setSettings({ ...settings, delivery_fee: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">Tarifa fija para los primeros {settings.base_km} km</p>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">📍 Km incluidos en tarifa base</label>
              <input
                type="number" min={1} max={20} step={0.5}
                value={settings.base_km}
                onChange={e => setSettings({ ...settings, base_km: parseFloat(e.target.value) || 3 })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">Distancia cubierta por la tarifa base. Default: 3 km</p>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">🛒 Mínimo pedido</label>
              <input
                type="number" min={0} step={500}
                value={settings.min_order_amount}
                onChange={e => setSettings({ ...settings, min_order_amount: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Delivery pricing: mensaje de variabilidad y presets rápidos */}
          <div className="mt-4 pt-4 border-t space-y-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-orange-400 text-xs">💬</span>
              <h4 className="text-xs font-bold text-orange-300 uppercase tracking-wide">Mensaje de Variabilidad de Tarifa</h4>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Mensaje honesto para el cliente (opcional)</label>
              <input
                type="text"
                placeholder="Ej: El costo de envío puede variar según la distancia exacta"
                value={settings.fee_variability_msg}
                onChange={e => setSettings({ ...settings, fee_variability_msg: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">Se muestra en el checkout junto a la tarifa estimada. Deja vacío para no mostrar.</p>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Presets rápidos de tarifa (separados por coma, en colones)</label>
              <input
                type="text"
                placeholder="1000,1500,2000,2500,3000"
                value={settings.fee_presets.join(',')}
                onChange={e => {
                  const vals = e.target.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v) && v > 0);
                  if (vals.length > 0) setSettings({ ...settings, fee_presets: vals });
                }}
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-orange-500/50 focus:outline-none"
              />
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">El rider puede seleccionar uno de estos valores al asignar el pedido.</p>
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
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  🛡️ Buffer de capacidad (%)
                </label>
                <input
                  type="number" min={50} max={100} step={5}
                  value={settings.commit_buffer_pct}
                  onChange={e => setSettings({ ...settings, commit_buffer_pct: parseInt(e.target.value) || 80 })}
                  className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none"
                />
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                  No commitear si la capacidad supera este %. Default: 80%
                </p>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  ⏱️ Espera máxima (min)
                </label>
                <input
                  type="number" min={5} max={120} step={5}
                  value={settings.max_wait_minutes}
                  onChange={e => setSettings({ ...settings, max_wait_minutes: parseInt(e.target.value) || 20 })}
                  className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none"
                />
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                  Pedidos en waitlist se auto-promueven después de este tiempo. Default: 20 min
                </p>
              </div>
            </div>
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-[10px]"
              style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}
            >
              <Zap size={11} className="text-purple-400 shrink-0 mt-0.5" />
              <span className="text-[var(--text-secondary)] leading-relaxed">
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
        <div className="mt-6 pt-6 border-t border-[var(--border)]">
          <DeliveryZonesPanel tenant={tenant} />
        </div>
      )}

      {/* ── Configuración de Mesas ── */}
      <div className="mt-6 pt-6 border-t border-slate-700/50">
        <TablesConfigSection tenant={tenant} />
      </div>
    </div>
  );
}
// ─── Order Cleanup Card ─────────────────────────────────────────────────────
/**
 * Herramienta para limpiar pedidos fantasma, de prueba o atascados.
 * Muestra pedidos candidatos y permite eliminarlos o marcarlos como cancelados.
 */
function OrderCleanupCard({ tenantId }: { tenantId: string }) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchCandidates = async () => {
    setLoading(true);
    // Pedidos candidatos: status pendiente/en_cocina/listo con más de 24h de antigüedad,
    // o delivery_status=delivered pero status != entregado (pedidos atascados)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await supabase
      .from('orders')
      .select('id, order_number, status, logistic_status, delivery_status, created_at, customer_name, total')
      .eq('tenant_id', tenantId)
      .in('status', ['pendiente', 'en_cocina', 'listo', 'pago_en_revision'])
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(50);
    const { data: stuck } = await supabase
      .from('orders')
      .select('id, order_number, status, logistic_status, delivery_status, created_at, customer_name, total')
      .eq('tenant_id', tenantId)
      .eq('delivery_status', 'delivered')
      .neq('status', 'entregado')
      .order('created_at', { ascending: true })
      .limit(50);
    const all = [...(stale || []), ...(stuck || [])];
    // Deduplicar por id
    const seen = new Set<string>();
    const deduped = all.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
    setCandidates(deduped);
    setLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(candidates.map(o => o.id)));
  const clearAll = () => setSelected(new Set());

  const handleMarkCancelled = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelado', updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { toast.error('Error: ' + error.message); setDeleting(false); return; }
    toast.success(`${ids.length} pedido(s) marcados como cancelados`);
    setSelected(new Set());
    fetchCandidates();
    setDeleting(false);
  };

  const handleFixStuck = async () => {
    // Corregir pedidos atascados: delivery_status=delivered pero status!=entregado
    const stuckOrders = candidates.filter(o => o.delivery_status === 'delivered' && o.status !== 'entregado');
    if (stuckOrders.length === 0) { toast.info('No hay pedidos atascados para corregir'); return; }
    setDeleting(true);
    const ids = stuckOrders.map(o => o.id);
    const { error } = await supabase
      .from('orders')
      .update({ status: 'entregado', logistic_status: 'delivered', updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { toast.error('Error: ' + error.message); setDeleting(false); return; }
    toast.success(`✅ ${ids.length} pedido(s) atascado(s) sincronizados a "entregado"`);
    fetchCandidates();
    setDeleting(false);
  };

  return (
    <div className="mt-6 bg-red-950/20 border border-red-500/20 rounded-2xl p-5">
      <button
        onClick={() => { setExpanded(e => !e); if (!expanded) fetchCandidates(); }}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
            <Trash2 size={15} className="text-red-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-black text-[var(--text-primary)]">Limpieza de Pedidos</h3>
            <p className="text-xs text-[var(--text-secondary)]">Eliminar pedidos de prueba, fantasma o atascados</p>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="text-[var(--text-secondary)]" /> : <ChevronDown size={16} className="text-[var(--text-secondary)]" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchCandidates}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Buscando...' : 'Buscar candidatos'}
            </button>
            {candidates.length > 0 && (
              <>
                <button onClick={selectAll} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600 transition-colors">Seleccionar todos</button>
                <button onClick={clearAll} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600 transition-colors">Limpiar selección</button>
              </>
            )}
          </div>

          {/* Botón de corrección rápida para pedidos atascados */}
          {candidates.some(o => o.delivery_status === 'delivered' && o.status !== 'entregado') && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-300">Pedidos atascados detectados</p>
                <p className="text-xs text-[var(--text-secondary)]">Tienen delivery_status=delivered pero status≠entregado</p>
              </div>
              <button
                onClick={handleFixStuck}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
              >
                Corregir ahora
              </button>
            </div>
          )}

          {candidates.length === 0 && !loading && (
            <p className="text-xs text-[var(--text-secondary)] text-center py-4">No se encontraron pedidos candidatos. ¡Todo limpio! ✅</p>
          )}

          {candidates.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {candidates.map(o => {
                const isStuck = o.delivery_status === 'delivered' && o.status !== 'entregado';
                const age = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 3600000);
                return (
                  <label key={o.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors" style={{ background: selected.has(o.id) ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected.has(o.id) ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}` }}>
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggleSelect(o.id)}
                      className="w-4 h-4 accent-red-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[var(--text-primary)]">#{o.order_number} — {o.customer_name || 'Sin nombre'}</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        status: <span className="text-amber-300">{o.status}</span>
                        {o.delivery_status && <> · delivery: <span className={isStuck ? 'text-red-400' : 'text-[var(--text-secondary)]'}>{o.delivery_status}</span></>}
                        {' · '}{age}h atrás
                      </p>
                    </div>
                    {isStuck && <span className="text-[10px] font-black text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">ATASCADO</span>}
                  </label>
                );
              })}
            </div>
          )}

          {selected.size > 0 && (
            <button
              onClick={handleMarkCancelled}
              disabled={deleting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black bg-red-500 text-[var(--text-primary)] hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} /> {deleting ? 'Procesando...' : `Cancelar ${selected.size} pedido(s) seleccionado(s)`}
            </button>
          )}
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
                  <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold text-[var(--text-primary)]" style={{ backgroundColor: preset.recommended.primary }}>+</span>
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
            <span className="px-3 py-1 rounded-full text-xs font-bold text-[var(--text-primary)]" style={{ backgroundColor: form.badge_color }}>Entradas</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${form.badge_color}20`, color: form.badge_color }}>Platos</span>
            <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${form.badge_color}20`, color: form.badge_color }}>Bebidas</span>
          </div>
          {/* Card de platillo */}
          <div className="p-3 rounded-xl" style={{ backgroundColor: form.surface_color, border: `1px solid ${form.text_color}10` }}>
            <p className="text-sm font-semibold" style={{ color: form.text_color }}>Platillo de ejemplo</p>
            <p className="text-xs mt-0.5" style={{ color: form.text_color, opacity: 0.6 }}>Descripción del platillo...</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-bold" style={{ color: form.primary_color }}>₡5 500</span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold text-[var(--text-primary)]" style={{ backgroundColor: form.primary_color }}>+ Agregar</span>
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
  const [activeStatusTab, setActiveStatusTab] = useState<'nuevos' | 'en_cocina' | 'listos' | 'cobro'>('nuevos');
  const prevActiveIdsRef = useRef<Set<string>>(new Set());
  const { playBell, stopAlarm, isAlarming } = useKitchenBell();
  // sinpe_block_mode: cargado de delivery_settings para respetar la config del admin
  const [sinpeBlockMode, setSinpeBlockMode] = useState<'always' | 'delivery_only' | 'never'>('always');
  useEffect(() => {
    supabase.from('delivery_settings').select('sinpe_block_mode').eq('tenant_id', tenant.id).maybeSingle()
      .then(({ data }) => { if (data?.sinpe_block_mode) setSinpeBlockMode(data.sinpe_block_mode as any); });
  }, [tenant.id]);

  // ── Sesiones de mesa activas ──
  const [activeSessions, setActiveSessions] = useState<Record<string, string>>({});
  const [tableHistoryModal, setTableHistoryModal] = useState<string | null>(null);
  const [tableHistoryOrders, setTableHistoryOrders] = useState<Order[]>([]);
  const fetchActiveSessions = useCallback(async () => {
    const { data } = await supabase.from('table_sessions').select('id,table_name').eq('tenant_id', tenant.id).eq('status', 'active');
    if (data) {
      const map: Record<string, string> = {};
      (data as any[]).forEach(s => { map[s.table_name] = s.id; });
      setActiveSessions(map);
    }
  }, [tenant.id]);
  useEffect(() => { fetchActiveSessions(); }, [fetchActiveSessions]);
  const fetchOrders = useCallback(async () => {
    // V17.2: Traer tanto activos como entregados (para el tab Cobrados)
    // Excluir pedidos archivados (mesa cerrada) de la vista activa
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .not('status', 'in', '(cancelado)')
      .neq('table_archived', true)
      .order('created_at', { ascending: false })
      .limit(100);
    const newOrders = (data as Order[]) || [];
    // Detección de nuevos pedidos por ID (más fiable que por conteo)
    const activeOrders = newOrders.filter(o => o.status !== 'entregado' && o.status !== 'cancelado');
    const activeIds = new Set(activeOrders.map(o => o.id));
    const hasNewOrder = prevActiveIdsRef.current.size > 0 &&
      activeOrders.some(o => !prevActiveIdsRef.current.has(o.id));
    if (hasNewOrder) {
      playBell();
      toast.success('🔔 ¡Nuevo pedido recibido!', { duration: 6000 });
    }
    prevActiveIdsRef.current = activeIds;
    setOrders(newOrders);
    setLoading(false);
  }, [tenant.id, playBell]);
  const handleCloseTable = useCallback(async (tableName: string) => {
    const sessionId = activeSessions[tableName];
    if (sessionId) {
      await supabase.from('orders').update({ table_archived: true, updated_at: new Date().toISOString() }).eq('session_id', sessionId);
      await supabase.from('table_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sessionId);
      setActiveSessions(prev => { const n = { ...prev }; delete n[tableName]; return n; });
    }
    // Archivar pedidos entregados legacy (sin session_id)
    await supabase.from('orders').update({ table_archived: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenant.id).eq('customer_table', tableName).eq('status', 'entregado').is('session_id', null);
    toast.success(`✅ Mesa ${tableName} cerrada — lista para nuevo cliente`);
    fetchOrders();
  }, [activeSessions, tenant.id, fetchOrders]);
  const handleViewTableHistory = useCallback(async (tableName: string) => {
    const { data } = await supabase.from('orders').select('*').eq('tenant_id', tenant.id)
      .eq('customer_table', tableName).order('created_at', { ascending: false }).limit(50);
    setTableHistoryOrders((data as Order[]) || []);
    setTableHistoryModal(tableName);
  }, [tenant.id]);

  const QUICK_REQUEST_LABELS: Record<'water_ice' | 'napkins' | 'help', string> = {
    water_ice: '💧 Agua / Hielo',
    napkins: '🧻 Servilletas',
    help: '🆘 Ayuda',
  };


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

  // ── Validar pago SINPE delivery y enviar a cocina en un solo paso ──
  const handleValidateSinpeDelivery = async (orderId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('orders')
      .update({
        payment_verified: true,
        payment_status: 'paid',
        status: 'en_cocina',
        accepted_at: now,
        updated_at: now,
        has_new_items: false,
      })
      .eq('id', orderId);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('\u2705 Pago SINPE validado \u2014 pedido enviado a cocina');
    stopAlarm();
    const order = orders.find(o => o.id === orderId);
    if (order) {
      const customerPhone = (order as any).delivery_phone || order.customer_phone;
      if (customerPhone) {
        const name = order.customer_name || 'Cliente';
        const shortId = String(order.order_number);
        const waMsg = `¡Hola ${name}! Tu pago SINPE fue verificado ✅.\nTu pedido #${shortId} ya está siendo preparado en cocina. 🍳`;
        const waUrl = buildWhatsAppUrl(customerPhone, waMsg);
        if (waUrl) setTimeout(() => window.open(waUrl, '_blank'), 500);
      }
    }
    fetchOrders();
  };

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    const interval = setInterval(fetchOrders, 12000);;
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    const channel = supabase
      .channel(`admin-orders-realtime-${tenant.id}`)
      // INSERT: pedido nuevo → refresco inmediato (la campanita se activa en fetchOrders)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => { fetchOrders(); }
      )
      // UPDATE: cambios de estado → refresco visual silencioso
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => { fetchOrders(); }
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
    const order = orders.find(o => o.id === orderId);
    const isDeliveryOrder = (order as any)?.delivery_type === 'delivery';
    // REGLA: Para pedidos delivery, el admin NO puede marcar 'entregado' directamente.
    // Solo el rider puede completar la entrega. El admin usa handleDeliverToRider.
    if (isDeliveryOrder && newStatus === 'entregado') {
      toast.error('Para delivery, usa el botón "Entregar al Rider". Solo el rider completa la entrega.');
      return;
    }
    const extra: Record<string, any> = { updated_at: now, has_new_items: false };
    if (newStatus === 'en_cocina') extra.accepted_at = now;
    if (newStatus === 'listo') {
      extra.ready_at = now;
      // Setear kitchen_committed_at para que DeliveryDispatchPanel detecte el pedido como listo para asignar rider
      const orderObj = orders.find(o => o.id === orderId);
      if ((orderObj as any)?.delivery_type === 'delivery') {
        extra.kitchen_committed_at = now;
      }
    }
    if (newStatus === 'entregado') extra.completed_at = now;
    const { error } = await supabase.from('orders').update({ status: newStatus, ...extra }).eq('id', orderId);
    if (error) { toast.error('Error: ' + error.message); return; }
    const label = ORDER_STATUS_CONFIG[newStatus]?.label || newStatus;
    toast.success(`✅ ${label}`);
    // Silenciar alarma al atender el pedido (aceptar, marcar listo, etc.)
    stopAlarm();
    // Liberar mesa automáticamente cuando se marca entregado (dine_in)
    if (newStatus === 'entregado' && order && (order as any).delivery_type !== 'delivery') {
      supabase
        .from('restaurant_tables')
        .update({ is_occupied: false, current_order_id: null, occupied_at: null })
        .eq('current_order_id', orderId)
        .then(() => console.info('[Tables] Mesa liberada automáticamente'));
    }
    fetchOrders();
    // ── WhatsApp: solo para takeout cuando está listo (no delivery — el rider se encarga) ──
    if (!order) return;
    const deliveryType = (order as any).delivery_type || 'dine_in';
    if (deliveryType === 'delivery') return;
    const customerPhone = (order as any).delivery_phone || order.customer_phone;
    if (!customerPhone) return;
    const name = order.customer_name || 'Cliente';
    const shortId = String(order.order_number);
    if (newStatus === 'listo' && deliveryType === 'takeout') {
      const waMsg = `¡Buenas noticias ${name}! Tu pedido #${shortId} ya está LISTO 🎉.\nYa puedes pasar por él al local.`;
      const waUrl = buildWhatsAppUrl(customerPhone, waMsg);
      if (waUrl) setTimeout(() => window.open(waUrl, '_blank'), 500);
    }
  };

  // ── Entregar al Rider: marca delivery_status = picked_up (NO cambia status principal) ──
  // El rider es el único que puede completar la entrega final.
  const handleDeliverToRider = async (orderId: string) => {
    const now = new Date().toISOString();
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const { error } = await supabase.from('orders').update({
      delivery_status: 'picked_up',
      updated_at: now,
    }).eq('id', orderId);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('🛵 Pedido entregado al rider — en camino');
    fetchOrders();
    // WhatsApp al cliente al despachar al rider
    const deliveryPhone = (order as any).delivery_phone;
    const customerPhone = deliveryPhone || order.customer_phone;
    if (customerPhone) {
      const name = order.customer_name || 'Cliente';
      const shortId = String(order.order_number);
      const waMsg = `🛵 ¡Hola ${name}! Tu pedido #${shortId} ya está en camino hacia tu dirección. ¡En breve llegará!`;
      const waUrl = buildWhatsAppUrl(customerPhone, waMsg);
      if (waUrl) setTimeout(() => window.open(waUrl, '_blank'), 500);
    }
  };

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  const elapsedMin = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  // Formatea minutos en formato legible: 18 min, 1 h 12 min, 2 h
  const formatElapsed = (min: number): string => {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  };
  // Severidad del cronómetro: normal < 15, warning 15-25, critical > 25
  const timerSeverity = (min: number): 'normal' | 'warning' | 'critical' => {
    if (min >= 25) return 'critical';
    if (min >= 15) return 'warning';
    return 'normal';
  };

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
    const severity = timerSeverity(elapsed);
    const timerColors = {
      normal:   { bg: 'rgba(100,116,139,0.15)', text: 'var(--text-secondary)', border: 'rgba(100,116,139,0.2)' },
      warning:  { bg: 'rgba(245,158,11,0.15)',  text: '#F59E0B',              border: 'rgba(245,158,11,0.3)' },
      critical: { bg: 'rgba(239,68,68,0.18)',   text: '#F87171',              border: 'rgba(239,68,68,0.4)' },
    }[severity];
    const hasNewItems = (order as any).has_new_items === true;
    const isDeliveryOrder = (order as any).delivery_type === 'delivery';
    // GATING: SINPE solo aplica en delivery (dine-in/takeout cobran con POS externo)
    const isSinpe = order.payment_method === 'sinpe' && isDeliveryOrder;
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
      <div className={`rounded-xl p-3 border transition-all ${
        hasNewItems ? 'bg-amber-500/10 border-amber-500/50 animate-pulse' :
        isDeliveredUrgent ? 'bg-red-500/8 border-red-500/50' :
        isDeliveredUnpaid ? 'bg-yellow-500/8 border-yellow-500/40' :
        isPaid ? 'bg-emerald-500/5 border-emerald-500/20 opacity-70' :
        isUrgent ? 'bg-red-500/5 border-red-500/30' : 'bg-[var(--bg-surface)] border-[var(--border)]'
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
        {/* Fila 1: número + cliente/mesa + timer — todo en 1 línea */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-sm font-black text-[var(--text-primary)] flex-shrink-0">#{order.order_number}</span>
          {order.customer_name && <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1">👤 {order.customer_name}</span>}
          {!order.customer_name && order.customer_table && <span className="text-[11px] text-[var(--text-secondary)] flex-1">🪑 {order.customer_table}</span>}
          {order.customer_name && order.customer_table && <span className="text-[11px] text-[var(--text-secondary)] flex-shrink-0">🪑 {order.customer_table}</span>}
          <div className="ml-auto flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: timerColors.bg, color: timerColors.text, border: `1px solid ${timerColors.border}` }}>
            <Timer size={9} /> {formatElapsed(elapsed)}
          </div>
        </div>

        {quickRequestType && (
          <div className="mb-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-xs font-bold">
              {QUICK_REQUEST_LABELS[quickRequestType]}
            </div>
            {quickRequestPendingForAdmin && (
              <button
                onClick={() => markQuickRequestSeenByAdmin(order.id)}
                className="mt-2 text-[11px] px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)]/90 hover:bg-slate-600"
              >
                Marcar solicitud como vista
              </button>
            )}
          </div>
        )}
        <div className="space-y-0 mb-2">
          {(order.items as any[]).map((item: any, i: number) => (
            <div key={i} className="flex justify-between text-[11px]">
              <span className="text-[var(--text-secondary)]">{item.quantity}× {item.name}</span>
              <span className="text-[var(--text-secondary)] opacity-60">{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>
        {/* ── Upsells en el pedido ── */}
        {(order as any).upsell_accepted && (order as any).upsell_revenue > 0 && (
          <div className="flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded-lg" style={{ backgroundColor: '#34d39915', border: '1px solid #34d39930' }}>
            <span className="text-[10px] font-bold text-emerald-400">⚡ UPSELL</span>
            <span className="text-[10px] text-emerald-300">+{formatPrice((order as any).upsell_revenue)}</span>
            {(order as any).ai_upsell_revenue > 0 && <span className="text-[9px] text-emerald-400/70">✨ IA</span>}
          </div>
        )}
        {/* ── Descuento / Promo / Cupón ── */}
        {((order as any).discount_amount > 0 || (order as any).coupon_code || (order as any).promo_label || (order as any).promotion_id) && (
          <div className="mb-1.5 px-2 py-1.5 rounded-lg space-y-0.5" style={{ backgroundColor: '#F59E0B10', border: '1px solid #F59E0B25' }}>
            {/* Promo label (new field) */}
            {(order as any).promo_label && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-amber-300">🏷️ {(order as any).promo_label}</span>
                <span className="text-[10px] text-amber-300 font-bold">
                  {(order as any).promo_type === 'bogo' || (order as any).promo_type === 'free_item' ? '✓ Aplicada' : ''}
                </span>
              </div>
            )}
            {/* Coupon code */}
            {(order as any).coupon_code && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-amber-300">🎟️ Cupón: <span className="font-mono font-bold">{(order as any).coupon_code}</span></span>
              </div>
            )}
            {/* Discount amount */}
            {(order as any).discount_amount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-amber-400 font-bold">Descuento</span>
                <span className="text-[10px] text-amber-400 font-bold">-{formatPrice((order as any).discount_amount)}</span>
              </div>
            )}
            {/* Subtotal vs total */}
            {(order as any).subtotal && (order as any).subtotal !== order.total && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-secondary)]">Precio original</span>
                <span className="text-[10px] text-[var(--text-secondary)] line-through">{formatPrice((order as any).subtotal)}</span>
              </div>
            )}
          </div>
        )}
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
                <Clock size={11} className="text-[var(--text-secondary)]" />
                {/* V4.0: mostrar 'ASAP' como 'Lo antes posible' en el Kanban */}
                <span className="text-xs text-[var(--text-secondary)]">
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
                    <span className="text-xs text-[var(--text-secondary)] leading-tight">{deliveryAddress}</span>
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
        {/* ── Botón Validar Pago SINPE (para CUALQUIER tipo de pedido con SINPE sin verificar) ── */}
        {isSinpe && order.status === 'pendiente' && !(order as any).payment_verified && (
          <button
            onClick={() => handleValidateSinpeDelivery(order.id)}
            className="w-full flex items-center justify-center gap-2 py-3 mb-2 rounded-xl text-sm font-black transition-all active:scale-[0.97] touch-manipulation animate-pulse"
            style={{ backgroundColor: '#10B98125', color: '#10B981', border: '2px solid #10B98150' }}>
            <CheckCircle2 size={16} /> ✅ Validar Pago SINPE → Cocina
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
            <span className="ml-auto text-xs font-bold text-[var(--text-secondary)]">
              Hace {formatElapsed(deliveredElapsed)}
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

        <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border)] mb-2">
          <span className="text-sm font-bold text-amber-400">{formatPrice(order.total)}</span>
          <div className="flex items-center gap-1.5">
            {isDelivery && <Bike size={11} className="text-blue-400" />}
            <span className="text-[10px] text-[var(--text-secondary)] uppercase">{order.payment_method}</span>
          </div>
        </div>
        {/* ── Costo de envío: ajuste manual por pedido ── */}
        {isDelivery && (
          <DeliveryFeeAdjuster
            orderId={order.id}
            orderNumber={order.order_number}
            currentFee={(order as any).delivery_fee_final ?? null}
            feePending={(order as any).delivery_fee_pending ?? false}
          />
        )}
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
          {/* Delivery: botón "Entregar al Rider" cuando está listo y el rider ya está asignado */}
          {isDelivery && order.status === 'listo' && (order as any).rider_id && (order as any).delivery_status !== 'picked_up' && (order as any).delivery_status !== 'delivered' && (
            <button
              onClick={() => handleDeliverToRider(order.id)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all active:scale-[0.97] touch-manipulation"
              style={{ backgroundColor: '#F9731620', color: '#F97316', border: '2px solid #F9731640' }}
            >
              <Bike size={16} /> Entregar al Rider
            </button>
          )}
          {/* Delivery: indicador cuando ya fue entregado al rider */}
          {isDelivery && (order as any).delivery_status === 'picked_up' && order.status !== 'entregado' && (
            <div className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold"
              style={{ backgroundColor: '#3B82F615', color: '#60A5FA', border: '1px solid #3B82F630' }}>
              <Bike size={13} /> En camino — esperando confirmación del rider
            </div>
          )}
          <div className="flex gap-2">
            {actions
              // SINPE sin verificar: ocultar botón "A Cocina" según sinpe_block_mode
              .filter((action: any) => {
                if (action.nextStatus !== 'en_cocina') return true;
                if (!isSinpe || (order as any).payment_verified) return true;
                if (sinpeBlockMode === 'never') return true;
                if (sinpeBlockMode === 'delivery_only' && !isDeliveryOrder) return true;
                return false;
              })
              // Para delivery, ocultar el botón "Entregado" (solo el rider puede completar)
              .filter((action: any) => !(isDelivery && action.nextStatus === 'entregado'))
              .map((action: any) => (
              <button key={action.nextStatus}
                onClick={() => handleStatusChange(order.id, action.nextStatus)}
                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold transition-all active:scale-[0.97] touch-manipulation"
                style={{ backgroundColor: `${action.color}20`, color: action.color, border: `1px solid ${action.color}40` }}>
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
        <h3 className="font-bold text-[var(--text-primary)] text-sm">{title}</h3>
        <span className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-[var(--text-primary)]"
          style={{ backgroundColor: color }}>{colOrders.length}</span>
      </div>
      <div className="space-y-3">
        {colOrders.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-secondary)] text-xs border-2 border-dashed border-[var(--border)] rounded-2xl">{emptyMsg}</div>
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
      {/* ── ROW 1: Header ultra-compacto ── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Pedidos en Vivo</h2>
          <span className="text-[10px] text-[var(--text-secondary)]">{activeOrders.length} activo{activeOrders.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1">
          {isAlarming && (
            <button onClick={stopAlarm}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black animate-pulse"
              style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#FCA5A5' }}>
              🔔
            </button>
          )}
          <button onClick={fetchOrders}
            className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600 transition-colors" title="Actualizar">
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => { if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).then(() => window.location.reload()); }}
            className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600 transition-colors" title="Limpiar caché y actualizar">
            <span className="text-[11px]">🗑️</span>
          </button>
        </div>
      </div>

      {/* ── ROW 2: Canal (Comer Aquí / Delivery / Encargo) ── */}
      <div className="flex gap-1 mb-2 p-0.5 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)]">
        {subTabs.map(tab => {
          const count = badgeCount(tab.key);
          const isActive = activeSubTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveSubTab(tab.key)}
              className={`relative flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                isActive ? tab.activeColor + ' border' : 'border border-transparent text-[var(--text-secondary)]'
              }`}>
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-black px-0.5 shadow animate-pulse">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── ROW 3: Mesas activas compactas (solo DINE_IN) ── */}
      {activeSubTab === 'DINE_IN' && (() => {
        const tableGroups: Record<string, Order[]> = {};
        filteredOrders.forEach(o => {
          const t = (o as any).customer_table || 'Sin mesa';
          if (!tableGroups[t]) tableGroups[t] = [];
          tableGroups[t].push(o);
        });
        const tableNames = Object.keys(tableGroups).sort();
        if (tableNames.length === 0) return null;
        return (
          <div className="flex items-center gap-1.5 flex-wrap mb-2 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]">
            <span className="text-[10px] font-bold text-amber-400 flex-shrink-0">🪑</span>
            {tableNames.map(tableName => {
              const tOrders = tableGroups[tableName];
              const allDelivered = tOrders.every(o => o.status === 'entregado');
              return (
                <div key={tableName} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold"
                  style={{ background: allDelivered ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.08)', borderColor: allDelivered ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)', color: allDelivered ? '#10B981' : '#F59E0B' }}>
                  {tableName}<span className="opacity-50">({tOrders.length})</span>
                  {allDelivered && (
                    <button onClick={() => handleCloseTable(tableName)}
                      className="ml-0.5 text-[9px] font-black px-1 rounded"
                      style={{ background: 'rgba(16,185,129,0.2)', color: '#10B981' }}
                      title="Cerrar">✓</button>
                  )}
                  <button onClick={() => handleViewTableHistory(tableName)}
                    className="ml-0.5 opacity-40 hover:opacity-80" title="Historial">📋</button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── ROW 4: TABS DE ESTADO — el corazón del panel ── */}
      {(() => {
        const statusTabs = [
          { key: 'nuevos' as const,    label: 'Nuevos',      icon: '🔔', color: '#F59E0B', count: nuevos.length },
          { key: 'en_cocina' as const, label: 'En prep.',    icon: '👨‍🍳', color: '#3B82F6', count: enCocina.length },
          { key: 'listos' as const,    label: 'Listos',      icon: '✅',    color: '#10B981', count: listos.length },
          { key: 'cobro' as const,     label: 'Cobro',       icon: '💰',    color: '#A78BFA', count: porCobrar.length + cobrados.length },
        ];
        const currentOrders =
          activeStatusTab === 'nuevos'    ? nuevos :
          activeStatusTab === 'en_cocina' ? enCocina :
          activeStatusTab === 'listos'    ? listos : null;
        return (
          <>
            {/* Tabs de estado */}
            <div className="grid grid-cols-4 gap-1 mb-2">
              {statusTabs.map(st => {
                const isActive = activeStatusTab === st.key;
                const hasUrgent = st.key === 'nuevos' && nuevos.length > 0;
                return (
                  <button key={st.key}
                    onClick={() => setActiveStatusTab(st.key)}
                    className={`flex flex-col items-center py-2 px-1 rounded-lg border transition-all ${
                      isActive
                        ? 'border-current'
                        : 'border-[var(--border)] bg-[var(--bg-surface)]'
                    }`}
                    style={isActive ? { background: `${st.color}18`, borderColor: `${st.color}60`, color: st.color } : { color: 'var(--text-secondary)' }}
                  >
                    <span className="text-base leading-none">{st.icon}</span>
                    <span className="text-[9px] font-bold mt-0.5 leading-none">{st.label}</span>
                    <span className={`text-sm font-black mt-0.5 leading-none ${
                      isActive ? '' : st.count > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}>{st.count}</span>
                    {hasUrgent && !isActive && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Contenido del tab de estado activo */}
            {loading ? (
              <div className="text-center py-10"><div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" /></div>
            ) : activeStatusTab === 'cobro' ? (
              /* ── Vista Cobro ── */
              <div>
                <div className="flex gap-1 mb-2 p-0.5 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)]">
                  <button onClick={() => setPaymentTab('pending')}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all border ${
                      paymentTab === 'pending' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' : 'border-transparent text-[var(--text-secondary)]'
                    }`}>
                    💰 Por cobrar ({porCobrar.length})
                  </button>
                  <button onClick={() => setPaymentTab('paid')}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-all border ${
                      paymentTab === 'paid' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'border-transparent text-[var(--text-secondary)]'
                    }`}>
                    ✅ Cobrados ({cobrados.length})
                  </button>
                </div>
                <div className="space-y-2">
                  {paymentTab === 'pending' ? (
                    porCobrar.length === 0
                      ? <div className="text-center py-8 text-[var(--text-secondary)] text-xs border-2 border-dashed border-[var(--border)] rounded-xl">Sin cuentas pendientes</div>
                      : porCobrar.map(o => <KanbanCard key={o.id} order={o} showPayBtn={true} />)
                  ) : (
                    cobrados.length === 0
                      ? <div className="text-center py-8 text-[var(--text-secondary)] text-xs border-2 border-dashed border-[var(--border)] rounded-xl">Sin cobrados hoy</div>
                      : cobrados.map(o => <KanbanCard key={o.id} order={o} showPayBtn={false} />)
                  )}
                </div>
              </div>
            ) : activeSubTab === 'DELIVERY' && currentOrders !== null ? (
              /* ── Vista Delivery: envuelve en DeliveryTabWithHistory ── */
              <DeliveryTabWithHistory
                tenant={tenant}
                pendingCount={nuevos.length}
                kanbanNode={
                  <div className="space-y-2">
                    {currentOrders.length === 0
                      ? <div className="text-center py-8 text-[var(--text-secondary)] text-xs border-2 border-dashed border-[var(--border)] rounded-xl">Sin pedidos en este estado</div>
                      : currentOrders.map(o => <KanbanCard key={o.id} order={o} />)}
                  </div>
                }
              />
            ) : currentOrders !== null ? (
              /* ── Vista normal: lista del estado activo ── */
              <div className="space-y-2">
                {currentOrders.length === 0
                  ? <div className="text-center py-8 text-[var(--text-secondary)] text-xs border-2 border-dashed border-[var(--border)] rounded-xl">Sin pedidos en este estado</div>
                  : currentOrders.map(o => <KanbanCard key={o.id} order={o} />)}
              </div>
            ) : null}
          </>
        );
      })()}

      {/* ─── Modal Historial de Mesa ─── */}
      {tableHistoryModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setTableHistoryModal(null)}>
          <div className="relative max-w-lg w-[90vw] max-h-[85vh] bg-card rounded-2xl border border-[var(--border)] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border)]">
              <span className="text-sm font-bold text-[var(--text-primary)]">🪑 Historial — Mesa {tableHistoryModal}</span>
              <button onClick={() => setTableHistoryModal(null)} className="w-8 h-8 rounded-full bg-[var(--bg-surface)] hover:bg-slate-600 flex items-center justify-center text-[var(--text-secondary)] transition-colors"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto max-h-[70vh] p-4 space-y-3">
              {tableHistoryOrders.length === 0 ? (
                <p className="text-center text-xs text-[var(--text-secondary)] py-8">Sin historial para esta mesa</p>
              ) : tableHistoryOrders.map(o => (
                <div key={o.id} className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[var(--text-primary)]"># {o.order_number}</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">{new Date(o.created_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)]">{o.status}</span>
                    <span className="text-xs font-bold text-amber-400">{formatPrice(o.total)}</span>
                  </div>
                  {(o as any).table_archived && <span className="text-[9px] text-emerald-400 font-bold">ARCHIVADO</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Receipt Lightbox Modal ─── */}
      {receiptViewerUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setReceiptViewerUrl(null)}
        >
          <div
            className="relative max-w-lg w-[90vw] max-h-[85vh] bg-card rounded-2xl border border-[var(--border)] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-surface)] border-b border-[var(--border)]">
              <span className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                🧾 Comprobante SINPE
              </span>
              <button
                onClick={() => setReceiptViewerUrl(null)}
                className="w-8 h-8 rounded-full bg-[var(--bg-surface)] hover:bg-slate-600 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
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
            <div className="px-4 py-3 bg-[var(--bg-surface)] border-t border-[var(--border)] flex gap-2">
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
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600 transition-colors"
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

    // Promo & coupon analytics
    const promoOrders = month.filter(o => (o as any).promotion_id);
    const couponOrders = month.filter(o => (o as any).coupon_code);
    const totalDiscountGiven = month.reduce((s, o) => s + ((o as any).discount_amount || 0), 0);
    const promoConversionRate = totalOrders > 0 ? Math.round((promoOrders.length / totalOrders) * 100) : 0;
    const couponConversionRate = totalOrders > 0 ? Math.round((couponOrders.length / totalOrders) * 100) : 0;

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
      promoOrders: promoOrders.length, couponOrders: couponOrders.length,
      totalDiscountGiven, promoConversionRate, couponConversionRate,
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

  // ── Section header helper ──
  const SectionHeader = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) => (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <span className="text-amber-400">{icon}</span>
      </div>
      <div>
        <h3 className="text-sm font-black text-[var(--text-primary)] leading-tight">{title}</h3>
        {subtitle && <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Analítica</h2>
        <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface)] px-3 py-1 rounded-full border border-[var(--border)]">Este mes</span>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          A. RESUMEN EJECUTIVO
      ═══════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader icon={<BarChart3 size={15} />} title="Resumen Ejecutivo" subtitle="KPIs principales del negocio" />

      {/* ── ROI / Upsell Module Premium V9.0 ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-green-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">Prueba de ROI — Este Mes</h3>
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
                <p className="text-[11px] text-[var(--text-secondary)] font-bold">{card.label}</p>
              </div>
              <p className="text-2xl font-black" style={{ color: card.color }}>{card.value}</p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1.5 font-medium">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Promo & Coupon Analytics */}
        {(stats.promoOrders > 0 || stats.couponOrders > 0 || stats.totalDiscountGiven > 0) && (
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-amber-400">🏷️</span>
                <p className="text-[10px] text-[var(--text-secondary)] font-bold">Promos aplicadas</p>
              </div>
              <p className="text-xl font-black text-amber-400">{stats.promoOrders}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">{stats.promoConversionRate}% de pedidos</p>
            </div>
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-purple-400">🎟️</span>
                <p className="text-[10px] text-[var(--text-secondary)] font-bold">Cupones usados</p>
              </div>
              <p className="text-xl font-black text-purple-400">{stats.couponOrders}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">{stats.couponConversionRate}% de pedidos</p>
            </div>
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-red-400">💸</span>
                <p className="text-[10px] text-[var(--text-secondary)] font-bold">Descuento total</p>
              </div>
              <p className="text-xl font-black text-red-400">-{formatPrice(stats.totalDiscountGiven)}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">en descuentos dados</p>
            </div>
          </div>
        )}

        {/* Revenue trend chart */}
        {stats.trendData.length > 0 && (
          <div className="mt-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4">
            <p className="text-xs text-[var(--text-secondary)] mb-3">Tendencia de ventas — últimos 7 días</p>
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

      </section>

      {/* ═══════════════════════════════════════════════════════════════
          B. VENTAS Y COMPORTAMIENTO
      ═══════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader icon={<TrendingUp size={15} />} title="Ventas y Comportamiento" subtitle="Cuándo vendes más y cómo fluye el negocio" />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: 'Ticket Promedio', value: formatPrice(stats.avgTicket), icon: <DollarSign size={15} />, color: 'text-amber-400', bg: 'from-amber-500/10 to-amber-600/5 border-amber-500/20' },
          { label: 'Pedidos este mes', value: stats.totalOrders, icon: <ClipboardList size={15} />, color: 'text-[var(--text-primary)]', bg: 'from-slate-700/30 to-slate-800/20 border-[var(--border)]' },
          { label: 'Visitas al menú', value: stats.visits, icon: <Eye size={15} />, color: 'text-[var(--text-primary)]', bg: 'from-slate-700/30 to-slate-800/20 border-[var(--border)]' },
          { label: 'Conversión', value: stats.visits > 0 ? `${Math.round((stats.totalOrders / stats.visits) * 100)}%` : '0%', icon: <TrendingUp size={15} />, color: 'text-green-400', bg: 'from-green-500/10 to-green-600/5 border-green-500/20' },
        ].map(({ label, value, icon, color, bg }) => (
          <div key={label} className={`bg-gradient-to-br ${bg} border rounded-[2rem] p-5 shadow-xl`}>
            <div className="flex items-center gap-1.5 mb-2 text-[var(--text-secondary)]">{icon}<p className="text-xs font-semibold">{label}</p></div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Picos de Venta + Top 3 con filtro dinámico ── */}
      <div className="border border-[var(--border)] rounded-3xl p-5 shadow-xl space-y-5" style={{ backgroundColor: 'var(--bg-surface)' }}>
        {/* Filtro de tiempo */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Picos de Venta</h3>
            <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-surface)] px-2 py-0.5 rounded-full">{filteredStats.filteredCount} pedidos</span>
          </div>
          <div className="flex gap-1">
            {(Object.keys(analyticsFilterLabels) as AnalyticsFilter[]).map(f => (
              <button key={f} onClick={() => setAnalyticsFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  analyticsFilter === f ? 'bg-amber-500 text-black' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600'
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
              <div key={label} className="bg-[var(--bg-surface)] rounded-2xl p-4 text-center border border-[var(--border)]">
                <div className="text-2xl mb-1">{emoji}</div>
                <p className="text-xs text-[var(--text-secondary)] font-semibold">{label}</p>
                <p className="text-[10px] text-[var(--text-secondary)] mb-2">{sublabel}</p>
                <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">{pct}%</p>
              </div>
            );
          })}
        </div>

        {/* Top 3 Platillos */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={14} className="text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Top 3 Platillos Más Vendidos</h3>
          </div>
          {filteredStats.top3.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)] text-center py-4">Sin datos en este período</p>
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
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate max-w-[160px]">{item.name}</span>
                        <span className="text-xs font-bold text-amber-400 ml-2 flex-shrink-0">{item.count} uds.</span>
                      </div>
                      <div className="h-2 bg-[var(--bg-surface)] rounded-full overflow-hidden">
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

      </section>

      {/* ═══════════════════════════════════════════════════════════════
          C. PRODUCTOS
      ═══════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader icon={<Trophy size={15} />} title="Productos" subtitle="Qué se vende más y qué mueve ingresos" />

      {/* ── Top 5 + Horas Pico ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top 5 Platillos */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={14} className="text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Top 5 Platillos</h3>
          </div>
          {stats.top5.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)] text-center py-4">Sin datos aún</p>
          ) : (
            <div className="space-y-2">
              {stats.top5.map((item, i) => {
                const maxCount = stats.top5[0].count;
                return (
                  <div key={item.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-secondary)] w-4">#{i + 1}</span>
                        <span className="text-sm text-[var(--text-primary)] truncate max-w-[140px]">{item.name}</span>
                      </div>
                      <span className="text-xs text-[var(--text-secondary)]">{item.count} uds.</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bg-surface)] rounded-full overflow-hidden">
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
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-blue-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Horas Pico (7 días)</h3>
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

      </section>

      {/* ═══════════════════════════════════════════════════════════════
          D. EQUIPO
      ═══════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader icon={<Users size={15} />} title="Equipo" subtitle="Cómo está rindiendo el personal hoy" />

      {/* ── Rendimiento del Equipo ── */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck size={15} className="text-blue-400" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Rendimiento del Equipo — Hoy</h3>
          <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] px-2 py-0.5 rounded-full">
            {staffStats.reduce((s, m) => s + m.completed, 0)} pedidos completados
          </span>
        </div>
        {staffStats.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] text-center py-6">Sin actividad de meseros hoy</p>
        ) : (
          <div className="space-y-3">
            {staffStats.map(member => (
              <div key={member.name} className="bg-card/60 border border-[var(--border)] rounded-xl p-4">
                {/* Staff header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[var(--text-primary)] font-bold text-xs flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-bold text-[var(--text-primary)]">{member.name}</span>
                  </div>
                  <span className="text-xs font-bold text-amber-400">{formatPrice(member.totalRevenue)}</span>
                </div>
                {/* Metrics row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[var(--bg-surface)] rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-[var(--text-primary)]">{member.completed}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Completados</p>
                  </div>
                  <div className="bg-[var(--bg-surface)] rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-green-400">{member.cobrados}</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Cobrados</p>
                  </div>
                  <div className="bg-[var(--bg-surface)] rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-blue-400">
                      {member.avgTimeMin > 0 ? `${member.avgTimeMin}m` : '—'}
                    </p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Tiempo prom.</p>
                  </div>
                </div>
                {/* Order list */}
                {member.orders.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {member.orders.map(o => (
                      <div key={o.id} className="flex items-center justify-between text-xs py-1 border-b border-[var(--border)] last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--text-secondary)]">#{o.order_number}</span>
                          <span className="text-[var(--text-secondary)]">{o.customer_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'entregado' ? 'bg-green-500/20 text-green-400' :
                            o.status === 'listo' ? 'bg-blue-500/20 text-blue-400' :
                            o.status === 'en_cocina' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                          }`}>
                            {o.status === 'entregado' ? 'Entregado' :
                             o.status === 'listo' ? 'Listo' :
                             o.status === 'en_cocina' ? 'En cocina' : o.status}
                          </span>
                          {(o as any).payment_status === 'paid' && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">Cobrado</span>
                          )}
                          <span className="text-[var(--text-secondary)] font-medium">{formatPrice(o.total)}</span>
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

      </section>

      {/* ═══════════════════════════════════════════════════════════════
          E. DELIVERY
      ═══════════════════════════════════════════════════════════════ */}
      <section>
        <SectionHeader icon={<Bike size={15} />} title="Delivery" subtitle="Cómo está funcionando el delivery como unidad operativa" />
        <DeliveryAnalyticsCard orders={orders as any} filter={analyticsFilter} />
      </section>

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
  const [cleaningOrders, setCleaningOrders] = useState(false);
  const [showCleanConfirm, setShowCleanConfirm] = useState<'7days' | '30days' | '90days' | null>(null);

  const handleCleanOldOrders = async (days: number) => {
    setCleaningOrders(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const { error, count } = await supabase
      .from('orders')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenant.id)
      .in('status', ['entregado', 'cancelado'])
      .lt('created_at', cutoff.toISOString());
    setCleaningOrders(false);
    setShowCleanConfirm(null);
    if (error) {
      toast.error('Error al limpiar pedidos: ' + error.message);
    } else {
      toast.success(`✅ ${count || 0} pedidos eliminados correctamente`);
      fetchHistory();
    }
  };

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
        <h2 className="text-lg font-bold text-[var(--text-primary)]">Historial de Pedidos</h2>
        <button onClick={fetchHistory} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-lg text-xs hover:bg-slate-600 transition-colors">
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(filterLabels) as HistoryFilter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === f ? 'bg-amber-500 text-black' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-slate-600'
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
            <p className="text-xs text-[var(--text-secondary)] font-semibold">Ingresos Totales</p>
          </div>
          <p className="text-2xl font-bold text-amber-400">{formatPrice(kpis.totalRevenue)}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5">{filterLabels[filter]}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/10 to-rose-500/10 border border-rose-500/20 rounded-[2rem] p-5 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={15} className="text-emerald-400" />
            <p className="text-xs text-[var(--text-secondary)] font-bold">Revenue por IA ✨</p>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{formatPrice(kpis.aiUpsellRevenue)}</p>
          <p className="text-xs text-rose-400/70 mt-1.5 font-medium">generado por GPT</p>
        </div>
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-[2rem] p-5 shadow-xl">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={15} className="text-blue-400" />
            <p className="text-xs text-[var(--text-secondary)] font-semibold">Volumen de Pedidos</p>
          </div>
          <p className="text-2xl font-bold text-blue-400">{kpis.count}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5">pedidos completados</p>
        </div>
      </div>

      {/* Orders table */}
      {loading ? (
        <div className="text-center py-12"><div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-secondary)] text-sm">Sin pedidos en este período</div>
      ) : (
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="hidden sm:grid grid-cols-6 px-4 py-2 border-b border-[var(--border)] text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
            <span>#</span><span>Cliente</span><span>Tipo</span><span>Total</span><span>Mesero</span><span>Detalle</span>
          </div>
          <div className="divide-y divide-slate-700/30">
            {orders.map(o => (
              <div key={o.id}>
                <div className="grid grid-cols-2 sm:grid-cols-6 items-center px-4 py-3 hover:bg-[var(--bg-surface)] transition-colors">
                  <span className="text-sm font-bold text-[var(--text-primary)]">#{o.order_number}</span>
                  <span className="text-sm text-[var(--text-secondary)] truncate">{o.customer_name || '—'}</span>
                  <span className="text-xs text-[var(--text-secondary)] hidden sm:block">{deliveryLabel(o)}</span>
                  <span className="text-sm font-bold text-amber-400">{formatPrice(o.total)}</span>
                  <span className="text-xs flex items-center gap-1">
                    {(o as any).handled_by_name ? <><UserCheck size={10} className="text-blue-400" /><span className="text-blue-300 font-semibold">{(o as any).handled_by_name}</span></> : <span className="text-[var(--text-secondary)]">—</span>}
                  </span>
                  <button
                    onClick={() => setExpandedOrderId(expandedOrderId === o.id ? null : o.id)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors text-left sm:text-center">
                    {expandedOrderId === o.id ? 'Ocultar' : 'Ver Detalle'}
                  </button>
                </div>
                {expandedOrderId === o.id && (
                  <div className="px-4 pb-3 bg-card/40">
                    <div className="text-xs text-[var(--text-secondary)] mb-1">
                      {new Date(o.created_at).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {(o as any).scheduled_date && (
                        <span className="ml-2 text-orange-400">⏰ Programado: {(o as any).scheduled_date === 'tomorrow' ? 'Mañana' : 'Hoy'} {(o as any).scheduled_time}</span>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {((o.items || []) as any[]).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-[var(--text-secondary)]">{item.quantity}× {item.name}</span>
                          <span className="text-[var(--text-secondary)]">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    {(o as any).delivery_address && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1">📍 {(o as any).delivery_address}</p>
                    )}
                    {(o as any).delivery_phone && (
                      <p className="text-xs text-[var(--text-secondary)]">📱 {(o as any).delivery_phone}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Limpieza de pedidos viejos ── */}
      <div className="mt-8 p-5 rounded-2xl border border-red-500/20 bg-red-500/5">
        <h3 className="text-sm font-bold text-red-400 mb-1 flex items-center gap-2">
          <Trash2 size={14} /> Limpiar pedidos del sistema
        </h3>
        <p className="text-xs text-[var(--text-secondary)] mb-4">Elimina permanentemente pedidos completados o cancelados más antiguos que el período seleccionado. Esta acción no se puede deshacer.</p>
        <div className="flex flex-wrap gap-2">
          {[{ key: '7days' as const, label: 'Más de 7 días', days: 7 },
            { key: '30days' as const, label: 'Más de 30 días', days: 30 },
            { key: '90days' as const, label: 'Más de 90 días', days: 90 }].map(opt => (
            <div key={opt.key}>
              {showCleanConfirm === opt.key ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-300 font-bold">¿Confirmar?</span>
                  <button
                    onClick={() => handleCleanOldOrders(opt.days)}
                    disabled={cleaningOrders}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                  >
                    {cleaningOrders ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button
                    onClick={() => setShowCleanConfirm(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCleanConfirm(opt.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  {opt.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
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
      <h2 className="text-lg font-bold text-[var(--text-primary)] mb-6">Código QR del Menú</h2>
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 text-center max-w-sm mx-auto">
        <div className="bg-white rounded-2xl p-6 mb-4 inline-block">
          <img src={qrApiUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-1 font-semibold">{tenant.name}</p>
        <p className="text-xs text-[var(--text-secondary)] mb-4 font-mono">{menuUrl}</p>
        <button onClick={handleDownload}
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-[var(--text-primary)] rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors mx-auto">
          <Download size={16} /> Descargar QR
        </button>
        <p className="text-[10px] text-[var(--text-secondary)] mt-3">Imprime este QR y colócalo en las mesas de tu restaurante</p>
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
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2"><Users size={20} className="text-blue-400" /> Equipo / Personal</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Gestiona los meseros y cajeros de tu restaurante</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
          <UserPlus size={14} /> Agregar Usuario
        </button>
      </div>

      {/* Admin PIN config */}
      <div className="bg-[var(--bg-surface)] border border-yellow-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-yellow-400" />
          <h3 className="text-sm font-bold text-yellow-400">PIN de Seguridad del Admin</h3>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-4">Este PIN de 4 dígitos se requerirá cuando un mesero intente cancelar una orden.</p>
        <div className="flex items-center gap-3">
          <input
            type="password"
            maxLength={4}
            value={adminPin}
            onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            className="w-24 px-3 py-2 bg-card border border-[var(--border)] rounded-xl text-center text-lg font-bold text-[var(--text-primary)] tracking-widest focus:outline-none focus:border-yellow-500"
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
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2"><UserPlus size={14} /> Nuevo Usuario</h3>
          {/* Role selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewRole('staff')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                newRole === 'staff'
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-slate-500'
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
                  : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-slate-500'
              }`}
            >
              <ChefHat size={12} /> Cocina
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Nombre completo</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Juan Pérez"
                className="w-full px-3 py-2 bg-card border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Username (para login)</label>
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="juan"
                className="w-full px-3 py-2 bg-card border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-secondary)] mb-1 block">Contraseña</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••"
                className="w-full px-3 py-2 bg-card border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateStaff} disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 text-[var(--text-primary)] rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                newRole === 'kitchen' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-blue-600 hover:bg-blue-500'
              }`}>
              <Save size={14} /> {saving ? 'Creando...' : newRole === 'kitchen' ? 'Crear Usuario Cocina' : 'Crear Mesero'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-xl text-sm hover:bg-slate-600 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <div className="text-center py-8"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" /></div>
      ) : staff.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay meseros registrados</p>
          <p className="text-xs mt-1">Agrega tu primer mesero para que puedan usar el panel de staff</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map(member => (
            <div key={member.id} className="flex items-center justify-between p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-primary)] font-bold text-sm ${
                    member.role === 'kitchen'
                      ? 'bg-gradient-to-br from-orange-500 to-red-600'
                      : 'bg-gradient-to-br from-blue-500 to-purple-600'
                  }`}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{member.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">@{member.username} · {member.role === 'kitchen' ? '🍳 Cocina' : 'Mesero'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${member.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-600/40 text-[var(--text-secondary)]'}`}>
                  {member.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => handleToggleActive(member)}
                  className="p-2 rounded-lg bg-[var(--bg-surface)] hover:bg-slate-600 transition-colors text-[var(--text-secondary)]">
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
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
          <Eye size={12} /> Meseros inician sesión en: <span className="text-blue-400 font-mono">/staff/{tenant.slug}</span>
        </p>
        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
          <ChefHat size={12} className="text-orange-400" /> Cocina accede en: <span className="text-orange-400 font-mono">/kitchen/{tenant.slug}</span>
        </p>
        <p className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
          <Bike size={12} className="text-amber-400" /> Riders acceden en: <span className="text-amber-400 font-mono">/rider/{tenant.slug}</span>
        </p>
      </div>

      {/* ── Riders de Delivery ── */}
      <div className="mt-2">
        <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 mb-1">
          <Bike size={20} className="text-amber-400" /> Riders de Delivery
        </h2>
        <p className="text-xs text-[var(--text-secondary)] mb-4">Gestiona los repartidores. Cada rider accede con su PIN desde <span className="text-amber-400 font-mono">/rider/{tenant.slug}</span></p>
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
          <h2 className="text-lg font-black text-[var(--text-primary)] flex items-center gap-2"><TrendingUp size={20} className="text-amber-400" /> Rendimiento del Equipo</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Métricas operativas en tiempo real por mesero</p>
        </div>
        <div className="flex gap-1.5">
          {(Object.keys(filterLabels) as (keyof typeof filterLabels)[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={filter === f ? { background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: '#000' } : { backgroundColor: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid hsl(var(--border))' }}>
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
              <p className="text-sm text-[var(--text-primary)]/90">{ins.text}</p>
            </div>
          ))}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" /></div>
      ) : staffMetrics.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-secondary)]">
          <UserCheck size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Sin actividad registrada</p>
          <p className="text-xs mt-1 text-[var(--text-secondary)]">Los eventos se registran cuando los meseros aceptan o entregan pedidos</p>
        </div>
      ) : (
        <div className="space-y-4">
          {staffMetrics.map((member, idx) => (
            <div key={member.name} className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-primary)] font-black text-sm flex-shrink-0"
                    style={{ background: idx === 0 ? 'linear-gradient(135deg,#F59E0B,#F97316)' : idx === 1 ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-black text-[var(--text-primary)]">{member.name}</p>
                    {idx === 0 && <span className="text-[10px] font-bold text-amber-400">🏆 Top performer</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-[var(--text-primary)]">{member.ordersDelivered}</p>
                  <p className="text-[10px] text-[var(--text-secondary)]">entregados</p>
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
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'rgba(30,41,59,0.4)', border: '1px solid hsl(var(--border))' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
            <h3 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest">Últimos eventos</h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'hsl(var(--border))' }}>
            {events.slice(0, 20).map(e => {
              const ev = eventLabels[e.event_type] || { label: e.event_type, color: '#64748b' };
              return (
                <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]/90">{e.staff_name}</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">{ev.label}{e.order_number ? ` — #${e.order_number}` : ''}{e.table_number ? ` · Mesa ${e.table_number}` : ''}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    {e.response_time_seconds && <p className="text-[10px] text-[var(--text-secondary)]">{fmtTime(e.response_time_seconds)}</p>}
                    <p className="text-[10px] text-[var(--text-secondary)]">{new Date(e.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</p>
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

// ─── Smart Closing Tab — Corte Inteligente ───
function SmartClosingTab({ tenant, orders }: { tenant: Tenant; orders: Order[] }) {
  const [corteVisible, setCorteVisible] = useState(false);
  const [arqueoValues, setArqueoValues] = useState({ sinpe: '', efectivo: '', tarjeta: '' });
  const [arqueoSaved, setArqueoSaved] = useState(false);

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

  const arqueoTotal = useMemo(() => {
    const s = parseFloat(arqueoValues.sinpe.replace(/,/g, '')) || 0;
    const e = parseFloat(arqueoValues.efectivo.replace(/,/g, '')) || 0;
    const t = parseFloat(arqueoValues.tarjeta.replace(/,/g, '')) || 0;
    return s + e + t;
  }, [arqueoValues]);

  const diferencia = arqueoTotal - corteStats.total;

  const handleDownloadCorte = () => {
    const now = new Date().toLocaleString('es-CR');
    const lines = [
      `CORTE INTELIGENTE — ${tenant.name}`,
      `Fecha: ${now}`,
      `${'='.repeat(40)}`,
      `Total de pedidos: ${corteStats.count}`,
      ``,
      `SISTEMA`,
      `SINPE Móvil:  ${formatPrice(corteStats.byMethod.sinpe)}`,
      `Efectivo:     ${formatPrice(corteStats.byMethod.efectivo)}`,
      `Tarjeta:      ${formatPrice(corteStats.byMethod.tarjeta)}`,
      `TOTAL SISTEMA: ${formatPrice(corteStats.total)}`,
      ``,
      ...(arqueoSaved ? [
        `ARQUEO MANUAL`,
        `SINPE Móvil:  ${formatPrice(parseFloat(arqueoValues.sinpe) || 0)}`,
        `Efectivo:     ${formatPrice(parseFloat(arqueoValues.efectivo) || 0)}`,
        `Tarjeta:      ${formatPrice(parseFloat(arqueoValues.tarjeta) || 0)}`,
        `TOTAL ARQUEO: ${formatPrice(arqueoTotal)}`,
        ``,
        `DIFERENCIA:   ${diferencia >= 0 ? '+' : ''}${formatPrice(diferencia)}`,
      ] : []),
      `${'='.repeat(40)}`,
      `TOTAL DEL DÍA: ${formatPrice(corteStats.total)}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `corte-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Corte descargado');
  };

  const handleWhatsAppCorte = () => {
    const now = new Date().toLocaleString('es-CR');
    let msg = `*CORTE — ${tenant.name}*\n${now}\n\n` +
      `Pedidos: ${corteStats.count}\n` +
      `SINPE: ${formatPrice(corteStats.byMethod.sinpe)}\n` +
      `Efectivo: ${formatPrice(corteStats.byMethod.efectivo)}\n` +
      `Tarjeta: ${formatPrice(corteStats.byMethod.tarjeta)}\n` +
      `*TOTAL: ${formatPrice(corteStats.total)}*`;
    if (arqueoSaved) {
      msg += `\n\n*ARQUEO MANUAL*\n` +
        `SINPE: ${formatPrice(parseFloat(arqueoValues.sinpe) || 0)}\n` +
        `Efectivo: ${formatPrice(parseFloat(arqueoValues.efectivo) || 0)}\n` +
        `Tarjeta: ${formatPrice(parseFloat(arqueoValues.tarjeta) || 0)}\n` +
        `Total arqueo: ${formatPrice(arqueoTotal)}\n` +
        `Diferencia: ${diferencia >= 0 ? '+' : ''}${formatPrice(diferencia)}`;
    }
    const waUrl = buildWhatsAppUrl(tenant.whatsapp_number || tenant.phone, msg);
    if (waUrl) window.open(waUrl, '_blank');
    else window.open(`https://wa.me/?text=${encodeURIComponent(msg.normalize('NFC'))}`, '_blank');
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Corte Inteligente</h2>
          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">Cierre del día con arqueo manual y cuadre automático</p>
        </div>
        <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface)] px-3 py-1 rounded-full border border-[var(--border)]">
          {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {/* Resumen del sistema */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">Resumen del sistema</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total del día', value: formatPrice(corteStats.total), color: 'text-amber-400', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
            { label: 'SINPE Móvil', value: formatPrice(corteStats.byMethod.sinpe), color: 'text-purple-400', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.15)' },
            { label: 'Efectivo', value: formatPrice(corteStats.byMethod.efectivo), color: 'text-green-400', bg: 'rgba(52,211,153,0.06)', border: 'rgba(52,211,153,0.15)' },
            { label: 'Tarjeta', value: formatPrice(corteStats.byMethod.tarjeta), color: 'text-blue-400', bg: 'rgba(96,165,250,0.06)', border: 'rgba(96,165,250,0.15)' },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} className="rounded-2xl p-4" style={{ backgroundColor: bg, border: `1px solid ${border}` }}>
              <p className="text-[11px] text-[var(--text-secondary)] mb-1.5">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle de pedidos */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={14} className="text-[var(--text-secondary)]" />
            <span className="text-sm font-bold text-[var(--text-primary)]">{corteStats.count} pedidos hoy</span>
          </div>
          <button onClick={() => setCorteVisible(!corteVisible)}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
            {corteVisible ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {corteVisible ? 'Ocultar' : 'Ver detalle'}
          </button>
        </div>
        {corteVisible && corteStats.orders.length > 0 && (
          <div className="max-h-52 overflow-y-auto space-y-1">
            {corteStats.orders.map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-[var(--border)] last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-secondary)]">#{o.order_number}</span>
                  <span className="text-[var(--text-secondary)]">{new Date(o.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-[var(--text-secondary)] capitalize">{o.payment_method || 'efectivo'}</span>
                </div>
                <span className="text-[var(--text-primary)] font-medium">{formatPrice(o.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Arqueo Manual */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Scissors size={15} className="text-purple-400" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">Arqueo Manual</h3>
          <span className="text-[11px] text-[var(--text-secondary)] bg-[var(--bg-surface)] px-2 py-0.5 rounded-full">Ingresa lo que contaste físicamente</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {[
            { key: 'sinpe' as const, label: 'SINPE Móvil', color: '#8B5CF6' },
            { key: 'efectivo' as const, label: 'Efectivo', color: '#34d399' },
            { key: 'tarjeta' as const, label: 'Tarjeta', color: '#60a5fa' },
          ].map(({ key, label, color }) => (
            <div key={key}>
              <label className="text-[11px] font-bold text-[var(--text-secondary)] mb-1.5 block">{label}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-sm font-bold">₡</span>
                <input
                  type="number"
                  value={arqueoValues[key]}
                  onChange={e => { setArqueoValues(prev => ({ ...prev, [key]: e.target.value })); setArqueoSaved(false); }}
                  placeholder="0"
                  className="w-full border border-[var(--border)] rounded-xl pl-7 pr-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-1 transition-all"
                  style={{ color, backgroundColor: 'var(--bg-surface)' }}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setArqueoSaved(true)}
          className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
          style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B' }}
        >
          Calcular cuadre
        </button>
        {arqueoSaved && (
          <div className="mt-4 rounded-xl p-4 space-y-3" style={{
            background: diferencia === 0 ? 'rgba(52,211,153,0.08)' : diferencia > 0 ? 'rgba(96,165,250,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${diferencia === 0 ? 'rgba(52,211,153,0.2)' : diferencia > 0 ? 'rgba(96,165,250,0.2)' : 'rgba(239,68,68,0.2)'}`
          }}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)]">Total arqueo</span>
              <span className="text-base font-bold text-[var(--text-primary)]">{formatPrice(arqueoTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)]">Total sistema</span>
              <span className="text-base font-bold text-amber-400">{formatPrice(corteStats.total)}</span>
            </div>
            <div className="h-px bg-[var(--bg-surface)]" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[var(--text-primary)]">Diferencia</span>
              <span className={`text-lg font-black ${diferencia === 0 ? 'text-green-400' : diferencia > 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {diferencia >= 0 ? '+' : ''}{formatPrice(diferencia)}
              </span>
            </div>
            <p className="text-[11px] text-center" style={{ color: diferencia === 0 ? '#34d399' : diferencia > 0 ? '#60a5fa' : '#f87171' }}>
              {diferencia === 0 ? '✓ Cuadre perfecto' : diferencia > 0 ? `Sobrante de ${formatPrice(Math.abs(diferencia))}` : `Faltante de ${formatPrice(Math.abs(diferencia))}`}
            </p>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex gap-3">
        <button onClick={handleDownloadCorte}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--bg-surface)] text-[var(--text-secondary)] rounded-xl text-xs font-bold hover:bg-slate-600 transition-colors">
          <Download size={13} /> Descargar TXT
        </button>
        <button onClick={handleWhatsAppCorte}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600/20 text-green-400 border border-green-600/30 rounded-xl text-xs font-bold hover:bg-green-600/30 transition-colors">
          <MessageCircle size={13} /> Enviar por WhatsApp
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───
type TabKey = 'menu' | 'categories' | 'modifiers' | 'settings' | 'theme' | 'orders' | 'analytics' | 'history' | 'qr' | 'staff' | 'performance' | 'closing' | 'delivery' | 'tables';

export default function AdminDashboard() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { isAuthenticated, role, logout } = useAdminAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>('orders');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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

  const planTier = (tenant.plan_tier || 'premium') as import('@/lib/plans').PlanTier;
  const planFeatures = getPlanFeatures(planTier);
  // Delivery OS: activo si el plan es premium o si el tenant tiene delivery configurado
  const hasDeliveryOs = planFeatures.deliveryOs;

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* ── Sidebar ── */}
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tenantName={tenant.name}
        tenantSlug={slug || ''}
        isOpen={true}
        isOpen_mobile={mobileSidebarOpen}
        onToggleMobile={() => setMobileSidebarOpen(p => !p)}
        onLogout={() => { logout(); navigate('/'); }}
        planFeatures={planFeatures}
        planTier={planTier}
        hasDeliveryOs={hasDeliveryOs}
      />

      {/* ── Main content (offset by sidebar width on desktop) ── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-56">
        {/* Top bar (mobile: shows tenant name + status; desktop: minimal) */}
        <header
          className="sticky top-0 z-30 backdrop-blur-xl border-b flex items-center justify-between px-4 py-3 lg:px-6"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bg-surface) 95%, transparent)',
            borderColor: 'var(--border)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
          }}
        >
          {/* Mobile: spacer for hamburger button */}
          <div className="lg:hidden w-10" />

          {/* Tenant name + status */}
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-black" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{tenant.name}</h1>
            <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
              tenant.is_open
                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                : 'bg-red-500/15 text-red-400 border border-red-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tenant.is_open ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {tenant.is_open ? 'Abierto' : 'Cerrado'}
            </span>
          </div>

          {/* Right: current section label */}
          <p className="text-xs text-[var(--text-secondary)] font-mono hidden lg:block">/{slug}</p>
          <div className="lg:hidden w-10" />
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6 lg:px-8 overflow-y-auto">
          {activeTab === 'orders' && <OrdersTab tenant={tenant} />}
          {activeTab === 'menu' && <MenuTab tenant={tenant} categories={categories} items={items} onRefresh={fetchData} />}
          {activeTab === 'categories' && (
            <div>
              <CategoriesTab tenant={tenant} categories={categories} onRefresh={fetchData} />
              <MenuSectionsManager tenant={tenant} categories={categories} items={items} />
            </div>
          )}
          {activeTab === 'modifiers' && <ModifiersTab tenant={tenant} items={items} />}
          {activeTab === 'settings' && <SettingsTab tenant={tenant} onRefresh={fetchData} />}
          {activeTab === 'theme' && <ThemeTab tenant={tenant} theme={theme} onRefresh={fetchData} />}
          {activeTab === 'analytics' && <AnalyticsTab tenant={tenant} items={items} orders={orders} />}
          {activeTab === 'history' && <HistoryTab tenant={tenant} />}
          {activeTab === 'qr' && <QRTab tenant={tenant} />}
          {activeTab === 'staff' && <StaffTab tenant={tenant} onRefresh={fetchData} />}
          {activeTab === 'performance' && <StaffAnalyticsTab tenant={tenant} />}
          {activeTab === 'closing' && <SmartClosingTab tenant={tenant} orders={orders} />}
          {activeTab === 'delivery' && <DeliveryOS tenant={tenant} />}
          {activeTab === 'customers' && <CustomersTab tenant={tenant} />}
          {activeTab === 'promotions' && <PromotionsTab tenant={tenant} />}
          {activeTab === 'tables' && (
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                <UtensilsCrossed size={20} className="text-amber-400" /> Mapa de Mesas
              </h2>
              <TablesMapPanel tenant={tenant} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
