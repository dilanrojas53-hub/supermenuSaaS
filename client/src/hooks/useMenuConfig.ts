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

/**
 * La interfaz pública usa una composición editorial por categoría:
 * los primeros productos se muestran como cards protagonistas y el resto
 * como cards compactas. Para que ningún producto desaparezca ni se repita,
 * la vista previa debe recibir todos los productos y no renderizar "Ver todo".
 */
function normalizePublicMenuConfig(source?: Partial<MenuConfig> | null): MenuConfig {
  return {
    ...DEFAULT_CONFIG,
    ...(source || {}),
    category_preview_count: 1000,
    category_preview_horizontal: true,
    show_view_all_cta: false,
  };
}

export function useMenuConfig(tenantId: string | undefined) {
  const [config, setConfig] = useState<MenuConfig>(() => normalizePublicMenuConfig());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setConfig(normalizePublicMenuConfig());
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('menu_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        setConfig(normalizePublicMenuConfig(data));
        setLoading(false);
      });
  }, [tenantId]);

  return { config, loading };
}
