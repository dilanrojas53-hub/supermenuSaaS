import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { Lock, Eye, EyeOff, Mail } from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface AdminLoginProps {
  mode: 'admin' | 'superadmin';
}

export default function AdminLogin({ mode }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAdminAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ slug: string }>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const slug = params.slug || undefined;
    const result = await login(email, password, mode, slug);

    setLoading(false);

    if (result.success) {
      if (mode === 'superadmin') {
        navigate('/super-admin');
      } else {
        navigate(`/admin/${slug}`);
      }
    } else {
      setError(result.error || 'Credenciales incorrectas. Intenta de nuevo.');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #0f1724 50%, #0a0a0a 100%)' }}
    >
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl p-8"
          style={{
            backgroundColor: '#111827',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{
                background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                boxShadow: '0 8px 24px rgba(245,158,11,0.3)',
              }}
            >
              <Lock size={28} style={{ color: '#000' }} />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{ color: '#f5f3ee', fontFamily: "'Lora', serif" }}
            >
              {mode === 'superadmin' ? 'Super Admin' : 'Panel de Administración'}
            </h1>
            <p className="text-sm mt-2" style={{ color: '#9b8f82' }}>
              {mode === 'superadmin'
                ? 'Control central de la plataforma Smart Menu'
                : `Gestiona tu restaurante${params.slug ? ` (${params.slug})` : ''}`}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9b8f82' }}>Email</label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 pl-11 rounded-xl text-sm outline-none transition-all"
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f5f3ee',
                  }}
                  placeholder="tu@email.com"
                  autoComplete="email"
                  required
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#c6a75e';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(198,167,94,0.2)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#9b8f82' }} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#9b8f82' }}>Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all pr-12"
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#f5f3ee',
                  }}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  required
                  onFocus={e => {
                    e.currentTarget.style.borderColor = '#c6a75e';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(198,167,94,0.2)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#9b8f82' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="rounded-xl px-4 py-3"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}
              >
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                color: '#000',
                boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
              }}
            >
              {loading ? (
                <>
                  <div
                    className="w-4 h-4 rounded-full border-2 animate-spin"
                    style={{ borderColor: '#000', borderTopColor: 'transparent' }}
                  />
                  Verificando...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#4b5563' }}>
          Smart Menu Platform — Autenticación segura con Supabase
        </p>
      </div>
    </div>
  );
}
