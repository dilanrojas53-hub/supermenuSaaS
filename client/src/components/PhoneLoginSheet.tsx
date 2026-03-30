/**
 * PhoneLoginSheet — v3.0
 * Flujo: teléfono → login/registro con contraseña → passkey opcional.
 * Sin OTP/SMS. Fallback siempre disponible: número + contraseña.
 */
import { useState, useRef, useEffect } from 'react';
import { X, Phone, ArrowRight, Loader2, CheckCircle2, User, Calendar, Lock, Eye, EyeOff, Mail, Fingerprint, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCustomerProfile } from '@/contexts/CustomerProfileContext';

interface PhoneLoginSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  accentColor?: string;
  bgColor?: string;
  textColor?: string;
}

export default function PhoneLoginSheet({
  isOpen, onClose, tenantId,
  accentColor = '#F59E0B',
  bgColor = 'var(--menu-surface)',
  textColor = 'var(--menu-text)',
}: PhoneLoginSheetProps) {
  const {
    authStep, setAuthStep,
    checkPhone, registerWithPassword, loginWithPassword,
    isWebAuthnSupported, registerPasskey, loginWithPasskey,
  } = useCustomerProfile();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasPasskey, setHasPasskey] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  // Determinar qué pantalla mostrar basado en authStep
  const step: 'phone' | 'login' | 'register' | 'passkey_prompt' | 'done' =
    authStep === 'login_password' ? 'login' :
    authStep === 'register_form' ? 'register' :
    authStep === 'passkey_prompt' ? 'passkey_prompt' :
    authStep === 'logged_in' ? 'done' : 'phone';

  useEffect(() => {
    if (!isOpen) {
      setPhone(''); setPassword(''); setConfirmPassword('');
      setName(''); setEmail(''); setBirthday('');
      setError(''); setShowPassword(false); setShowConfirm(false);
      setHasPasskey(false);
      if (authStep !== 'logged_in') setAuthStep('idle');
    }
  }, [isOpen]);

  // Cerrar automáticamente cuando el login es exitoso (y no hay passkey_prompt)
  useEffect(() => {
    if (authStep === 'logged_in' && isOpen) {
      onClose();
    }
  }, [authStep, isOpen, onClose]);

  const handleCheckPhone = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 8) { setError('Ingresá un número válido (mínimo 8 dígitos)'); return; }
    setLoading(true); setError('');
    const result = await checkPhone(clean, tenantId);
    setHasPasskey(result.hasPasskey);
    setLoading(false);
    if (result.exists) {
      setAuthStep('login_password');
    } else {
      setAuthStep('register_form');
    }
  };

  const handleLogin = async () => {
    if (!password) { setError('Ingresá tu contraseña'); return; }
    setLoading(true); setError('');
    const result = await loginWithPassword(phone.replace(/\D/g, ''), password, tenantId);
    setLoading(false);
    if (!result.success) setError(result.error || 'Error al iniciar sesión');
  };

  const handlePasskeyLogin = async () => {
    setLoading(true); setError('');
    const result = await loginWithPasskey(phone.replace(/\D/g, ''), tenantId);
    setLoading(false);
    if (!result.success) setError(result.error || 'Error con passkey');
  };

  const handleRegister = async () => {
    if (!name.trim()) { setError('Ingresá tu nombre'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true); setError('');
    const result = await registerWithPassword({
      phone: phone.replace(/\D/g, ''), password, name: name.trim(),
      email: email.trim() || undefined, birthday: birthday || undefined,
      tenantId,
    });
    setLoading(false);
    if (!result.success) setError(result.error || 'Error al crear la cuenta');
  };

  const handleRegisterPasskey = async () => {
    setLoading(true); setError('');
    const result = await registerPasskey();
    setLoading(false);
    if (!result.success && result.error !== 'Operación cancelada') setError(result.error || 'Error');
  };

  const inputStyle = {
    backgroundColor: 'var(--menu-bg, rgba(255,255,255,0.05))',
    color: textColor,
    border: `1.5px solid var(--menu-border, rgba(255,255,255,0.15))`,
  };

  const btnPrimary = {
    backgroundColor: accentColor,
    color: '#000',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (step !== 'passkey_prompt') onClose(); }}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[310] rounded-t-3xl p-6 overflow-y-auto"
            style={{ backgroundColor: bgColor, maxHeight: '90vh', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: textColor, opacity: 0.2 }} />

            {/* Close button */}
            {step !== 'passkey_prompt' && (
              <button onClick={onClose} className="absolute top-5 right-5 p-1.5 rounded-full"
                style={{ backgroundColor: 'var(--menu-surface, rgba(255,255,255,0.1))' }}>
                <X size={16} style={{ color: textColor }} />
              </button>
            )}

            <AnimatePresence mode="wait">

              {/* ── STEP 1: TELÉFONO ── */}
              {step === 'phone' && (
                <motion.div key="phone"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: accentColor + '22' }}>
                      <Phone size={18} style={{ color: accentColor }} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black" style={{ color: textColor }}>Iniciá sesión</h2>
                      <p className="text-xs" style={{ color: textColor, opacity: 0.5 }}>Con tu número de teléfono</p>
                    </div>
                  </div>
                  <p className="text-sm mb-5" style={{ color: textColor, opacity: 0.65 }}>
                    Acumulá puntos, guardá favoritos y revisá tu historial de pedidos.
                  </p>
                  <div className="flex gap-2 mb-3">
                    <div className="flex items-center px-3 py-3 rounded-xl text-sm font-semibold"
                      style={{ ...inputStyle, minWidth: 72 }}>
                      🇨🇷 +506
                    </div>
                    <input
                      ref={phoneRef}
                      type="tel" value={phone}
                      onChange={e => { setPhone(e.target.value); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleCheckPhone()}
                      placeholder="8888 8888" autoFocus
                      className="flex-1 px-4 py-3 rounded-xl text-base outline-none"
                      style={inputStyle}
                    />
                  </div>
                  {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                  <button onClick={handleCheckPhone} disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 transition-transform"
                    style={btnPrimary}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Continuar</span><ArrowRight size={18} /></>}
                  </button>
                  <p className="text-center text-[11px] mt-3" style={{ color: textColor, opacity: 0.35 }}>
                    Si no tenés cuenta, te guiamos para crearla
                  </p>
                </motion.div>
              )}

              {/* ── STEP 2: LOGIN CON CONTRASEÑA ── */}
              {step === 'login' && (
                <motion.div key="login"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h2 className="text-xl font-black mb-1" style={{ color: textColor }}>Bienvenido de vuelta</h2>
                  <p className="text-sm mb-5" style={{ color: textColor, opacity: 0.55 }}>
                    +506 {phone}
                  </p>

                  {/* Passkey si está disponible */}
                  {hasPasskey && isWebAuthnSupported() && (
                    <button onClick={handlePasskeyLogin} disabled={loading}
                      className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 mb-4 active:scale-95 disabled:opacity-60 transition-transform"
                      style={btnPrimary}>
                      {loading ? <Loader2 size={18} className="animate-spin" /> : <><Fingerprint size={20} /><span>Entrar con huella / Face ID</span></>}
                    </button>
                  )}

                  {hasPasskey && isWebAuthnSupported() && (
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px" style={{ backgroundColor: textColor, opacity: 0.15 }} />
                      <span className="text-xs" style={{ color: textColor, opacity: 0.4 }}>o con contraseña</span>
                      <div className="flex-1 h-px" style={{ backgroundColor: textColor, opacity: 0.15 }} />
                    </div>
                  )}

                  <div className="relative mb-3">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={inputStyle}>
                      <Lock size={16} style={{ color: textColor, opacity: 0.5 }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleLogin()}
                        placeholder="Contraseña" autoFocus={!hasPasskey}
                        className="flex-1 bg-transparent outline-none text-sm"
                        style={{ color: textColor }}
                      />
                      <button onClick={() => setShowPassword(p => !p)} type="button">
                        {showPassword
                          ? <EyeOff size={16} style={{ color: textColor, opacity: 0.4 }} />
                          : <Eye size={16} style={{ color: textColor, opacity: 0.4 }} />}
                      </button>
                    </div>
                  </div>
                  {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                  <button onClick={handleLogin} disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 transition-transform"
                    style={btnPrimary}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Iniciar sesión'}
                  </button>
                  <button onClick={() => { setAuthStep('phone_input' as any); setError(''); setPassword(''); }}
                    className="w-full text-sm py-2 mt-2" style={{ color: textColor, opacity: 0.5 }}>
                    ← Cambiar número
                  </button>
                </motion.div>
              )}

              {/* ── STEP 3: REGISTRO ── */}
              {step === 'register' && (
                <motion.div key="register"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h2 className="text-xl font-black mb-1" style={{ color: textColor }}>Crear cuenta</h2>
                  <p className="text-sm mb-5" style={{ color: textColor, opacity: 0.55 }}>
                    +506 {phone} · Completá tu información
                  </p>
                  <div className="space-y-3 mb-4">
                    {/* Nombre */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={inputStyle}>
                      <User size={16} style={{ color: textColor, opacity: 0.5 }} />
                      <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }}
                        placeholder="Tu nombre *" autoFocus
                        className="flex-1 bg-transparent outline-none text-sm" style={{ color: textColor }} />
                    </div>
                    {/* Contraseña */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={inputStyle}>
                      <Lock size={16} style={{ color: textColor, opacity: 0.5 }} />
                      <input type={showPassword ? 'text' : 'password'} value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        placeholder="Contraseña * (mín. 6 caracteres)"
                        className="flex-1 bg-transparent outline-none text-sm" style={{ color: textColor }} />
                      <button onClick={() => setShowPassword(p => !p)} type="button">
                        {showPassword
                          ? <EyeOff size={16} style={{ color: textColor, opacity: 0.4 }} />
                          : <Eye size={16} style={{ color: textColor, opacity: 0.4 }} />}
                      </button>
                    </div>
                    {/* Confirmar contraseña */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={inputStyle}>
                      <Lock size={16} style={{ color: textColor, opacity: 0.5 }} />
                      <input type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                        placeholder="Confirmar contraseña *"
                        className="flex-1 bg-transparent outline-none text-sm" style={{ color: textColor }} />
                      <button onClick={() => setShowConfirm(p => !p)} type="button">
                        {showConfirm
                          ? <EyeOff size={16} style={{ color: textColor, opacity: 0.4 }} />
                          : <Eye size={16} style={{ color: textColor, opacity: 0.4 }} />}
                      </button>
                    </div>
                    {/* Email (opcional) */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={inputStyle}>
                      <Mail size={16} style={{ color: textColor, opacity: 0.5 }} />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="Correo electrónico (opcional)"
                        className="flex-1 bg-transparent outline-none text-sm" style={{ color: textColor }} />
                    </div>
                    {/* Cumpleaños (opcional) */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={inputStyle}>
                      <Calendar size={16} style={{ color: textColor, opacity: 0.5 }} />
                      <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-sm" style={{ color: textColor, opacity: 0.7 }} />
                      <span className="text-xs" style={{ color: textColor, opacity: 0.35 }}>Opcional</span>
                    </div>
                  </div>
                  {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
                  <button onClick={handleRegister} disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 transition-transform"
                    style={btnPrimary}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Crear cuenta'}
                  </button>
                  <button onClick={() => { setAuthStep('phone_input' as any); setError(''); }}
                    className="w-full text-sm py-2 mt-2" style={{ color: textColor, opacity: 0.5 }}>
                    ← Cambiar número
                  </button>
                </motion.div>
              )}

              {/* ── STEP 4: OFRECER PASSKEY ── */}
              {step === 'passkey_prompt' && (
                <motion.div key="passkey"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                      style={{ backgroundColor: accentColor + '22' }}>
                      <Fingerprint size={32} style={{ color: accentColor }} />
                    </div>
                    <h2 className="text-xl font-black mb-2" style={{ color: textColor }}>
                      ¿Guardar acceso rápido?
                    </h2>
                    <p className="text-sm" style={{ color: textColor, opacity: 0.6 }}>
                      La próxima vez podés entrar con tu huella, Face ID o PIN del dispositivo — sin escribir contraseña.
                    </p>
                  </div>
                  <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: accentColor + '11', border: `1px solid ${accentColor}33` }}>
                    <div className="flex items-start gap-3">
                      <Shield size={18} style={{ color: accentColor, flexShrink: 0, marginTop: 2 }} />
                      <p className="text-xs" style={{ color: textColor, opacity: 0.75 }}>
                        No almacenamos tu biometría. El dispositivo la verifica localmente usando el estándar WebAuthn (FIDO2). Solo guardamos una clave criptográfica pública.
                      </p>
                    </div>
                  </div>
                  {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}
                  {isWebAuthnSupported() ? (
                    <>
                      <button onClick={handleRegisterPasskey} disabled={loading}
                        className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 transition-transform mb-3"
                        style={btnPrimary}>
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <><Fingerprint size={20} /><span>Activar acceso rápido</span></>}
                      </button>
                      <button onClick={() => { setAuthStep('logged_in'); onClose(); }}
                        className="w-full py-2 text-sm" style={{ color: textColor, opacity: 0.45 }}>
                        Ahora no
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-center text-xs mb-4" style={{ color: textColor, opacity: 0.45 }}>
                        Tu navegador no soporta passkeys. Podés activarlo más tarde desde Perfil → Seguridad.
                      </p>
                      <button onClick={() => { setAuthStep('logged_in'); onClose(); }}
                        className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                        style={btnPrimary}>
                        Continuar
                      </button>
                    </>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
