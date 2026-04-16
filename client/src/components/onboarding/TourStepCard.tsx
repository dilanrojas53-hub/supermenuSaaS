/**
 * TourStepCard.tsx
 * Card del paso del tour. Diseño premium, sobrio y sin ruido.
 * Muestra título, explicación, progreso y controles de navegación.
 */

import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import type { TourStep } from '@/lib/onboarding';

interface TourStepCardProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onSkip: () => void;
}

export default function TourStepCard({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  onSkip,
}: TourStepCardProps) {
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div
      className="w-80 rounded-2xl shadow-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #1E293B, #0F172A)',
        border: '1px solid rgba(245,158,11,0.2)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        animation: 'tourCardIn 0.2s ease-out',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Progress bar ── */}
      <div className="h-0.5 w-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #F59E0B, #F97316)',
          }}
        />
      </div>

      {/* ── Header ── */}
      <div className="flex items-start justify-between px-5 pt-4 pb-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(245,158,11,0.15)',
              color: '#F59E0B',
              border: '1px solid rgba(245,158,11,0.2)',
            }}
          >
            {stepIndex + 1} / {totalSteps}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: '#64748B' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
          onMouseLeave={e => (e.currentTarget.style.color = '#64748B')}
          aria-label="Cerrar guía"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Content ── */}
      <div className="px-5 pb-4">
        <h3
          className="text-sm font-bold mb-1.5 leading-snug"
          style={{ color: '#F1F5F9' }}
        >
          {step.title}
        </h3>
        <p
          className="text-xs leading-relaxed"
          style={{ color: '#94A3B8' }}
        >
          {step.body}
        </p>
      </div>

      {/* ── Dot indicators ── */}
      {totalSteps > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-200"
              style={{
                width: i === stepIndex ? 16 : 5,
                height: 5,
                background: i === stepIndex
                  ? 'linear-gradient(90deg, #F59E0B, #F97316)'
                  : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Actions ── */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Skip */}
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors"
          style={{ color: '#475569' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#64748B')}
          onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
        >
          <SkipForward size={12} />
          <span>Saltar</span>
        </button>

        {/* Prev / Next */}
        <div className="flex items-center gap-2">
          {!isFirst && (
            <button
              onClick={onPrev}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: '#94A3B8',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.1)';
                (e.currentTarget as HTMLElement).style.color = '#E2E8F0';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.color = '#94A3B8';
              }}
              aria-label="Paso anterior"
            >
              <ChevronLeft size={15} />
            </button>
          )}
          <button
            onClick={onNext}
            className="flex items-center gap-1.5 px-4 h-8 rounded-xl text-xs font-bold transition-all"
            style={{
              background: 'linear-gradient(135deg, #F59E0B, #F97316)',
              color: '#0F172A',
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(245,158,11,0.45)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(245,158,11,0.3)';
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            }}
          >
            {isLast ? 'Finalizar' : 'Siguiente'}
            {!isLast && <ChevronRight size={13} />}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes tourCardIn {
          from { opacity: 0; transform: scale(0.95) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
