/**
 * HelpTrigger.tsx
 * Botón de ayuda contextual para colocar en cualquier módulo.
 * Variantes: icon (solo ícono), button (botón con texto), badge (pill pequeño).
 * Al hacer clic, inicia el tour del módulo correspondiente.
 */

import { HelpCircle, BookOpen, Play } from 'lucide-react';
import { useOnboardingSafe, type TourModuleKey } from '@/lib/onboarding';
import { tourRegistry } from '@/lib/onboarding';

interface HelpTriggerProps {
  module: TourModuleKey;
  variant?: 'icon' | 'button' | 'badge';
  className?: string;
}

export default function HelpTrigger({ module, variant = 'icon', className = '' }: HelpTriggerProps) {
  const onboarding = useOnboardingSafe();
  const def = tourRegistry[module];

  // No renderizar si no hay provider o si las guías están desactivadas
  if (!onboarding || !onboarding.state.guidesEnabled || !def) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onboarding.startTour(module);
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleClick}
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${className}`}
        style={{ color: '#475569' }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.color = '#F59E0B';
          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245,158,11,0.1)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.color = '#475569';
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
        title={`Ver guía: ${def.label}`}
        aria-label={`Ver guía de ${def.label}`}
      >
        <HelpCircle size={15} />
      </button>
    );
  }

  if (variant === 'badge') {
    return (
      <button
        onClick={handleClick}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${className}`}
        style={{
          background: 'rgba(245,158,11,0.1)',
          color: '#F59E0B',
          border: '1px solid rgba(245,158,11,0.2)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.18)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.1)';
        }}
        title={`Ver guía: ${def.label}`}
      >
        <Play size={9} />
        Ver guía
      </button>
    );
  }

  // variant === 'button'
  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${className}`}
      style={{
        background: 'rgba(245,158,11,0.08)',
        color: '#F59E0B',
        border: '1px solid rgba(245,158,11,0.15)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.14)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.25)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.08)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(245,158,11,0.15)';
      }}
    >
      <BookOpen size={13} />
      Ver guía
    </button>
  );
}
