/*
 * AdminAuthContext v5: Fix del error "Restaurante no encontrado".
 * Cambios:
 * - Usa maybeSingle() en lugar de single() para evitar error cuando RLS devuelve 0 filas
 * - Hace signOut() previo para limpiar sesiones activas que puedan interferir con RLS
 * - Aumenta el timeout a 15s para conexiones lentas
 * - Mejora el manejo de errores con mensajes más específicos
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface AdminAuth {
  isLoading: boolean;
  isAuthenticated: boolean;
  role: 'admin' | 'superadmin' | null;
  tenantSlug: string | null;
  userEmail: string | null;
  login: (email: string, password: string, role: 'admin' | 'superadmin', slug?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const SUPER_ADMIN_EMAIL = 'admin@digitalatlas.com';

const AdminAuthContext = createContext<AdminAuth | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<'admin' | 'superadmin' | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      const stored = localStorage.getItem('smartmenu_admin_session');
      if (!stored) {
        if (mounted) setIsLoading(false);
        return;
      }

      try {
        const saved = JSON.parse(stored) as {
          role?: 'admin' | 'superadmin';
          tenantSlug?: string | null;
          userEmail?: string | null;
        };
        const { data, error } = await supabase.auth.getSession();
        const user = data.session?.user;

        if (error || !user || !saved.role || user.email?.toLowerCase() !== saved.userEmail?.toLowerCase()) {
          throw new Error('invalid-session');
        }

        if (saved.role === 'superadmin') {
          if (user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) throw new Error('invalid-role');
        } else {
          if (!saved.tenantSlug) throw new Error('missing-tenant');
          const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('admin_id, admin_email')
            .eq('slug', saved.tenantSlug)
            .maybeSingle();
          const ownsTenant = tenant?.admin_id === user.id
            || (!tenant?.admin_id && tenant?.admin_email?.toLowerCase() === user.email?.toLowerCase());
          if (tenantError || !ownsTenant) throw new Error('invalid-tenant-access');
        }

        if (mounted) {
          setIsAuthenticated(true);
          setRole(saved.role);
          setTenantSlug(saved.tenantSlug || null);
          setUserEmail(user.email || null);
        }
      } catch {
        localStorage.removeItem('smartmenu_admin_session');
        await supabase.auth.signOut().catch(() => {});
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    restoreSession();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (
    email: string,
    password: string,
    targetRole: 'admin' | 'superadmin',
    slug?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // PASO 0: Limpiar cualquier sesión activa que pueda interferir con RLS
      await supabase.auth.signOut().catch(() => {});

      // PASO 1: Para admin, verificar el tenant ANTES de autenticar
      // Usa maybeSingle() para evitar error cuando RLS devuelve 0 filas
      if (targetRole === 'admin' && slug) {
        let tenant: { admin_email: string } | null = null;
        let tenantError: any = null;

        try {
          const result = await withTimeout(
            supabase.from('tenants').select('admin_email').eq('slug', slug).maybeSingle() as unknown as Promise<{ data: { admin_email: string } | null; error: unknown }>,
            15000
          );
          tenant = result.data;
          tenantError = result.error;
        } catch (timeoutErr: any) {
          if (timeoutErr?.message === 'timeout') {
            return { success: false, error: 'La conexión tardó demasiado. Verifica tu internet e intenta de nuevo.' };
          }
          throw timeoutErr;
        }

        if (tenantError) {
          console.error('[AdminAuth] Error buscando tenant:', tenantError);
          const isNetworkErr = !navigator.onLine
            || tenantError.message?.includes('fetch')
            || tenantError.message?.includes('network')
            || tenantError.message?.includes('Failed to fetch');
          if (isNetworkErr) {
            return { success: false, error: 'Sin conexión a internet. Verifica tu red e intenta de nuevo.' };
          }
          // Error de RLS u otro error de Supabase — no es error de red
          return { success: false, error: 'No se pudo verificar el restaurante. Intenta de nuevo.' };
        }

        if (!tenant) {
          return { success: false, error: 'Restaurante no encontrado. Verifica la URL.' };
        }

        if (tenant.admin_email?.toLowerCase() !== email.toLowerCase()) {
          return { success: false, error: 'Credenciales incorrectas para este restaurante.' };
        }
      }

      // PASO 2: Autenticar con Supabase Auth
      let authData: any = null;
      let authError: any = null;

      try {
        const result = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          15000
        );
        authData = result.data;
        authError = result.error;
      } catch (timeoutErr: any) {
        if (timeoutErr?.message === 'timeout') {
          return { success: false, error: 'La conexión tardó demasiado. Verifica tu internet e intenta de nuevo.' };
        }
        throw timeoutErr;
      }

      if (authError || !authData?.user) {
        console.error('[AdminAuth] Error de autenticación:', authError);
        const isNetworkErr = !navigator.onLine
          || authError?.message?.includes('fetch')
          || authError?.message?.includes('network')
          || authError?.message?.includes('Failed to fetch');
        if (isNetworkErr) {
          return { success: false, error: 'Sin conexión a internet. Verifica tu red e intenta de nuevo.' };
        }
        // Invalid login credentials u otro error de auth
        const isWrongCredentials = authError?.message?.includes('Invalid login') || authError?.message?.includes('invalid') || authError?.status === 400;
        if (isWrongCredentials) {
          return { success: false, error: 'Email o contraseña incorrectos. Verifica tus credenciales.' };
        }
        return { success: false, error: authError?.message || 'No se pudo iniciar sesión. Intenta de nuevo.' };
      }

      // PASO 3: Confirmar que el usuario autenticado pertenece al tenant.
      // La sesión local nunca es suficiente para conceder acceso.
      if (targetRole === 'admin' && slug) {
        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('admin_id, admin_email')
          .eq('slug', slug)
          .maybeSingle();
        const ownsTenant = tenant?.admin_id === authData.user.id
          || (!tenant?.admin_id && tenant?.admin_email?.toLowerCase() === authData.user.email?.toLowerCase());
        if (tenantError || !ownsTenant) {
          await supabase.auth.signOut().catch(() => {});
          return { success: false, error: 'Este usuario no tiene acceso a este restaurante.' };
        }
      }

      // PASO 4: Verificación extra para super admin
      if (targetRole === 'superadmin') {
        if (email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
          supabase.auth.signOut().catch(() => {});
          return { success: false, error: 'Este email no tiene permisos de Super Admin.' };
        }
      }

      // PASO 5: Persistir sesión
      const session = { role: targetRole, tenantSlug: slug || null, userEmail: email };
      localStorage.setItem('smartmenu_admin_session', JSON.stringify(session));
      setIsAuthenticated(true);
      setRole(targetRole);
      setTenantSlug(slug || null);
      setUserEmail(email);
      return { success: true };

    } catch (err: any) {
      console.error('AdminAuthContext login error:', err);
      return { success: false, error: 'Error inesperado. Intenta de nuevo.' };
    }
  }, []);

  const logout = useCallback(() => {
    supabase.auth.signOut().catch(() => {});
    localStorage.removeItem('smartmenu_admin_session');
    setIsAuthenticated(false);
    setRole(null);
    setTenantSlug(null);
    setUserEmail(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isLoading, isAuthenticated, role, tenantSlug, userEmail, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
