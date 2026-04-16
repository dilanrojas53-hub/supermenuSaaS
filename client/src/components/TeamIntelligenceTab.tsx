/**
 * TeamIntelligenceTab — v1.0
 * Panel gerencial de rendimiento del equipo para SmartMenu SaaS.
 * 
 * Secciones:
 *  1. Resumen general del equipo (KPI cards)
 *  2. Tabla/tarjetas por empleado con score
 *  3. Score explicable (determinístico, sin IA)
 *  4. Alertas gerenciales automáticas
 *  5. Comparativa de períodos (hoy / ayer / 7d / 30d)
 *  6. Vista de coaching por empleado
 * 
 * La capa de IA está preparada como extensión futura (ver teamIntelligence.ts).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Users, Clock, CheckCircle2, AlertCircle,
  Zap, DollarSign, ChevronRight, ChevronDown, X, BarChart3,
  Shield, Star, ArrowUp, ArrowDown, Minus, Activity, Target,
  Award, AlertTriangle, Info, RefreshCw, Loader2, UserCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Tenant } from '@/lib/types';
import {
  computeStaffMetrics,
  computeTeamSummary,
  computeAlerts,
  fmtSec,
  getScoreColor,
  getScoreBg,
  getScoreText,
  type StaffEvent,
  type StaffMemberMetrics,
  type TeamSummary,
  type GerentialAlert,
} from '@/lib/teamIntelligence';

// ─── Tipos locales ────────────────────────────────────────────────────────────

type Period = 'today' | 'yesterday' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Últimos 7 días',
  month: 'Últimos 30 días',
};

function getPeriodRange(period: Period): { since: Date; until: Date } {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  switch (period) {
    case 'today':
      return { since: today, until: now };
    case 'yesterday': {
      const yStart = new Date(today); yStart.setDate(today.getDate() - 1);
      const yEnd = new Date(today);
      return { since: yStart, until: yEnd };
    }
    case 'week': {
      const w = new Date(now); w.setDate(now.getDate() - 7);
      return { since: w, until: now };
    }
    case 'month': {
      const m = new Date(now); m.setDate(now.getDate() - 30);
      return { since: m, until: now };
    }
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TeamIntelligenceTab({ tenant }: { tenant: Tenant }) {
  const [period, setPeriod] = useState<Period>('today');
  const [events, setEvents] = useState<StaffEvent[]>([]);
  const [prevEvents, setPrevEvents] = useState<StaffEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffMemberMetrics | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'alerts' | 'coaching'>('overview');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { since, until } = getPeriodRange(period);

    // Período actual
    const { data: current } = await supabase
      .from('staff_events')
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('created_at', since.toISOString())
      .lte('created_at', until.toISOString())
      .order('created_at', { ascending: false });

    setEvents((current || []) as StaffEvent[]);

    // Período anterior (mismo rango desplazado)
    const rangeMs = until.getTime() - since.getTime();
    const prevUntil = new Date(since.getTime());
    const prevSince = new Date(since.getTime() - rangeMs);
    const { data: prev } = await supabase
      .from('staff_events')
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('created_at', prevSince.toISOString())
      .lte('created_at', prevUntil.toISOString());

    setPrevEvents((prev || []) as StaffEvent[]);
    setLoading(false);
  }, [tenant.id, period]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const metrics = useMemo(() => computeStaffMetrics(events), [events]);
  const prevMetrics = useMemo(() => computeStaffMetrics(prevEvents), [prevEvents]);
  const summary = useMemo(() => computeTeamSummary(metrics), [metrics]);
  const alerts = useMemo(() => computeAlerts(metrics, prevMetrics), [metrics, prevMetrics]);

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-2">
            <Activity size={20} className="text-amber-400" />
            Team Intelligence
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Panel gerencial de rendimiento operativo del equipo
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro de período */}
          <div className="flex gap-1 bg-[var(--bg-surface)] rounded-xl p-1 border border-[var(--border)]">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={period === p
                  ? { background: 'linear-gradient(135deg,#F59E0B,#F97316)', color: '#000' }
                  : { color: '#94a3b8' }}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          <button
            onClick={fetchEvents}
            className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Nav de secciones ── */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {([
          { key: 'overview', label: 'Resumen', icon: BarChart3 },
          { key: 'alerts',   label: `Alertas${alerts.length > 0 ? ` (${alerts.length})` : ''}`, icon: AlertTriangle },
          { key: 'coaching', label: 'Coaching', icon: Target },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px"
            style={activeSection === key
              ? { borderColor: '#F59E0B', color: '#F59E0B' }
              : { borderColor: 'transparent', color: '#64748b' }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-amber-400" />
        </div>
      ) : (
        <>
          {activeSection === 'overview' && (
            <OverviewSection
              summary={summary}
              metrics={metrics}
              prevMetrics={prevMetrics}
              period={period}
              onSelectStaff={setSelectedStaff}
            />
          )}
          {activeSection === 'alerts' && (
            <AlertsSection alerts={alerts} />
          )}
          {activeSection === 'coaching' && (
            <CoachingSection
              metrics={metrics}
              selectedStaff={selectedStaff}
              onSelectStaff={setSelectedStaff}
              events={events}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Sección: Resumen + Tabla de empleados ────────────────────────────────────

function OverviewSection({
  summary, metrics, prevMetrics, period, onSelectStaff
}: {
  summary: TeamSummary;
  metrics: StaffMemberMetrics[];
  prevMetrics: StaffMemberMetrics[];
  period: Period;
  onSelectStaff: (m: StaffMemberMetrics) => void;
}) {
  const prevSummary = useMemo(() => computeTeamSummary(prevMetrics), [prevMetrics]);

  const kpis = [
    {
      label: 'Pedidos aceptados',
      value: summary.totalAccepted,
      prev: prevSummary.totalAccepted,
      icon: CheckCircle2,
      color: '#3b82f6',
      unit: '',
    },
    {
      label: 'Pedidos entregados',
      value: summary.totalDelivered,
      prev: prevSummary.totalDelivered,
      icon: Award,
      color: '#22c55e',
      unit: '',
    },
    {
      label: 'T. prom. aceptación',
      value: summary.avgAcceptTimeSec,
      prev: prevSummary.avgAcceptTimeSec,
      icon: Clock,
      color: summary.avgAcceptTimeSec > 180 ? '#ef4444' : '#f59e0b',
      unit: 'time',
      lowerIsBetter: true,
    },
    {
      label: 'T. prom. entrega',
      value: summary.avgDeliverTimeSec,
      prev: prevSummary.avgDeliverTimeSec,
      icon: Zap,
      color: summary.avgDeliverTimeSec > 600 ? '#ef4444' : '#a78bfa',
      unit: 'time',
      lowerIsBetter: true,
    },
    {
      label: 'Solicitudes rápidas',
      value: summary.totalQuickRequests,
      prev: prevSummary.totalQuickRequests,
      icon: Zap,
      color: '#a78bfa',
      unit: '',
    },
    {
      label: 'Tasa de entrega',
      value: summary.deliveryRate,
      prev: prevSummary.deliveryRate,
      icon: Target,
      color: summary.deliveryRate >= 80 ? '#22c55e' : '#f59e0b',
      unit: '%',
    },
    {
      label: 'Staff activo',
      value: summary.activeStaffCount,
      prev: prevSummary.activeStaffCount,
      icon: Users,
      color: '#64748b',
      unit: '',
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {kpis.map(kpi => (
          <KPICard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Tabla de empleados */}
      {metrics.length === 0 ? (
        <EmptyState period={period} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-[var(--text-primary)]">
              Rendimiento por empleado
            </h3>
            <span className="text-xs text-[var(--text-secondary)]">
              {metrics.length} empleado{metrics.length !== 1 ? 's' : ''} con actividad
            </span>
          </div>
          <div className="space-y-3">
            {metrics.map((m, idx) => (
              <StaffCard
                key={m.name}
                member={m}
                rank={idx + 1}
                prevMember={prevMetrics.find(p => p.name === m.name)}
                onViewCoaching={() => onSelectStaff(m)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  label, value, prev, icon: Icon, color, unit, lowerIsBetter
}: {
  label: string;
  value: number;
  prev: number;
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  const displayValue = unit === 'time' ? fmtSec(value) : unit === '%' ? `${value}%` : value.toString();
  const diff = prev > 0 ? ((value - prev) / prev) * 100 : 0;
  const improved = lowerIsBetter ? diff < -5 : diff > 5;
  const worsened = lowerIsBetter ? diff > 5 : diff < -5;

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ backgroundColor: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex items-center justify-between">
        <Icon size={15} style={{ color }} />
        {prev > 0 && Math.abs(diff) > 5 && (
          <span
            className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              color: improved ? '#22c55e' : worsened ? '#ef4444' : '#94a3b8',
              backgroundColor: improved ? 'rgba(34,197,94,0.1)' : worsened ? 'rgba(239,68,68,0.1)' : 'rgba(148,163,184,0.1)',
            }}
          >
            {improved ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
            {Math.abs(Math.round(diff))}%
          </span>
        )}
      </div>
      <p className="text-2xl font-black" style={{ color }}>{displayValue || '—'}</p>
      <p className="text-[11px] text-[var(--text-secondary)] leading-tight">{label}</p>
    </div>
  );
}

// ─── Staff Card ───────────────────────────────────────────────────────────────

function StaffCard({
  member, rank, prevMember, onViewCoaching
}: {
  member: StaffMemberMetrics;
  rank: number;
  prevMember?: StaffMemberMetrics;
  onViewCoaching: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = getScoreColor(member.scoreLabel);
  const scoreBg = getScoreBg(member.scoreLabel);
  const scoreText = getScoreText(member.scoreLabel);

  const avatarGradients = [
    'linear-gradient(135deg,#F59E0B,#F97316)',
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#22c55e,#16a34a)',
    'linear-gradient(135deg,#3b82f6,#1d4ed8)',
    'linear-gradient(135deg,#ec4899,#be185d)',
  ];

  const deliveryRate = member.ordersAccepted > 0
    ? Math.round((member.ordersDelivered / member.ordersAccepted) * 100)
    : 0;

  const cobroRate = member.ordersDelivered > 0
    ? Math.round((member.ordersCobradas / member.ordersDelivered) * 100)
    : 0;

  // Tendencia vs período anterior
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (prevMember && prevMember.ordersDelivered > 0) {
    const diff = member.ordersDelivered - prevMember.ordersDelivered;
    if (diff > 1) trend = 'up';
    else if (diff < -1) trend = 'down';
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all"
      style={{ backgroundColor: 'rgba(20,30,48,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0"
          style={{ background: avatarGradients[(rank - 1) % avatarGradients.length] }}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>

        {/* Nombre y estado */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-black text-[var(--text-primary)]">{member.name}</p>
            {rank === 1 && member.hasSufficientData && (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
                🏆 Top
              </span>
            )}
            {trend === 'up' && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-green-400">
                <ArrowUp size={10} /> Subiendo
              </span>
            )}
            {trend === 'down' && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-400">
                <ArrowDown size={10} /> Bajando
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
            {member.ordersAccepted} aceptados · {member.ordersDelivered} entregados
          </p>
        </div>

        {/* Score badge */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {member.hasSufficientData ? (
            <>
              <span
                className="text-xs font-black px-2.5 py-1 rounded-xl"
                style={{ backgroundColor: scoreBg, color: scoreColor, border: `1px solid ${scoreColor}33` }}
              >
                {scoreText}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)]">
                Score: {member.score}/100
              </span>
            </>
          ) : (
            <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--bg-surface)] px-2 py-1 rounded-lg">
              Datos insuficientes
            </span>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors ml-1"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {/* Métricas rápidas */}
      <div
        className="grid grid-cols-4 gap-px"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      >
        {[
          { label: 'Aceptados', value: member.ordersAccepted, color: '#3b82f6' },
          { label: 'Entregados', value: member.ordersDelivered, color: '#22c55e' },
          { label: 'T. aceptación', value: fmtSec(member.avgAcceptTimeSec), color: member.avgAcceptTimeSec > 180 ? '#ef4444' : '#f59e0b' },
          { label: 'Solicitudes', value: member.quickRequests, color: '#a78bfa' },
        ].map(m => (
          <div key={m.label} className="px-3 py-2.5 text-center" style={{ backgroundColor: 'rgba(10,15,30,0.6)' }}>
            <p className="text-base font-black" style={{ color: m.color }}>{m.value || '—'}</p>
            <p className="text-[9px] text-[var(--text-secondary)] mt-0.5 leading-tight">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Detalle expandible */}
      {expanded && (
        <div className="px-5 py-4 space-y-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {/* Score bar */}
          {member.hasSufficientData && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-[var(--text-secondary)]">Score de rendimiento</span>
                <span className="text-xs font-black" style={{ color: scoreColor }}>{member.score}/100</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${member.score}%`, backgroundColor: scoreColor }}
                />
              </div>
              <div className="mt-2 space-y-1">
                {member.scoreExplanation.map((exp, i) => (
                  <p key={i} className="text-[11px] text-[var(--text-secondary)]">{exp}</p>
                ))}
              </div>
            </div>
          )}

          {/* Métricas adicionales */}
          <div className="grid grid-cols-3 gap-2">
            <MetricMini label="Cobrados" value={member.ordersCobradas} />
            <MetricMini label="Tasa entrega" value={`${deliveryRate}%`} />
            <MetricMini label="Tasa cobro" value={`${cobroRate}%`} />
            <MetricMini label="T. entrega prom." value={fmtSec(member.avgDeliverTimeSec)} />
            <MetricMini label="Ticket prom." value={member.avgTicket > 0 ? `₡${member.avgTicket.toLocaleString()}` : '—'} />
            <MetricMini label="Ingresos" value={member.totalRevenue > 0 ? `₡${member.totalRevenue.toLocaleString()}` : '—'} />
          </div>

          {/* Botón coaching */}
          <button
            onClick={onViewCoaching}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{
              backgroundColor: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.2)',
              color: '#F59E0B',
            }}
          >
            <Target size={13} />
            Ver perfil de coaching
          </button>
        </div>
      )}
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-xl px-3 py-2 text-center"
      style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <p className="text-sm font-black text-[var(--text-primary)]">{value || '—'}</p>
      <p className="text-[9px] text-[var(--text-secondary)] mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

// ─── Sección: Alertas ─────────────────────────────────────────────────────────

function AlertsSection({ alerts }: { alerts: GerentialAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-16">
        <Shield size={40} className="mx-auto mb-3 text-green-400 opacity-60" />
        <p className="text-sm font-bold text-[var(--text-primary)]">Sin alertas activas</p>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          El equipo opera dentro de parámetros normales
        </p>
      </div>
    );
  }

  const alertConfig = {
    critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', icon: AlertTriangle, label: 'Crítico' },
    warning:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', icon: AlertCircle, label: 'Atención' },
    info:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', icon: Info, label: 'Info' },
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-secondary)]">
        {alerts.length} alerta{alerts.length !== 1 ? 's' : ''} detectada{alerts.length !== 1 ? 's' : ''} — basadas en reglas operativas
      </p>
      {alerts.map(alert => {
        const cfg = alertConfig[alert.type];
        const Icon = cfg.icon;
        return (
          <div
            key={alert.id}
            className="rounded-2xl p-4 space-y-2"
            style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}
          >
            <div className="flex items-start gap-3">
              <Icon size={16} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-[var(--text-primary)]">{alert.title}</p>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ color: cfg.color, backgroundColor: `${cfg.color}22` }}
                  >
                    {cfg.label}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{alert.detail}</p>
              </div>
            </div>
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
            >
              <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wide flex-shrink-0 mt-0.5">
                Acción
              </span>
              <p className="text-xs text-[var(--text-primary)]/80">{alert.action}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sección: Coaching ────────────────────────────────────────────────────────

function CoachingSection({
  metrics, selectedStaff, onSelectStaff, events
}: {
  metrics: StaffMemberMetrics[];
  selectedStaff: StaffMemberMetrics | null;
  onSelectStaff: (m: StaffMemberMetrics | null) => void;
  events: StaffEvent[];
}) {
  if (selectedStaff) {
    return (
      <CoachingDetail
        member={selectedStaff}
        events={events.filter(e => e.staff_name === selectedStaff.name)}
        onBack={() => onSelectStaff(null)}
      />
    );
  }

  if (metrics.length === 0) {
    return <EmptyState period="today" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-secondary)]">
        Selecciona un empleado para ver su perfil de coaching detallado
      </p>
      {metrics.map(m => (
        <button
          key={m.name}
          onClick={() => onSelectStaff(m)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left transition-all hover:opacity-80"
          style={{ backgroundColor: 'rgba(30,41,59,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}
          >
            {m.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[var(--text-primary)]">{m.name}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {m.ordersDelivered} entregados · Score {m.hasSufficientData ? m.score : '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {m.hasSufficientData && (
              <span
                className="text-xs font-bold px-2 py-1 rounded-lg"
                style={{ backgroundColor: getScoreBg(m.scoreLabel), color: getScoreColor(m.scoreLabel) }}
              >
                {getScoreText(m.scoreLabel)}
              </span>
            )}
            <ChevronRight size={14} className="text-[var(--text-secondary)]" />
          </div>
        </button>
      ))}
    </div>
  );
}

function CoachingDetail({
  member, events, onBack
}: {
  member: StaffMemberMetrics;
  events: StaffEvent[];
  onBack: () => void;
}) {
  const scoreColor = getScoreColor(member.scoreLabel);
  const scoreBg = getScoreBg(member.scoreLabel);

  const recentEvents = events.slice(0, 15);

  const eventLabels: Record<string, { label: string; color: string; icon: string }> = {
    order_accepted:          { label: 'Pedido aceptado',    color: '#3b82f6', icon: '✅' },
    order_ready:             { label: 'Pedido listo',       color: '#f59e0b', icon: '🍽️' },
    order_delivered:         { label: 'Pedido entregado',   color: '#22c55e', icon: '🚀' },
    quick_request_attended:  { label: 'Solicitud atendida', color: '#a78bfa', icon: '⚡' },
  };

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ChevronRight size={12} className="rotate-180" />
        Volver al equipo
      </button>

      {/* Header del empleado */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: 'rgba(30,41,59,0.7)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#F59E0B,#F97316)' }}
          >
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-[var(--text-primary)]">{member.name}</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {member.ordersAccepted} aceptados · {member.ordersDelivered} entregados · {member.quickRequests} solicitudes
            </p>
          </div>
          {member.hasSufficientData ? (
            <div className="text-right flex-shrink-0">
              <div
                className="text-2xl font-black px-3 py-1.5 rounded-xl"
                style={{ backgroundColor: scoreBg, color: scoreColor }}
              >
                {member.score}
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">/ 100</p>
            </div>
          ) : (
            <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-surface)] px-2 py-1 rounded-lg">
              Sin datos suficientes
            </span>
          )}
        </div>

        {/* Score bar */}
        {member.hasSufficientData && (
          <div className="mt-4">
            <div className="h-2.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${member.score}%`, backgroundColor: scoreColor }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-[var(--text-secondary)]">0</span>
              <span className="text-[10px] font-bold" style={{ color: scoreColor }}>
                {getScoreText(member.scoreLabel)}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)]">100</span>
            </div>
          </div>
        )}
      </div>

      {/* Métricas del período */}
      <div>
        <h4 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-3">
          Métricas del período
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { label: 'Pedidos aceptados', value: member.ordersAccepted, color: '#3b82f6' },
            { label: 'Pedidos entregados', value: member.ordersDelivered, color: '#22c55e' },
            { label: 'Pedidos cobrados', value: member.ordersCobradas, color: '#10b981' },
            { label: 'T. aceptación prom.', value: fmtSec(member.avgAcceptTimeSec), color: member.avgAcceptTimeSec > 180 ? '#ef4444' : '#f59e0b' },
            { label: 'T. entrega prom.', value: fmtSec(member.avgDeliverTimeSec), color: '#a78bfa' },
            { label: 'Solicitudes rápidas', value: member.quickRequests, color: '#a78bfa' },
            { label: 'Consistencia', value: `${member.consistencyRate}%`, color: member.consistencyRate >= 80 ? '#22c55e' : '#f59e0b' },
            { label: 'Ticket promedio', value: member.avgTicket > 0 ? `₡${member.avgTicket.toLocaleString()}` : '—', color: '#64748b' },
            { label: 'Ingresos asociados', value: member.totalRevenue > 0 ? `₡${member.totalRevenue.toLocaleString()}` : '—', color: '#22c55e' },
          ].map(m => (
            <div
              key={m.label}
              className="rounded-xl px-3 py-3 text-center"
              style={{ backgroundColor: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-lg font-black" style={{ color: m.color }}>{m.value || '—'}</p>
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 leading-tight">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fortalezas y mejoras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Fortalezas */}
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
        >
          <h4 className="text-xs font-black text-green-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Star size={12} /> Fortalezas
          </h4>
          <ul className="space-y-2">
            {member.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-primary)]/80">
                <span className="text-green-400 flex-shrink-0 mt-0.5">✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Áreas de mejora */}
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}
        >
          <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Target size={12} /> Áreas de mejora
          </h4>
          <ul className="space-y-2">
            {member.improvements.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-primary)]/80">
                <span className="text-amber-400 flex-shrink-0 mt-0.5">→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Score explicado */}
      {member.hasSufficientData && member.scoreExplanation.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <h4 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-3">
            Por qué tiene este score
          </h4>
          <ul className="space-y-1.5">
            {member.scoreExplanation.map((exp, i) => (
              <li key={i} className="text-xs text-[var(--text-primary)]/80">{exp}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline de eventos recientes */}
      {recentEvents.length > 0 && (
        <div>
          <h4 className="text-xs font-black text-[var(--text-secondary)] uppercase tracking-widest mb-3">
            Últimos eventos
          </h4>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'rgba(30,41,59,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {recentEvents.map((e, i) => {
              const ev = eventLabels[e.event_type] || { label: e.event_type, color: '#64748b', icon: '•' };
              return (
                <div
                  key={e.id}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < recentEvents.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{ev.icon}</span>
                    <div>
                      <p className="text-xs font-bold text-[var(--text-primary)]/90">{ev.label}</p>
                      {e.order_number && (
                        <p className="text-[10px] text-[var(--text-secondary)]">
                          Pedido #{e.order_number}{e.table_number ? ` · Mesa ${e.table_number}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    {e.response_time_seconds && (
                      <p className="text-[10px] text-[var(--text-secondary)]">{fmtSec(e.response_time_seconds)}</p>
                    )}
                    <p className="text-[10px] text-[var(--text-secondary)]">
                      {new Date(e.created_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ period }: { period: Period }) {
  return (
    <div className="text-center py-16">
      <UserCheck size={40} className="mx-auto mb-3 opacity-20 text-[var(--text-secondary)]" />
      <p className="text-sm font-bold text-[var(--text-primary)]">Sin actividad registrada</p>
      <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs mx-auto">
        {period === 'today'
          ? 'Los eventos se registran cuando los meseros aceptan o entregan pedidos hoy'
          : `No hay eventos en el período seleccionado (${PERIOD_LABELS[period]})`}
      </p>
    </div>
  );
}
