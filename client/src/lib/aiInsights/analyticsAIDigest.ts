/**
 * analyticsAIDigest
 * Servicio principal de AI Business Insights.
 * - Llama a la API de OpenAI (gpt-4.1-mini) con contexto curado
 * - Maneja caché por período en localStorage
 * - Valida y parsea la respuesta
 * - Fallback limpio si la IA falla
 *
 * Fase 1: Solo lectura e interpretación.
 */

import type {
  AIAnalyticsContext,
  AIInsightDigest,
  AIInsightCacheEntry,
  InsightPeriod,
} from './types';
import { CACHE_TTL } from './types';

// ─── Clave de caché en localStorage ───────────────────────────────────────
function cacheKey(restaurantSlug: string, period: InsightPeriod): string {
  return `supermenu_ai_insight_${restaurantSlug}_${period}`;
}

// ─── Leer caché ───────────────────────────────────────────────────────────
export function readCache(
  restaurantSlug: string,
  period: InsightPeriod
): AIInsightDigest | null {
  try {
    const raw = localStorage.getItem(cacheKey(restaurantSlug, period));
    if (!raw) return null;
    const entry: AIInsightCacheEntry = JSON.parse(raw);
    const ttl = CACHE_TTL[period];
    if (Date.now() - entry.cachedAt > ttl) {
      localStorage.removeItem(cacheKey(restaurantSlug, period));
      return null;
    }
    return entry.digest;
  } catch {
    return null;
  }
}

// ─── Escribir caché ───────────────────────────────────────────────────────
function writeCache(
  restaurantSlug: string,
  period: InsightPeriod,
  digest: AIInsightDigest
): void {
  try {
    const entry: AIInsightCacheEntry = {
      digest,
      cachedAt: Date.now(),
      period,
    };
    localStorage.setItem(cacheKey(restaurantSlug, period), JSON.stringify(entry));
  } catch {
    // localStorage lleno o no disponible — ignorar silenciosamente
  }
}

// ─── Invalidar caché de un período ────────────────────────────────────────
export function invalidateCache(restaurantSlug: string, period: InsightPeriod): void {
  try {
    localStorage.removeItem(cacheKey(restaurantSlug, period));
  } catch { /* noop */ }
}

// ─── Validar y parsear respuesta de la IA ─────────────────────────────────
function parseAIResponse(raw: string, ctx: AIAnalyticsContext): AIInsightDigest {
  // Limpiar posible markdown que el modelo incluya a pesar de las instrucciones
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  // Validar estructura mínima
  if (typeof parsed.executiveSummary !== 'string') {
    throw new Error('Respuesta inválida: falta executiveSummary');
  }

  const ensureArray = (v: unknown) => Array.isArray(v) ? v : [];
  const ensureInsightItems = (arr: unknown[]) =>
    arr.map((item: any) => ({
      text: String(item?.text || ''),
      confidence: (['high', 'medium', 'low', 'inference'].includes(item?.confidence)
        ? item.confidence
        : 'medium') as 'high' | 'medium' | 'low' | 'inference',
      dataNote: item?.dataNote ? String(item.dataNote) : undefined,
    })).filter(i => i.text.length > 0);

  return {
    period: ctx.period,
    generatedAt: new Date().toISOString(),
    restaurantName: ctx.restaurantName,
    executiveSummary: String(parsed.executiveSummary),
    highlights: ensureInsightItems(ensureArray(parsed.highlights)),
    concerns: ensureInsightItems(ensureArray(parsed.concerns)),
    actions: ensureInsightItems(ensureArray(parsed.actions)),
    signals: ensureInsightItems(ensureArray(parsed.signals)),
    dataNote: String(parsed.dataNote || 'Análisis basado en datos del período seleccionado.'),
    hasEnoughData: parsed.hasEnoughData !== false,
    insufficientDataReason: parsed.insufficientDataReason,
    rawContext: ctx,
  };
}

// ─── Fallback cuando no hay suficientes datos ─────────────────────────────
function buildInsufficientDataDigest(ctx: AIAnalyticsContext): AIInsightDigest {
  return {
    period: ctx.period,
    generatedAt: new Date().toISOString(),
    restaurantName: ctx.restaurantName,
    executiveSummary: `No hay suficientes datos para el período "${ctx.periodLabel}". Se necesitan al menos 5 pedidos para generar un análisis significativo.`,
    highlights: [],
    concerns: [],
    actions: [
      {
        text: 'Asegúrate de que los pedidos del período estén registrados correctamente en el sistema.',
        confidence: 'high',
        dataNote: 'Basado en ausencia de datos en el período seleccionado.',
      },
    ],
    signals: [],
    dataNote: 'Datos insuficientes para análisis.',
    hasEnoughData: false,
    insufficientDataReason: `Solo ${ctx.totalOrders} pedidos en el período "${ctx.periodLabel}".`,
    rawContext: ctx,
  };
}

// ─── Servicio principal ───────────────────────────────────────────────────
export async function generateAIInsightDigest(
  ctx: AIAnalyticsContext,
  restaurantSlug: string,
  forceRefresh = false
): Promise<AIInsightDigest> {
  // 1. Verificar si hay suficientes datos
  if (ctx.totalOrders < 5) {
    return buildInsufficientDataDigest(ctx);
  }

  // 2. Revisar caché
  if (!forceRefresh) {
    const cached = readCache(restaurantSlug, ctx.period);
    if (cached) return cached;
  }

  // 3. Llamar al endpoint del servidor (la API key nunca se expone al cliente)
  const response = await fetch('/api/ai-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context: ctx }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  if (!data.digest) {
    throw new Error('Respuesta vacía del servidor');
  }

  // 4. El servidor ya devuelve el digest parseado y validado
  const digest: AIInsightDigest = { ...data.digest, rawContext: ctx };

  // 6. Guardar en caché
  writeCache(restaurantSlug, ctx.period, digest);

  return digest;
}
