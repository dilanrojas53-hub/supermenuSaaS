Warning: truncated output (original token count: 77476)
Total output lines: 5560

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
import HeroImageUpload from '@/components/HeroImageUpload';
import type { HeroImageMetadata } from '@/lib/heroImageProcessor';
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
import TaxSettingsTab from '@/pages/TaxSettingsTab';
import LandingTab from '@/pages/LandingTab';
import OrderTypesTab from '@/pages/OrderTypesTab';
import TeamIntelligenceTab from '@/components/TeamIntelligenceTab';
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
  Loader2, ShoppingBag
} from 'lucide-react';
import { waPhone, buildWhatsAppUrl } from '@/lib/phone';
import { AdminSidebar } from '@/components/AdminSidebar';
import { OnboardingProvider } from '@/lib/onboarding';
import { TourOverlay, ModuleWelcomeGate, HelpTrigger, HelpCenter } from '@/components/onboarding';
import { useUITheme } from '@/contexts/UIThemeContext';
import { themes, type ThemeKey, RESTAURANT_THEMES, type RestaurantThemePreset, getThemeCategories, getThemePreset, applyRestaurantTheme, isColorDark } from '@/lib/themes';
import { toast } from 'sonner';
import { useAIInsights } from '@/lib/aiInsights';
import type { RawAnalyticsData } from '@/lib/aiInsights';
import { AIInsightPanel } from '@/components/analytics/AIInsightPanel';
import UpsellAnalyticsPanel from '@/components/analytics/UpsellAnalyticsPanel';

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
      name: item.name, description: item.description || '', price: String(Math.round(item.price)),
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
      price: Math.round(parseFloat(form.price.replace(/\./g, '').replace(',', '.')) || 0), category_id: form.category_id,
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
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={form.price}
                onChange={e => {
                  // Solo permitir dígitos (sin punto ni coma)
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setForm({ ...form, price: raw });
                }}
                placeholder="Ej: 3850"
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

  const toggleItemInSection = async (sectionId: string, itemId: string, _categoryId?: string) => {
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
                                    if (assignedItemIds.includes(item.id)) await toggleItemInSection(section.id, item.id, item.category_id);
                                  }
                                } else {
                                  // Select all in category
                                  for (const item of catItems) {
                                    if (!assignedItemIds.includes(item.id)) await toggleItemInSection(section.id, item.id, item.category_id);
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
                                <button key={item.id} onClick={() => toggleItemInSection(section.id, item.id, item.category_id)}
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
    { key: 'dispatch' as const, label: 'Despacho',    badge: undefined },
    { key: 'ops'      as const, label: '🟢 Operaciones', badge: undefined },
    { key: 'history'  as const, label: 'Historial',   badge: undefined },
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
type TableCategory = 'mesa_grande' | 'mesa_pequeña' | 'taburete';
const TABLE_CATEGORY_LABELS: Record<TableCategory, string> = {
  mesa_grande: 'Mesa grande',
  mesa_pequeña: 'Mesa pequeña',
  taburete: 'Taburete de bar',
};
const TABLE_CATEGORY_ICONS: Record<TableCategory, string> = {
  mesa_grande: '🪑',
  mesa_pequeña: '🍽️',
  taburete: '🪑',
};
// ─── TakeoutToggleCard ─ Toggle de Para llevar en Configuración ──────────────
function TakeoutToggleCard({ tenant }: { tenant: Tenant }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('delivery_settings')
      .select('takeout_orders_enabled')
      .eq('tenant_id', tenant.id)
      .maybeSingle()
      .then(({ data }) => {
        setEnabled(data?.takeout_orders_enabled ?? false);
        setLoading(false);
      });
  }, [tenant.id]);

  const handleToggle = async (v: boolean) => {
    setEnabled(v);
    setSaving(true);
    const { error } = await supabase
      .from('delivery_settings')
      .upsert({ tenant_id: tenant.id, takeout_orders_enabled: v }, { onConflict: 'tenant_id' });
    setSaving(false);
    if (error) toast.error('Error: ' + error.message);
    else toast.success(v ? 'Para llevar activado ✅' : 'Para llevar desactivado');
  };

  if (loading) return null;
  return (
    <div className="mt-6 pt-6 border-t border-slate-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} className="text-emerald-400" />
          <div>
            <h3 className="text-sm font-black text-[var(--text-primary)]">Para llevar</h3>
            <p className="text-xs text-[var(--text-secondary)]">Pedidos para recoger en el local. El servicio 10% se descuenta automáticamente si los precios lo incluyen.</p>
          </div>
        </div>
        <ToggleSwitch
          checked={enabled}
          onChange={handleToggle}
          colorOn="#10B981"
        />
      </div>
      {saving && <p className="text-xs text-emerald-400 mt-1">Guardando...</p>}
    </div>
  );
}

