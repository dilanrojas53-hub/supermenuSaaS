/**
 * WelcomeModal.tsx
 * Modal de bienvenida que aparece la primera vez que el usuario entra a un módulo.
 * Tres opciones: Ver guía / Ahora no / No volver a mostrar.
 * Diseño premium, no invasivo.
 */

import { BookOpen, X, EyeOff } from 'lucide-react';
import { useOnboarding, type TourModuleKey } from '@/lib/onboarding';
import { tourRegistry } from '@/lib/onboarding';

interface WelcomeModalProps {
  module: TourModuleKey;
  onClose?: () => void;
}

export default function WelcomeModal({ module, onClose }: WelcomeModalProps) {
  const { startTour, markDismissed, markNeverShow, markPromptSeen } = useOnboarding();
  const def = tourRegistry[module];

  if (!def) return null;

  const handleStartTour = () => {
    markPromptSeen(module);
    startTour(module);
    onClose?.();
  };

  const handleDismiss = () => {
    markDismissed(module);
    onClose?.();
  };

  const handleNeverShow = () => {
    markNeverShow(module);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[8500] flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={handleDismiss}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #1E293B, #0F172A)',
          border: '1px solid rgba(245,158,11,0.2)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.7)',
          animation: 'welcomeIn 0.25s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Top accent line ── */}
        <div
          className="h-0.5 w-full"
          style={{ background: 'linear-gradient(90deg, #F59E0B, #F97316, transparent)' }}
        />

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              {def.icon}
            </div>
            <div>
              <p className="text-[10px] font-black tracking-widest mb-0.5" style={{ color: '#F59E0B' }}>
                GUÍA RÁPIDA
              </p>
              <h2 className="text-sm font-bold leading-tight" style={{ color: '#F1F5F9' }}>
                {def.label}
              </h2>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
            style={{ color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-5 pb-5">
          <p className="text-xs leading-relaxed mb-5" style={{ color: '#94A3B8' }}>
            {def.description} ¿Quieres una guía rápida de {def.steps.length} pasos?
          </p>

          {/* ── Actions ── */}
          <div className="space-y-2">
            <button
              onClick={handleStartTour}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: 'linear-gradient(135deg, #F59E0B, #F97316)',
                color: '#0F172A',
                boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(245,158,11,0.45)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(245,158,11,0.3)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              <BookOpen size={15} />
              Sí, mostrar guía
            </button>

            <button
              onClick={handleDismiss}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: '#94A3B8',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                (e.currentTarget as HTMLElement).style.color = '#CBD5E1';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                (e.currentTarget as HTMLElement).style.color = '#94A3B8';
              }}
            >
              Ahora no
            </button>

            <button
              onClick={handleNeverShow}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs transition-colors"
              style={{ color: '#475569' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#64748B')}
              onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            >
              <EyeOff size={11} />
              No volver a mostrar
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes welcomeIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
