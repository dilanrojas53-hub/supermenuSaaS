/**
 * PhoneLoginSheet
 * Login rápido por número de teléfono.
 * No requiere OTP real — identifica al cliente por teléfono y crea perfil si no existe.
 * Es completamente opcional: el cliente puede cerrar y seguir como invitado.
 */
import { useState } from 'react';
import { X, Phone, ChevronRight, Loader2 } from 'lucide-react';
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
  isOpen,
  onClose,
  tenantId,
  accentColor = '#F59E0B',
  bgColor = 'var(--menu-bg)',
  textColor = 'var(--menu-text)',
}: PhoneLoginSheetProps) {
  const { login } = useCustomerProfile();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'name' | 'done'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePhoneSubmit = async () => {
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 8) { setError('Ingresá un número válido'); return; }
    setError('');
    setLoading(true);
    const profile = await login(clean, tenantId);
    setLoading(false);
    if (!profile) { setError('Error al iniciar sesión. Intentá de nuevo.'); return; }
    if (!profile.name) {
      setStep('name');
    } else {
      setStep('done');
      setTimeout(onClose, 1200);
    }
  };

  const handleNameSubmit = async () => {
    if (!name.trim()) { setError('Ingresá tu nombre'); return; }
    setError('');
    setLoading(true);
    await login(phone.replace(/\D/g, ''), tenantId);
    setLoading(false);
    setStep('done');
    setTimeout(onClose, 1200);
  };

  const handleClose = () => {
    setPhone(''); setName(''); setStep('phone'); setError('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[150] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[160] rounded-t-3xl p-6"
            style={{ backgroundColor: bgColor, paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: textColor, opacity: 0.2 }} />

            {/* Close */}
            <button onClick={handleClose} className="absolute top-5 right-5 p-1.5 rounded-full" style={{ backgroundColor: 'var(--menu-surface)' }}>
              <X size={16} style={{ color: textColor }} />
            </button>

            {step === 'done' ? (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">🎉</div>
                <p className="text-lg font-bold" style={{ color: textColor }}>¡Bienvenido!</p>
                <p className="text-sm mt-1" style={{ color: textColor, opacity: 0.6 }}>Tu perfil está listo</p>
              </div>
            ) : step === 'name' ? (
              <>
                <h2 className="text-xl font-black mb-1" style={{ color: textColor, fontFamily: "'Lora', serif" }}>¿Cómo te llamás?</h2>
                <p className="text-sm mb-5" style={{ color: textColor, opacity: 0.55 }}>Para personalizar tu experiencia</p>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
                  placeholder="Tu nombre"
                  className="w-full px-4 py-3 rounded-xl text-base outline-none mb-3"
                  style={{ backgroundColor: 'var(--menu-surface)', color: textColor, border: '1.5px solid var(--menu-border)' }}
                  autoFocus
                />
                {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
                <button
                  onClick={handleNameSubmit}
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-60"
                  style={{ backgroundColor: accentColor }}
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Continuar</span><ChevronRight size={18} /></>}
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: accentColor + '20' }}>
                    <Phone size={18} style={{ color: accentColor }} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black leading-tight" style={{ color: textColor, fontFamily: "'Lora', serif" }}>Identificate</h2>
                    <p className="text-xs" style={{ color: textColor, opacity: 0.5 }}>Rápido y sin contraseña</p>
                  </div>
                </div>
                <p className="text-sm mb-4" style={{ color: textColor, opacity: 0.65 }}>
                  Guardamos tu historial de pedidos, favoritos y puntos de recompensa.
                </p>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePhoneSubmit()}
                  placeholder="Ej: 8888-8888"
                  className="w-full px-4 py-3 rounded-xl text-base outline-none mb-3"
                  style={{ backgroundColor: 'var(--menu-surface)', color: textColor, border: '1.5px solid var(--menu-border)' }}
                  autoFocus
                />
                {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
                <button
                  onClick={handlePhoneSubmit}
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-60"
                  style={{ backgroundColor: accentColor }}
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <><span>Continuar</span><ChevronRight size={18} /></>}
                </button>
                <p className="text-center text-[11px] mt-3" style={{ color: textColor, opacity: 0.35 }}>
                  Podés continuar como invitado sin identificarte
                </p>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
