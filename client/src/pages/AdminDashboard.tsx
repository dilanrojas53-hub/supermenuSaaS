import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { formatPrice } from '@/lib/types';
import type { Tenant, ThemeSettings, Category, MenuItem } from '@/lib/types';
import {
  LogOut, Settings, Palette, UtensilsCrossed, Tag, Plus, Pencil, Trash2,
  Save, X, Eye, ChevronDown, GripVertical, ImageIcon, Star, Zap,
  LayoutGrid, List, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Tab Components ───

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

  const startCreate = () => {
    setIsCreating(true);
    setEditingItem(null);
    resetForm();
  };

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
    setEditingItem(null);
    setIsCreating(false);
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este platillo?')) return;
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Platillo eliminado');
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

      {/* Edit/Create Form */}
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
              <label className="block text-xs text-slate-400 mb-1">URL de Imagen</label>
              <input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..." className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
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
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_available} onChange={e => setForm({ ...form, is_available: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500" />
                <span className="text-sm text-slate-300">Disponible</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500" />
                <span className="text-sm text-slate-300">Platillo de la semana</span>
              </label>
            </div>
          </div>
          {form.image_url && (
            <div className="mt-4">
              <p className="text-xs text-slate-400 mb-2">Vista previa:</p>
              <img src={form.image_url} alt="Preview" className="w-24 h-24 object-cover rounded-xl border border-slate-600" onError={e => (e.currentTarget.style.display = 'none')} />
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
                <div key={item.id} className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 mb-2 group hover:border-slate-600 transition-colors">
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
                      {!item.is_available && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">No disponible</span>}
                    </div>
                    <span className="text-sm text-amber-400 font-semibold">{formatPrice(item.price)}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(item)} className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                      <Pencil size={14} className="text-slate-400" />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 hover:bg-red-500/10 rounded-lg transition-colors">
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

function CategoriesTab({ tenant, categories, onRefresh }: {
  tenant: Tenant; categories: Category[]; onRefresh: () => void;
}) {
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', sort_order: '0', is_active: true });

  const startEdit = (cat: Category) => {
    setEditingCat(cat);
    setIsCreating(false);
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500" />
              <span className="text-sm text-slate-300">Activa</span>
            </label>
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

function SettingsTab({ tenant, onRefresh }: { tenant: Tenant; onRefresh: () => void }) {
  const [form, setForm] = useState({
    name: tenant.name, description: tenant.description || '', logo_url: tenant.logo_url || '',
    phone: tenant.phone || '', whatsapp_number: tenant.whatsapp_number || '',
    address: tenant.address || '', sinpe_number: tenant.sinpe_number || '',
    sinpe_owner: tenant.sinpe_owner || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('tenants').update({
      ...form, description: form.description || null, logo_url: form.logo_url || null,
      phone: form.phone || null, whatsapp_number: form.whatsapp_number || null,
      address: form.address || null, sinpe_number: form.sinpe_number || null,
      sinpe_owner: form.sinpe_owner || null, updated_at: new Date().toISOString()
    }).eq('id', tenant.id);
    setSaving(false);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Configuración guardada');
    onRefresh();
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-6">Configuración del Restaurante</h2>
      <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre del restaurante *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">URL del Logo</label>
            <input value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://..." className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
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
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <Zap size={12} className="text-green-400" />
              </div>
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
    </div>
  );
}

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
    toast.success('Tema actualizado — los cambios se reflejan al instante en el menú público');
    onRefresh();
  };

  const fonts = ['Georgia', 'Poppins', 'Montserrat', 'Inter', 'Lora', 'Nunito'];

  return (
    <div>
      <h2 className="text-lg font-bold text-white mb-6">Personalización del Tema</h2>
      <div className="bg-slate-700/50 border border-slate-600/50 rounded-2xl p-6">
        {/* Color pickers */}
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Colores</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {[
            { key: 'primary_color', label: 'Primario' },
            { key: 'secondary_color', label: 'Secundario' },
            { key: 'accent_color', label: 'Acento' },
            { key: 'background_color', label: 'Fondo' },
            { key: 'text_color', label: 'Texto' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-slate-400 mb-1">{label}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent" />
                <input value={(form as any)[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm font-mono focus:ring-2 focus:ring-amber-500/50 focus:outline-none" />
              </div>
            </div>
          ))}
        </div>

        {/* Font selector */}
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

        {/* View mode */}
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

        {/* Hero image */}
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Imagen Hero</h3>
        <input value={form.hero_image_url} onChange={e => setForm({ ...form, hero_image_url: e.target.value })}
          placeholder="https://..." className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500/50 focus:outline-none mb-2" />
        {form.hero_image_url && (
          <img src={form.hero_image_url} alt="Hero preview" className="w-full h-32 object-cover rounded-xl border border-slate-600 mt-2" onError={e => (e.currentTarget.style.display = 'none')} />
        )}

        {/* Preview */}
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

// ─── Main Dashboard ───

type TabKey = 'menu' | 'categories' | 'settings' | 'theme';

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
  const [loading, setLoading] = useState(true);

  // Auth guard
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
    const [themeRes, catRes, itemsRes] = await Promise.all([
      supabase.from('theme_settings').select('*').eq('tenant_id', t.id).single(),
      supabase.from('categories').select('*').eq('tenant_id', t.id).order('sort_order'),
      supabase.from('menu_items').select('*').eq('tenant_id', t.id).order('sort_order'),
    ]);
    setTheme(themeRes.data);
    setCategories(catRes.data || []);
    setItems(itemsRes.data || []);
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

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'menu', label: 'Menú', icon: <UtensilsCrossed size={16} /> },
    { key: 'categories', label: 'Categorías', icon: <Tag size={16} /> },
    { key: 'settings', label: 'Configuración', icon: <Settings size={16} /> },
    { key: 'theme', label: 'Tema', icon: <Palette size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Top bar */}
      <header className="bg-slate-800/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <UtensilsCrossed size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">{tenant.name}</h1>
              <p className="text-[10px] text-slate-500">/{slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={`/${slug}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600 transition-colors">
              <Eye size={12} /> Ver menú
              <ExternalLink size={10} />
            </a>
            <button onClick={() => { logout(); navigate('/'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-red-500/20 hover:text-red-400 transition-colors">
              <LogOut size={12} /> Salir
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
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

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === 'menu' && <MenuTab tenant={tenant} categories={categories} items={items} onRefresh={fetchData} />}
        {activeTab === 'categories' && <CategoriesTab tenant={tenant} categories={categories} onRefresh={fetchData} />}
        {activeTab === 'settings' && <SettingsTab tenant={tenant} onRefresh={fetchData} />}
        {activeTab === 'theme' && <ThemeTab tenant={tenant} theme={theme} onRefresh={fetchData} />}
      </main>
    </div>
  );
}
