/**
 * AI Business Insights — Tipos tipados
 * Fase 1: Solo lectura e interpretación. Sin acciones automáticas.
 */

// ─── Período de análisis ───────────────────────────────────────────────────
export type InsightPeriod = 'today' | 'yesterday' | 'week' | 'month';

export const PERIOD_LABELS: Record<InsightPeriod, string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'Últimos 7 días',
  month: 'Este mes',
};

// ─── Contexto curado que se envía a la IA ─────────────────────────────────
export interface AIAnalyticsContext {
  period: InsightPeriod;
  periodLabel: string;
  restaurantName: string;

  // KPIs principales
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
  upsellRevenue: number;
  upsellRate: number; // %
  aiUpsellRevenue: number;

  // Comparativa con período anterior
  revenueChange: number | null;    // % cambio vs período anterior (null si no hay datos)
  ordersChange: number | null;
  ticketChange: number | null;

  // Productos
  topProducts: Array<{ name: string; count: number; revenue: number }>;
  fallingProducts: Array<{ name: string; count: number; trend: 'falling' | 'stable' }>;

  // Promociones y cupones
  promoOrders: number;
  couponOrders: number;
  totalDiscountGiven: number;
  promoConversionRate: number; // %
  bestPromo: string | null;

  // Distribución horaria
  peakHour: string | null;       // ej. "12h"
  peakBlock: 'mañana' | 'tarde' | 'noche' | null;
  timeBlocks: { manana: number; tarde: number; noche: number };

  // Delivery
  deliveryOrders: number;
  deliveryRevenue: number;
  deliveryRate: number; // % del total

  // Equipo
  topStaff: Array<{ name: string; completed: number; avgTimeMin: number }>;
  staffCount: number;

  // Alertas activas (texto corto)
  activeAlerts: string[];

  // Datos disponibles (para que la IA sepa qué tiene)
  dataAvailability: {
    hasOrders: boolean;
    hasStaff: boolean;
    hasDelivery: boolean;
    hasPromos: boolean;
    hasComparatives: boolean;
  };
}

// ─── Bloque de insight individual ─────────────────────────────────────────
export type InsightConfidence = 'high' | 'medium' | 'low' | 'inference';

export interface InsightItem {
  text: string;
  confidence: InsightConfidence;
  dataNote?: string; // ej. "Basado en ticket promedio y volumen del período"
}

// ─── Respuesta completa del digest de IA ──────────────────────────────────
export interface AIInsightDigest {
  period: InsightPeriod;
  generatedAt: string; // ISO timestamp
  restaurantName: string;

  // Bloque 1: Resumen ejecutivo (3-5 líneas)
  executiveSummary: string;

  // Bloque 2: Lo bueno (2-3 hallazgos positivos)
  highlights: InsightItem[];

  // Bloque 3: Lo preocupante (2-3 riesgos)
  concerns: InsightItem[];

  // Bloque 4: Qué hacer hoy (3 recomendaciones)
  actions: InsightItem[];

  // Bloque 5: Señales destacadas
  signals: InsightItem[];

  // Meta
  dataNote: string; // resumen de qué datos se usaron
  hasEnoughData: boolean;
  insufficientDataReason?: string;

  // Para fase 2: digest serializable para reportes automáticos
  rawContext?: AIAnalyticsContext;
}

// ─── Estado del hook ──────────────────────────────────────────────────────
export type AIInsightStatus = 'idle' | 'loading' | 'success' | 'error' | 'disabled' | 'insufficient_data';

export interface AIInsightState {
  status: AIInsightStatus;
  digest: AIInsightDigest | null;
  error: string | null;
  lastFetchedPeriod: InsightPeriod | null;
}

// ─── Cache entry ──────────────────────────────────────────────────────────
export interface AIInsightCacheEntry {
  digest: AIInsightDigest;
  cachedAt: number; // Date.now()
  period: InsightPeriod;
}

// TTL de caché por período (ms)
export const CACHE_TTL: Record<InsightPeriod, number> = {
  today: 5 * 60 * 1000,       // 5 minutos (datos en tiempo real)
  yesterday: 60 * 60 * 1000,  // 1 hora (datos fijos)
  week: 15 * 60 * 1000,       // 15 minutos
  month: 30 * 60 * 1000,      // 30 minutos
};
