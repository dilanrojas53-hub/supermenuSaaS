/**
 * teamIntelligence.ts — Helpers determinísticos para el módulo Team Intelligence
 * 
 * Toda la lógica es basada en reglas, sin dependencia de IA.
 * La capa de IA (resúmenes, recomendaciones en lenguaje natural) está preparada
 * como extensión futura en la sección "AI_READY" marcada con comentarios.
 */

// ─── Tipos base ───────────────────────────────────────────────────────────────

export interface StaffEvent {
  id: string;
  tenant_id: string;
  staff_id: string;
  staff_name: string;
  event_type: 'order_accepted' | 'order_ready' | 'order_delivered' | 'quick_request_attended' | string;
  order_id: string;
  order_number: number;
  table_number?: string | null;
  response_time_seconds?: number | null;
  metadata?: Record<string, any> | null;
  created_at: string;
}

export interface StaffMemberMetrics {
  // Identidad
  name: string;
  staffId: string;

  // Volumen
  ordersAccepted: number;
  ordersDelivered: number;
  quickRequests: number;

  // Tiempos (segundos)
  avgAcceptTimeSec: number;     // tiempo desde creación hasta aceptación
  avgDeliverTimeSec: number;    // tiempo desde aceptación hasta entrega
  acceptTimes: number[];
  deliverTimes: number[];

  // Cobros (calculados desde orders si se pasan)
  ordersCobradas: number;
  totalRevenue: number;
  avgTicket: number;

  // Consistencia: % de pedidos aceptados que también fueron entregados
  consistencyRate: number;      // 0-100

  // Score
  score: number;                // 0-100
  scoreLabel: 'excelente' | 'bien' | 'atencion' | 'critico';
  scoreExplanation: string[];   // frases explicando el score

  // Coaching
  strengths: string[];
  improvements: string[];

  // Datos suficientes para evaluar
  hasSufficientData: boolean;   // false si < 3 eventos
}

export interface TeamSummary {
  totalAccepted: number;
  totalDelivered: number;
  totalQuickRequests: number;
  avgAcceptTimeSec: number;
  avgDeliverTimeSec: number;
  activeStaffCount: number;
  deliveryRate: number;         // % entregados / aceptados
}

export interface GerentialAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  staffName?: string;
  title: string;
  detail: string;
  action: string;               // qué hacer al respecto
}

// ─── Umbrales configurables ───────────────────────────────────────────────────

export const THRESHOLDS = {
  // Tiempos en segundos
  ACCEPT_TIME_FAST: 60,         // < 60s = rápido
  ACCEPT_TIME_SLOW: 180,        // > 180s = lento
  ACCEPT_TIME_CRITICAL: 300,    // > 5min = crítico
  DELIVER_TIME_FAST: 300,       // < 5min = rápido
  DELIVER_TIME_SLOW: 600,       // > 10min = lento

  // Volumen mínimo para evaluar
  MIN_EVENTS_FOR_SCORE: 3,

  // Consistencia
  CONSISTENCY_GOOD: 80,         // > 80% = bien
  CONSISTENCY_LOW: 50,          // < 50% = atención

  // Cobro
  COBRO_RATE_GOOD: 85,          // > 85% cobrado = bien
  COBRO_RATE_LOW: 60,           // < 60% cobrado = atención

  // Score pesos (deben sumar 100)
  SCORE_WEIGHTS: {
    acceptTime: 30,
    deliveredRate: 25,
    cobroRate: 20,
    quickRequests: 10,
    consistency: 15,
  },
};

// ─── Función principal: calcular métricas por empleado ───────────────────────

