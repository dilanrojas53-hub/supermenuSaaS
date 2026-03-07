/*
 * SuperAdminDashboard v2: Panel maestro con:
 * - Dashboard GMV (Gross Merchandise Value) total de la plataforma
 * - Ranking de restaurantes por ventas
 * - Métricas de plataforma (pedidos, visitas, ticket promedio)
 * - Gestión CRUD de tenants con activar/desactivar
 * - Generación rápida de slugs
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { formatPrice } from '@/lib/types';
import type { Tenant, ThemeSettings, Order } from '@/lib/types';
import {
  LogOut, Plus, Eye, EyeOff, Pencil, Trash2, Save, X,
  Store, Users, Activity, ExternalLink, Shield, Search, Copy, Check,
  TrendingUp, DollarSign, ShoppingCart, BarChart3, Crown, ArrowUpRight
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

type TabKey = 'dashboard' | 'tenants';

export default function SuperAdminDashboard() {
  const { isAuthenticated, role, logout } = useAdminAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [tenants, setTenants] = useState<(Tenant & { theme?: ThemeSettings; itemCount?: number })[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', slug: '', description: '', phone: '', whatsapp_number: '',
    address: '', sinpe_number: '', sinpe_owner: '', admin_email: '', admin_password: '', admin_password_confirm: '',
    plan_tier: 'basic' as 'basic' | 'pro' | 'premium',
    subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    primary_color: '#FF6B35', secondary_color: '#004E89', accent_color: '#F7C948',
    background_color: '#FFFFFF', text_color: '#1A1A2E', font_family: 'Inter', view_mode: 'grid' as 'grid' | 'list'
  });

  useEffect(() => {
    if (!isAuthenticated || role !== 'superadmin') {
      navigate('/super-admin/login');
    }
  }, [isAuthenticated, role, navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [tenantsRes, ordersRes] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500),
    ]);

    const tenantsData = tenantsRes.data || [];
    const enriched = await Promise.all(tenantsData.map(async (t) => {
      const [themeRes, countRes] = await Promise.all([
        supabase.from('theme_settings').select('*').eq('tenant_id', t.id).single(),
        supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      ]);
      return { ...t, theme: themeRes.data || undefined, itemCount: countRes.count || 0 };
    }));

    setTenants(enriched);
    setAllOrders((ordersRes.data as Order[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Platform Metrics ───
  const metrics = useMemo(() => {
    const validOrders = allOrders.filter(o => o.status !== 'cancelado');
    const gmv = validOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = validOrders.length;
    const avgTicket = totalOrders > 0 ? Math.round(gmv / totalOrders) : 0;
    const totalVisits = tenants.reduce((sum, t) => sum + (t.visit_count || 0), 0);

    // Revenue per tenant
    const revenueByTenant: Record<string, { name: string; revenue: number; orders: number; color: string }> = {};
    tenants.forEach(t => {
      revenueByTenant[t.id] = { name: t.name, revenue: 0, orders: 0, color: t.theme?.primary_color || '#FF6B35' };
    });
    validOrders.forEach(o => {
      if (revenueByTenant[o.tenant_id]) {
        revenueByTenant[o.tenant_id].revenue += o.total;
        revenueByTenant[o.tenant_id].orders += 1;
      }
    });
    const ranking = Object.values(revenueByTenant).sort((a, b) => b.revenue - a.revenue);

    // Orders by status
    const statusCounts: Record<string, number> = {};
    allOrders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });

    // Today's orders
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = validOrders.filter(o => o.created_at.startsWith(today));
    const todayGmv = todayOrders.reduce((sum, o) => sum + o.total, 0);

    return { gmv, totalOrders, avgTicket, totalVisits, ranking, statusCounts, todayOrders: todayOrders.length, todayGmv };
  }, [allOrders, tenants]);

  // ─── Tenant Actions ───
  const toggleActive = async (tenant: Tenant) => {
    const { error } = await supabase.from('tenants').update({
      is_active: !tenant.is_active, updated_at: new Date().toISOString()
    }).eq('id', tenant.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success(tenant.is_active ? 'Restaurante desactivado' : 'Restaurante activado');
    fetchData();
  };

  const deleteTenant = async (tenant: Tenant) => {
    if (!confirm(`¿Eliminar "${tenant.name}" y TODOS sus datos? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from('tenants').delete().eq('id', tenant.id);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Restaurante eliminado');
    fetchData();
  };

  const handleCreate = async () => {
    if (!form.name || !form.slug) { toast.error('Nombre y slug son obligatorios'); return; }
    if (!form.admin_email || !form.admin_password) { toast.error('Email y contraseña del admin son obligatorios'); return; }
    if (form.admin_password.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return; }
    if (form.admin_password !== form.admin_password_confirm) { toast.error('Las contraseñas no coinciden'); return; }

    setIsCreating(true);
    try {
      const response = await fetch('/api/admin/create-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          slug: form.slug,
          description: form.description || null,
          phone: form.phone || null,
          whatsapp_number: form.whatsapp_number || null,
          address: form.address || null,
          sinpe_number: form.sinpe_number || null,
          sinpe_owner: form.sinpe_owner || null,
          admin_email: form.admin_email,
          admin_password: form.admin_password,
          plan_tier: form.plan_tier,
          subscription_expires_at: form.subscription_expires_at || null,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          background_color: form.background_color,
          text_color: form.text_color,
          font_family: form.font_family,
          view_mode: form.view_mode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(`Error: ${data.error || 'Failed to create tenant'}`);
        setIsCreating(false);
        return;
      }

      toast.success(`"${form.name}" creado exitosamente con admin ${form.admin_email}`);
      setIsCreating(false);
      setForm({
        name: '', slug: '', description: '', phone: '', whatsapp_number: '',
        address: '', sinpe_number: '', sinpe_owner: '', admin_email: '', admin_password: '', admin_password_confirm: '',
        plan_tier: 'basic',
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        primary_color: '#FF6B35', secondary_color: '#004E89', accent_color: '#F7C948',
        background_color: '#FFFFFF', text_color: '#1A1A2E', font_family: 'Inter', view_mode: 'grid'
      });
      fetchData();
    } catch (error) {
      console.error('Error creating tenant:', error);
      toast.error('Error al crear el restaurante: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setIsCreating(false);
    }
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

      {/* Tabs */}
      <div className="bg-slate-800/40 border-b border-slate-700/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1">
            {[
              { key: 'dashboard' as TabKey, label: 'Dashboard', icon: <BarChart3 size={16} /> },
              { key: 'tenants' as TabKey, label: 'Restaurantes', icon: <Store size={16} /> },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab.key
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : activeTab === 'dashboard' ? (
          /* ─── DASHBOARD TAB ─── */
          <div>
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign size={14} className="text-purple-400" />
                  <span className="text-xs text-slate-400">GMV Total</span>
                </div>
                <span className="text-xl font-bold text-white">{formatPrice(metrics.gmv)}</span>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart size={14} className="text-amber-400" />
                  <span className="text-xs text-slate-400">Pedidos totales</span>
                </div>
                <span className="text-xl font-bold text-white">{metrics.totalOrders}</span>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className="text-green-400" />
                  <span className="text-xs text-slate-400">Ticket promedio</span>
                </div>
                <span className="text-xl font-bold text-white">{formatPrice(metrics.avgTicket)}</span>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users size={14} className="text-blue-400" />
                  <span className="text-xs text-slate-400">Visitas totales</span>
                </div>
                <span className="text-xl font-bold text-white">{metrics.totalVisits.toLocaleString()}</span>
              </div>
            </div>

            {/* Today's summary */}
            <div className="bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-2xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📊</span>
                <h3 className="text-sm font-bold text-white">Hoy</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Pedidos hoy</p>
                  <p className="text-2xl font-bold text-amber-400">{metrics.todayOrders}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Ventas hoy</p>
                  <p className="text-2xl font-bold text-amber-400">{formatPrice(metrics.todayGmv)}</p>
                </div>
              </div>
            </div>

            {/* Platform stats row */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Store size={14} className="text-amber-400" />
                  <span className="text-xs text-slate-400">Restaurantes</span>
                </div>
                <span className="text-2xl font-bold text-white">{tenants.length}</span>
                <span className="text-xs text-green-400 ml-2">{tenants.filter(t => t.is_active).length} activos</span>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity size={14} className="text-green-400" />
                  <span className="text-xs text-slate-400">Abiertos ahora</span>
                </div>
                <span className="text-2xl font-bold text-green-400">{tenants.filter(t => t.is_open).length}</span>
              </div>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users size={14} className="text-blue-400" />
                  <span className="text-xs text-slate-400">Total platillos</span>
                </div>
                <span className="text-2xl font-bold text-white">{tenants.reduce((sum, t) => sum + (t.itemCount || 0), 0)}</span>
              </div>
            </div>

            {/* Ranking */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Crown size={16} className="text-amber-400" />
                <h3 className="text-sm font-bold text-white">Ranking por ventas</h3>
              </div>
              {metrics.ranking.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No hay datos de ventas aún</p>
              ) : (
                <div className="space-y-2">
                  {metrics.ranking.map((r, idx) => {
                    const maxRevenue = metrics.ranking[0]?.revenue || 1;
                    const pct = Math.round((r.revenue / maxRevenue) * 100);
                    return (
                      <div key={r.name} className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                          idx === 1 ? 'bg-slate-500/20 text-slate-300' :
                          idx === 2 ? 'bg-orange-500/20 text-orange-400' :
                          'bg-slate-800 text-slate-500'
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-white font-medium truncate">{r.name}</span>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-slate-400">{r.orders} pedidos</span>
                              <span className="text-amber-400 font-bold">{formatPrice(r.revenue)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: r.color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ─── TENANTS TAB ─── */
          <div>
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
              <div className="bg-slate-800/50 border border-purple-500/30 rounded-2xl p-6 mb-6 overflow-y-auto pb-32" style={{ maxHeight: '80vh' }}>
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
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Email del Admin</label>
                    <input type="email" value={form.admin_email} onChange={e => setForm({ ...form, admin_email: e.target.value })}
                      placeholder="admin@restaurante.com" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Contraseña del Admin</label>
                    <input type="password" value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })}
                      placeholder="Mínimo 6 caracteres" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Confirmar Contraseña</label>
                    <input type="password" value={form.admin_password_confirm} onChange={e => setForm({ ...form, admin_password_confirm: e.target.value })}
                      placeholder="Repite la contraseña" className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Plan</label>
                    <select value={form.plan_tier} onChange={e => setForm({ ...form, plan_tier: e.target.value as 'basic' | 'pro' | 'premium' })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-purple-500/50 focus:outline-none">
                      <option value="basic">Basic — Solo WhatsApp</option>
                      <option value="pro">Pro — KDS + Neuro-Ventas + i18n</option>
                      <option value="premium">Premium — Todo incluido</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Vencimiento Suscripción</label>
                    <input type="date" value={form.subscription_expires_at} onChange={e => setForm({ ...form, subscription_expires_at: e.target.value })}
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
                        <option value="grid">Cuadrícula</option>
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
            <div className="space-y-3">
              {filteredTenants.map(tenant => {
                const tenantOrders = allOrders.filter(o => o.tenant_id === tenant.id && o.status !== 'cancelado');
                const tenantRevenue = tenantOrders.reduce((sum, o) => sum + o.total, 0);
                return (
                  <div key={tenant.id}
                    className={`bg-slate-800/50 border rounded-2xl p-4 transition-all hover:border-slate-600 ${tenant.is_active ? 'border-slate-700/50' : 'border-red-500/20 opacity-60'}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: tenant.theme?.primary_color || '#FF6B35' }}>
                        <Store size={18} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-sm font-bold text-white truncate">{tenant.name}</h3>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tenant.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {tenant.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tenant.is_open ? 'bg-green-500/10 text-green-300' : 'bg-slate-500/20 text-slate-400'}`}>
                            {tenant.is_open ? 'Abierto' : 'Cerrado'}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                            tenant.plan_tier === 'premium' ? 'bg-purple-500/20 text-purple-300' :
                            tenant.plan_tier === 'pro' ? 'bg-blue-500/20 text-blue-300' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {(tenant.plan_tier || 'basic').toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <button onClick={() => copySlug(tenant.slug)} className="flex items-center gap-1 hover:text-slate-300 transition-colors font-mono">
                            /{tenant.slug}
                            {copiedSlug === tenant.slug ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                          </button>
                          <span>{tenant.itemCount || 0} platillos</span>
                          <span className="text-amber-400 font-semibold">{formatPrice(tenantRevenue)}</span>
                          <span>{tenantOrders.length} pedidos</span>
                          {tenant.subscription_expires_at && (
                            <span className={`font-medium ${
                              new Date(tenant.subscription_expires_at) < new Date() ? 'text-red-400' :
                              new Date(tenant.subscription_expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) ? 'text-yellow-400' : 'text-green-400'
                            }`}>
                              Vence: {new Date(tenant.subscription_expires_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Plan selector inline */}
                        <select
                          value={tenant.plan_tier || 'basic'}
                          onChange={async (e) => {
                            const newPlan = e.target.value;
                            const { error } = await supabase.from('tenants').update({ plan_tier: newPlan, updated_at: new Date().toISOString() }).eq('id', tenant.id);
                            if (error) { toast.error('Error: ' + error.message); return; }
                            toast.success(`Plan de ${tenant.name} cambiado a ${newPlan.toUpperCase()}`);
                            fetchData();
                          }}
                          className="px-2 py-1 bg-slate-700 border border-slate-600 rounded-lg text-white text-[10px] focus:ring-2 focus:ring-purple-500/50 focus:outline-none cursor-pointer"
                          title="Cambiar plan">
                          <option value="basic">Basic</option>
                          <option value="pro">Pro</option>
                          <option value="premium">Premium</option>
                        </select>
                        {/* Subscription date editor */}
                        <input
                          type="date"
                          value={tenant.subscription_expires_at ? new Date(tenant.subscription_expires_at).toISOString().split('T')[0] : ''}
                          onChange={async (e) => {
                            const newDate = e.target.value;
                            if (!newDate) return;
                            const { error } = await supabase.from('tenants').update({ subscription_expires_at: `${newDate}T23:59:59Z`, updated_at: new Date().toISOString() }).eq('id', tenant.id);
                            if (error) { toast.error('Error: ' + error.message); return; }
                            toast.success(`Fecha de vencimiento de ${tenant.name} actualizada`);
                            fetchData();
                          }}
                          className="px-1.5 py-1 bg-slate-700 border border-slate-600 rounded-lg text-white text-[10px] focus:ring-2 focus:ring-purple-500/50 focus:outline-none cursor-pointer w-28"
                          title="Fecha de vencimiento" />
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
                );
              })}

              {filteredTenants.length === 0 && (
                <div className="text-center py-12">
                  <Store size={32} className="text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">
                    {searchQuery ? 'No se encontraron resultados' : 'No hay restaurantes creados'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
