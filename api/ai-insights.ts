/**
 * ai-insights.ts — Vercel Serverless Function
 * Endpoint para AI Business Insights (Fase 1).
 *
 * Recibe un contexto curado del cliente y devuelve el digest ejecutivo.
 * La API key de OpenAI nunca se expone al cliente.
 *
 * POST /api/ai-insights
 * Body: { context: AIAnalyticsContext }
 * Response: { digest: AIInsightDigest } | { error: string }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

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
8. Responde SIEMPRE en español.

FORMATO DE RESPUESTA (JSON estricto):
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
Si no hay suficientes datos (menos de 5 pedidos), responde con hasEnoughData: false y explica en executiveSummary.`;

// ─── Formateo ─────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return `₡${n.toLocaleString("es-CR")}`;
}

function fmtChange(pct: number | null): string {
  if (pct === null) return "(sin datos previos)";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}% vs período anterior`;
}

// ─── Serializar contexto curado ───────────────────────────────────────────
function serializeContext(ctx: Record<string, unknown>): string {
  const lines: string[] = [];

  lines.push(`PERÍODO: ${ctx.periodLabel}`);
  lines.push(`RESTAURANTE: ${ctx.restaurantName}`);
  lines.push("");

  lines.push("=== KPIs PRINCIPALES ===");
  lines.push(`Ventas totales: ${fmt(ctx.totalRevenue as number)} (${fmtChange(ctx.revenueChange as number | null)})`);
  lines.push(`Pedidos: ${ctx.totalOrders} (${fmtChange(ctx.ordersChange as number | null)})`);
  lines.push(`Ticket promedio: ${fmt(ctx.avgTicket as number)} (${fmtChange(ctx.ticketChange as number | null)})`);
  lines.push(`Revenue upsell total: ${fmt(ctx.upsellRevenue as number)} (tasa: ${ctx.upsellRate}%)`);
  if ((ctx.aiUpsellRevenue as number) > 0) {
    lines.push(`Revenue upsell IA: ${fmt(ctx.aiUpsellRevenue as number)}`);
  }
  lines.push("");

  const topProducts = ctx.topProducts as Array<{ name: string; count: number; revenue: number }>;
  if (topProducts?.length > 0) {
    lines.push("=== PRODUCTOS TOP ===");
    topProducts.forEach((p, i) => {
      lines.push(`${i + 1}. ${p.name}: ${p.count} pedidos, ${fmt(p.revenue)}`);
    });
    lines.push("");
  }

  const fallingProducts = ctx.fallingProducts as Array<{ name: string; count: number }>;
  if (fallingProducts?.length > 0) {
    lines.push("=== PRODUCTOS EN CAÍDA ===");
    fallingProducts.forEach((p) => {
      lines.push(`- ${p.name}: ${p.count} pedidos (caída vs período anterior)`);
    });
    lines.push("");
  }

  const avail = ctx.dataAvailability as Record<string, boolean>;
  if (avail?.hasPromos) {
    lines.push("=== PROMOCIONES Y CUPONES ===");
    lines.push(`Pedidos con promo: ${ctx.promoOrders} (${ctx.promoConversionRate}% conversión)`);
    lines.push(`Pedidos con cupón: ${ctx.couponOrders}`);
    lines.push(`Descuentos dados: ${fmt(ctx.totalDiscountGiven as number)}`);
    lines.push("");
  }

  const timeBlocks = ctx.timeBlocks as { manana: number; tarde: number; noche: number };
  lines.push("=== DISTRIBUCIÓN HORARIA ===");
  lines.push(`Mañana (antes 12pm): ${timeBlocks?.manana ?? 0} pedidos`);
  lines.push(`Tarde (12pm-5pm): ${timeBlocks?.tarde ?? 0} pedidos`);
  lines.push(`Noche (después 5pm): ${timeBlocks?.noche ?? 0} pedidos`);
  if (ctx.peakHour) lines.push(`Hora pico: ${ctx.peakHour}`);
  if (ctx.peakBlock) lines.push(`Bloque pico: ${ctx.peakBlock}`);
  lines.push("");

  if (avail?.hasDelivery) {
    lines.push("=== DELIVERY ===");
    lines.push(`Pedidos delivery: ${ctx.deliveryOrders} (${ctx.deliveryRate}% del total)`);
    lines.push(`Revenue delivery: ${fmt(ctx.deliveryRevenue as number)}`);
    lines.push("");
  }

  const topStaff = ctx.topStaff as Array<{ name: string; completed: number; avgTimeMin: number }>;
  if (avail?.hasStaff && topStaff?.length > 0) {
    lines.push("=== EQUIPO ===");
    lines.push(`Miembros activos: ${ctx.staffCount}`);
    topStaff.forEach((s) => {
      lines.push(`- ${s.name}: ${s.completed} completados, tiempo promedio ${s.avgTimeMin}min`);
    });
    lines.push("");
  }

  const alerts = ctx.activeAlerts as string[];
  if (alerts?.length > 0) {
    lines.push("=== ALERTAS ACTIVAS ===");
    alerts.forEach((a) => lines.push(`- ${a}`));
    lines.push("");
  }

  // Indicar datos no disponibles
  const missing: string[] = [];
  if (!avail?.hasOrders) missing.push("sin pedidos en el período");
  if (!avail?.hasComparatives) missing.push("sin datos del período anterior para comparar");
  if (!avail?.hasDelivery) missing.push("sin pedidos delivery");
  if (!avail?.hasStaff) missing.push("sin datos de equipo");
  if (!avail?.hasPromos) missing.push("sin datos de promociones");
  if (missing.length > 0) {
    lines.push("=== DATOS NO DISPONIBLES ===");
    missing.forEach((m) => lines.push(`- ${m}`));
  }

  return lines.join("\n");
}

// ─── Handler principal ────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verificar API key
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "AI service not configured" });
  }

  try {
    const { context } = req.body as { context: Record<string, unknown> };

    if (!context || typeof context !== "object") {
      return res.status(400).json({ error: "Missing or invalid context" });
    }

    // Verificar datos mínimos
    const totalOrders = (context.totalOrders as number) || 0;
    if (totalOrders < 5) {
      return res.status(200).json({
        digest: {
          period: context.period,
          generatedAt: new Date().toISOString(),
          restaurantName: context.restaurantName,
          executiveSummary: `No hay suficientes datos para el período "${context.periodLabel}". Se necesitan al menos 5 pedidos para generar un análisis significativo.`,
          highlights: [],
          concerns: [],
          actions: [
            {
              text: "Asegúrate de que los pedidos del período estén registrados correctamente en el sistema.",
              confidence: "high",
              dataNote: "Basado en ausencia de datos en el período seleccionado.",
            },
          ],
          signals: [],
          dataNote: "Datos insuficientes para análisis.",
          hasEnoughData: false,
          insufficientDataReason: `Solo ${totalOrders} pedidos en el período "${context.periodLabel}".`,
        },
      });
    }

    // Construir prompt
    const contextText = serializeContext(context);
    const userPrompt = `Analiza los siguientes datos del restaurante "${context.restaurantName}" para el período "${context.periodLabel}" y genera el digest ejecutivo en JSON:\n\n${contextText}\n\nResponde SOLO con el JSON.`;

    // Llamar a OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("Empty response from model");
    }

    // Parsear respuesta
    const parsed = JSON.parse(rawContent);

    const ensureArray = (v: unknown) => (Array.isArray(v) ? v : []);
    const ensureInsightItems = (arr: unknown[]) =>
      arr
        .map((item: any) => ({
          text: String(item?.text || ""),
          confidence: ["high", "medium", "low", "inference"].includes(item?.confidence)
            ? item.confidence
            : "medium",
          dataNote: item?.dataNote ? String(item.dataNote) : undefined,
        }))
        .filter((i) => i.text.length > 0);

    const digest = {
      period: context.period,
      generatedAt: new Date().toISOString(),
      restaurantName: context.restaurantName,
      executiveSummary: String(parsed.executiveSummary || ""),
      highlights: ensureInsightItems(ensureArray(parsed.highlights)),
      concerns: ensureInsightItems(ensureArray(parsed.concerns)),
      actions: ensureInsightItems(ensureArray(parsed.actions)),
      signals: ensureInsightItems(ensureArray(parsed.signals)),
      dataNote: String(parsed.dataNote || "Análisis basado en datos del período seleccionado."),
      hasEnoughData: parsed.hasEnoughData !== false,
      insufficientDataReason: parsed.insufficientDataReason,
    };

    return res.status(200).json({ digest });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-insights] Error:", message);
    return res.status(500).json({ error: message });
  }
}
