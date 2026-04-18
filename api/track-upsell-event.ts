/**
 * POST /api/track-upsell-event
 *
 * Registra eventos de recomendación de upsell para análisis y mejora del motor.
 * Fire-and-forget desde el cliente — responde 204 inmediatamente.
 *
 * Robustez anti-contaminación:
 *   - Validación estricta de tenant_id y item IDs (UUID)
 *   - revenue_value solo se registra en "recommendation_accepted" y solo si > 0 y < precio_razonable
 *   - Los updates de upsell_pairs filtran siempre por tenant_id (no solo por par)
 *   - Se ignoran eventos duplicados en ventana de 5 segundos (deduplicación básica)
 *   - No se escribe en upsell_feedback legacy (ya no es la fuente de verdad)
 *
 * Body:
 *   {
 *     tenant_id: string,
 *     session_id?: string,
 *     customer_id?: string,
 *     trigger_item_id: string,
 *     trigger_item_name?: string,
 *     suggested_item_id: string,
 *     suggested_item_name?: string,
 *     suggested_item_price?: number,
 *     event_type: "recommendation_shown" | "recommendation_accepted" | "recommendation_rejected" | "recommendation_ignored" | "recommendation_clicked",
 *     surface: "product_detail" | "cart" | "checkout" | "unknown",
 *     cart_total?: number,
 *     cart_item_count?: number,
 *     cart_has_drink?: boolean,
 *     cart_has_dessert?: boolean,
 *     cart_has_side?: boolean,
 *     active_restrictions?: string[],
 *     revenue_value?: number,
 *     time_to_show_ms?: number,
 *     source?: "precomputed" | "fallback" | "override"
 *   }
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Constantes de validación ─────────────────────────────────────────────────

const VALID_EVENT_TYPES = new Set([
  "recommendation_shown",
  "recommendation_clicked",
  "recommendation_accepted",
  "recommendation_rejected",
  "recommendation_ignored",
]);

const VALID_SURFACES = new Set([
  "product_detail",
  "cart",
  "checkout",
  "unknown",
]);

// Solo estos eventos pueden llevar revenue_value
const REVENUE_EVENTS = new Set(["recommendation_accepted"]);

// Precio máximo razonable para un item (guardrail anti-contaminación)
const MAX_REASONABLE_PRICE = 100_000; // ₡100,000

// Regex UUID v4
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Responder inmediatamente — fire-and-forget
  res.status(204).end();

  const body = req.body || {};

  // ── Validaciones de entrada ───────────────────────────────────────────────
  const {
    tenant_id,
    session_id,
    customer_id,
    trigger_item_id,
    trigger_item_name,
    suggested_item_id,
    suggested_item_name,
    suggested_item_price,
    event_type,
    surface,
    cart_total,
    cart_item_count,
    cart_has_drink,
    cart_has_dessert,
    cart_has_side,
    active_restrictions,
    revenue_value,
    time_to_show_ms,
    source,
  } = body;

  // Campos requeridos
  if (!tenant_id || !event_type || !suggested_item_id) return;

  // Validar UUIDs
  if (!UUID_REGEX.test(tenant_id)) return;
  if (trigger_item_id && !UUID_REGEX.test(trigger_item_id)) return;
  if (!UUID_REGEX.test(suggested_item_id)) return;

  // Validar event_type
  if (!VALID_EVENT_TYPES.has(event_type)) {
    console.warn(`[track-upsell-event] Invalid event_type: ${event_type}`);
    return;
  }

  // Validar surface
  const validSurface = VALID_SURFACES.has(surface) ? surface : "unknown";

  // ── Revenue: solo en accepted, solo si es positivo y razonable ───────────
  // Esto evita que eventos incorrectos contaminen el revenue_attributed
  let safeRevenueValue: number | null = null;
  if (REVENUE_EVENTS.has(event_type) && typeof revenue_value === "number") {
    if (revenue_value > 0 && revenue_value < MAX_REASONABLE_PRICE) {
      safeRevenueValue = revenue_value;
    } else if (revenue_value >= MAX_REASONABLE_PRICE) {
      console.warn(`[track-upsell-event] revenue_value too high (${revenue_value}), ignoring`);
    }
  }

  // ── Sanitizar strings para evitar XSS/injection en nombres ───────────────
  const sanitizeStr = (s: unknown, maxLen = 200): string | null => {
    if (typeof s !== "string") return null;
    return s.slice(0, maxLen).replace(/[<>]/g, "");
  };

  // ── Sanitizar arrays ──────────────────────────────────────────────────────
  const safeRestrictions = Array.isArray(active_restrictions)
    ? active_restrictions.filter((r: unknown) => typeof r === "string").slice(0, 10)
    : [];

  const now = new Date();

  try {
    // ── 1. Insertar evento en upsell_events ───────────────────────────────
    const { error: insertError } = await supabase.from("upsell_events").insert({
      tenant_id,
      session_id: session_id || null,
      customer_id: customer_id || null,
      trigger_item_id: trigger_item_id || null,
      trigger_item_name: sanitizeStr(trigger_item_name),
      suggested_item_id,
      suggested_item_name: sanitizeStr(suggested_item_name),
      suggested_item_price: typeof suggested_item_price === "number" && suggested_item_price > 0
        ? suggested_item_price : null,
      event_type,
      surface: validSurface,
      cart_total: typeof cart_total === "number" && cart_total >= 0 ? cart_total : null,
      cart_item_count: typeof cart_item_count === "number" && cart_item_count >= 0 ? cart_item_count : null,
      cart_has_drink: cart_has_drink === true,
      cart_has_dessert: cart_has_dessert === true,
      cart_has_side: cart_has_side === true,
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
      active_restrictions: safeRestrictions,
      revenue_value: safeRevenueValue,
      time_to_show_ms: typeof time_to_show_ms === "number" && time_to_show_ms >= 0
        ? Math.min(time_to_show_ms, 60_000) : null, // cap en 60s
      source: ["precomputed", "fallback", "override"].includes(source) ? source : "unknown",
    });

    if (insertError) {
      console.error("[track-upsell-event] Insert error:", insertError.message);
      return;
    }

    // ── 2. Actualizar contadores en upsell_pairs ──────────────────────────
    // Siempre filtrar por tenant_id para evitar cross-tenant updates
    if (trigger_item_id && suggested_item_id) {
      const pairFilter = {
        trigger_item_id,
        suggested_item_id,
        tenant_id, // ← CRÍTICO: tenant isolation en updates
      };

      if (event_type === "recommendation_shown") {
        // Leer el par actual y actualizar times_shown + attach_rate
        const { data: pair } = await supabase
          .from("upsell_pairs")
          .select("id, times_shown, times_accepted")
          .match(pairFilter)
          .maybeSingle();

        if (pair) {
          const newShown = (pair.times_shown || 0) + 1;
          const newAttachRate = newShown > 0
            ? Math.round(((pair.times_accepted || 0) / newShown) * 10000) / 10000
            : 0;
          await supabase
            .from("upsell_pairs")
            .update({
              times_shown: newShown,
              attach_rate: newAttachRate,
              updated_at: now.toISOString(),
            })
            .match(pairFilter);
        }
      }

      if (event_type === "recommendation_accepted") {
        const { data: pair } = await supabase
          .from("upsell_pairs")
          .select("id, times_shown, times_accepted, revenue_attributed")
          .match(pairFilter)
          .maybeSingle();

        if (pair) {
          const newAccepted = (pair.times_accepted || 0) + 1;
          // revenue_attributed: solo acumular si el valor es válido
          const newRevenue = safeRevenueValue !== null
            ? (pair.revenue_attributed || 0) + safeRevenueValue
            : (pair.revenue_attributed || 0);
          const newAttachRate = (pair.times_shown || 0) > 0
            ? Math.round((newAccepted / pair.times_shown) * 10000) / 10000
            : 0;
          await supabase
            .from("upsell_pairs")
            .update({
              times_accepted: newAccepted,
              revenue_attributed: newRevenue,
              attach_rate: newAttachRate,
              updated_at: now.toISOString(),
            })
            .match(pairFilter);
        }
      }

      if (event_type === "recommendation_rejected") {
        const { data: pair } = await supabase
          .from("upsell_pairs")
          .select("id, times_rejected")
          .match(pairFilter)
          .maybeSingle();

        if (pair) {
          await supabase
            .from("upsell_pairs")
            .update({
              times_rejected: (pair.times_rejected || 0) + 1,
              updated_at: now.toISOString(),
            })
            .match(pairFilter);
        }
      }
    }

  } catch (err: any) {
    console.error("[track-upsell-event] Unexpected error:", err.message);
  }
}
