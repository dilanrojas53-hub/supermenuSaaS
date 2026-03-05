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
import { PRESET_LIST } from '@/lib/themes';
import { useKitchenBell } from '@/hooks/useKitchenBell';
import type { Tenant, ThemeSettings, Category, MenuItem, Order } from '@/lib/types';
import ImageUpload from '@/components/ImageUpload';
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
  Trophy, AlertCircle, Users, MapPin, Navigation, Bike
} from 'lucide-react';
import { waPhone, buildWhatsAppUrl } from '@/lib/phone';
import { useUITheme } from '@/contexts/UIThemeContext';
import { themes, type ThemeKey } from '@/lib/themes';
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
    setEditingItem(item);
    setIsCreating(false);
    setForm({
      name: item.name, description: item.description || '', price: String(item.price),
      category_id: item.category_id, image_url: item.image_url || '',
      is_available: item.is_available, is_featured: item.is_featured,
      badge: item.badge || '', upsell_item_id: item.upsell_item_id || '',
      upsell_text: item.upsell_text || '', sort_order: String(item.sort_order)
    });
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
    const { error } = await supabase.from('menu_items').update({
      is_available: !item.is_available, updated_at: new Date().toISOString()
    }).eq('id', item.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(item.is_available ? 'Marcado como agotado' : 'Marcado como disponible');
    onRefresh();
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{item.name}</span>
                      {item.badge && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">{item.badge}</span>}
                      {item.is_featured && <Star size={12} className="text-amber-400" />}
                    </div>
                    <span className="text-sm text-amber-400 font-semibold">{formatPrice(item.price)}</span>
                  </div>
                  {/* Quick toggle */}
                  <ToggleSwitch checked={item.is_available} onChange={() => handleToggleAvailable(item)} />
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(item)} className="p-2 hover:bg-slate-700 rounded-lg"><Pencil size={14} className="text-slate-400" /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} className="text-red-400" /></button>
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

