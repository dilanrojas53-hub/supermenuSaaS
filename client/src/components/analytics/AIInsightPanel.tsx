/**
 * AIInsightPanel
 * UI premium para el AI Business Insights Digest.
 * Diseño sobrio, ejecutivo. Sin chat, sin recargado.
 *
 * Fase 1: Solo lectura e interpretación.
 */

import React, { useState } from 'react';
import {
  Sparkles, RefreshCw, TrendingUp, AlertTriangle,
  Zap, Eye, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
  Info, CheckCircle2, XCircle, Lightbulb, Activity,
} from 'lucide-react';
import type { AIInsightDigest, InsightItem, InsightConfidence, AIInsightStatus } from '@/lib/aiInsights';
import type { InsightPeriod } from '@/lib/aiInsights';
import { PERIOD_LABELS } from '@/lib/aiInsights';

// ─── Colores por confianza ─────────────────────────────────────────────────
const CONFIDENCE_CONFIG: Record<InsightConfidence, { label: string; color: string; bg: string }> = {
  high:      { label: 'Alta confianza',  color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
  medium:    { label: 'Confianza media', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)' },
  low:       { label: 'Baja confianza',  color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
  inference: { label: 'Inferencia',      color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
};

// ─── Componente: Badge de confianza ───────────────────────────────────────
function ConfidenceBadge({ confidence }: { confidence: InsightConfidence }) {
  const cfg = CONFIDENCE_CONFIG[confidence];
  if (confidence === 'high') return null; // No mostrar badge para alta confianza (es el default)
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      {confidence === 'inference' ? '~' : ''}
      {cfg.label}
    </span>
  );
}

// ─── Componente: Item de insight ──────────────────────────────────────────
function InsightRow({
  item,
  icon,
  accentColor,
}: {
  item: InsightItem;
  icon: React.ReactNode;
  accentColor: string;
}) {
  const [showNote, setShowNote] = useState(false);

  return (
    <div className="flex gap-3 py-2.5 border-b border-white/5 last:border-0">
      <div
        className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)] leading-snug">{item.text}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <ConfidenceBadge confidence={item.confidence} />
          {item.dataNote && (
            <button
              onClick={() => setShowNote(v => !v)}
              className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Info size={9} />
              <span>sustento</span>
              {showNote ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </button>
          )}
        </div>
        {showNote && item.dataNote && (
          <p className="text-[11px] text-[var(--text-secondary)] mt-1.5 italic leading-snug">
            {item.dataNote}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Componente: Sección del digest ───────────────────────────────────────
function InsightSection({
  title,
  icon,
  accentColor,
  items,
  rowIcon,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  items: InsightItem[];
  rowIcon: React.ReactNode;
  emptyText: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: accentColor }}>{icon}</span>
        <h4 className="text-xs font-black uppercase tracking-widest" style={{ color: accentColor }}>
          {title}
        </h4>
      </div>
      <div>
        {items.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] italic">{emptyText}</p>
        ) : (
          items.map((item, i) => (
            <InsightRow
              key={i}
              item={item}
              icon={rowIcon}
              accentColor={accentColor}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Componente: Loading skeleton ─────────────────────────────────────────
function AIInsightSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="rounded-2xl p-5" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 rounded-lg bg-amber-500/20" />
          <div className="h-3 w-32 rounded bg-white/10" />
          <div className="ml-auto h-3 w-16 rounded bg-white/10" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-white/8" />
          <div className="h-3 w-4/5 rounded bg-white/8" />
          <div className="h-3 w-3/5 rounded bg-white/8" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2].map(i => (
          <div key={i} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="h-2.5 w-24 rounded bg-white/10 mb-3" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-white/8" />
              <div className="h-3 w-3/4 rounded bg-white/8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Componente: Error state ───────────────────────────────────────────────
function AIInsightError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div
      className="rounded-2xl p-5 flex items-start gap-4"
      style={{ backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
    >
      <XCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-red-300">No se pudo generar el análisis</p>
        <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
        style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' }}
      >
        <RefreshCw size={11} />
        Reintentar
      </button>
    </div>
  );
}

// ─── Componente: Datos insuficientes ──────────────────────────────────────
function AIInsightInsufficient({ reason }: { reason?: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex items-start gap-4"
      style={{ backgroundColor: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.12)' }}
    >
      <Activity size={18} className="text-slate-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-slate-300">Datos insuficientes para este período</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {reason || 'Se necesitan al menos 5 pedidos para generar un análisis significativo.'}
        </p>
      </div>
    </div>
  );
}

// ─── Componente principal: AIInsightPanel ─────────────────────────────────
interface AIInsightPanelProps {
  status: AIInsightStatus;
  digest: AIInsightDigest | null;
  error: string | null;
  period: InsightPeriod;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  onRefresh: () => void;
}

export function AIInsightPanel({
  status,
  digest,
  error,
  period,
  enabled,
  onToggle,
  onRefresh,
}: AIInsightPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  // ── Header siempre visible ───────────────────────────────────────────────
  const header = (
    <div className="flex items-center gap-3">
      {/* Ícono */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: enabled
            ? 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.1))'
            : 'rgba(148,163,184,0.08)',
          border: enabled ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(148,163,184,0.15)',
        }}
      >
        <Sparkles size={15} style={{ color: enabled ? '#f59e0b' : '#64748b' }} />
      </div>

      {/* Título */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-black text-[var(--text-primary)]">AI Business Insights</h3>
          {enabled && status === 'success' && digest && (
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}
            >
              {PERIOD_LABELS[period]}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
          {enabled
            ? 'Análisis ejecutivo generado por IA sobre tus datos reales'
            : 'Activa para ver el análisis ejecutivo de tu negocio'}
        </p>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Refresh (solo cuando está activo y hay digest) */}
        {enabled && (status === 'success' || status === 'error') && (
          <button
            onClick={onRefresh}
            className="w-7 h-7 rounded-xl flex items-center justify-center transition-all hover:scale-105"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
            title="Regenerar análisis"
          >
            <RefreshCw size={12} />
          </button>
        )}
        {enabled && status === 'loading' && (
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
          >
            <RefreshCw size={12} className="animate-spin" />
          </div>
        )}

        {/* Toggle on/off */}
        <button
          onClick={() => onToggle(!enabled)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all"
          style={{
            backgroundColor: enabled ? 'rgba(245,158,11,0.1)' : 'rgba(148,163,184,0.08)',
            color: enabled ? '#f59e0b' : '#64748b',
            border: enabled ? '1px solid rgba(245,158,11,0.2)' : '1px solid rgba(148,163,184,0.12)',
          }}
          title={enabled ? 'Desactivar IA' : 'Activar IA'}
        >
          {enabled
            ? <ToggleRight size={14} />
            : <ToggleLeft size={14} />
          }
          <span className="hidden sm:inline">{enabled ? 'IA activa' : 'IA inactiva'}</span>
        </button>

        {/* Collapse */}
        {enabled && (
          <button
            onClick={() => setCollapsed(v => !v)}
            className="w-7 h-7 rounded-xl flex items-center justify-center transition-all hover:scale-105"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="rounded-3xl overflow-hidden transition-all"
      style={{
        background: enabled
          ? 'linear-gradient(135deg, rgba(245,158,11,0.04) 0%, rgba(10,15,25,0) 60%)'
          : 'transparent',
        border: enabled
          ? '1px solid rgba(245,158,11,0.15)'
          : '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)',
      }}
    >
      {/* Header */}
      <div className="p-5">{header}</div>

      {/* Body (colapsable) */}
      {enabled && !collapsed && (
        <div className="px-5 pb-5 space-y-3">
          {/* Loading */}
          {status === 'loading' && <AIInsightSkeleton />}

          {/* Error */}
          {status === 'error' && error && (
            <AIInsightError error={error} onRetry={onRefresh} />
          )}

          {/* Datos insuficientes */}
          {status === 'insufficient_data' && digest && (
            <AIInsightInsufficient reason={digest.insufficientDataReason} />
          )}

          {/* Digest completo */}
          {status === 'success' && digest && digest.hasEnoughData && (
            <>
              {/* Resumen ejecutivo */}
              <div
                className="rounded-2xl p-5"
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(251,191,36,0.02) 100%)',
                  border: '1px solid rgba(245,158,11,0.12)',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Eye size={13} className="text-amber-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                    Resumen Ejecutivo
                  </span>
                </div>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                  {digest.executiveSummary}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-3 italic">
                  {digest.dataNote}
                </p>
              </div>

              {/* Grid: Lo bueno + Lo preocupante */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InsightSection
                  title="Lo bueno"
                  icon={<TrendingUp size={13} />}
                  accentColor="#34d399"
                  items={digest.highlights}
                  rowIcon={<CheckCircle2 size={11} />}
                  emptyText="Sin hallazgos positivos destacados en este período."
                />
                <InsightSection
                  title="Lo preocupante"
                  icon={<AlertTriangle size={13} />}
                  accentColor="#f87171"
                  items={digest.concerns}
                  rowIcon={<AlertTriangle size={11} />}
                  emptyText="Sin riesgos identificados en este período."
                />
              </div>

              {/* Qué hacer hoy */}
              <InsightSection
                title="Qué hacer hoy"
                icon={<Zap size={13} />}
                accentColor="#f59e0b"
                items={digest.actions}
                rowIcon={<Lightbulb size={11} />}
                emptyText="Sin recomendaciones específicas para este período."
              />

              {/* Señales destacadas */}
              {digest.signals.length > 0 && (
                <InsightSection
                  title="Señales destacadas"
                  icon={<Activity size={13} />}
                  accentColor="#a78bfa"
                  items={digest.signals}
                  rowIcon={<Activity size={11} />}
                  emptyText="Sin señales destacadas en este período."
                />
              )}

              {/* Footer: timestamp */}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-[var(--text-secondary)]">
                  Generado {new Date(digest.generatedAt).toLocaleString('es-CR', {
                    hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'
                  })}
                </p>
                <button
                  onClick={onRefresh}
                  className="text-[10px] text-[var(--text-secondary)] hover:text-amber-400 transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={9} />
                  Actualizar análisis
                </button>
              </div>
            </>
          )}

          {/* Idle (no se ha generado aún) */}
          {status === 'idle' && (
            <div className="text-center py-6">
              <Sparkles size={24} className="text-amber-400/40 mx-auto mb-2" />
              <p className="text-sm text-[var(--text-secondary)]">
                El análisis se generará automáticamente.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Disabled state */}
      {!enabled && (
        <div className="px-5 pb-5">
          <p className="text-xs text-[var(--text-secondary)]">
            El análisis ejecutivo de IA está desactivado. Actívalo para ver interpretaciones y recomendaciones basadas en tus datos.
          </p>
        </div>
      )}
    </div>
  );
}
