import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface AdminLoginProps {
  mode: 'admin' | 'superadmin';
}

export default function AdminLogin({ mode }: AdminLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAdminAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ slug: string }>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const slug = params.slug || undefined;
    const success = login(username, password, mode, slug);
    if (success) {
      if (mode === 'superadmin') {
        navigate('/super-admin');
      } else {
        navigate(`/admin/${slug}`);
      }
    } else {
      setError('Credenciales incorrectas. Intenta de nuevo.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Volver al inicio</span>
        </button>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/20">
              <Lock size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Lora', serif" }}>
              {mode === 'superadmin' ? 'Super Admin' : 'Panel de Administración'}
            </h1>
            <p className="text-slate-400 text-sm mt-2">
              {mode === 'superadmin'
                ? 'Control central de la plataforma Smart Menu'
                : `Gestiona tu restaurante${params.slug ? ` (${params.slug})` : ''}`}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all"
                placeholder="Ingresa tu usuario"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all pr-12"
                  placeholder="Ingresa tu contraseña"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Smart Menu Platform — Panel Administrativo
        </p>
      </div>
    </div>
  );
}
