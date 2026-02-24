import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { TenantData, Tenant, ThemeSettings, Category, MenuItem } from '@/lib/types';

export function useTenantData(slug: string | undefined) {
  const [data, setData] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError('No slug provided');
      return;
    }

    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch tenant by slug
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();

        if (tenantError || !tenantData) {
          setError('Restaurante no encontrado');
          setLoading(false);
          return;
        }

        const tenant = tenantData as Tenant;

        // Increment visit counter (fire and forget)
        supabase.from('tenants').update({ visit_count: (tenant.visit_count || 0) + 1 }).eq('id', tenant.id).then(() => {});

        // Fetch theme settings
        const { data: themeData } = await supabase
          .from('theme_settings')
          .select('*')
          .eq('tenant_id', tenant.id)
          .single();

        // Fetch categories
        const { data: categoriesData } = await supabase
          .from('categories')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        // Fetch menu items
        const { data: menuItemsData } = await supabase
          .from('menu_items')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('is_available', true)
          .order('sort_order', { ascending: true });

        setData({
          tenant,
          theme: themeData as ThemeSettings,
          categories: (categoriesData || []) as Category[],
          menuItems: (menuItemsData || []) as MenuItem[],
        });
      } catch (err) {
        setError('Error al cargar el menú');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [slug]);

  return { data, loading, error };
}

export function useAllTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTenants() {
      const { data } = await supabase
        .from('tenants')
        .select('*')
        .eq('is_active', true)
        .order('name');

      setTenants((data || []) as Tenant[]);
      setLoading(false);
    }
    fetchTenants();
  }, []);

  return { tenants, loading };
}