export function computeStaffMetrics(
  events: StaffEvent[],
  ordersMap?: Map<string, { payment_status: string; total: number }>
): StaffMemberMetrics[] {
  const byStaff: Record<string, {
    name: string;
    staffId: string;
    ordersAccepted: number;
    ordersDelivered: number;
    quickRequests: number;
    acceptTimes: number[];
    deliverTimes: number[];
    orderIds: Set<string>;
    cobradas: number;
    revenue: number;
  }> = {};

  events.forEach(e => {
    if (!byStaff[e.staff_name]) {
      byStaff[e.staff_name] = {
        name: e.staff_name,
        staffId: e.staff_id,
        ordersAccepted: 0,
        ordersDelivered: 0,
        quickRequests: 0,
        acceptTimes: [],
        deliverTimes: [],
        orderIds: new Set(),
        cobradas: 0,
        revenue: 0,
      };
    }
    const s = byStaff[e.staff_name];
    s.orderIds.add(e.order_id);

    if (e.event_type === 'order_accepted') {
      s.ordersAccepted++;
      if (e.response_time_seconds && e.response_time_seconds > 0) {
        s.acceptTimes.push(e.response_time_seconds);
      }
    }
    if (e.event_type === 'order_delivered') {
      s.ordersDelivered++;
      if (e.response_time_seconds && e.response_time_seconds > 0) {
        s.deliverTimes.push(e.response_time_seconds);
      }
    }
    if (e.event_type === 'quick_request_attended') {
      s.quickRequests++;
    }
  });

  // Enriquecer con datos de órdenes si están disponibles
  if (ordersMap) {
    Object.values(byStaff).forEach(s => {
      s.orderIds.forEach(orderId => {
        const order = ordersMap.get(orderId);
        if (order) {
          if (order.payment_status === 'paid') {
            s.cobradas++;
            s.revenue += order.total;
          }
        }
      });
    });
  }

  return Object.values(byStaff).map(s => {
    const avgAcceptTimeSec = s.acceptTimes.length
      ? Math.round(s.acceptTimes.reduce((a, b) => a + b, 0) / s.acceptTimes.length)
      : 0;
    const avgDeliverTimeSec = s.deliverTimes.length
      ? Math.round(s.deliverTimes.reduce((a, b) => a + b, 0) / s.deliverTimes.length)
      : 0;

    const consistencyRate = s.ordersAccepted > 0
      ? Math.round((s.ordersDelivered / s.ordersAccepted) * 100)
      : 0;

    const totalEvents = s.ordersAccepted + s.ordersDelivered + s.quickRequests;
    const hasSufficientData = totalEvents >= THRESHOLDS.MIN_EVENTS_FOR_SCORE;

    const avgTicket = s.cobradas > 0 ? Math.round(s.revenue / s.cobradas) : 0;

    // Calcular score
    const { score, explanation } = computeScore({
      avgAcceptTimeSec,
      ordersDelivered: s.ordersDelivered,
      ordersAccepted: s.ordersAccepted,
      cobradas: s.cobradas,
      quickRequests: s.quickRequests,
      consistencyRate,
      hasSufficientData,
    });

    const scoreLabel = getScoreLabel(score);
    const { strengths, improvements } = computeCoaching({
      avgAcceptTimeSec,
      avgDeliverTimeSec,
      consistencyRate,
      cobradas: s.cobradas,
      ordersAccepted: s.ordersAccepted,
      ordersDelivered: s.ordersDelivered,
      quickRequests: s.quickRequests,
      hasSufficientData,
    });

    return {
      name: s.name,
      staffId: s.staffId,
      ordersAccepted: s.ordersAccepted,
      ordersDelivered: s.ordersDelivered,
      quickRequests: s.quickRequests,
      avgAcceptTimeSec,
      avgDeliverTimeSec,
      acceptTimes: s.acceptTimes,
      deliverTimes: s.deliverTimes,
      ordersCobradas: s.cobradas,
      totalRevenue: s.revenue,
      avgTicket,
      consistencyRate,
      score,
      scoreLabel,
      scoreExplanation: explanation,
      strengths,
      improvements,
      hasSufficientData,
    };
  }).sort((a, b) => b.score - a.score);
}

// ─── Score determinístico ─────────────────────────────────────────────────────