// ─── Theme Tab ───
function ThemeTab({ tenant, theme, onRefresh }: { tenant: Tenant; theme: ThemeSettings; onRefresh: () => void }) {
  // ── Motor de Theming B2B V4.0 ──
  const { uiTheme, setUiTheme } = useUITheme();
  const [form, setForm] = useState({
    primary_color: theme.primary_color, secondary_color: theme.secondary_color,
    accent_color: theme.accent_color, background_color: theme.background_color,
    text_color: theme.text_color, font_family: theme.font_family,
    view_mode: theme.view_mode, hero_image_url: theme.hero_image_url || '',
    theme_preset: (theme as any).theme_preset || 'default'
  });
  const [saving, setSaving] = useState(false);

  // TAREA 3: Color pickers de personalización libre
  const [customBg, setCustomBg] = useState<string>(
    localStorage.getItem('custom_bg_color') || ''
  );
  const [customAccent, setCustomAccent] = useState<string>(
    localStorage.getItem('custom_accent_color') || ''
  );

  const handleCustomBgChange = (color: string) => {
    setCustomBg(color);
    localStorage.setItem('custom_bg_color', color);
    document.documentElement.style.setProperty('--bg-page', color);
    document.documentElement.style.setProperty('--bg-surface', color);
    // También actualiza el form para que el botón Guardar lo persista en Supabase
    setForm(f => ({ ...f, background_color: color }));
  };

  const handleCustomAccentChange = (color: string) => {
    setCustomAccent(color);
    localStorage.setItem('custom_accent_color', color);
    document.documentElement.style.setProperty('--accent', color);
    // También actualiza el form para que el botón Guardar lo persista en Supabase
    setForm(f => ({ ...f, primary_color: color }));
  };

  const handleClearCustomColors = () => {
    localStorage.removeItem('custom_bg_color');
    localStorage.removeItem('custom_accent_color');
    setCustomBg('');
    setCustomAccent('');
    // Restaurar los colores del tema del restaurante
    document.documentElement.style.setProperty('--bg-page', form.background_color);
    document.documentElement.style.setProperty('--accent', form.primary_color);
    toast.success('Colores personalizados eliminados');
  };

  const handlePresetChange = async (presetId: string) => {
    setForm(f => ({ ...f, theme_preset: presetId }));
    try {
      await supabase
        .from('theme_settings')
        .update({ theme_preset: presetId })
        .eq('tenant_id', tenant.id);
      toast.success('Preset aplicado: ' + presetId);
    } catch (error) {
      console.error('Error saving preset:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('theme_settings').update({
      ...form, hero_image_url: form.hero_image_url || null, updated_at: new Date().toISOString()
    }).eq('tenant_id', tenant.id);
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Tema actualizado'); onRefresh();
  };

  const fonts = ['Georgia', 'Poppins', 'Montserrat', 'Inter', 'Lora', 'Nunito'];

  return (
    <div>
      <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Personalización del Tema</h2>

      {/* ── PANEL DE APARIENCIA B2B V4.0 ── */}
      <div className="rounded-2xl p-6 mb-6 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">🎨</span>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Apariencia del Panel de Administración</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Elige el tema visual del panel. El cambio es instantáneo y se guarda automáticamente.</p>

        {/* Dropdown simple para selección rápida */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Selección rápida:</label>
          <select
            value={uiTheme}
            onChange={e => setUiTheme(e.target.value as ThemeKey)}
            className="px-3 py-1.5 rounded-lg text-sm border cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-page)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border)',
            }}
          >
            {(Object.entries(themes) as [ThemeKey, typeof themes[ThemeKey]][]).map(([key, def]) => (
              <option key={key} value={key}>{def.emoji} {def.name} — {def.description}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.entries(themes) as [ThemeKey, typeof themes[ThemeKey]][]).map(([key, def]) => {
            const isActive = uiTheme === key;
            return (
              <button
                key={key}
                onClick={() => setUiTheme(key)}
                className="relative rounded-xl p-3 border-2 transition-all text-left hover:scale-[1.02]"
                style={{
                  backgroundColor: def.vars['--bg-page'],
                  borderColor: isActive ? def.vars['--accent'] : 'rgba(255,255,255,0.08)',
                  boxShadow: isActive ? `0 0 0 3px ${def.vars['--accent']}30` : 'none',
                }}
              >
                {/* Preview mini */}
                <div className="flex gap-1 mb-2">
                  <div className="w-5 h-5 rounded-md" style={{ backgroundColor: def.vars['--bg-surface'] }} />
                  <div className="w-5 h-5 rounded-md" style={{ backgroundColor: def.vars['--accent'] }} />
                  <div className="w-5 h-5 rounded-md" style={{ backgroundColor: def.vars['--border'] }} />
                </div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm">{def.emoji}</span>
                  <span className="text-xs font-bold" style={{ color: def.vars['--text-primary'] }}>{def.name}</span>
                </div>
                <p className="text-[10px]" style={{ color: def.vars['--text-secondary'] }}>{def.description}</p>
                {isActive && (
                  <div
                    className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black"
                    style={{ backgroundColor: def.vars['--accent'], color: def.vars['--accent-contrast'] }}
                  >
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── COLORES DEL MENÚ PÚBLICO (Supabase) ── */}
      <div className="rounded-2xl p-6 border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">🍽️</span>
          <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Colores del Menú Público</h3>
        </div>

        {/* V6.0 — Selector de Preset Compacto (pills) */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
            marginBottom: '10px'
          }}>
            Personalidad Visual
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PRESET_LIST.map((p) => {
              const isActive = (form.theme_preset || 'default') === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePresetChange(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '999px',
                    border: isActive
                      ? `2px solid ${form.primary_color}`
                      : '2px solid rgba(128,128,128,0.25)',
                    background: isActive
                      ? `${form.primary_color}18`
                      : 'rgba(128,128,128,0.08)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? form.primary_color : 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {[
            { key: 'primary_color', label: 'Primario' },
            { key: 'secondary_color', label: 'Secundario' },
            { key: 'accent_color', label: 'Acento' },
            { key: 'background_color', label: 'Fondo' },
            { key: 'text_color', label: 'Texto' },
          ].map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center gap-1.5">
              <input type="color" value={(form as any)[key]}
                onChange={e => setForm({ ...form, [key]: e.target.value })}
                className="w-12 h-12 rounded-xl border-2 border-slate-600 cursor-pointer bg-transparent hover:border-slate-400 transition-colors" />
              <span className="text-xs text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        <h3 className="text-sm font-semibold text-slate-300 mb-3">Tipografía</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
          {fonts.map(f => (
            <button key={f} onClick={() => setForm({ ...form, font_family: f })}
              className={`px-3 py-2.5 rounded-xl text-sm border transition-all ${form.font_family === f
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'}`}
              style={{ fontFamily: `'${f}', sans-serif` }}>
              {f}
            </button>
          ))}
        </div>

        <h3 className="text-sm font-semibold text-slate-300 mb-3">Modo de vista</h3>
        <div className="flex gap-3 mb-6">
          <button onClick={() => setForm({ ...form, view_mode: 'grid' })}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all ${form.view_mode === 'grid'
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
              : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
            <LayoutGrid size={16} /> Cuadrícula
          </button>
          <button onClick={() => setForm({ ...form, view_mode: 'list' })}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all ${form.view_mode === 'list'
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
              : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'}`}>
            <List size={16} /> Lista
          </button>
        </div>

        <h3 className="text-sm font-semibold text-slate-300 mb-3">Imagen Hero</h3>
        <ImageUpload bucket="menu-images" currentUrl={form.hero_image_url} onUpload={(url) => setForm({ ...form, hero_image_url: url })} label="" previewSize="lg" />

        {/* TAREA 3: Color Pickers de Personalización Libre */}
        <div className="mt-6 p-4 rounded-2xl border" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 5%, var(--bg-page))', borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🎨</span>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Personalización Libre de Colores</h3>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>Sobreescribe el fondo y el acento del menú público. Los cambios son instantáneos y se guardan al presionar "Guardar tema".</p>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Color de Fondo Principal</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={customBg || form.background_color}
                  onChange={e => handleCustomBgChange(e.target.value)}
                  className="w-14 h-14 rounded-xl border-2 cursor-pointer bg-transparent transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                />
                <div>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{customBg || form.background_color}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Sobreescribe --bg-page</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Color de Acento (Botones)</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={customAccent || form.primary_color}
                  onChange={e => handleCustomAccentChange(e.target.value)}
                  className="w-14 h-14 rounded-xl border-2 cursor-pointer bg-transparent transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                />
                <div>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{customAccent || form.primary_color}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Sobreescribe --accent</p>
                </div>
              </div>
            </div>
          </div>
          {(customBg || customAccent) && (
            <button
              onClick={handleClearCustomColors}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              × Limpiar colores personalizados
            </button>
          )}
        </div>

        {/* Live Preview */}
        <div className="mt-6 p-4 rounded-xl border border-slate-600" style={{ backgroundColor: form.background_color }}>
          <p className="text-xs opacity-50 mb-2" style={{ color: form.text_color }}>Vista previa:</p>
          <h3 className="text-lg font-bold" style={{ color: form.text_color, fontFamily: `'${form.font_family}', sans-serif` }}>{tenant.name}</h3>
          <div className="flex gap-2 mt-2">
            <span className="px-3 py-1 rounded-full text-xs text-white" style={{ backgroundColor: form.primary_color }}>Categoría</span>
            <span className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: `${form.accent_color}30`, color: form.accent_color }}>Badge</span>
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

function OrdersTab({ tenant }: { tenant: Tenant }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptViewerUrl, setReceiptViewerUrl] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<OrderSubTab>('DINE_IN');
  const prevOrderCountRef = useRef(0);
  const { playBell } = useKitchenBell();

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant.id)
      .not('status', 'in', '(entregado,cancelado)')
      .order('created_at', { ascending: true })
      .limit(60);
    const newOrders = (data as Order[]) || [];
    if (prevOrderCountRef.current > 0 && newOrders.length > prevOrderCountRef.current) {
      playBell();
      toast.success('🔔 ¡Nuevo pedido recibido!', { duration: 6000 });
    }
    prevOrderCountRef.current = newOrders.length;
    setOrders(newOrders);
    setLoading(false);
  }, [tenant.id, playBell]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    const interval = setInterval(fetchOrders, 12000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

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

    if (newStatus === 'en_cocina' && order.payment_method === 'sinpe') {
      waMsg =
        `¡Hola ${name}! Tu pago por SINPE ha sido verificado con éxito ✅.\n` +
        `Tu pedido #${shortId} ya está en la cocina preparándose.`;
    } else if (newStatus === 'listo') {
      const suffix =
        deliveryType === 'delivery'
          ? 'El motorizado va en camino hacia tu dirección.'
          : deliveryType === 'takeout'
          ? 'Ya puedes pasar por él al local.'
          : 'Te lo estamos llevando a tu mesa.';
      waMsg = `¡Buenas noticias ${name}! Tu pedido #${shortId} ya está LISTO 🎉.\n${suffix}`;
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

  // ── Pedidos filtrados por sub-tab activa ──
  const filteredOrders = orders.filter(o => getDeliveryType(o) === activeSubTab);

  // ── Columnas Kanban según sub-tab ──
  const nuevos = filteredOrders.filter(o =>
    o.status === 'pendiente' || o.status === 'pago_en_revision'
  );
  const enCocina = filteredOrders.filter(o => o.status === 'en_cocina');
  const listos = filteredOrders.filter(o => o.status === 'listo');
  const deliveryActivos = filteredOrders; // para la columna Delivery (sub-tab DELIVERY)

  // ── Badges: tareas pendientes por sub-tab ──
  const badgeCount = (subTab: OrderSubTab): number => {
    const tabOrders = orders.filter(o => getDeliveryType(o) === subTab);
    return tabOrders.filter(o =>
      o.status === 'pendiente' ||
      o.status === 'pago_en_revision'
    ).length;
  };

  const KanbanCard = ({ order }: { order: Order }) => {
    const elapsed = elapsedMin(order.status === 'en_cocina' && order.accepted_at ? order.accepted_at : order.created_at);
    const isUrgent = elapsed > 20;
    const hasNewItems = (order as any).has_new_items === true;
    const isSinpe = order.payment_method === 'sinpe';
    const isEfectivoOrTarjeta = order.payment_method === 'efectivo' || order.payment_method === 'tarjeta';
    const isSinpePending = isSinpe && (order.status === 'pendiente' || order.status === 'pago_en_revision');
    // For SINPE pending orders: only show Aprobar/Rechazar, block 'A Cocina' directly
    const actions = ORDER_STATUS_ACTIONS[order.status] || [];
    const isDelivery = (order as any).delivery_type === 'delivery';
    const isTomorrow = (order as any).scheduled_date === 'tomorrow';
    const scheduledTime = (order as any).scheduled_time;
    const deliveryAddress = (order as any).delivery_address;
    const deliveryPhone = (order as any).delivery_phone;

    const isGoogleMapsLink = deliveryAddress &&
      (deliveryAddress.includes('google.com/maps') || deliveryAddress.includes('maps.app.goo.gl'));

    const handleWaze = () => {
      if (!deliveryAddress) return;
      if (isGoogleMapsLink) {
        // Use the Google Maps link directly as Waze destination
        window.open(`https://waze.com/ul?q=${encodeURIComponent(deliveryAddress)}&navigate=yes`, '_blank');
      } else {
        window.open(`https://waze.com/ul?q=${encodeURIComponent(deliveryAddress)}&navigate=yes`, '_blank');
      }
    };

    const handleWhatsAppDelivery = () => {
      if (!deliveryPhone) return;
      const msg =
        `🛕 *Pedido #${order.order_number}* listo para entrega\n` +
        `📍 ${deliveryAddress || ''}\n` +
        `⏰ ${isTomorrow ? 'Mañana' : 'Hoy'} ${scheduledTime || ''}\n` +
        `💰 Total: ${formatPrice(order.total)}`;
      const url = buildWhatsAppUrl(deliveryPhone, msg);
      if (url) window.open(url, '_blank');
    };

    return (
      <div className={`rounded-2xl p-4 border transition-all ${
        hasNewItems ? 'bg-amber-500/10 border-amber-500/50 animate-pulse' :
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
                  {scheduledTime === 'ASAP' ? '\uD83D\uDEF5 Lo antes posible' : `Hoy ${scheduledTime}`}
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

        {/* ── Waze + WhatsApp for delivery ── */}
        {isDelivery && (
          <div className="flex gap-2 mb-2">
            {deliveryAddress && (
              <button
                onClick={handleWaze}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.97] touch-manipulation"
                style={{ backgroundColor: '#06B6D420', color: '#06B6D4', border: '2px solid #06B6D440' }}
              >
                <Navigation size={13} /> Waze
              </button>
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

        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50 mb-3">
          <span className="font-bold text-amber-400">{formatPrice(order.total)}</span>
          <div className="flex items-center gap-2">
            {isDelivery && <Bike size={12} className="text-blue-400" />}
            <span className="text-[10px] text-slate-600 uppercase">{order.payment_method}</span>
          </div>
        </div>
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
          <p className="text-xs text-slate-500">{orders.length} pedido{orders.length !== 1 ? 's' : ''} activo{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={fetchOrders}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600 transition-colors">
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

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
          /* Vista Delivery: columna única con todos los pedidos de delivery activos */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KanbanColumn
              title="Nuevos Delivery"
              icon={<AlertCircle size={14} />}
              color="#F59E0B"
              orders={nuevos}
              emptyMsg="Sin pedidos nuevos"
            />
            <KanbanColumn
              title="En Camino"
              icon={<Bike size={14} />}
              color="#3B82F6"
              orders={enCocina}
              emptyMsg="Sin pedidos en camino"
            />
            <KanbanColumn
              title="Entregados / Listos"
              icon={<CheckCircle2 size={14} />}
              color="#10B981"
              orders={listos}
              emptyMsg="Sin pedidos listos"
            />
          </div>
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
      <h2 className="text-lg font-bold text-white">Dashboard</h2>

      {/* ── ROI / Upsell Module ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-green-400" />
          <h3 className="text-sm font-bold text-white">Prueba de ROI — Este Mes</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-[2rem] p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={15} className="text-amber-400" />
              <p className="text-xs text-slate-400 font-semibold">Ventas Totales</p>
            </div>
            <p className="text-2xl font-bold text-amber-400">{formatPrice(stats.totalRevenue)}</p>
            <p className="text-xs text-slate-500 mt-1.5">{stats.totalOrders} pedidos</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500/10 to-rose-500/10 border border-rose-500/20 rounded-[2rem] p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={15} className="text-emerald-400" />
              <p className="text-xs text-slate-300 font-bold">Revenue por IA ✨</p>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{formatPrice(stats.aiUpsellRevenue)}</p>
            <p className="text-xs text-rose-400/70 mt-1.5 font-medium">generado por GPT</p>
          </div>
          <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-[2rem] p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={15} className="text-green-400" />
              <p className="text-xs text-slate-400 font-semibold">Upsell Estático</p>
            </div>
            <p className="text-2xl font-bold text-green-400">{formatPrice(stats.staticUpsellRevenue)}</p>
            <p className="text-xs text-slate-500 mt-1.5">{stats.upsellOrders} pedidos con upsell</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-[2rem] p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Users size={15} className="text-blue-400" />
              <p className="text-xs text-slate-400 font-semibold">Tasa de Éxito</p>
            </div>
            <p className="text-2xl font-bold text-blue-400">{stats.upsellRate}%</p>
            <p className="text-xs text-slate-500 mt-1.5">de clientes aceptaron</p>
          </div>
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
          <div className="hidden sm:grid grid-cols-5 px-4 py-2 border-b border-slate-700/50 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>#</span><span>Cliente</span><span>Tipo</span><span>Total</span><span>Detalle</span>
          </div>
          <div className="divide-y divide-slate-700/30">
            {orders.map(o => (
              <div key={o.id}>
                <div className="grid grid-cols-2 sm:grid-cols-5 items-center px-4 py-3 hover:bg-slate-700/20 transition-colors">
                  <span className="text-sm font-bold text-white">#{o.order_number}</span>
                  <span className="text-sm text-slate-300 truncate">{o.customer_name || '—'}</span>
                  <span className="text-xs text-slate-400 hidden sm:block">{deliveryLabel(o)}</span>
                  <span className="text-sm font-bold text-amber-400">{formatPrice(o.total)}</span>
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

// ─── Main Dashboard ───
type TabKey = 'menu' | 'categories' | 'settings' | 'theme' | 'orders' | 'analytics' | 'history' | 'qr';

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
    { key: 'orders', label: 'Pedidos', icon: <ClipboardList size={16} /> },
    { key: 'history', label: 'Historial', icon: <Clock size={16} /> },
    { key: 'menu', label: 'Menú', icon: <UtensilsCrossed size={16} /> },
    { key: 'categories', label: 'Categorías', icon: <Tag size={16} /> },
    { key: 'settings', label: 'Config', icon: <Settings size={16} /> },
    { key: 'theme', label: 'Tema', icon: <Palette size={16} /> },
    { key: 'analytics', label: 'Analítica', icon: <BarChart3 size={16} /> },
    { key: 'qr', label: 'QR', icon: <QrCode size={16} /> },
  ];

  // Feature flagging: filter tabs based on plan tier
  const tabs = allTabs.filter(tab => {
    if (tab.key === 'orders' && !planFeatures.kds) return false;
    if (tab.key === 'analytics' && !planFeatures.analytics) return false;
    return true;
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <header className="backdrop-blur-xl border-b sticky top-0 z-40" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 90%, transparent)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <UtensilsCrossed size={16} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{tenant.name}</h1>
                <span className={`w-2 h-2 rounded-full ${tenant.is_open ? 'bg-green-400' : 'bg-red-400'}`} />
              </div>
              <p className="text-[10px] text-slate-500">/{slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/${slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600 transition-colors">
              <Eye size={12} /> Ver menú <ExternalLink size={10} />
            </a>
            <button onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-red-500/20 hover:text-red-400 transition-colors">
              <LogOut size={12} /> Salir
            </button>
          </div>
        </div>
      </header>

      <div className="border-b sticky top-[57px] z-30 backdrop-blur-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex overflow-x-auto scrollbar-hide whitespace-nowrap gap-1 px-4 py-2">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap flex-shrink-0 border"
                style={activeTab === tab.key ? {
                  backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  color: 'var(--accent)',
                  borderColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
                } : {
                  color: 'var(--text-secondary)',
                  borderColor: 'transparent',
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
        {activeTab === 'settings' && <SettingsTab tenant={tenant} onRefresh={fetchData} />}
        {activeTab === 'theme' && <ThemeTab tenant={tenant} theme={theme} onRefresh={fetchData} />}
        {activeTab === 'analytics' && <AnalyticsTab tenant={tenant} items={items} orders={orders} />}
        {activeTab === 'history' && <HistoryTab tenant={tenant} />}
        {activeTab === 'qr' && <QRTab tenant={tenant} />}
      </main>
    </div>
  );
}
