/**
 * aiPromptBuilder
 * Construye el prompt robusto para el modelo de IA.
 * La IA actúa como analista de negocio para restaurantes.
 *
 * Reglas de calidad:
 * - No inventar causas sin evidencia
 * - Marcar inferencias como tales
 * - Solo datos reales del contexto
 * - Si faltan datos, decirlo claramente
 * - Lenguaje corto, claro y accionable
 */

import type { AIAnalyticsContext } from './types';

// ─── Formateo de moneda (CRC) ──────────────────────────────────────────────
function fmt(n: number): string {
  return `₡${n.toLocaleString('es-CR')}`;
}

function fmtChange(pct: number | null): string {
  if (pct === null) return '(sin datos previos)';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}% vs período anterior`;
}

// ─── Serializar el contexto como texto estructurado ───────────────────────
function serializeContext(ctx: AIAnalyticsContext): string {
  const lines: string[] = [];

  lines.push(`PERÍODO: ${ctx.periodLabel}`);
  lines.push(`RESTAURANTE: ${ctx.restaurantName}`);
  lines.push('');

  lines.push('=== KPIs PRINCIPALES ===');
  lines.push(`Ventas totales: ${fmt(ctx.totalRevenue)} (${fmtChange(ctx.revenueChange)})`);
  lines.push(`Pedidos: ${ctx.totalOrders} (${fmtChange(ctx.ordersChange)})`);
  lines.push(`Ticket promedio: ${fmt(ctx.avgTicket)} (${fmtChange(ctx.ticketChange)})`);
  lines.push(`Revenue upsell total: ${fmt(ctx.upsellRevenue)} (tasa: ${ctx.upsellRate}%)`);
  if (ctx.aiUpsellRevenue > 0) {
    lines.push(`Revenue upsell IA: ${fmt(ctx.aiUpsellRevenue)}`);
  }
  lines.push('');

  if (ctx.topProducts.length > 0) {
    lines.push('=== PRODUCTOS TOP ===');
    ctx.topProducts.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name}: ${p.count} pedidos, ${fmt(p.revenue)}`);
    });
    lines.push('');
  }

  if (ctx.fallingProducts.length > 0) {
    lines.push('=== PRODUCTOS EN CAÍDA ===');
    ctx.fallingProducts.forEach(p => {
      lines.push(`- ${p.name}: ${p.count} pedidos (caída vs período anterior)`);
    });
    lines.push('');
  }

  if (ctx.dataAvailability.hasPromos) {
    lines.push('=== PROMOCIONES Y CUPONES ===');
    lines.push(`Pedidos con promo: ${ctx.promoOrders} (${ctx.promoConversionRate}% conversión)`);
    lines.push(`Pedidos con cupón: ${ctx.couponOrders}`);
    lines.push(`Descuentos dados: ${fmt(ctx.totalDiscountGiven)}`);
    if (ctx.bestPromo) lines.push(`Mejor promo: ${ctx.bestPromo}`);
    lines.push('');
  }

  lines.push('=== DISTRIBUCIÓN HORARIA ===');
  lines.push(`Mañana (antes 12pm): ${ctx.timeBlocks.manana} pedidos`);
  lines.push(`Tarde (12pm-5pm): ${ctx.timeBlocks.tarde} pedidos`);
  lines.push(`Noche (después 5pm): ${ctx.timeBlocks.noche} pedidos`);
  if (ctx.peakHour) lines.push(`Hora pico: ${ctx.peakHour}`);
  if (ctx.peakBlock) lines.push(`Bloque pico: ${ctx.peakBlock}`);
  lines.push('');

  if (ctx.dataAvailability.hasDelivery) {
    lines.push('=== DELIVERY ===');
    lines.push(`Pedidos delivery: ${ctx.deliveryOrders} (${ctx.deliveryRate}% del total)`);
    lines.push(`Revenue delivery: ${fmt(ctx.deliveryRevenue)}`);
    lines.push('');
  }

  if (ctx.dataAvailability.hasStaff) {
    lines.push('=== EQUIPO ===');
    lines.push(`Miembros activos: ${ctx.staffCount}`);
    ctx.topStaff.forEach(s => {
      lines.push(`- ${s.name}: ${s.completed} completados, tiempo promedio ${s.avgTimeMin}min`);
    });
    lines.push('');
  }

  if (ctx.activeAlerts.length > 0) {
    lines.push('=== ALERTAS ACTIVAS ===');
    ctx.activeAlerts.forEach(a => lines.push(`- ${a}`));
    lines.push('');
  }

  // Indicar qué datos NO están disponibles
  const missing: string[] = [];
  if (!ctx.dataAvailability.hasOrders) missing.push('sin pedidos en el período');
  if (!ctx.dataAvailability.hasComparatives) missing.push('sin datos del período anterior para comparar');
  if (!ctx.dataAvailability.hasDelivery) missing.push('sin pedidos delivery');
  if (!ctx.dataAvailability.hasStaff) missing.push('sin datos de equipo');
  if (!ctx.dataAvailability.hasPromos) missing.push('sin datos de promociones');
  if (missing.length > 0) {
    lines.push('=== DATOS NO DISPONIBLES ===');
    missing.forEach(m => lines.push(`- ${m}`));
    lines.push('');
  }

  return lines.join('\n');
}

