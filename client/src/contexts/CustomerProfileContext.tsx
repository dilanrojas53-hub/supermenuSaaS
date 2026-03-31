/**
 * CustomerProfileContext — v4.0 GLOBAL IDENTITY
 *
 * Arquitectura:
 * - customer_profiles: identidad GLOBAL (phone único, sin tenant_id en auth)
 * - tenant_customer_stats: puntos/nivel/stats AISLADOS por tenant
 *
 * Helpers globales:
 * - findGlobalCustomerByPhone()   → busca por phone sin tenant_id
 * - ensureTenantMembership()      → crea vínculo cliente↔tenant si no existe
 * - loginGlobalCustomer()         → autentica globalmente y vincula al tenant actual
 * - registerGlobalCustomer()      → crea cuenta global y vincula al tenant actual
 * - loadTenantStats()             → carga stats del tenant actual
 * - loadCustomerTenants()         → carga todos los tenants donde el cliente tiene actividad
 *
 * Compatibilidad: los métodos legacy (checkPhone, loginWithPassword, etc.)
 * siguen funcionando pero ya no filtran por tenant_id en auth.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export interface CustomerProfile {
  id: string;
  tenant_id?: string | null; // legacy, ya no se usa en auth
  phone: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  points: number;       // legacy, usar tenantStats.points
  level: string;        // legacy, usar tenantStats.level
  total_spent: number;  // legacy, usar tenantStats.total_spent
  total_orders: number; // legacy, usar tenantStats.total_orders
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

export interface CustomerTenantEntry {
  tenant_id: string;
  tenant_name: string;
  tenant_logo_url: string | null;
  points: number;
  total_orders: number;
  last_seen_at: string | null;
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
  tenantStats: TenantStats | null;
  isGuest: boolean;
  isLoading: boolean;
  authStep: AuthStep;
  setAuthStep: (step: AuthStep) => void;
  refreshTenantStats: () => Promise<void>;
  // Flujo global
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
  // Mis restaurantes
  loadCustomerTenants: () => Promise<CustomerTenantEntry[]>;
  // Legacy compat
  sendOTP: (phone: string, tenantId: string) => Promise<{ success: boolean; error?: string }>;
  verifyOTP: (phone: string, code: string, tenantId: string) => Promise<{ success: boolean; error?: string; isNew?: boolean }>;
  completeProfile: (data: { name: string; email?: string; birthday?: string }) => Promise<void>;
  setPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  login: (phone: string, tenantId: string) => Promise<CustomerProfile | null>;
}

const CustomerProfileContext = createContext<CustomerProfileContextType | null>(null);

// Sesión global: una sola key, no por tenant
const GLOBAL_STORAGE_KEY = 'sm_customer_global_id';
const DEVICE_KEY = 'sm_device_fp';

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

// ─── HELPERS GLOBALES ─────────────────────────────────────────────────────────

/** Busca un cliente por teléfono en la identidad global (sin filtrar por tenant) */
async function findGlobalCustomerByPhone(phone: string) {
  const clean = phone.replace(/\D/g, '');
  const { data } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('phone', clean)
    .maybeSingle();
  return data;
}

/** Crea el vínculo cliente↔tenant en tenant_customer_stats si no existe */
async function ensureTenantMembership(customerId: string, tenantId: string) {
  const { data: existing } = await supabase
    .from('tenant_customer_stats')
    .select('id')
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from('tenant_customer_stats').insert({
      customer_id: customerId,
      tenant_id: tenantId,
      points: 0,
      level: 'bronze',
      total_spent: 0,
      total_orders: 0,
      last_seen_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[ensureTenantMembership] error:', error.message);
    } else {
      console.info('[ensureTenantMembership] vínculo creado:', customerId, '↔', tenantId);
    }
  } else {
    // Actualizar last_seen_at
    await supabase
      .from('tenant_customer_stats')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('customer_id', customerId)
      .eq('tenant_id', tenantId);
  }
}

/** Carga stats del tenant actual para un cliente */
async function loadTenantStats(customerId: string, tenantId: string): Promise<TenantStats> {
  const { data } = await supabase
    .from('tenant_customer_stats')
    .select('points, level, total_spent, total_orders')
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data
    ? { points: data.points ?? 0, level: data.level ?? 'bronze', total_spent: data.total_spent ?? 0, total_orders: data.total_orders ?? 0 }
    : { points: 0, level: 'bronze', total_spent: 0, total_orders: 0 };
}

// ─── PROVIDER ─────────────────────────────────────────────────────────────────

