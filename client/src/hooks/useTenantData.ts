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
