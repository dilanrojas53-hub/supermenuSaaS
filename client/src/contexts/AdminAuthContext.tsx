import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AdminAuth {
  isAuthenticated: boolean;
  role: 'admin' | 'superadmin' | null;
  tenantSlug: string | null;
  login: (username: string, password: string, role: 'admin' | 'superadmin', slug?: string) => boolean;
  logout: () => void;
}

// MVP credentials — will be replaced with proper auth later
const ADMIN_CREDENTIALS = { username: 'admin', password: 'SmartMenu2025!' };
const SUPERADMIN_CREDENTIALS = { username: 'superadmin', password: 'SuperMenu2025!' };

const AdminAuthContext = createContext<AdminAuth | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<'admin' | 'superadmin' | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);

  const login = useCallback((username: string, password: string, targetRole: 'admin' | 'superadmin', slug?: string): boolean => {
    const creds = targetRole === 'superadmin' ? SUPERADMIN_CREDENTIALS : ADMIN_CREDENTIALS;
    if (username === creds.username && password === creds.password) {
      setIsAuthenticated(true);
      setRole(targetRole);
      setTenantSlug(slug || null);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setRole(null);
    setTenantSlug(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, role, tenantSlug, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