function TablesConfigSection({ tenant }: { tenant: Tenant }) {
  const [tables, setTables] = useState<{ id: string; table_number: string; label: string; capacity: string; sort_order: number; category: TableCategory | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newTable, setNewTable] = useState({ table_number: '', label: '', capacity: '', category: '' as TableCategory | '' });
  const [showAdd, setShowAdd] = useState(false);
  const [bulkFrom, setBulkFrom] = useState('');
  const [bulkTo, setBulkTo] = useState('');
  const [bulkCategory, setBulkCategory] = useState<TableCategory | ''>('');
  const [showBulk, setShowBulk] = useState(false);

  const fetchTables = useCallback(async () => {
    const { data } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, label, capacity, sort_order, is_active, category')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('table_number', { ascending: true });
    setTables((data || []).map((t: any) => ({ ...t, capacity: String(t.capacity || ''), category: t.category || null })));
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
      category: newTable.category || null,
      is_active: true,
      is_occupied: false,
      sort_order: tables.length,
    });
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Mesa agregada');
    setNewTable({ table_number: '', label: '', capacity: '', category: '' });
    setShowAdd(false);
    fetchTables();
  };

  const handleBulkCreate = async () => {
    const from = parseInt(bulkFrom);
    const to = parseInt(bulkTo);
    if (!from || !to || from > to || to - from > 99) {
      toast.error('Ingresa un rango válido (ej: 1 a 6, máximo 100 espacios)');
      return;
    }
    if (!bulkCategory) { toast.error('Selecciona una categoría'); return; }
    setSaving(true);
    const existingNumbers = new Set(tables.map(t => t.table_number));
    const toInsert = [];
    for (let num = from; num <= to; num++) {
      const numStr = String(num);
      if (!existingNumbers.has(numStr)) {
        toInsert.push({
          tenant_id: tenant.id,
          table_number: numStr,
          label: null,
          capacity: null,
          category: bulkCategory,
          is_active: true,
          is_occupied: false,
          sort_order: tables.length + toInsert.length,
        });
      }
    }
    if (toInsert.length === 0) { toast.error('Todos esos números ya existen'); setSaving(false); return; }
    const { error } = await supabase.from('restaurant_tables').insert(toInsert);
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(`${toInsert.length} espacios creados como "${TABLE_CATEGORY_LABELS[bulkCategory]}"`);
    setBulkFrom('');
    setBulkTo('');
    setBulkCategory('');
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
        <div className="mb-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] space-y-3">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">Crear espacios por rango numérico</p>
          {/* Rango */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Desde #</label>
              <input
                type="number" min={1}
                value={bulkFrom}
                onChange={e => setBulkFrom(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
              />
            </div>
            <span className="text-[var(--text…47476 tokens truncated…'today': return { from: today, to: now };
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
type TabKey = 'menu' | 'categories' | 'modifiers' | 'settings' | 'theme' | 'orders' | 'analytics' | 'history' | 'qr' | 'staff' | 'performance' | 'closing' | 'delivery' | 'tables' | 'experience' | 'customers' | 'promotions' | 'tax' | 'landing' | 'order_types';

export default function AdminDashboard() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { isLoading: authLoading, isAuthenticated, role, logout } = useAdminAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>('orders');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (role !== 'admin' && role !== 'superadmin'))) {
      navigate(`/admin/${slug}/login`);
    }
  }, [authLoading, isAuthenticated, role, navigate, slug]);

  const fetchData = useCallback(async () => {
    if (!slug || authLoading || !isAuthenticated || (role !== 'admin' && role !== 'superadmin')) return;
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
  }, [authLoading, isAuthenticated, role, slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-page)' }}>
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

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
    <OnboardingProvider userId={slug || 'admin'}>
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
        onOpenHelpCenter={() => setHelpCenterOpen(true)}
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

          {/* Right: current section label + help */}
          <div className="hidden lg:flex items-center gap-3">
            <p className="text-xs text-[var(--text-secondary)] font-mono">/{slug}</p>
            <button
              onClick={() => setHelpCenterOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
              style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.15)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.14)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.08)'; }}
            >
              <span>📚</span> Guías
            </button>
          </div>
          <div className="lg:hidden w-10" />
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6 lg:px-8 overflow-y-auto">
          {activeTab === 'orders' && <ModuleWelcomeGate module="orders"><OrdersTab tenant={tenant} /></ModuleWelcomeGate>}
          {activeTab === 'menu' && <ModuleWelcomeGate module="menu"><MenuTab tenant={tenant} categories={categories} items={items} onRefresh={fetchData} /></ModuleWelcomeGate>}
          {activeTab === 'categories' && (
            <ModuleWelcomeGate module="categories">
              <div>
                <CategoriesTab tenant={tenant} categories={categories} onRefresh={fetchData} />
                <MenuSectionsManager tenant={tenant} categories={categories} items={items} />
              </div>
            </ModuleWelcomeGate>
          )}
          {activeTab === 'modifiers' && <ModuleWelcomeGate module="modifiers"><ModifiersTab tenant={tenant} items={items} /></ModuleWelcomeGate>}
          {activeTab === 'settings' && <ModuleWelcomeGate module="settings"><SettingsTab tenant={tenant} onRefresh={fetchData} /></ModuleWelcomeGate>}
          {activeTab === 'experience' && <ModuleWelcomeGate module="experience"><ExperienceTab tenant={tenant} onRefresh={fetchData} /></ModuleWelcomeGate>}
          {activeTab === 'theme' && <ModuleWelcomeGate module="theme"><ThemeTab tenant={tenant} theme={theme} onRefresh={fetchData} /></ModuleWelcomeGate>}
          {activeTab === 'analytics' && <ModuleWelcomeGate module="analytics"><AnalyticsTab tenant={tenant} items={items} orders={orders} /></ModuleWelcomeGate>}
          {activeTab === 'history' && <ModuleWelcomeGate module="history"><HistoryTab tenant={tenant} /></ModuleWelcomeGate>}
          {activeTab === 'qr' && <ModuleWelcomeGate module="qr"><QRTab tenant={tenant} /></ModuleWelcomeGate>}
          {activeTab === 'staff' && <ModuleWelcomeGate module="staff"><StaffTab tenant={tenant} onRefresh={fetchData} /></ModuleWelcomeGate>}
          {activeTab === 'performance' && <ModuleWelcomeGate module="performance"><TeamIntelligenceTab tenant={tenant} /></ModuleWelcomeGate>}
          {activeTab === 'closing' && <SmartClosingTab tenant={tenant} orders={orders} />}
          {activeTab === 'delivery' && <ModuleWelcomeGate module="delivery"><DeliveryOS tenant={tenant} /></ModuleWelcomeGate>}
          {activeTab === 'customers' && <ModuleWelcomeGate module="customers"><CustomersTab tenant={tenant} /></ModuleWelcomeGate>}
          {activeTab === 'promotions' && <ModuleWelcomeGate module="promotions"><PromotionsTab tenant={tenant} /></ModuleWelcomeGate>}
          {activeTab === 'tax' && <TaxSettingsTab tenant={tenant} />}
          {activeTab === 'landing' && <LandingTab tenant={tenant} />}
          {activeTab === 'order_types' && <OrderTypesTab tenant={tenant} />}
          {activeTab === 'tables' && (
            <ModuleWelcomeGate module="tables">
              <div>
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                  <UtensilsCrossed size={20} className="text-amber-400" /> Mapa de Mesas
                </h2>
                <TablesMapPanel tenant={tenant} />
              </div>
            </ModuleWelcomeGate>
          )}
        </main>
      </div>
    </div>
    {/* ── Onboarding: Tour overlay (siempre montado, solo visible cuando hay tour activo) ── */}
    <TourOverlay />
    {/* ── Help Center ── */}
    {helpCenterOpen && <HelpCenter onClose={() => setHelpCenterOpen(false)} />}
    </OnboardingProvider>
  );
}
