/**
 * CustomerProfileContext — v2.0
 * Auth completo: OTP por teléfono, sesión persistente, contraseña opcional,
 * cerrar sesión en otros dispositivos.
 * NO afecta el flujo de pedidos existente — completamente aditivo.
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
  total_spent: number;
  total_orders: number;
  birthday: string | null;
  created_at: string;
  updated_at?: string;
}

export type AuthStep = 'idle' | 'phone_input' | 'otp_sent' | 'complete_profile' | 'logged_in';

interface CustomerProfileContextType {
  profile: CustomerProfile | null;
  isGuest: boolean;
  isLoading: boolean;
  authStep: AuthStep;
  // Auth
  sendOTP: (phone: string, tenantId: string) => Promise<{ success: boolean; error?: string }>;
  verifyOTP: (phone: string, code: string, tenantId: string) => Promise<{ success: boolean; error?: string; isNew?: boolean }>;
  completeProfile: (data: { name: string; email?: string; birthday?: string }) => Promise<void>;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  // Profile
  updateProfile: (data: Partial<CustomerProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  setAuthStep: (step: AuthStep) => void;
  // Legacy compat
  login: (phone: string, tenantId: string) => Promise<CustomerProfile | null>;
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

function generateOTPCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function CustomerProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authStep, setAuthStep] = useState<AuthStep>('idle');

  // Restore session on mount
  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) { setIsLoading(false); return; }
    supabase.from('customer_profiles').select('*').eq('id', savedId).maybeSingle()
      .then(({ data }) => {
        if (data) { setProfile(data as CustomerProfile); setAuthStep('logged_in'); }
        else localStorage.removeItem(STORAGE_KEY);
        setIsLoading(false);
      });
  }, []);

  const sendOTP = useCallback(async (phone: string, tenantId: string) => {
    try {
      const code = generateOTPCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      // Invalidate old codes
      await supabase.from('otp_codes').update({ used: true })
        .eq('phone', phone).eq('tenant_id', tenantId).eq('used', false);
      const { error } = await supabase.from('otp_codes')
        .insert({ phone, tenant_id: tenantId, code, expires_at: expiresAt });
      if (error) return { success: false, error: 'Error al generar código' };
      // In production: call Twilio/WhatsApp API here
      console.log(`[OTP DEV] Code for ${phone}: ${code}`);
      setAuthStep('otp_sent');
      return { success: true };
    } catch { return { success: false, error: 'Error de conexión' }; }
  }, []);

  const verifyOTP = useCallback(async (phone: string, code: string, tenantId: string) => {
    try {
      const { data: otpRow } = await supabase.from('otp_codes')
        .select('*').eq('phone', phone).eq('tenant_id', tenantId)
        .eq('code', code).eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!otpRow) return { success: false, error: 'Código incorrecto o expirado' };
      await supabase.from('otp_codes').update({ used: true }).eq('id', otpRow.id);

      let { data: existingProfile } = await supabase.from('customer_profiles')
        .select('*').eq('phone', phone).eq('tenant_id', tenantId).maybeSingle();
      const isNew = !existingProfile;
      if (!existingProfile) {
        const { data: np } = await supabase.from('customer_profiles')
          .insert({ phone, tenant_id: tenantId, points: 0, level: 'bronze', total_spent: 0, total_orders: 0 })
          .select().single();
        existingProfile = np;
      }
      if (!existingProfile) return { success: false, error: 'Error al crear perfil' };

      const fp = getDeviceFingerprint();
      await supabase.from('trusted_devices').upsert(
        { customer_id: existingProfile.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
        { onConflict: 'customer_id,device_fingerprint' }
      );
      await supabase.from('customer_profiles')
        .update({ last_login_at: new Date().toISOString() }).eq('id', existingProfile.id);

      localStorage.setItem(STORAGE_KEY, existingProfile.id);
      setProfile(existingProfile as CustomerProfile);
      setAuthStep(isNew ? 'complete_profile' : 'logged_in');
      return { success: true, isNew };
    } catch { return { success: false, error: 'Error de verificación' }; }
  }, []);

  const completeProfile = useCallback(async (data: { name: string; email?: string; birthday?: string }) => {
    if (!profile) return;
    await supabase.from('customer_profiles')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', profile.id);
    setProfile(prev => prev ? { ...prev, ...data } : null);
    setAuthStep('logged_in');
  }, [profile]);

  const logout = useCallback(async () => {
    const fp = getDeviceFingerprint();
    if (profile) {
      await supabase.from('trusted_devices')
        .delete().eq('customer_id', profile.id).eq('device_fingerprint', fp);
    }
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
    setAuthStep('idle');
  }, [profile]);

  const logoutAllDevices = useCallback(async () => {
    if (!profile) return;
    await supabase.from('trusted_devices').delete().eq('customer_id', profile.id);
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
    setAuthStep('idle');
  }, [profile]);

  const setPassword = useCallback(async (password: string) => {
    if (!profile) return { success: false, error: 'No hay sesión activa' };
    try {
      const hash = btoa(password + profile.id).slice(0, 64);
      await supabase.from('customer_profiles').update({ password_hash: hash }).eq('id', profile.id);
      return { success: true };
    } catch { return { success: false, error: 'Error al guardar contraseña' }; }
  }, [profile]);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!profile) return { success: false, error: 'No hay sesión activa' };
    try {
      const { data } = await supabase.from('customer_profiles')
        .select('password_hash').eq('id', profile.id).single();
      const oldHash = btoa(oldPassword + profile.id).slice(0, 64);
      if (data?.password_hash && data.password_hash !== oldHash)
        return { success: false, error: 'Contraseña actual incorrecta' };
      const newHash = btoa(newPassword + profile.id).slice(0, 64);
      await supabase.from('customer_profiles').update({ password_hash: newHash }).eq('id', profile.id);
      return { success: true };
    } catch { return { success: false, error: 'Error al cambiar contraseña' }; }
  }, [profile]);

  const updateProfile = useCallback(async (data: Partial<CustomerProfile>) => {
    if (!profile) return;
    await supabase.from('customer_profiles')
      .update({ ...data, updated_at: new Date().toISOString() }).eq('id', profile.id);
    setProfile(prev => prev ? { ...prev, ...data } : null);
  }, [profile]);

  const refreshProfile = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('customer_profiles')
      .select('*').eq('id', profile.id).maybeSingle();
    if (data) setProfile(data as CustomerProfile);
  }, [profile]);

  // Legacy compat: login sin OTP (para componentes viejos)
  const login = useCallback(async (phone: string, tid: string): Promise<CustomerProfile | null> => {
    let { data } = await supabase.from('customer_profiles')
      .select('*').eq('phone', phone).eq('tenant_id', tid).maybeSingle();
    if (!data) {
      const { data: created } = await supabase.from('customer_profiles')
        .insert({ phone, tenant_id: tid, points: 0, level: 'bronze', total_spent: 0, total_orders: 0 })
        .select().single();
      data = created;
    }
    if (!data) return null;
    const fp = getDeviceFingerprint();
    await supabase.from('trusted_devices').upsert(
      { customer_id: data.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
      { onConflict: 'customer_id,device_fingerprint' }
    );
    localStorage.setItem(STORAGE_KEY, data.id);
    setProfile(data as CustomerProfile);
    setAuthStep('logged_in');
    return data as CustomerProfile;
  }, []);

  return (
    <CustomerProfileContext.Provider value={{
      profile, isGuest: !profile, isLoading, authStep,
      sendOTP, verifyOTP, completeProfile,
      logout, logoutAllDevices, setPassword, changePassword,
      updateProfile, refreshProfile, setAuthStep, login,
    }}>
      {children}
    </CustomerProfileContext.Provider>
  );
}

export function useCustomerProfile() {
  const ctx = useContext(CustomerProfileContext);
  if (!ctx) throw new Error('useCustomerProfile must be used within CustomerProfileProvider');
  return ctx;
}
