/**
 * AI Business Insights — Módulo principal
 * Fase 1: Lectura e interpretación de datos de analítica.
 *
 * Para Fase 2 (reportes automáticos):
 * - Importar AIInsightDigest y rawContext para serializar y enviar por email/WhatsApp
 * - Usar generateAIInsightDigest directamente desde un worker/cron
 * - Los tipos ya están listos para digest por Team Intelligence y Promociones
 */

export type {
  AIAnalyticsContext,
  AIInsightDigest,
  AIInsightState,
  AIInsightStatus,
  AIInsightCacheEntry,
  InsightItem,
  InsightConfidence,
  InsightPeriod,
} from './types';

export { PERIOD_LABELS, CACHE_TTL } from './types';

export type { RawAnalyticsData } from './aiSafeContextBuilder';
export { buildAISafeContext } from './aiSafeContextBuilder';

export { buildAIPrompt } from './aiPromptBuilder';

export {
  generateAIInsightDigest,
  readCache,
  invalidateCache,
} from './analyticsAIDigest';

export { useAIInsights } from './useAIInsights';
