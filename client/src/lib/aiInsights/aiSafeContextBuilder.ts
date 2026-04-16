/**
 * aiSafeContextBuilder
 * Construye un contexto curado, limpio y seguro a partir de los datos ya calculados
 * por el sistema. NUNCA envía datos crudos a la IA.
 *
 * Fase 1: Solo lectura. Sin acciones automáticas.
 */

import type { AIAnalyticsContext, InsightPeriod } from './types';

// ─── Tipos de entrada (datos ya calculados por AnalyticsTab) ──────────────
export interface RawAnalyticsData {
  // Período
  period: InsightPeriod;
  restaurantName: string;

  // Stats del período actual
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
  upsellRevenue: number;
  upsellRate: number;
  aiUpsellRevenue: number;
  staticUpsellRevenue: number;

  // Productos
  top5: Array<{ name: string; count: number; revenue: number }>;

  // Promos
  promoOrders: number;
  couponOrders: number;
  totalDiscountGiven: number;
  promoConversionRate: number;
  couponConversionRate: number;

  // Distribución horaria
  timeBlocks: { manana: number; tarde: number; noche: number };
  hourlyData: Array<{ hour: string; pedidos: number }>;

  // Staff
  staffStats: Array<{
    name: string;
    completed: number;
    cobrados: number;
    totalRevenue: number;
    avgTimeMin: number;
  }>;

  // Delivery (opcional)
  deliveryOrders?: number;
  deliveryRevenue?: number;

  // Órdenes crudas (solo para calcular comparativas — no se envían a la IA)
  allOrders: Array<{
    created_at: string;
    total: number;
    status: string;
    items: unknown[];
    promotion_id?: string | null;
    coupon_code?: string | null;
    delivery_type?: string | null;
  }>;

  // Alertas activas (ya calculadas por el sistema)
  activeAlerts?: string[];
}

// ─── Helper: calcular stats de un conjunto de órdenes ─────────────────────
function calcPeriodStats(orders: RawAnalyticsData['allOrders']) {
  const valid = orders.filter(o => o.status !== 'cancelado');
  const revenue = valid.reduce((s, o) => s + o.total, 0);
  const count = valid.length;
  const avgTicket = count > 0 ? Math.round(revenue / count) : 0;
  return { revenue, count, avgTicket };
}

// ─── Helper: obtener órdenes del período anterior ─────────────────────────
function getPreviousPeriodOrders(
  allOrders: RawAnalyticsData['allOrders'],
  period: InsightPeriod
): RawAnalyticsData['allOrders'] {
  const now = new Date();
  switch (period) {
    case 'today': {
      const start = new Date(now); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setHours(0, 0, 0, 0);
      return allOrders.filter(o => { const d = new Date(o.created_at); return d >= start && d < end; });
    }
    case 'yesterday': {
      const start = new Date(now); start.setDate(start.getDate() - 2); start.setHours(0, 0, 0, 0);
      const end = new Date(now); end.setDate(end.getDate() - 1); end.setHours(0, 0, 0, 0);
      return allOrders.filter(o => { const d = new Date(o.created_at); return d >= start && d < end; });
    }
    case 'week': {
      const start = new Date(now); start.setDate(start.getDate() - 14);
      const end = new Date(now); end.setDate(end.getDate() - 7);
      return allOrders.filter(o => { const d = new Date(o.created_at); return d >= start && d < end; });
    }
    case 'month': {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return allOrders.filter(o => { const d = new Date(o.created_at); return d >= prevMonth && d <= prevMonthEnd; });
    }
  }
}

// ─── Helper: calcular % de cambio ─────────────────────────────────────────
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ─── Helper: detectar productos en caída ──────────────────────────────────
function detectFallingProducts(
  allOrders: RawAnalyticsData['allOrders'],
  period: InsightPeriod
): Array<{ name: string; count: number; trend: 'falling' | 'stable' }> {
  // Comparar conteo actual vs período anterior
  const prevOrders = getPreviousPeriodOrders(allOrders, period);

  const countItems = (orders: RawAnalyticsData['allOrders']) => {
    const counts: Record<string, number> = {};
    orders.filter(o => o.status !== 'cancelado').forEach(o => {
      (o.items as any[]).forEach((item: any) => {
        const key = item.name || item.id;
        if (!counts[key]) counts[key] = 0;
        counts[key] += item.quantity || 1;
      });
    });
    return counts;
  };

  const currentCounts = countItems(allOrders);
  const prevCounts = countItems(prevOrders);

  const falling: Array<{ name: string; count: number; trend: 'falling' | 'stable' }> = [];

  Object.entries(prevCounts).forEach(([name, prevCount]) => {
    const currentCount = currentCounts[name] || 0;
    if (prevCount > 2 && currentCount < prevCount * 0.6) {
      falling.push({ name, count: currentCount, trend: 'falling' });
    }
  });

  return falling.sort((a, b) => a.count - b.count).slice(0, 3);
}

