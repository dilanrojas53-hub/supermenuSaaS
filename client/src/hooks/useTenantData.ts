import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { TenantData, Tenant, ThemeSettings, Category, MenuItem } from '@/lib/types';

export function useTenantData(slug: string | undefined) {
  const [data, setData] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Guard: si el slug todavía no está disponible (primer render de wouter), mantener loading
    if (slug === undefined) {
      console.log('[useTenantData] slug undefined — esperando...');
      return; // NO cambiar loading a false, esperar al siguiente render con slug
    }
    if (slug === '') {
      console.warn('[useTenantData] slug vacío');
      setLoading(false);
      setError('Restaurante no encontrado');
      return;
    }

    async function fetchData() {
      setLoading(true);
      setError(null);
      console.log('[useTenantData] Cargando tenant para slug:', slug);

      try {
        // Usar maybeSingle() en lugar de single() para evitar error PGRST116
        // cuando el tenant no existe (devuelve null sin error)
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .select('*')
          .eq('slug', slug!)
          .eq('is_active', true)
          .maybeSingle();

        if (tenantError) {
          // Error real de Supabase o de red
          console.error('[useTenantData] Error Supabase al buscar tenant:', tenantError);
          const isNetworkError = !navigator.onLine || tenantError.message?.includes('fetch') || tenantError.message?.includes('network');
          setError(isNetworkError
            ? 'No se pudo cargar el restaurante. Revisa tu conexión o intenta de nuevo.'
            : 'No se pudo cargar el restaurante. Revisa tu conexión o intenta de nuevo.');
          setLoading(false);
          return;
        }
        if (!tenantData) {
          console.warn('[useTenantData] Tenant no encontrado para slug:', slug);
          setError('Restaurante no encontrado');
          setLoading(false);
          return;
        }
        console.log('[useTenantData] Tenant cargado:', tenantData.name);

        const tenant = tenantData as Tenant;

        // Increment visit counter (fire and forget)
        supabase.from('tenants').update({ visit_count: (tenant.visit_count || 0) + 1 }).eq('id', tenant.id).then(() => {});

        // Fetch theme settings
        const { data: themeData } = await supabase
          .from('theme_settings')
          .select('*')
          .eq('tenant_id', tenant.id)
          .single();

        // Fetch categories (active only)
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

        // Fetch menu sections to detect inactive categories used in time slots
        const { data: sectionsData } = await supabase
          .from('menu_sections')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true);

        let allCategories = (categoriesData || []) as Category[];

        if (sectionsData && sectionsData.length > 0) {
          const sectionIds = sectionsData.map((s: any) => s.id);
          // Get all item_ids assigned to any section
          const { data: sectionItemsData } = await supabase
            .from('menu_section_items')
            .select('item_id')
            .in('section_id', sectionIds);

          if (sectionItemsData && sectionItemsData.length > 0) {
            const sectionItemIds = sectionItemsData.map((si: any) => si.item_id);
            // Find category_ids of those items that are NOT already in active categories
            const activeCatIds = new Set(allCategories.map((c: Category) => c.id));
            const sectionMenuItems = (menuItemsData || []).filter((item: any) =>
              sectionItemIds.includes(item.id)
            );
            const missingCatIds = Array.from(new Set(
              sectionMenuItems
                .map((item: any) => item.category_id)
                .filter((catId: string) => !activeCatIds.has(catId))
            ));

            if (missingCatIds.length > 0) {
              // Fetch those inactive categories so they render when a section is selected
              const { data: inactiveCatsData } = await supabase
                .from('categories')
                .select('*')
                .in('id', missingCatIds)
                .eq('tenant_id', tenant.id)
                .order('sort_order', { ascending: true });
              if (inactiveCatsData) {
                // Mark them so MenuPage knows they are section-only (not shown in "all")
                const sectionOnlyCats = (inactiveCatsData as Category[]).map((c: Category) => ({
                  ...c,
                  _sectionOnly: true,
                }));
                allCategories = [...allCategories, ...sectionOnlyCats];
              }
            }
          }
        }

        setData({
          tenant,
          theme: themeData as ThemeSettings,
          categories: allCategories,
          menuItems: (menuItemsData || []) as MenuItem[],
        });
      } catch (err: any) {
        console.error('[useTenantData] Error inesperado:', err);
        const isNetworkError = !navigator.onLine || err?.message?.includes('fetch') || err?.message?.includes('network') || err?.message?.includes('Failed to fetch');
        setError(isNetworkError
          ? 'No se pudo cargar el restaurante. Revisa tu conexión o intenta de nuevo.'
          : 'Error al cargar el menú. Intenta de nuevo.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [slug]);

  return { data, loading, error };
}

export interface TenantWithHero extends Tenant {
  hero_image_url: string | null;
}

export function useAllTenants() {
  const [tenants, setTenants] = useState<TenantWithHero[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTenants() {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (!tenantsData || tenantsData.length === 0) {
        setTenants([]);
        setLoading(false);
        return;
      }

      // Fetch hero images from theme_settings for all tenants in one query
      const tenantIds = tenantsData.map((t: Tenant) => t.id);
      const { data: themesData } = await supabase
        .from('theme_settings')
        .select('tenant_id, hero_image_url')
        .in('tenant_id', tenantIds);

      const heroMap: Record<string, string | null> = {};
      (themesData || []).forEach((t: { tenant_id: string; hero_image_url: string | null }) => {
        heroMap[t.tenant_id] = t.hero_image_url;
      });

      const enriched: TenantWithHero[] = tenantsData.map((tenant: Tenant) => ({
        ...tenant,
        hero_image_url: heroMap[tenant.id] ?? null,
      }));

      setTenants(enriched);
      setLoading(false);
    }
    fetchTenants();
  }, []);

  return { tenants, loading };
}
