/*
 * AdminAuthContext v2: Autenticación por tenant usando Supabase.
 * Cada tenant tiene su propio admin_email en la tabla tenants.
 * La contraseña se valida contra Supabase Auth.
 * Super Admin usa credenciales separadas de Supabase Auth.
 *
 * Para el MVP, usamos un enfoque híbrido:
 * - Se autentica contra Supabase Auth (signInWithPassword)
 * - Se verifica que el email pertenece al tenant correcto
 * - La sesión se persiste en localStorage
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

// Super admin email — the platform owner
const SUPER_ADMIN_EMAIL = 'superadmin@smartmenu.cr';

const AdminAuthContext = createContext<AdminAuth | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<'admin' | 'superadmin' | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Restore session from localStorage on mount
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

    // Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return { success: false, error: 'Credenciales incorrectas. Verifica tu email y contraseña.' };
    }

    // For super admin, verify the email matches
    if (targetRole === 'superadmin') {
      if (email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
        await supabase.auth.signOut();
        return { success: false, error: 'Este email no tiene permisos de Super Admin.' };
      }
    }

    // For admin, verify the email belongs to the tenant
    if (targetRole === 'admin' && slug) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('admin_email')
        .eq('slug', slug)
        .single();

      if (!tenant || tenant.admin_email?.toLowerCase() !== email.toLowerCase()) {
        await supabase.auth.signOut();
        return { success: false, error: 'Este email no está asociado a este restaurante.' };
      }
    }

    // Success — persist session
    const session = { role: targetRole, tenantSlug: slug || null, userEmail: email };
    localStorage.setItem('smartmenu_admin_session', JSON.stringify(session));
    setIsAuthenticated(true);
    setRole(targetRole);
    setTenantSlug(slug || null);
    setUserEmail(email);

    return { success: true };
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
