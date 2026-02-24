import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import type { Tenant, ThemeSettings } from '@/lib/types';
import {
  LogOut, Plus, Eye, EyeOff, Pencil, Trash2, Save, X,
  Store, Users, Activity, ExternalLink, Shield, Search, Copy, Check
} from 'lucide-react';
import { toast } from 'sonner';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SuperAdminDashboard() {
  const { isAuthenticated, role, logout } = useAdminAuth();
  const [, navigate] = useLocation();
  const [tenants, setTenants] = useState<(Tenant & { theme?: ThemeSettings; itemCount?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', slug: '', description: '', phone: '', whatsapp_number: '',
    address: '', sinpe_number: '', sinpe_owner: '',
    primary_color: '#FF6B35', secondary_color: '#004E89', accent_color: '#F7C948',
    background_color: '#FFFFFF', text_color: '#1A1A2E', font_family: 'Inter', view_mode: 'grid' as 'grid' | 'list'
  });

  useEffect(() => {
    if (!isAuthenticated || role !== 'superadmin') {
      navigate('/super-admin/login');
    }
  }, [isAuthenticated, role, navigate]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    const { data: tenantsData } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
    if (!tenantsData) { setLoading(false); return; }

    const enriched = await Promise.all(tenantsData.map(async (t) => {
      const [themeRes, countRes] = await Promise.all([
        supabase.from('theme_settings').select('*').eq('tenant_id', t.id).single(),
        supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      ]);
      return { ...t, theme: themeRes.data || undefined, itemCount: countRes.count || 0 };
    }));

    setTenants(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const toggleActive = async (tenant: Tenant) => {
    const { error } = await supabase.from('tenants').update({
      is_active: !tenant.is_active, updated_at: new Date().toISOString()
    }).eq('id', tenant.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(tenant.is_active ? 'Restaurante desactivado' : 'Restaurante activado');
    fetchTenants();
  };

  const deleteTenant = async (tenant: Tenant) => {
    if (!confirm(`¿Eliminar "${tenant.name}" y TODOS sus datos? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from('tenants').delete().eq('id', tenant.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Restaurante eliminado');
    fetchTenants();
  };

  const handleCreate = async () => {
    if (!form.name || !form.slug) { toast.error('Nombre y slug son obligatorios'); return; }

    // Check slug uniqueness
    const { data: existing } = await supabase.from('tenants').select('id').eq('slug', form.slug).single();
    if (existing) { toast.error('Ese slug ya está en uso'); return; }

    // Create tenant
    const { data: newTenant, error: tenantError } = await supabase.from('tenants').insert({
      name: form.name, slug: form.slug, description: form.description || null,
      phone: form.phone || null, whatsapp_number: form.whatsapp_number || null,
      address: form.address || null, sinpe_number: form.sinpe_number || null,
      sinpe_owner: form.sinpe_owner || null, is_active: true
    }).select().single();

    if (tenantError || !newTenant) { toast.error('Error al crear: ' + (tenantError?.message || 'Unknown')); return; }

    // Create theme settings
    const { error: themeError } = await supabase.from('theme_settings').insert({
      tenant_id: newTenant.id, primary_color: form.primary_color,
      secondary_color: form.secondary_color, accent_color: form.accent_color,
      background_color: form.background_color, text_color: form.text_color,
      font_family: form.font_family, view_mode: form.view_mode
    });

    if (themeError) { toast.error('Tenant creado pero error en tema: ' + themeError.message); }

    toast.success(`"${form.name}" creado exitosamente`);
    setIsCreating(false);
    setForm({
      name: '', slug: '', description: '', phone: '', whatsapp_number: '',
      address: '', sinpe_number: '', sinpe_owner: '',
      primary_color: '#FF6B35', secondary_color: '#004E89', accent_color: '#F7C948',
      background_color: '#FFFFFF', text_color: '#1A1A2E', font_family: 'Inter', view_mode: 'grid'
    });
    fetchTenants();
  };

  const copySlug = (slug: string) => {
    navigator.clipboard.writeText(`/${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAuthenticated || role !== 'superadmin') return null;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Top bar */}
      <header className="bg-slate-800/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Super Admin</h1>
              <p className="text-[10px] text-slate-500">Smart Menu Platform</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-red-500/20 hover:text-red-400 transition-colors">
            <LogOut size={12} /> Salir
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Store size={14} className="text-amber-400" />
              <span className="text-xs text-slate-400">Total Restaurantes</span>
            </div>
            <span className="text-2xl font-bold text-white">{tenants.length}</span>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={14} className="text-green-400" />
              <span className="text-xs text-slate-400">Activos</span>
            </div>
            <span className="text-2xl font-bold text-green-400">{tenants.filter(t => t.is_active).length}</span>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users size={14} className="text-blue-400" />
              <span className="text-xs text-slate-400">Total Platillos</span>
            </div>
            <span className="text-2xl font-bold text-white">{tenants.reduce((sum, t) => sum + (t.itemCount || 0), 0)}</span>
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar restaurante..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
          </div>
          <button onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-purple-600 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20">
            <Plus size={16} /> Nuevo restaurante
          </button>
        </div>

        {/* Create form */}
        {isCreating && (
          <div className="bg-slate-800/50 border border-purple-500/30 rounded-2xl p-6 mb-6">
            <h3 className="text-white font-bold mb-4">Crear nuevo restaurante</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nombre *</label>
                <input value={form.name}
                  onChange={e => {
                    const name = e.target.value;
                    setForm({ ...form, name, slug: slugify(name) });
                  }}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Slug (URL) *</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-sm">/</span>
                  <input value={form.slug} onChange={e => setForm({ ...form, slug: slugify(e.target.value) })}
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-mono focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Descripción</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Teléfono</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">WhatsApp</label>
                <input value={form.whatsapp_number} onChange={e => setForm({ ...form, whatsapp_number: e.target.value })}
                  placeholder="50688881111" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Dirección</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">SINPE Móvil</label>
                <input value={form.sinpe_number} onChange={e => setForm({ ...form, sinpe_number: e.target.value })}
                  placeholder="8888-1111" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Titular SINPE</label>
                <input value={form.sinpe_owner} onChange={e => setForm({ ...form, sinpe_owner: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
              </div>

              {/* Theme quick setup */}
              <div className="md:col-span-2 mt-2">
                <h4 className="text-xs font-semibold text-slate-300 mb-2">Tema visual rápido</h4>
                <div className="flex flex-wrap gap-3">
                  {[
                    { key: 'primary_color', label: 'Primario' },
                    { key: 'secondary_color', label: 'Secundario' },
                    { key: 'background_color', label: 'Fondo' },
                    { key: 'text_color', label: 'Texto' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <input type="color" value={(form as any)[key]}
                        onChange={e => setForm({ ...form, [key]: e.target.value })}
                        className="w-7 h-7 rounded border border-slate-600 cursor-pointer bg-transparent" />
                      <span className="text-[10px] text-slate-500">{label}</span>
                    </div>
                  ))}
                  <select value={form.font_family} onChange={e => setForm({ ...form, font_family: e.target.value })}
                    className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs">
                    {['Georgia', 'Poppins', 'Montserrat', 'Inter', 'Lora', 'Nunito'].map(f => <option key={f}>{f}</option>)}
                  </select>
                  <select value={form.view_mode} onChange={e => setForm({ ...form, view_mode: e.target.value as 'grid' | 'list' })}
                    className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs">
                    <option value="grid">Grid</option>
                    <option value="list">Lista</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleCreate}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl text-sm font-medium hover:from-purple-600 hover:to-indigo-700">
                <Save size={16} /> Crear restaurante
              </button>
              <button onClick={() => setIsCreating(false)}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-600 text-white rounded-xl text-sm font-medium hover:bg-slate-500">
                <X size={16} /> Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Tenants list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTenants.map(tenant => (
              <div key={tenant.id}
                className={`bg-slate-800/50 border rounded-2xl p-4 transition-all hover:border-slate-600 ${tenant.is_active ? 'border-slate-700/50' : 'border-red-500/20 opacity-60'}`}>
                <div className="flex items-center gap-4">
                  {/* Color indicator */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: tenant.theme?.primary_color || '#FF6B35' }}>
                    <Store size={18} className="text-white" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-white truncate">{tenant.name}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tenant.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {tenant.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <button onClick={() => copySlug(tenant.slug)} className="flex items-center gap-1 hover:text-slate-300 transition-colors font-mono">
                        /{tenant.slug}
                        {copiedSlug === tenant.slug ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                      </button>
                      <span>{tenant.itemCount || 0} platillos</span>
                      {tenant.sinpe_number && <span>SINPE: {tenant.sinpe_number}</span>}
                      <span className="flex items-center gap-1" style={{ fontFamily: `'${tenant.theme?.font_family || 'Inter'}', sans-serif` }}>
                        {tenant.theme?.font_family || 'Inter'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <a href={`/${tenant.slug}`} target="_blank" rel="noopener noreferrer"
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors" title="Ver menú público">
                      <ExternalLink size={14} className="text-slate-400" />
                    </a>
                    <a href={`/admin/${tenant.slug}/login`}
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors" title="Panel admin">
                      <Pencil size={14} className="text-slate-400" />
                    </a>
                    <button onClick={() => toggleActive(tenant)}
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                      title={tenant.is_active ? 'Desactivar' : 'Activar'}>
                      {tenant.is_active ? <EyeOff size={14} className="text-slate-400" /> : <Eye size={14} className="text-green-400" />}
                    </button>
                    <button onClick={() => deleteTenant(tenant)}
                      className="p-2 hover:bg-red-500/10 rounded-lg transition-colors" title="Eliminar">
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredTenants.length === 0 && (
              <div className="text-center py-12">
                <Store size={32} className="text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">
                  {searchQuery ? 'No se encontraron resultados' : 'No hay restaurantes creados'}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