// ─── Helper: hora pico ────────────────────────────────────────────────────
function getPeakHour(hourlyData: Array<{ hour: string; pedidos: number }>): string | null {
  if (!hourlyData.length) return null;
  const peak = hourlyData.reduce((max, h) => h.pedidos > max.pedidos ? h : max, hourlyData[0]);
  return peak.pedidos > 0 ? peak.hour : null;
}

function getPeakBlock(timeBlocks: { manana: number; tarde: number; noche: number }): 'mañana' | 'tarde' | 'noche' | null {
  const entries = Object.entries(timeBlocks) as [string, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;
  const peak = entries.reduce((max, e) => e[1] > max[1] ? e : max, entries[0]);
  return peak[0] as 'mañana' | 'tarde' | 'noche';
}

// ─── Builder principal ────────────────────────────────────────────────────
export function buildAISafeContext(data: RawAnalyticsData): AIAnalyticsContext {
  const prevOrders = getPreviousPeriodOrders(data.allOrders, data.period);
  const prevStats = calcPeriodStats(prevOrders);

  const revenueChange = pctChange(data.totalRevenue, prevStats.revenue);
  const ordersChange = pctChange(data.totalOrders, prevStats.count);
  const ticketChange = pctChange(data.avgTicket, prevStats.avgTicket);

  const fallingProducts = detectFallingProducts(data.allOrders, data.period);

  const deliveryOrders = data.deliveryOrders ??
    data.allOrders.filter(o => o.status !== 'cancelado' && (o as any).delivery_type === 'delivery').length;
  const deliveryRevenue = data.deliveryRevenue ??
    data.allOrders.filter(o => o.status !== 'cancelado' && (o as any).delivery_type === 'delivery')
      .reduce((s, o) => s + o.total, 0);
  const deliveryRate = data.totalOrders > 0
    ? Math.round((deliveryOrders / data.totalOrders) * 100)
    : 0;

  // Mejor promo: la que más pedidos generó
  const bestPromo: string | null = data.promoOrders > 0 ? 'promoción activa' : null;

  const peakHour = getPeakHour(data.hourlyData);
  const peakBlock = getPeakBlock(data.timeBlocks);

  return {
    period: data.period,
    periodLabel: { today: 'Hoy', yesterday: 'Ayer', week: 'Últimos 7 días', month: 'Este mes' }[data.period],
    restaurantName: data.restaurantName,

    totalRevenue: data.totalRevenue,
    totalOrders: data.totalOrders,
    avgTicket: data.avgTicket,
    upsellRevenue: data.upsellRevenue,
    upsellRate: data.upsellRate,
    aiUpsellRevenue: data.aiUpsellRevenue,

    revenueChange,
    ordersChange,
    ticketChange,

    topProducts: data.top5.slice(0, 5),
    fallingProducts,

    promoOrders: data.promoOrders,
    couponOrders: data.couponOrders,
    totalDiscountGiven: data.totalDiscountGiven,
    promoConversionRate: data.promoConversionRate,
    bestPromo,

    peakHour,
    peakBlock,
    timeBlocks: data.timeBlocks,

    deliveryOrders,
    deliveryRevenue,
    deliveryRate,

    topStaff: data.staffStats.slice(0, 3).map(s => ({
      name: s.name,
      completed: s.completed,
      avgTimeMin: s.avgTimeMin,
    })),
    staffCount: data.staffStats.length,

    activeAlerts: data.activeAlerts || [],

    dataAvailability: {
      hasOrders: data.totalOrders > 0,
      hasStaff: data.staffStats.length > 0,
      hasDelivery: deliveryOrders > 0,
      hasPromos: data.promoOrders > 0 || data.couponOrders > 0,
      hasComparatives: prevStats.count > 0,
    },
  };
}
