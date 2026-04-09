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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<'admin' | 'superadmin' | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('smartmenu_admin_session');
    if (stored) {
      try {
        const session = JSON.parse(stored);
        setIsAuthenticated(true);
        setRole(session.role);
        setTenantSlug(session.tenantSlug);
        setUserEmail(session.userEmail);
      } catch {
        localStorage.removeItem('smartmenu_admin_session');
      }
    }
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
            supabase.from('tenants').select('admin_email').eq('slug', slug).maybeSingle(),
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
          console.error('Error buscando tenant:', tenantError);
          return { success: false, error: 'Error de conexión. Intenta de nuevo.' };
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
        return { success: false, error: 'Contraseña incorrecta. Intenta de nuevo.' };
      }

      // PASO 3: Verificación extra para super admin
      if (targetRole === 'superadmin') {
        if (email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
          supabase.auth.signOut().catch(() => {});
          return { success: false, error: 'Este email no tiene permisos de Super Admin.' };
        }
      }

      // PASO 4: Persistir sesión
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
    <AdminAuthContext.Provider value={{ isAuthenticated, role, tenantSlug, userEmail, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
