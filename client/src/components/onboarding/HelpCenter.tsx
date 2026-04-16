/**
 * HelpCenter.tsx
 * Panel de ayuda central del admin. Permite:
 * - Ver todos los módulos disponibles
 * - Ver cuáles ya aprendió (completados)
 * - Repetir un tutorial
 * - Reiniciar onboarding completo
 * - Activar/desactivar guías y ayuda contextual
 */

import { useState } from 'react';
import {
  X,
  RotateCcw,
  CheckCircle2,
  Circle,
  Play,
  Settings2,
  BookOpen,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
} from 'lucide-react';
import { useOnboarding, ALL_TOUR_MODULES, tourRegistry, type TourModuleKey } from '@/lib/onboarding';

interface HelpCenterProps {
  onClose: () => void;
}

// Agrupación de módulos por sección
const MODULE_GROUPS: { label: string; icon: string; modules: TourModuleKey[] }[] = [
  {
    label: 'Operación',
    icon: '⚡',
    modules: ['orders', 'history', 'staff', 'tables'],
  },
  {
    label: 'Catálogo',
    icon: '📦',
    modules: ['menu', 'categories', 'modifiers'],
  },
  {
    label: 'Negocio',
    icon: '📈',
    modules: ['analytics', 'performance', 'customers', 'promotions', 'qr'],
  },
  {
    label: 'Sistema',
    icon: '🔧',
    modules: ['settings', 'experience', 'theme'],
  },
  {
    label: 'Delivery OS',
    icon: '🚀',
    modules: ['delivery'],
  },
];

