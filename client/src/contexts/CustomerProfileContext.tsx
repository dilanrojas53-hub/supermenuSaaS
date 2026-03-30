/**
 * CustomerProfileContext
 * Maneja el perfil opcional del cliente (invitado o con cuenta).
 * NO afecta el flujo de pedidos existente — es completamente aditivo.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export interface CustomerProfile {
  id: string;
  tenant_id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  points: number;
  level: string;
  created_at: string;
}

interface CustomerProfileContextType {
  profile: CustomerProfile | null;
  isGuest: boolean;
  isLoading: boolean;
  login: (phone: string, tenantId: string) => Promise<CustomerProfile | null>;
  logout: () => void;
  updateProfile: (data: Partial<CustomerProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const CustomerProfileContext = createContext<CustomerProfileContextType | null>(null);

const STORAGE_KEY = 'sm_customer_profile_id';
const DEVICE_KEY = 'sm_device_fp';

function getDeviceFingerprint(): string {
  let fp = localStorage.getItem(DEVICE_KEY);
  if (!fp) {
    fp = btoa(`${navigator.userAgent}-${screen.width}x${screen.height}-${Date.now()}`).slice(0, 32);
    localStorage.setItem(DEVICE_KEY, fp);
  }
  return fp;
}

export function CustomerProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Al montar: intentar restaurar sesión desde localStorage
  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) { setIsLoading(false); return; }
    supabase.from('customer_profiles').select('*').eq('id', savedId).maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as CustomerProfile);
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (phone: string, tid: string): Promise<CustomerProfile | null> => {
    // Buscar o crear perfil por teléfono
    let { data } = await supabase.from('customer_profiles').select('*').eq('phone', phone).eq('tenant_id', tid).maybeSingle();
    if (!data) {
      const { data: created } = await supabase.from('customer_profiles').insert({ phone, tenant_id: tid }).select().single();
      data = created;
    }
    if (!data) return null;
    // Actualizar last_login_at
    await supabase.from('customer_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.id);
    // Registrar dispositivo confiable
    const fp = getDeviceFingerprint();
    await supabase.from('trusted_devices').upsert({ customer_id: data.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() }, { onConflict: 'customer_id,device_fingerprint' });
    localStorage.setItem(STORAGE_KEY, data.id);
    setProfile(data as CustomerProfile);
    return data as CustomerProfile;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
  }, []);

  const updateProfile = useCallback(async (data: Partial<CustomerProfile>) => {
    if (!profile) return;
    await supabase.from('customer_profiles').update({ ...data, updated_at: new Date().toISOString() }).eq('id', profile.id);
    setProfile(prev => prev ? { ...prev, ...data } : null);
  }, [profile]);

  const refreshProfile = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('customer_profiles').select('*').eq('id', profile.id).maybeSingle();
    if (data) setProfile(data as CustomerProfile);
  }, [profile]);

  return (
    <CustomerProfileContext.Provider value={{ profile, isGuest: !profile, isLoading, login, logout, updateProfile, refreshProfile }}>
      {children}
    </CustomerProfileContext.Provider>
  );
}

export function useCustomerProfile() {
  const ctx = useContext(CustomerProfileContext);
  if (!ctx) throw new Error('useCustomerProfile must be used within CustomerProfileProvider');
  return ctx;
}