function computeScore(params: {
  avgAcceptTimeSec: number;
  ordersDelivered: number;
  ordersAccepted: number;
  cobradas: number;
  quickRequests: number;
  consistencyRate: number;
  hasSufficientData: boolean;
}): { score: number; explanation: string[] } {
  const { avgAcceptTimeSec, ordersDelivered, ordersAccepted, cobradas, quickRequests, consistencyRate, hasSufficientData } = params;
  const w = THRESHOLDS.SCORE_WEIGHTS;
  const explanation: string[] = [];

  if (!hasSufficientData) {
    return { score: 0, explanation: ['Datos insuficientes para calcular score'] };
  }

  // 1. Tiempo de aceptación (30%)
  let acceptScore = 0;
  if (avgAcceptTimeSec === 0) {
    acceptScore = 50; // sin datos de tiempo
    explanation.push('Sin datos de tiempo de aceptación');
  } else if (avgAcceptTimeSec <= THRESHOLDS.ACCEPT_TIME_FAST) {
    acceptScore = 100;
    explanation.push(`✅ Acepta pedidos rápido (${fmtSec(avgAcceptTimeSec)} promedio)`);
  } else if (avgAcceptTimeSec <= THRESHOLDS.ACCEPT_TIME_SLOW) {
    acceptScore = 70;
  } else if (avgAcceptTimeSec <= THRESHOLDS.ACCEPT_TIME_CRITICAL) {
    acceptScore = 40;
    explanation.push(`⚠️ Tiempo de aceptación alto (${fmtSec(avgAcceptTimeSec)} promedio)`);
  } else {
    acceptScore = 10;
    explanation.push(`🔴 Tiempo de aceptación crítico (${fmtSec(avgAcceptTimeSec)} promedio)`);
  }

  // 2. Tasa de entrega (25%)
  const deliveryRate = ordersAccepted > 0 ? (ordersDelivered / ordersAccepted) * 100 : 0;
  let deliveryScore = 0;
  if (deliveryRate >= 90) {
    deliveryScore = 100;
    explanation.push(`✅ Alta tasa de entrega (${Math.round(deliveryRate)}%)`);
  } else if (deliveryRate >= 70) {
    deliveryScore = 70;
  } else if (deliveryRate >= 50) {
    deliveryScore = 40;
    explanation.push(`⚠️ Tasa de entrega baja (${Math.round(deliveryRate)}%)`);
  } else {
    deliveryScore = 10;
    explanation.push(`🔴 Muy pocos pedidos entregados vs aceptados`);
  }

  // 3. Tasa de cobro (20%)
  const cobroRate = ordersDelivered > 0 ? (cobradas / ordersDelivered) * 100 : 0;
  let cobroScore = 0;
  if (cobradas === 0 && ordersDelivered === 0) {
    cobroScore = 50;
  } else if (cobroRate >= THRESHOLDS.COBRO_RATE_GOOD) {
    cobroScore = 100;
    explanation.push(`✅ Buen cierre de cobros (${Math.round(cobroRate)}%)`);
  } else if (cobroRate >= THRESHOLDS.COBRO_RATE_LOW) {
    cobroScore = 60;
  } else {
    cobroScore = 20;
    explanation.push(`⚠️ Muchos pedidos entregados sin cobrar (${Math.round(cobroRate)}%)`);
  }

  // 4. Solicitudes rápidas (10%)
  let qrScore = 0;
  if (quickRequests >= 5) {
    qrScore = 100;
    explanation.push(`✅ Atiende bien las solicitudes rápidas (${quickRequests})`);
  } else if (quickRequests >= 2) {
    qrScore = 70;
  } else if (quickRequests === 1) {
    qrScore = 40;
  } else {
    qrScore = 20;
  }

  // 5. Consistencia (15%)
  let consistencyScore = 0;
  if (consistencyRate >= THRESHOLDS.CONSISTENCY_GOOD) {
    consistencyScore = 100;
  } else if (consistencyRate >= THRESHOLDS.CONSISTENCY_LOW) {
    consistencyScore = 60;
  } else {
    consistencyScore = 20;
    explanation.push(`⚠️ Baja consistencia en cierre de pedidos (${consistencyRate}%)`);
  }

  const score = Math.round(
    (acceptScore * w.acceptTime +
     deliveryScore * w.deliveredRate +
     cobroScore * w.cobroRate +
     qrScore * w.quickRequests +
     consistencyScore * w.consistency) / 100
  );

  if (explanation.length === 0) {
    explanation.push('Rendimiento dentro de parámetros normales');
  }

  return { score, explanation };
}