export function CustomerProfileProvider({ children, tenantId }: { children: ReactNode; tenantId?: string }) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [tenantStats, setTenantStats] = useState<TenantStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authStep, setAuthStep] = useState<AuthStep>('idle');

  // Cargar sesión global al iniciar
  useEffect(() => {
    const savedId = localStorage.getItem(GLOBAL_STORAGE_KEY);
    if (!savedId) { setIsLoading(false); return; }
    supabase.from('customer_profiles')
      .select('*')
      .eq('id', savedId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data as CustomerProfile);
          setAuthStep('logged_in');
        } else {
          localStorage.removeItem(GLOBAL_STORAGE_KEY);
        }
        setIsLoading(false);
      });
  }, []);

  // Cargar/refrescar tenantStats cuando cambia el perfil o el tenantId
  useEffect(() => {
    if (!profile?.id || !tenantId) { setTenantStats(null); return; }
    // Asegurar vínculo y cargar stats
    ensureTenantMembership(profile.id, tenantId).then(() => {
      loadTenantStats(profile.id, tenantId).then(setTenantStats);
    });
  }, [profile?.id, tenantId]);

  // Método explícito para refrescar tenantStats (post-orden, post-canje)
  const refreshTenantStats = useCallback(async () => {
    if (!profile?.id || !tenantId) return;
    const stats = await loadTenantStats(profile.id, tenantId);
    setTenantStats(stats);
    console.info('[CustomerProfileContext] tenantStats refrescado:', stats.points, 'pts');
  }, [profile?.id, tenantId]);

  // ─── CHECK PHONE (global) ────────────────────────────────────────────────
  const checkPhone = useCallback(async (phone: string, _tid: string) => {
    // _tid se ignora: la identidad es global
    const data = await findGlobalCustomerByPhone(phone);
    if (!data) return { exists: false, hasPasskey: false };
    const { data: creds } = await supabase.from('webauthn_credentials')
      .select('id').eq('user_id', data.id).limit(1);
    return { exists: true, hasPasskey: (creds?.length ?? 0) > 0 };
  }, []);

  // ─── REGISTRO GLOBAL ─────────────────────────────────────────────────────
  const registerWithPassword = useCallback(async ({
    phone, password, name, email, birthday, tenantId: tid,
  }: { phone: string; password: string; name: string; email?: string; birthday?: string; tenantId: string }) => {
    const clean = phone.replace(/\D/g, '');
    // Verificar si ya existe globalmente
    const existing = await findGlobalCustomerByPhone(clean);
    if (existing) return { success: false, error: 'Ya existe una cuenta con este número' };
    // Crear identidad global (sin tenant_id)
    const { data: created, error } = await supabase.from('customer_profiles').insert({
      phone: clean, name, email: email || null, birthday: birthday || null,
      has_password: true,
      // Legacy fields para compatibilidad
      points: 0, level: 'bronze', total_spent: 0, total_orders: 0,
    }).select().single();
    if (error || !created) {
      console.error('[registerGlobalCustomer] error:', error?.message);
      return { success: false, error: 'Error al crear la cuenta' };
    }
    const realHash = await hashPassword(password, created.id);
    await supabase.from('customer_profiles').update({ password_hash: realHash }).eq('id', created.id);
    // Crear vínculo con el tenant actual
    await ensureTenantMembership(created.id, tid);
    // Registrar dispositivo
    const fp = getDeviceFingerprint();
    await supabase.from('trusted_devices').upsert(
      { customer_id: created.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
      { onConflict: 'customer_id,device_fingerprint' }
    );
    localStorage.setItem(GLOBAL_STORAGE_KEY, created.id);
    setProfile({ ...created, has_password: true } as CustomerProfile);
    setAuthStep('passkey_prompt');
    console.info('[registerGlobalCustomer] cuenta global creada:', created.id);
    return { success: true };
  }, []);

  // ─── LOGIN GLOBAL ────────────────────────────────────────────────────────
  const loginWithPassword = useCallback(async (phone: string, password: string, tid: string) => {
    // Buscar globalmente (sin tenant_id)
    const data = await findGlobalCustomerByPhone(phone);
    if (!data) return { success: false, error: 'No existe una cuenta con este número' };
    if (!data.password_hash) return { success: false, error: 'Esta cuenta no tiene contraseña. Contacta soporte.' };
    const hash = await hashPassword(password, data.id);
    if (hash !== data.password_hash) return { success: false, error: 'Contraseña incorrecta' };
    // Crear vínculo con el tenant actual si no existe
    await ensureTenantMembership(data.id, tid);
    const fp = getDeviceFingerprint();
    await supabase.from('trusted_devices').upsert(
      { customer_id: data.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
      { onConflict: 'customer_id,device_fingerprint' }
    );
    await supabase.from('customer_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', data.id);
    localStorage.setItem(GLOBAL_STORAGE_KEY, data.id);
    setProfile(data as CustomerProfile);
    const { data: creds } = await supabase.from('webauthn_credentials').select('id').eq('user_id', data.id).limit(1);
    setAuthStep((creds?.length ?? 0) === 0 ? 'passkey_prompt' : 'logged_in');
    console.info('[loginGlobalCustomer] sesión iniciada globalmente:', data.id, '→ tenant:', tid);
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
      // Buscar globalmente
      const profileData = await findGlobalCustomerByPhone(phone);
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
      // Crear vínculo con el tenant actual
      await ensureTenantMembership(profileData.id, tid);
      const fp = getDeviceFingerprint();
      await supabase.from('trusted_devices').upsert(
        { customer_id: profileData.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
        { onConflict: 'customer_id,device_fingerprint' }
      );
      await supabase.from('customer_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', profileData.id);
      localStorage.setItem(GLOBAL_STORAGE_KEY, profileData.id);
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

  // ─── MIS RESTAURANTES ────────────────────────────────────────────────────
  const loadCustomerTenants = useCallback(async (): Promise<CustomerTenantEntry[]> => {
    if (!profile?.id) return [];
    const { data, error } = await supabase
      .from('tenant_customer_stats')
      .select('tenant_id, points, total_orders, last_seen_at')
      .eq('customer_id', profile.id)
      .order('last_seen_at', { ascending: false });
    if (error || !data?.length) return [];
    // Cargar info de los tenants
    const tenantIds = data.map(d => d.tenant_id);
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, logo_url')
      .in('id', tenantIds);
    const tenantMap = Object.fromEntries((tenants ?? []).map(t => [t.id, t]));
    return data.map(d => ({
      tenant_id: d.tenant_id,
      tenant_name: tenantMap[d.tenant_id]?.name ?? 'Restaurante',
      tenant_logo_url: tenantMap[d.tenant_id]?.logo_url ?? null,
      points: d.points ?? 0,
      total_orders: d.total_orders ?? 0,
      last_seen_at: d.last_seen_at ?? null,
    }));
  }, [profile?.id]);

  // ─── LOGOUT ──────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const fp = getDeviceFingerprint();
    if (profile) {
      await supabase.from('trusted_devices').delete().eq('customer_id', profile.id).eq('device_fingerprint', fp);
    }
    localStorage.removeItem(GLOBAL_STORAGE_KEY);
    setProfile(null);
    setAuthStep('idle');
  }, [profile]);

  const logoutAllDevices = useCallback(async () => {
    if (!profile) return;
    await supabase.from('trusted_devices').delete().eq('customer_id', profile.id);
    localStorage.removeItem(GLOBAL_STORAGE_KEY);
    setProfile(null);
    setAuthStep('idle');
  }, [profile]);

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

  // Legacy login: busca globalmente y crea vínculo con el tenant
  const login = useCallback(async (phone: string, tid: string): Promise<CustomerProfile | null> => {
    let data = await findGlobalCustomerByPhone(phone);
    if (!data) {
      // Crear cuenta global mínima (sin tenant_id)
      const { data: created } = await supabase.from('customer_profiles')
        .insert({ phone: phone.replace(/\D/g, ''), has_password: false, points: 0, level: 'bronze', total_spent: 0, total_orders: 0 })
        .select().single();
      data = created;
    }
    if (!data) return null;
    // Crear vínculo con el tenant actual
    await ensureTenantMembership(data.id, tid);
    const fp = getDeviceFingerprint();
    await supabase.from('trusted_devices').upsert(
      { customer_id: data.id, device_fingerprint: fp, last_seen_at: new Date().toISOString() },
      { onConflict: 'customer_id,device_fingerprint' }
    );
    localStorage.setItem(GLOBAL_STORAGE_KEY, data.id);
    setProfile(data as CustomerProfile);
    setAuthStep('logged_in');
    return data as CustomerProfile;
  }, []);

  return (
    <CustomerProfileContext.Provider value={{
      profile, tenantStats, isGuest: !profile, isLoading, authStep, setAuthStep,
      refreshTenantStats,
      checkPhone, registerWithPassword, loginWithPassword, changePassword,
      isWebAuthnSupported, registerPasskey, loginWithPasskey, getPasskeys, deletePasskey,
      updateProfile, refreshProfile, logout, logoutAllDevices,
      loadCustomerTenants,
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
