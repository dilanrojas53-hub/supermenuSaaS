/**
 * PhoneLoginSheet — v2.0
 * Flujo OTP real: teléfono → código 6 dígitos → completar perfil (si es nuevo).
 */
import { useState, useRef, useEffect } from 'react';
import { X, Phone, ArrowRight, Loader2, CheckCircle2, User, Calendar } from 'lucide-react';
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
  const { authStep, sendOTP, verifyOTP, completeProfile, setAuthStep } = useCustomerProfile();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setPhone(''); setOtp(['', '', '', '', '', '']);
      setName(''); setBirthday(''); setError('');
    }
  }, [isOpen]);

  const handleSendOTP = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 8) { setError('Ingresá un número válido'); return; }
    setLoading(true); setError('');
    const result = await sendOTP(clean, tenantId);
    setLoading(false);
    if (!result.success) setError(result.error || 'Error al enviar código');
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (newOtp.every(d => d !== '')) handleVerifyOTP(newOtp.join(''));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0)
      otpRefs.current[index - 1]?.focus();
  };

  const handleVerifyOTP = async (code: string) => {
    setLoading(true); setError('');
    const result = await verifyOTP(phone.replace(/\D/g, ''), code, tenantId);
    setLoading(false);
    if (!result.success) {
      setError(result.error || 'Código incorrecto');
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } else if (!result.isNew) {
      onClose();
    }
  };

  const handleCompleteProfile = async () => {
    if (!name.trim()) { setError('Ingresá tu nombre'); return; }
    setLoading(true);
    await completeProfile({ name: name.trim(), birthday: birthday || undefined });
    setLoading(false);
    onClose();
  };

  const step = authStep === 'otp_sent' ? 'otp'
    : authStep === 'complete_profile' ? 'profile'
    : 'phone';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[160] rounded-t-3xl p-6"
            style={{ backgroundColor: bgColor, paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: textColor, opacity: 0.2 }} />
            <button onClick={onClose} className="absolute top-5 right-5 p-1.5 rounded-full"
              style={{ backgroundColor: 'var(--menu-surface)' }}>
              <X size={16} style={{ color: textColor }} />
            </button>

            <AnimatePresence mode="wait">
              {/* STEP 1: Phone */}
              {step === 'phone' && (
                <motion.div key="phone"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: accentColor + '22' }}>
                      <Phone size={18} style={{ color: accentColor }} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black" style={{ color: textColor, fontFamily: "'Lora', serif" }}>Iniciá sesión</h2>
                      <p className="text-xs" style={{ color: textColor, opacity: 0.5 }}>Con tu número de teléfono</p>
                    </div>
                  </div>
                  <p className="text-sm mb-5" style={{ color: textColor, opacity: 0.65 }}>
                    Acumulá puntos, guardá favoritos y revisá tu historial de pedidos.
                  </p>
                  <div className="flex gap-2 mb-3">
                    <div className="flex items-center px-3 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--menu-bg)', color: textColor, minWidth: 64 }}>
                      🇨🇷 +506
                    </div>
                    <input type="tel" value={phone}
                      onChange={e => { setPhone(e.target.value); setError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleSendOTP()}
                      placeholder="8888 8888" autoFocus
                      className="flex-1 px-4 py-3 rounded-xl text-base outline-none"
                      style={{ backgroundColor: 'var(--menu-bg)', color: textColor, border: '1.5px solid var(--menu-border)' }} />
                  </div>
                  {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                  <button onClick={handleSendOTP} disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
                    style={{ backgroundColor: accentColor, color: '#000' }}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Enviar código</span><ArrowRight size={18} /></>}
                  </button>
                  <p className="text-center text-[11px] mt-3" style={{ color: textColor, opacity: 0.35 }}>
                    Podés continuar como invitado sin identificarte
                  </p>
                </motion.div>
              )}

              {/* STEP 2: OTP */}
              {step === 'otp' && (
                <motion.div key="otp"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h2 className="text-xl font-black mb-1" style={{ color: textColor, fontFamily: "'Lora', serif" }}>Verificá tu número</h2>
                  <p className="text-sm mb-5" style={{ color: textColor, opacity: 0.6 }}>
                    Código de 6 dígitos enviado a <strong>+506 {phone}</strong>
                  </p>
                  <div className="flex gap-2 justify-center mb-4">
                    {otp.map((digit, i) => (
                      <input key={i} ref={el => { otpRefs.current[i] = el; }}
                        type="text" inputMode="numeric" maxLength={1} value={digit}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className="w-11 h-14 text-center text-xl font-bold rounded-xl outline-none transition-all"
                        style={{
                          backgroundColor: digit ? accentColor + '22' : 'var(--menu-bg)',
                          color: textColor,
                          border: `2px solid ${digit ? accentColor : 'var(--menu-border)'}`,
                        }} />
                    ))}
                  </div>
                  {loading && <div className="flex justify-center mb-3"><Loader2 size={22} className="animate-spin" style={{ color: accentColor }} /></div>}
                  {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}
                  <button onClick={() => { setAuthStep('phone_input'); setOtp(['', '', '', '', '', '']); setError(''); }}
                    className="w-full text-sm py-2" style={{ color: textColor, opacity: 0.5 }}>
                    ← Cambiar número
                  </button>
                  <button onClick={handleSendOTP} disabled={loading}
                    className="w-full text-sm py-2 font-semibold" style={{ color: accentColor }}>
                    Reenviar código
                  </button>
                </motion.div>
              )}

              {/* STEP 3: Complete Profile */}
              {step === 'profile' && (
                <motion.div key="profile"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={22} style={{ color: accentColor }} />
                    <h2 className="text-xl font-black" style={{ color: textColor, fontFamily: "'Lora', serif" }}>¡Número verificado!</h2>
                  </div>
                  <p className="text-sm mb-5" style={{ color: textColor, opacity: 0.6 }}>
                    Completá tu perfil para ganar puntos y acceder a beneficios.
                  </p>
                  <div className="space-y-3 mb-5">
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ backgroundColor: 'var(--menu-bg)', border: '1.5px solid var(--menu-border)' }}>
                      <User size={16} style={{ color: textColor, opacity: 0.5 }} />
                      <input type="text" value={name} onChange={e => { setName(e.target.value); setError(''); }}
                        placeholder="Tu nombre" autoFocus
                        className="flex-1 bg-transparent outline-none text-sm"
                        style={{ color: textColor }} />
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ backgroundColor: 'var(--menu-bg)', border: '1.5px solid var(--menu-border)' }}>
                      <Calendar size={16} style={{ color: textColor, opacity: 0.5 }} />
                      <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-sm"
                        style={{ color: textColor, opacity: 0.7 }} />
                    </div>
                  </div>
                  {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
                  <button onClick={handleCompleteProfile} disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
                    style={{ backgroundColor: accentColor, color: '#000' }}>
                    {loading ? <Loader2 size={18} className="animate-spin" /> : 'Completar perfil'}
                  </button>
                  <button onClick={onClose} className="w-full mt-3 py-2 text-sm" style={{ color: textColor, opacity: 0.4 }}>
                    Ahora no
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