function getScoreLabel(score: number): 'excelente' | 'bien' | 'atencion' | 'critico' {
  if (score >= 80) return 'excelente';
  if (score >= 60) return 'bien';
  if (score >= 35) return 'atencion';
  return 'critico';
}

// ─── Coaching determinístico ──────────────────────────────────────────────────

function computeCoaching(params: {
  avgAcceptTimeSec: number;
  avgDeliverTimeSec: number;
  consistencyRate: number;
  cobradas: number;
  ordersAccepted: number;
  ordersDelivered: number;
  quickRequests: number;
  hasSufficientData: boolean;
}): { strengths: string[]; improvements: string[] } {
  const { avgAcceptTimeSec, avgDeliverTimeSec, consistencyRate, cobradas, ordersAccepted, ordersDelivered, quickRequests, hasSufficientData } = params;
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (!hasSufficientData) {
    return { strengths: [], improvements: ['Necesita más actividad para evaluar'] };
  }

  // Fortalezas
  if (avgAcceptTimeSec > 0 && avgAcceptTimeSec <= THRESHOLDS.ACCEPT_TIME_FAST) {
    strengths.push('Acepta pedidos rápidamente — excelente tiempo de respuesta');
  }
  if (avgDeliverTimeSec > 0 && avgDeliverTimeSec <= THRESHOLDS.DELIVER_TIME_FAST) {
    strengths.push('Entrega pedidos con rapidez — buena velocidad de servicio');
  }
  if (consistencyRate >= THRESHOLDS.CONSISTENCY_GOOD) {
    strengths.push('Alta consistencia — cierra bien los pedidos que acepta');
  }
  const cobroRate = ordersDelivered > 0 ? (cobradas / ordersDelivered) * 100 : 0;
  if (cobroRate >= THRESHOLDS.COBRO_RATE_GOOD) {
    strengths.push('Buen cierre de cobros — no deja pedidos sin cobrar');
  }
  if (quickRequests >= 3) {
    strengths.push('Atiende bien las solicitudes rápidas de los clientes');
  }
  if (ordersDelivered >= 10) {
    strengths.push('Alto volumen de pedidos entregados — empleado productivo');
  }

  // Áreas de mejora
  if (avgAcceptTimeSec > THRESHOLDS.ACCEPT_TIME_SLOW) {
    improvements.push(`Reducir tiempo de aceptación (actualmente ${fmtSec(avgAcceptTimeSec)}) — meta: menos de 3 min`);
  }
  if (avgDeliverTimeSec > THRESHOLDS.DELIVER_TIME_SLOW) {
    improvements.push(`Mejorar velocidad de entrega (actualmente ${fmtSec(avgDeliverTimeSec)}) — revisar flujo de trabajo`);
  }
  if (consistencyRate < THRESHOLDS.CONSISTENCY_LOW && ordersAccepted >= 3) {
    improvements.push('Mejorar tasa de cierre — muchos pedidos aceptados sin entregar');
  }
  if (cobroRate < THRESHOLDS.COBRO_RATE_LOW && ordersDelivered >= 3) {
    improvements.push('Mejorar cierre de cobros — varios pedidos entregados sin registrar pago');
  }
  if (quickRequests === 0 && ordersAccepted >= 5) {
    improvements.push('Prestar más atención a solicitudes rápidas de los clientes');
  }

  // Si no hay nada específico
  if (strengths.length === 0) strengths.push('Participación activa en el equipo');
  if (improvements.length === 0) improvements.push('Mantener el ritmo actual — rendimiento estable');

  return { strengths, improvements };
}

// ─── Resumen del equipo ───────────────────────────────────────────────────────

