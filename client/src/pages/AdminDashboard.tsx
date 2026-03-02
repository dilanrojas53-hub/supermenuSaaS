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
  Trophy, AlertCircle, Users
} from 'lucide-react';
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
  const [form, setForm] = useState({
    primary_color: theme.primary_color, secondary_color: theme.secondary_color,
    accent_color: theme.accent_color, background_color: theme.background_color,
    text_color: theme.text_color, font_family: theme.font_family,
    view_mode: theme.view_mode, hero_image_url: theme.hero_image_url || ''
  });
  const [saving, setSaving] = useState(false);

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
      <h2 className="text-lg font-bold text-white mb-6">Personalización del Tema</h2>
      <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Colores</h3>
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
          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors mt-6 disabled:opacity-50">
          <Save size={16} /> {saving ? 'Guardando...' : 'Guardar tema'}
        </button>
      </div>
    </div>
  );
}

// ─── Orders Tab — Kanban V2 ───
function OrdersTab({ tenant }: { tenant: Tenant }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
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
    const extra: Record<string, string> = { updated_at: now };
    if (newStatus === 'en_cocina') extra.accepted_at = now;
    if (newStatus === 'listo') extra.ready_at = now;
    if (newStatus === 'entregado') extra.completed_at = now;
    const { error } = await supabase.from('orders').update({ status: newStatus, ...extra }).eq('id', orderId);
    if (error) { toast.error('Error: ' + error.message); return; }
    const label = ORDER_STATUS_CONFIG[newStatus]?.label || newStatus;
    toast.success(`✅ ${label}`);
    fetchOrders();
  };

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  const elapsedMin = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);

  const nuevos = orders.filter(o => o.status === 'pendiente' || o.status === 'pago_en_revision');
  const enCocina = orders.filter(o => o.status === 'en_cocina');
  const listos = orders.filter(o => o.status === 'listo');

  const KanbanCard = ({ order }: { order: Order }) => {
    const elapsed = elapsedMin(order.status === 'en_cocina' && order.accepted_at ? order.accepted_at : order.created_at);
    const isUrgent = elapsed > 20;
    const actions = ORDER_STATUS_ACTIONS[order.status] || [];
    return (
      <div className={`rounded-2xl p-4 border transition-all ${
        isUrgent ? 'bg-red-500/5 border-red-500/30' : 'bg-slate-800/60 border-slate-700/50'
      }`}>
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
        {order.sinpe_receipt_url && (
          <a href={order.sinpe_receipt_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-purple-400 hover:underline flex items-center gap-1 mb-2">
            📎 Ver comprobante SINPE
          </a>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50 mb-3">
          <span className="font-bold text-amber-400">{formatPrice(order.total)}</span>
          <span className="text-[10px] text-slate-600 uppercase">{order.payment_method}</span>
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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-white">Pedidos en Vivo</h2>
          <p className="text-xs text-slate-500">{orders.length} pedido{orders.length !== 1 ? 's' : ''} activo{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={fetchOrders}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600 transition-colors">
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16"><div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto" /></div>
      ) : (
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
    </div>
  );
}

// ─── Analytics Tab — Dashboard Premium V2 ───
function AnalyticsTab({ tenant, items, orders }: { tenant: Tenant; items: MenuItem[]; orders: Order[] }) {
  const [corteVisible, setCorteVisible] = useState(false);

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

    // Upsell tracking: orders that have upsell_revenue > 0
    const upsellOrders = month.filter(o => (o as any).upsell_revenue && (o as any).upsell_revenue > 0);
    const upsellRevenue = upsellOrders.reduce((s, o) => s + ((o as any).upsell_revenue || 0), 0);
    const upsellRate = totalOrders > 0 ? Math.round((upsellOrders.length / totalOrders) * 100) : 0;

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

    return { totalRevenue, totalOrders, upsellRevenue, upsellRate, upsellOrders: upsellOrders.length,
      top5, hourlyData, trendData, avgTicket: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      visits: tenant.visit_count || 0 };
  }, [orders, tenant]);

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
    const msg = encodeURIComponent(
      `*CORTE Z — ${tenant.name}*\n${now}\n\n` +
      `Pedidos: ${corteStats.count}\n` +
      `SINPE: ${formatPrice(corteStats.byMethod.sinpe)}\n` +
      `Efectivo: ${formatPrice(corteStats.byMethod.efectivo)}\n` +
      `Tarjeta: ${formatPrice(corteStats.byMethod.tarjeta)}\n` +
      `*TOTAL: ${formatPrice(corteStats.total)}*`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={14} className="text-amber-400" />
              <p className="text-xs text-slate-400">Ventas Totales del Mes</p>
            </div>
            <p className="text-2xl font-bold text-amber-400">{formatPrice(stats.totalRevenue)}</p>
            <p className="text-xs text-slate-500 mt-1">{stats.totalOrders} pedidos completados</p>
          </div>
          <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-green-400" />
              <p className="text-xs text-slate-400">Ingresos por Upsells (IA)</p>
            </div>
            <p className="text-2xl font-bold text-green-400">{formatPrice(stats.upsellRevenue)}</p>
            <p className="text-xs text-slate-500 mt-1">{stats.upsellOrders} pedidos con upsell</p>
          </div>
          <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-blue-400" />
              <p className="text-xs text-slate-400">Tasa de Éxito Upselling</p>
            </div>
            <p className="text-2xl font-bold text-blue-400">{stats.upsellRate}%</p>
            <p className="text-xs text-slate-500 mt-1">de clientes aceptaron</p>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Ticket Promedio', value: formatPrice(stats.avgTicket), icon: <DollarSign size={14} />, color: 'text-amber-400' },
          { label: 'Pedidos este mes', value: stats.totalOrders, icon: <ClipboardList size={14} />, color: 'text-white' },
          { label: 'Visitas al menú', value: stats.visits, icon: <Eye size={14} />, color: 'text-white' },
          { label: 'Conversión', value: stats.visits > 0 ? `${Math.round((stats.totalOrders / stats.visits) * 100)}%` : '0%', icon: <TrendingUp size={14} />, color: 'text-green-400' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
            <div className="flex items-center gap-1.5 mb-1 text-slate-500">{icon}<p className="text-xs">{label}</p></div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
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
type TabKey = 'menu' | 'categories' | 'settings' | 'theme' | 'orders' | 'analytics' | 'qr';

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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!tenant || !theme) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-bold text-white mb-2">Restaurante no encontrado</h1>
          <p className="text-slate-400 text-sm">El slug "{slug}" no existe en la base de datos.</p>
        </div>
      </div>
    );
  }

  const planFeatures = getPlanFeatures(tenant.plan_tier || 'premium');

  const allTabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'orders', label: 'Pedidos', icon: <ClipboardList size={16} /> },
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
    <div className="min-h-screen bg-slate-900">
      <header className="bg-slate-800/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <UtensilsCrossed size={16} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white">{tenant.name}</h1>
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

      <div className="bg-slate-800/40 border-b border-slate-700/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab.key
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
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
        {activeTab === 'qr' && <QRTab tenant={tenant} />}
      </main>
    </div>
  );
}
