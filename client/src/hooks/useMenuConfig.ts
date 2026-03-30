/**
 * useMenuConfig
 * Carga la configuración del menú por restaurante desde la tabla menu_config.
 * Si no existe configuración, retorna los valores por defecto.
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface MenuConfig {
  allow_guest_order: boolean;
  enable_profiles: boolean;
  enable_phone_login: boolean;
  enable_points: boolean;
  enable_favorites: boolean;
  enable_history: boolean;
  enable_addresses: boolean;
  category_preview_count: number;
  category_preview_horizontal: boolean;
  show_view_all_cta: boolean;
  category_view_mode: 'grid' | 'list';
  show_product_description: boolean;
}

const DEFAULT_CONFIG: MenuConfig = {
  allow_guest_order: true,
  enable_profiles: false,
  enable_phone_login: false,
  enable_points: false,
  enable_favorites: false,
  enable_history: false,
  enable_addresses: false,
  category_preview_count: 3,
  category_preview_horizontal: true,
  show_view_all_cta: true,
  category_view_mode: 'grid',
  show_product_description: true,
};

export function useMenuConfig(tenantId: string | undefined) {
  const [config, setConfig] = useState<MenuConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) { setLoading(false); return; }
    supabase
      .from('menu_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfig({ ...DEFAULT_CONFIG, ...data });
        }
        setLoading(false);
      });
  }, [tenantId]);

  return { config, loading };
}