export default function HelpCenter({ onClose }: HelpCenterProps) {
  const {
    state,
    startTour,
    resetModule,
    resetAll,
    setGuidesEnabled,
    setContextualHelpEnabled,
  } = useOnboarding();

  const [activeSection, setActiveSection] = useState<'guides' | 'settings'>('guides');
  const [confirmReset, setConfirmReset] = useState(false);

  const completedCount = ALL_TOUR_MODULES.filter(
    m => state.moduleStates[m]?.completed
  ).length;

  const handleStartTour = (module: TourModuleKey) => {
    resetModule(module);
    startTour(module);
    onClose();
  };

  const handleResetAll = () => {
    resetAll();
    setConfirmReset(false);
  };

  return (
    <div
      className="fixed inset-0 z-[8000] flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #1E293B, #0F172A)',
          border: '1px solid rgba(245,158,11,0.2)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.7)',
          animation: 'helpCenterIn 0.25s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Top accent ── */}
        <div
          className="h-0.5 flex-shrink-0"
          style={{ background: 'linear-gradient(90deg, #F59E0B, #F97316, transparent)' }}
        />

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <BookOpen size={16} style={{ color: '#F59E0B' }} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: '#F1F5F9' }}>
                Centro de ayuda
              </h2>
              <p className="text-[10px]" style={{ color: '#64748B' }}>
                {completedCount} de {ALL_TOUR_MODULES.length} módulos aprendidos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Progress bar ── */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(completedCount / ALL_TOUR_MODULES.length) * 100}%`,
                background: 'linear-gradient(90deg, #F59E0B, #F97316)',
              }}
            />
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div
          className="flex px-5 gap-1 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          {[
            { key: 'guides' as const, label: 'Guías', icon: <Sparkles size={13} /> },
            { key: 'settings' as const, label: 'Configuración', icon: <Settings2 size={13} /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px"
              style={{
                color: activeSection === tab.key ? '#F59E0B' : '#64748B',
                borderColor: activeSection === tab.key ? '#F59E0B' : 'transparent',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">
          {activeSection === 'guides' && (
            <div className="p-4 space-y-4">
              {MODULE_GROUPS.map(group => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-sm">{group.icon}</span>
                    <span
                      className="text-[10px] font-black tracking-widest"
                      style={{ color: '#475569' }}
                    >
                      {group.label.toUpperCase()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.modules.map(moduleKey => {
                      const def = tourRegistry[moduleKey];
                      const ms = state.moduleStates[moduleKey];
                      const isCompleted = ms?.completed ?? false;
                      const isSeen = ms?.promptSeen ?? false;

                      return (
                        <div
                          key={moduleKey}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                          style={{
                            background: isCompleted
                              ? 'rgba(245,158,11,0.06)'
                              : 'rgba(255,255,255,0.03)',
                            border: isCompleted
                              ? '1px solid rgba(245,158,11,0.12)'
                              : '1px solid rgba(255,255,255,0.04)',
                          }}
                        >
                          {/* Status icon */}
                          <div className="flex-shrink-0">
                            {isCompleted ? (
                              <CheckCircle2 size={16} style={{ color: '#F59E0B' }} />
                            ) : (
                              <Circle size={16} style={{ color: '#334155' }} />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-base leading-none">{def.icon}</span>
                              <span className="text-xs font-semibold truncate" style={{ color: '#CBD5E1' }}>
                                {def.label}
                              </span>
                              {isSeen && !isCompleted && (
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{ background: 'rgba(100,116,139,0.2)', color: '#64748B' }}
                                >
                                  Visto
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] mt-0.5 truncate" style={{ color: '#475569' }}>
                              {def.steps.length} pasos · {def.description}
                            </p>
                          </div>

                          {/* Action */}
                          <button
                            onClick={() => handleStartTour(moduleKey)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all flex-shrink-0"
                            style={{
                              background: isCompleted
                                ? 'rgba(245,158,11,0.1)'
                                : 'rgba(255,255,255,0.06)',
                              color: isCompleted ? '#F59E0B' : '#94A3B8',
                              border: isCompleted
                                ? '1px solid rgba(245,158,11,0.2)'
                                : '1px solid rgba(255,255,255,0.08)',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.background = 'rgba(245,158,11,0.15)';
                              (e.currentTarget as HTMLElement).style.color = '#F59E0B';
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = isCompleted
                                ? 'rgba(245,158,11,0.1)'
                                : 'rgba(255,255,255,0.06)';
                              (e.currentTarget as HTMLElement).style.color = isCompleted ? '#F59E0B' : '#94A3B8';
                            }}
                          >
                            <Play size={9} />
                            {isCompleted ? 'Repetir' : 'Ver'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'settings' && (
            <div className="p-5 space-y-4">
              {/* Toggle: Guías activas */}
              <ToggleRow
                icon={<BookOpen size={15} />}
                label="Guías de onboarding"
                description="Muestra el modal de bienvenida al entrar a cada módulo por primera vez."
                enabled={state.guidesEnabled}
                onChange={setGuidesEnabled}
              />

              {/* Toggle: Ayuda contextual */}
              <ToggleRow
                icon={<Sparkles size={15} />}
                label="Ayuda contextual"
                description="Muestra botones de ayuda y tooltips dentro del sistema."
                enabled={state.contextualHelpEnabled}
                onChange={setContextualHelpEnabled}
              />

              {/* Reset all */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: 'rgba(239,68,68,0.05)',
                  border: '1px solid rgba(239,68,68,0.12)',
                }}
              >
                <div className="flex items-start gap-3">
                  <RotateCcw size={15} style={{ color: '#EF4444', marginTop: 1 }} />
                  <div className="flex-1">
                    <p className="text-xs font-semibold mb-0.5" style={{ color: '#FCA5A5' }}>
                      Reiniciar todo el onboarding
                    </p>
                    <p className="text-[10px] mb-3" style={{ color: '#64748B' }}>
                      Borra el progreso de todos los módulos. Los modales de bienvenida volverán a aparecer.
                    </p>

                    {!confirmReset ? (
                      <button
                        onClick={() => setConfirmReset(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: 'rgba(239,68,68,0.1)',
                          color: '#F87171',
                          border: '1px solid rgba(239,68,68,0.2)',
                        }}
                      >
                        <RotateCcw size={11} />
                        Reiniciar progreso
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#F87171' }}>
                          <AlertTriangle size={11} />
                          ¿Confirmar reinicio?
                        </div>
                        <button
                          onClick={handleResetAll}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold"
                          style={{ background: '#EF4444', color: 'white' }}
                        >
                          Sí, reiniciar
                        </button>
                        <button
                          onClick={() => setConfirmReset(false)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes helpCenterIn {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────

function ToggleRow({
  icon,
  label,
  description,
  enabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-xl"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="mt-0.5" style={{ color: enabled ? '#F59E0B' : '#475569' }}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold mb-0.5" style={{ color: '#CBD5E1' }}>
          {label}
        </p>
        <p className="text-[10px]" style={{ color: '#64748B' }}>
          {description}
        </p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className="flex-shrink-0 mt-0.5 transition-colors"
        style={{ color: enabled ? '#F59E0B' : '#334155' }}
        aria-label={enabled ? 'Desactivar' : 'Activar'}
      >
        {enabled
          ? <ToggleRight size={22} />
          : <ToggleLeft size={22} />
        }
      </button>
    </div>
  );
}