export function computeTeamSummary(metrics: StaffMemberMetrics[]): TeamSummary {
  if (metrics.length === 0) {
    return { totalAccepted: 0, totalDelivered: 0, totalQuickRequests: 0, avgAcceptTimeSec: 0, avgDeliverTimeSec: 0, activeStaffCount: 0, deliveryRate: 0 };
  }

  const totalAccepted = metrics.reduce((s, m) => s + m.ordersAccepted, 0);
  const totalDelivered = metrics.reduce((s, m) => s + m.ordersDelivered, 0);
  const totalQuickRequests = metrics.reduce((s, m) => s + m.quickRequests, 0);

  const allAcceptTimes = metrics.flatMap(m => m.acceptTimes);
  const allDeliverTimes = metrics.flatMap(m => m.deliverTimes);

  const avgAcceptTimeSec = allAcceptTimes.length
    ? Math.round(allAcceptTimes.reduce((a, b) => a + b, 0) / allAcceptTimes.length)
    : 0;
  const avgDeliverTimeSec = allDeliverTimes.length
    ? Math.round(allDeliverTimes.reduce((a, b) => a + b, 0) / allDeliverTimes.length)
    : 0;

  const deliveryRate = totalAccepted > 0 ? Math.round((totalDelivered / totalAccepted) * 100) : 0;

  return {
    totalAccepted,
    totalDelivered,
    totalQuickRequests,
    avgAcceptTimeSec,
    avgDeliverTimeSec,
    activeStaffCount: metrics.length,
    deliveryRate,
  };
}

// ─── Alertas gerenciales ──────────────────────────────────────────────────────

