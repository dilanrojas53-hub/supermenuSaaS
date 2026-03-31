/**
 * CustomerProfileContext — v3.0
 * Auth: teléfono + contraseña (sin OTP/SMS) + WebAuthn/passkey opcional.
 * Hashing: SHA-256 via SubtleCrypto (nativo en todos los navegadores modernos).
 * WebAuthn: registro y autenticación 100% en el cliente usando la Web Authentication API.
 * Aislamiento multi-tenant: STORAGE_KEY incluye tenantId.
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
  has_password?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface TenantStats {
  points: number;
  level: string;
  total_spent: number;
  total_orders: number;
}

export type AuthStep =
  | 'idle'
  | 'phone_input'
  | 'login_password'
  | 'register_form'
  | 'passkey_prompt'
  | 'complete_profile'
  | 'otp_sent'
  | 'logged_in';

export interface WebAuthnCredentialInfo {
  id: string;
  credential_id: string;
  friendly_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface CustomerProfileContextType {
  profile: CustomerProfile | null;
  tenantStats: TenantStats | null;  // puntos/nivel aislados por tenant
  isGuest: boolean;
  isLoading: boolean;
  authStep: AuthStep;
  setAuthStep: (step: AuthStep) => void;
  refreshTenantStats: () => Promise<void>;  // refresca puntos/nivel desde BD
  // Nuevo flujo: contraseña
  checkPhone: (phone: string, tenantId: string) => Promise<{ exists: boolean; hasPasskey: boolean }>;
  registerWithPassword: (data: {
    phone: string; password: string; name: string;
    email?: string; birthday?: string; tenantId: string;
  }) => Promise<{ success: boolean; error?: string }>;
  loginWithPassword: (phone: string, password: string, tenantId: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  // WebAuthn / Passkey
  isWebAuthnSupported: () => boolean;
  registerPasskey: (friendlyName?: string) => Promise<{ success: boolean; error?: string }>;
  loginWithPasskey: (phone: string, tenantId: string) => Promise<{ success: boolean; error?: string }>;
  getPasskeys: () => Promise<WebAuthnCredentialInfo[]>;
  deletePasskey: (credentialId: string) => Promise<{ success: boolean; error?: string }>;
  // Perfil
  updateProfile: (data: Partial<CustomerProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  // Legacy compat (usado en checkout y otros componentes)
  sendOTP: (phone: string, tenantId: string) => Promise<{ success: boolean; error?: string }>;
  verifyOTP: (phone: string, code: string, tenantId: string) => Promise<{ success: boolean; error?: string; isNew?: boolean }>;
  completeProfile: (data: { name: string; email?: string; birthday?: string }) => Promise<void>;
  setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  login: (phone: string, tenantId: string) => Promise<CustomerProfile | null>;
}

const CustomerProfileContext = createContext<CustomerProfileContextType | null>(null);

const STORAGE_KEY_PREFIX = 'sm_customer_profile_id';
const DEVICE_KEY = 'sm_device_fp';

function getStorageKey(tenantId?: string): string {
  return tenantId ? `${STORAGE_KEY_PREFIX}_${tenantId}` : STORAGE_KEY_PREFIX;
}

function getDeviceFingerprint(): string {
  let fp = localStorage.getItem(DEVICE_KEY);
  if (!fp) {
    fp = btoa(`${navigator.userAgent}-${screen.width}x${screen.height}-${Date.now()}`).slice(0, 32);
    localStorage.setItem(DEVICE_KEY, fp);
  }
  return fp;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

export function CustomerProfileProvider({ children, tenantId }: { children: ReactNode; tenantId?: string }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tenantStats, setTenantStats] = useState<TenantStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authStep, setAuthStep] = useState<AuthStep>('idle');

  // Cargar stats del tenant cuando cambia el perfil o el tenantId
  useEffect(() => {
    if (!profile?.id || !tenantId) { setTenantStats(null); return; }
    supabase.from('tenant_customer_stats')
      .select('points, level, total_spent, total_orders')
      .eq('customer_id', profile.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        setTenantStats(data ? {
          points: data.points ?? 0,
          level: data.level ?? 'bronze',
          total_spent: data.total_spent ?? 0,
          total_orders: data.total_orders ?? 0,
        } : { points: 0, level: 'bronze', total_spent: 0, total_orders: 0 });
      });
  }, [profile?.id, tenantId]);

  // Método explícito para refrescar tenantStats desde la BD (llamado post-orden y post-canje)
  const refreshTenantStats = useCallback(async () => {
    if (!profile?.id || !tenantId) return;
    const { data, error } = await supabase
      .from('tenant_customer_stats')
      .select('points, level, total_spent, total_orders')
      .eq('customer_id', profile.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      console.error('[CustomerProfileContext] refreshTenantStats error:', error.message);
      return;
    }
    setTenantStats(data ? {
      points: data.points ?? 0,
      level: data.level ?? 'bronze',
      total_spent: data.total_spent ?? 0,
      total_orders: data.total_orders ?? 0,
    } : { points: 0, level: 'bronze', total_spent: 0, total_orders: 0 });
    console.info('[CustomerProfileContext] tenantStats refrescado:', data?.points ?? 0, 'pts');
  }, [profile?.id, tenantId]);

  useEffect(() => {
    if (tenantId === undefined) return;
    const storageKey = getStorageKey(tenantId);
    const savedId = localStorage.getItem(storageKey);
    if (!savedId) { setIsLoading(false); return; }
    supabase.from('customer_profiles').select('*').eq('id', savedId).eq('tenant_id', tenantId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data as CustomerProfile);
          setAuthStep('logged_in');
        } else {
          localStorage.removeItem(storageKey);
        }
        setIsLoading(false);
      });
  }, [tenantId]);

  // ─── CHECK PHONE ────────────────────────────────────────────────────────────
  const checkPhone = useCallback(async (phone: string, tid: string) => {
    const clean = phone.replace(/\D/g, '');
    const { data } = await supabase.from('customer_profiles')
      .select('id').eq('phone', clean).eq('tenant_id', tid).maybeSingle();
    if (!data) return { exists: false, hasPasskey: false };
    const { data: creds } = await supabase.from('webauthn_credentials')
      .select('id').eq('user_id', data.id).limit(1);
    return { exists: true, hasPasskey: (creds?.length ?? 0) > 0 };
  }, []);

  // ─── REGISTRO CON CONTRASEÑA ─────────────────────────────────────────────
  const registerWithPassword = useCallback(async ({
    phone, password, name, email, birthday, tenantId: tid,
  }: { phone: string; password: string; name: string; email?: string; birthday?: string; tenantId: string }) => {
    const clean = phone.replace(/\D/g, '');
    const { data: existing } = await supabase.from('customer_profiles')
      .select('id').eq('phone', clean).eq('tenant_id', tid).maybeSingle();
    if (existing) return { success: false, error: 'Ya existe una cuenta con este número' };
    const { data: created, error } = await supabase.from('customer_profiles').insert({
      phone: clean, name, email: email || null, birthday: birthday || null,
      tenant_id: tid, points: 0, level: 'bronze', total_spent: 0, total_orders: 0,
      has_password: true,
    }).select().single();
    if (error || !created) return { success: false, error: 'Error al crear la cuenta' };
    const realHash = await hashPassword(password, created.id);
    await supabase.from('customer_profiles').update({ password_hash: realHash }).eq('id', created.id);
    const fp = getDeviceFingerprint();
    await supabase.from('trusted_devices').upsert(
      { customer_id: created.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
      { onConflict: 'customer_id,device_fingerprint' }
    );
    localStorage.setItem(getStorageKey(tid), created.id);
    setProfile({ ...created, has_password: true } as CustomerProfile);
    setAuthStep('passkey_prompt');
    return { success: true };
  }, []);

  // ─── LOGIN CON CONTRASEÑA ────────────────────────────────────────────────
  const loginWithPassword = useCallback(async (phone: string, password: string, tid: string) => {
    const clean = phone.replace(/\D/g, '');
    const { data } = await supabase.from('customer_profiles')
      .select('*').eq('phone', clean).eq('tenant_id', tid).maybeSingle();
    if (!data) return { success: false, error: 'No existe una cuenta con este número' };
    if (!data.password_hash) return { success: false, error: 'Esta cuenta no tiene contraseña. Contacta soporte.' };
    const hash = await hashPassword(password, data.id);
    if (hash !== data.password_hash) return { success: false, error: 'Contraseña incorrecta' };
    const fp = getDeviceFingerprint();
    await supabase.from('trusted_devices').upsert(
      { customer_id: data.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
      { onConflict: 'customer_id,device_fingerprint' }
    );
    await supabase.from('customer_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.id);
    localStorage.setItem(getStorageKey(tid), data.id);
    setProfile(data as CustomerProfile);
    const { data: creds } = await supabase.from('webauthn_credentials').select('id').eq('user_id', data.id).limit(1);
    setAuthStep((creds?.length ?? 0) === 0 ? 'passkey_prompt' : 'logged_in');
    return { success: true };
  }, []);

  // ─── CAMBIAR CONTRASEÑA ──────────────────────────────────────────────────
  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    if (!profile) return { success: false, error: 'No hay sesión activa' };
    const { data } = await supabase.from('customer_profiles').select('password_hash').eq('id', profile.id).single();
    if (data?.password_hash) {
      const oldHash = await hashPassword(oldPassword, profile.id);
      if (oldHash !== data.password_hash) return { success: false, error: 'Contraseña actual incorrecta' };
    }
    const newHash = await hashPassword(newPassword, profile.id);
    await supabase.from('customer_profiles').update({ password_hash: newHash, has_password: true }).eq('id', profile.id);
    setProfile(prev => prev ? { ...prev, has_password: true } : null);
    return { success: true };
  }, [profile]);

  // ─── WEBAUTHN ────────────────────────────────────────────────────────────
  const isWebAuthnSupported = useCallback(() => {
    return !!(window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function');
  }, []);

  const registerPasskey = useCallback(async (friendlyName?: string) => {
    if (!profile) return { success: false, error: 'Debes iniciar sesión primero' };
    if (!isWebAuthnSupported()) return { success: false, error: 'Tu dispositivo no soporta passkeys' };
    try {
      const challenge = generateChallenge();
      await supabase.from('webauthn_challenges').insert({
        user_id: profile.id, challenge, challenge_type: 'registration',
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      const rpId = window.location.hostname;
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: base64urlToBuffer(challenge),
          rp: { name: 'SmartMenu', id: rpId },
          user: {
            id: new TextEncoder().encode(profile.id),
            name: profile.phone || profile.email || profile.id,
            displayName: profile.name || 'Usuario SmartMenu',
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },
            { alg: -257, type: 'public-key' },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      }) as PublicKeyCredential;
      if (!credential) return { success: false, error: 'No se pudo crear la passkey' };
      const response = credential.response as AuthenticatorAttestationResponse;
      const credentialId = bufferToBase64url(credential.rawId);
      const publicKeyBytes = response.getPublicKey?.() ?? new ArrayBuffer(0);
      const publicKey = bufferToBase64url(publicKeyBytes);
      const deviceName = friendlyName || (() => {
        const ua = navigator.userAgent;
        if (/iPhone|iPad/.test(ua)) return 'iPhone/iPad';
        if (/Android/.test(ua)) return 'Android';
        if (/Mac/.test(ua)) return 'Mac';
        if (/Windows/.test(ua)) return 'Windows';
        return 'Dispositivo';
      })();
      await supabase.from('webauthn_credentials').insert({
        user_id: profile.id, credential_id: credentialId, public_key: publicKey,
        sign_count: 0, friendly_name: deviceName,
        transports: JSON.stringify((response as any).getTransports?.() ?? []),
        last_used_at: new Date().toISOString(),
      });
      setAuthStep('logged_in');
      return { success: true };
    } catch (err: any) {
      if (err.name === 'NotAllowedError') return { success: false, error: 'Operación cancelada' };
      return { success: false, error: 'Error al registrar la passkey' };
    }
  }, [profile, isWebAuthnSupported]);

  const loginWithPasskey = useCallback(async (phone: string, tid: string) => {
    if (!isWebAuthnSupported()) return { success: false, error: 'Tu dispositivo no soporta passkeys' };
    try {
      const clean = phone.replace(/\D/g, '');
      const { data: profileData } = await supabase.from('customer_profiles')
        .select('*').eq('phone', clean).eq('tenant_id', tid).maybeSingle();
      if (!profileData) return { success: false, error: 'No existe una cuenta con este número' };
      const { data: creds } = await supabase.from('webauthn_credentials')
        .select('credential_id').eq('user_id', profileData.id);
      if (!creds?.length) return { success: false, error: 'No hay passkeys registradas para esta cuenta' };
      const challenge = generateChallenge();
      await supabase.from('webauthn_challenges').insert({
        user_id: profileData.id, challenge, challenge_type: 'authentication',
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      const allowCredentials = creds.map(c => ({
        id: base64urlToBuffer(c.credential_id),
        type: 'public-key' as const,
      }));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: base64urlToBuffer(challenge),
          allowCredentials,
          userVerification: 'required',
          timeout: 60000,
          rpId: window.location.hostname,
        },
      }) as PublicKeyCredential;
      if (!assertion) return { success: false, error: 'Autenticación cancelada' };
      const usedCredId = bufferToBase64url(assertion.rawId);
      await supabase.from('webauthn_credentials')
        .update({ last_used_at: new Date().toISOString() }).eq('credential_id', usedCredId);
      const fp = getDeviceFingerprint();
      await supabase.from('trusted_devices').upsert(
        { customer_id: profileData.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
        { onConflict: 'customer_id,device_fingerprint' }
      );
      await supabase.from('customer_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', profileData.id);
      localStorage.setItem(getStorageKey(tid), profileData.id);
      setProfile(profileData as CustomerProfile);
      setAuthStep('logged_in');
      return { success: true };
    } catch (err: any) {
      if (err.name === 'NotAllowedError') return { success: false, error: 'Operación cancelada' };
      return { success: false, error: 'Error al autenticar con passkey' };
    }
  }, [isWebAuthnSupported]);

  const getPasskeys = useCallback(async (): Promise<WebAuthnCredentialInfo[]> => {
    if (!profile) return [];
    const { data } = await supabase.from('webauthn_credentials')
      .select('id, credential_id, friendly_name, created_at, last_used_at')
      .eq('user_id', profile.id).order('created_at', { ascending: false });
    return (data ?? []) as WebAuthnCredentialInfo[];
  }, [profile]);

  const deletePasskey = useCallback(async (credentialId: string) => {
    if (!profile) return { success: false, error: 'No hay sesión activa' };
    const { error } = await supabase.from('webauthn_credentials')
      .delete().eq('credential_id', credentialId).eq('user_id', profile.id);
    if (error) return { success: false, error: 'Error al eliminar la passkey' };
    return { success: true };
  }, [profile]);

  // ─── PERFIL ──────────────────────────────────────────────────────────────
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

  // ─── LOGOUT ──────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const fp = getDeviceFingerprint();
    if (profile) {
      await supabase.from('trusted_devices').delete().eq('customer_id', profile.id).eq('device_fingerprint', fp);
    }
    localStorage.removeItem(getStorageKey(tenantId));
    setProfile(null);
    setAuthStep('idle');
  }, [profile, tenantId]);

  const logoutAllDevices = useCallback(async () => {
    if (!profile) return;
    await supabase.from('trusted_devices').delete().eq('customer_id', profile.id);
    localStorage.removeItem(getStorageKey(tenantId));
    setProfile(null);
    setAuthStep('idle');
  }, [profile, tenantId]);

  // ─── LEGACY COMPAT ────────────────────────────────────────────────────────
  const sendOTP = useCallback(async (phone: string, tid: string) => {
    const result = await checkPhone(phone, tid);
    setAuthStep(result.exists ? 'login_password' : 'register_form');
    return { success: true };
  }, [checkPhone]);

  const verifyOTP = useCallback(async (_phone: string, _code: string, _tid: string) => {
    return { success: false, error: 'OTP no disponible. Usa contraseña.' };
  }, []);

  const completeProfile = useCallback(async (data: { name: string; email?: string; birthday?: string }) => {
    if (!profile) return;
    await supabase.from('customer_profiles').update({ ...data, updated_at: new Date().toISOString() }).eq('id', profile.id);
    setProfile(prev => prev ? { ...prev, ...data } : null);
    setAuthStep('logged_in');
  }, [profile]);

  const setPassword = useCallback(async (password: string) => {
    if (!profile) return { success: false, error: 'No hay sesión activa' };
    const hash = await hashPassword(password, profile.id);
    await supabase.from('customer_profiles').update({ password_hash: hash, has_password: true }).eq('id', profile.id);
    setProfile(prev => prev ? { ...prev, has_password: true } : null);
    return { success: true };
  }, [profile]);

  const login = useCallback(async (phone: string, tid: string): Promise<CustomerProfile | null> => {
    let { data } = await supabase.from('customer_profiles')
      .select('*').eq('phone', phone).eq('tenant_id', tid).maybeSingle();
    if (!data) {
      const { data: created } = await supabase.from('customer_profiles')
        .insert({ phone, tenant_id: tid, points: 0, level: 'bronze', total_spent: 0, total_orders: 0, has_password: false })
        .select().single();
      data = created;
    }
    if (!data) return null;
    const fp = getDeviceFingerprint();
    await supabase.from('trusted_devices').upsert(
      { customer_id: data.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
      { onConflict: 'customer_id,device_fingerprint' }
    );
    localStorage.setItem(getStorageKey(tenantId), data.id);
    setProfile(data as CustomerProfile);
    setAuthStep('logged_in');
    return data as CustomerProfile;
  }, [tenantId]);

  return (
    <CustomerProfileContext.Provider value={{
      profile, tenantStats, isGuest: !profile, isLoading, authStep, setAuthStep,
      checkPhone, registerWithPassword, loginWithPassword, changePassword,
      isWebAuthnSupported, registerPasskey, loginWithPasskey, getPasskeys, deletePasskey,
      updateProfile, refreshProfile, refreshTenantStats, logout, logoutAllDevices,
      sendOTP, verifyOTP, completeProfile, setPassword, login,
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
