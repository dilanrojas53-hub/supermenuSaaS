/*
 * AdminAuthContext v4: Verificación del tenant ANTES de autenticar.
 * El orden correcto es:
 * 1. Verificar que el email pertenece al tenant (query anónimo, siempre funciona)
 * 2. Autenticar con Supabase Auth (signInWithPassword)
 * Esto evita el problema de RLS donde la sesión recién creada puede bloquear
 * el SELECT en tenants si las políticas cambian.
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
      // PASO 1: Para admin, verificar el tenant ANTES de autenticar
      // Esto corre como sesión anónima y siempre funciona
      if (targetRole === 'admin' && slug) {
        const { data: tenant, error: tenantError } = await withTimeout(
          supabase.from('tenants').select('admin_email').eq('slug', slug).single(),
          8000
        );

        if (tenantError || !tenant) {
          return { success: false, error: 'Restaurante no encontrado. Verifica la URL.' };
        }

        if (tenant.admin_email?.toLowerCase() !== email.toLowerCase()) {
          return { success: false, error: 'Credenciales incorrectas para este restaurante.' };
        }
      }

      // PASO 2: Autenticar con Supabase Auth
      const { data: authData, error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        12000
      );

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
      if (err?.message === 'timeout') {
        return {
          success: false,
          error: 'La conexión tardó demasiado. Verifica tu internet e intenta de nuevo.',
        };
      }
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