export function computeAlerts(
  metrics: StaffMemberMetrics[],
  prevMetrics?: StaffMemberMetrics[]
): GerentialAlert[] {
  const alerts: GerentialAlert[] = [];
  let alertId = 0;

  metrics.forEach(m => {
    if (!m.hasSufficientData) return;

    // Alerta: tiempo de aceptación crítico
    if (m.avgAcceptTimeSec > THRESHOLDS.ACCEPT_TIME_CRITICAL && m.acceptTimes.length >= 2) {
      alerts.push({
        id: `alert_${alertId++}`,
        type: 'critical',
        staffName: m.name,
        title: `${m.name} tarda demasiado en aceptar pedidos`,
        detail: `Promedio de ${fmtSec(m.avgAcceptTimeSec)} — los clientes esperan más de lo aceptable`,
        action: 'Hablar con el empleado, revisar si tiene demasiada carga o si necesita apoyo',
      });
    } else if (m.avgAcceptTimeSec > THRESHOLDS.ACCEPT_TIME_SLOW && m.acceptTimes.length >= 3) {
      alerts.push({
        id: `alert_${alertId++}`,
        type: 'warning',
        staffName: m.name,
        title: `${m.name} tiene tiempo de aceptación elevado`,
        detail: `Promedio de ${fmtSec(m.avgAcceptTimeSec)} — meta recomendada: menos de 3 minutos`,
        action: 'Monitorear y dar retroalimentación en la próxima reunión de equipo',
      });
    }

    // Alerta: pedidos entregados pero no cobrados
    const cobroRate = m.ordersDelivered > 0 ? (m.ordersCobradas / m.ordersDelivered) * 100 : 100;
    if (m.ordersDelivered >= 3 && cobroRate < THRESHOLDS.COBRO_RATE_LOW) {
      alerts.push({
        id: `alert_${alertId++}`,
        type: 'warning',
        staffName: m.name,
        title: `${m.name}: muchos pedidos entregados sin cobrar`,
        detail: `Solo ${Math.round(cobroRate)}% de pedidos entregados tienen cobro registrado`,
        action: 'Verificar si hay problema con el proceso de cobro o si los pedidos se cobran fuera del sistema',
      });
    }

    // Alerta: baja consistencia
    if (m.ordersAccepted >= 5 && m.consistencyRate < THRESHOLDS.CONSISTENCY_LOW) {
      alerts.push({
        id: `alert_${alertId++}`,
        type: 'warning',
        staffName: m.name,
        title: `${m.name}: baja tasa de cierre de pedidos`,
        detail: `Acepta pedidos pero solo cierra el ${m.consistencyRate}% — puede indicar pedidos abandonados`,
        action: 'Revisar pedidos sin cerrar y verificar si hay problemas operativos',
      });
    }
  });

  // Alerta: diferencia grande entre empleados del mismo período
  if (metrics.length >= 2) {
    const withData = metrics.filter(m => m.hasSufficientData && m.ordersDelivered > 0);
    if (withData.length >= 2) {
      const maxDelivered = Math.max(...withData.map(m => m.ordersDelivered));
      const minDelivered = Math.min(...withData.map(m => m.ordersDelivered));
      if (maxDelivered > 0 && minDelivered / maxDelivered < 0.3) {
        const top = withData.find(m => m.ordersDelivered === maxDelivered);
        const bottom = withData.find(m => m.ordersDelivered === minDelivered);
        if (top && bottom) {
          alerts.push({
            id: `alert_${alertId++}`,
            type: 'warning',
            title: 'Desbalance de carga entre empleados',
            detail: `${top.name} entregó ${maxDelivered} pedidos vs ${bottom.name} con ${minDelivered} — diferencia significativa`,
            action: 'Revisar si la distribución de mesas o turnos es equitativa',
          });
        }
      }
    }
  }

  // Alerta: caída vs período anterior
  if (prevMetrics && prevMetrics.length > 0) {
    metrics.forEach(m => {
      const prev = prevMetrics.find(p => p.name === m.name);
      if (!prev || !prev.hasSufficientData || !m.hasSufficientData) return;
      if (prev.ordersDelivered > 0) {
        const drop = ((prev.ordersDelivered - m.ordersDelivered) / prev.ordersDelivered) * 100;
        if (drop > 40) {
          alerts.push({
            id: `alert_${alertId++}`,
            type: 'warning',
            staffName: m.name,
            title: `${m.name}: caída fuerte vs período anterior`,
            detail: `Pasó de ${prev.ordersDelivered} a ${m.ordersDelivered} pedidos entregados (-${Math.round(drop)}%)`,
            action: 'Verificar si hubo cambio de turno, ausencia o problema personal',
          });
        }
      }
    });
  }

  // Ordenar: críticos primero
  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.type] - order[b.type];
  });
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export function fmtSec(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const totalSec = Math.round(sec);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;
  if (totalMin < 60) {
    return remSec > 0 ? `${totalMin}m ${remSec}s` : `${totalMin}m`;
  }
  const h = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  if (h < 24) {
    return remMin > 0 ? `${h}h ${remMin}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
}

export function getScoreColor(label: StaffMemberMetrics['scoreLabel']): string {
  switch (label) {
    case 'excelente': return '#22c55e';
    case 'bien':      return '#3b82f6';
    case 'atencion':  return '#f59e0b';
    case 'critico':   return '#ef4444';
  }
}

export function getScoreBg(label: StaffMemberMetrics['scoreLabel']): string {
  switch (label) {
    case 'excelente': return 'rgba(34,197,94,0.12)';
    case 'bien':      return 'rgba(59,130,246,0.12)';
    case 'atencion':  return 'rgba(245,158,11,0.12)';
    case 'critico':   return 'rgba(239,68,68,0.12)';
  }
}

export function getScoreText(label: StaffMemberMetrics['scoreLabel']): string {
  switch (label) {
    case 'excelente': return 'Excelente';
    case 'bien':      return 'Bien';
    case 'atencion':  return 'Atención';
    case 'critico':   return 'Crítico';
  }
}

// ─── AI_READY: Preparación para capa de IA futura ─────────────────────────────
// Las siguientes interfaces y funciones están preparadas para ser implementadas
// con un LLM en una fase futura. Por ahora retornan null/vacío.

export interface AIInsight {
  type: 'summary' | 'recommendation' | 'weekly_report';
  content: string;
  generatedAt: string;
}

// Firma preparada para futura integración con OpenAI/Gemini
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateAIInsights(
  _metrics: StaffMemberMetrics[],
  _summary: TeamSummary,
  _alerts: GerentialAlert[],
  _period: string
): Promise<AIInsight | null> {
  // TODO: Implementar en Fase 2 con llamada a LLM
  // Ejemplo: const response = await openai.chat.completions.create({...})
  return null;
}
