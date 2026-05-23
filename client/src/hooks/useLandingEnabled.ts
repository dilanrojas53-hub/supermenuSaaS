/**
 * useLandingEnabled
 * Verifica si la landing pública del restaurante está activa (enabled=true).
 * Se usa en MenuPage para mostrar/ocultar el chip de acceso a la landing.
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useLandingEnabled(tenantId: string | undefined): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from('restaurant_landing_settings')
      .select('enabled')
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        setEnabled(!!data?.enabled);
      });
  }, [tenantId]);

  return enabled;
}