// ─── System prompt ────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres un analista de negocio especializado en restaurantes. Tu trabajo es interpretar datos operativos y de ventas para ayudar al dueño o gerente a tomar decisiones rápidas y concretas.

REGLAS ESTRICTAS:
1. Solo usa los datos que te proporcionan. No inventes causas ni conclusiones sin evidencia.
2. Si una conclusión es una inferencia (no un hecho directo), indícalo con "(inferencia)".
3. Si faltan datos para una sección, dilo claramente con "(datos insuficientes)".
4. Sé conciso. Máximo 2 oraciones por punto. Sin texto de relleno.
5. Usa lenguaje directo y ejecutivo. Nada de frases genéricas como "es importante considerar".
6. Piensa en ventas, operación, clientes y promociones.
7. No alucines. Si no tienes evidencia, no lo digas.

FORMATO DE RESPUESTA (JSON estricto, sin markdown):
{
  "executiveSummary": "3-5 líneas sobre qué está pasando en el período. Directo al grano.",
  "highlights": [
    { "text": "hallazgo positivo concreto", "confidence": "high|medium|low|inference", "dataNote": "basado en X" }
  ],
  "concerns": [
    { "text": "riesgo o problema concreto", "confidence": "high|medium|low|inference", "dataNote": "basado en X" }
  ],
  "actions": [
    { "text": "acción concreta y accionable hoy", "confidence": "high|medium|low|inference", "dataNote": "basado en X" }
  ],
  "signals": [
    { "text": "señal destacada del período", "confidence": "high|medium|low|inference", "dataNote": "basado en X" }
  ],
  "dataNote": "resumen de qué datos se usaron para este análisis",
  "hasEnoughData": true
}

Genera exactamente 2-3 highlights, 2-3 concerns, 3 actions y 2-3 signals.
Si no hay suficientes datos (menos de 5 pedidos), responde con hasEnoughData: false y explica por qué en executiveSummary.`;

// ─── Builder del prompt de usuario ───────────────────────────────────────
export function buildAIPrompt(ctx: AIAnalyticsContext): { system: string; user: string } {
  const contextText = serializeContext(ctx);

  const user = `Analiza los siguientes datos del restaurante "${ctx.restaurantName}" para el período "${ctx.periodLabel}" y genera el digest ejecutivo en JSON:

${contextText}

Responde SOLO con el JSON. Sin markdown, sin explicaciones adicionales.`;

  return { system: SYSTEM_PROMPT, user };
}
