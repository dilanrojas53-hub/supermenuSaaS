/**
 * POST /api/track-upsell-event
 *
 * Registra eventos de recomendación de upsell para análisis y mejora del motor.
 * Fire-and-forget desde el cliente — responde 204 inmediatamente.
 *
 * Body:
 *   {
 *     tenant_id: string,
 *     session_id?: string,
 *     customer_id?: string,
 *     trigger_item_id: string,
 *     trigger_item_name: string,
 *     suggested_item_id: string,
 *     suggested_item_name: string,
 *     suggested_item_price: number,
 *     event_type: "recommendation_shown" | "recommendation_accepted" | "recommendation_rejected" | "recommendation_ignored",
 *     surface: "add_to_cart" | "cart" | "checkout",
 *     cart_total?: number,
 *     cart_item_count?: number,
 *     active_restrictions?: string[],
 *     revenue_value?: number,
 *     time_to_show_ms?: number,
 *     source?: "precomputed" | "fallback" | "override" | "gpt_cached"
 *   }
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const VALID_EVENT_TYPES = new Set([
  "recommendation_generated",
  "recommendation_shown",
  "recommendation_clicked",
  "recommendation_accepted",
  "recommendation_rejected",
  "recommendation_removed_from_cart",
  "recommendation_ignored",
]);

const VALID_SURFACES = new Set(["add_to_cart", "cart", "checkout", "unknown"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Responder inmediatamente para no bloquear la UI
  res.status(204).end();

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
    surface = "unknown",
    cart_total,
    cart_item_count,
    cart_has_drink,
    cart_has_dessert,
    cart_has_side,
    active_restrictions = [],
    revenue_value,
    time_to_show_ms,
    source = "deterministic",
  } = req.body || {};

  if (!tenant_id || !event_type) return;
  if (!VALID_EVENT_TYPES.has(event_type)) return;

  const now = new Date();

  try {
    // 1. Insertar evento
    await supabase.from("upsell_events").insert({
      tenant_id,
      session_id: session_id || null,
      customer_id: customer_id || null,
      trigger_item_id: trigger_item_id || null,
      trigger_item_name: trigger_item_name || null,
      suggested_item_id: suggested_item_id || null,
      suggested_item_name: suggested_item_name || null,
      suggested_item_price: suggested_item_price || null,
      event_type,
      surface: VALID_SURFACES.has(surface) ? surface : "unknown",
      cart_total: cart_total || null,
      cart_item_count: cart_item_count || null,
      cart_has_drink: cart_has_drink || false,
      cart_has_dessert: cart_has_dessert || false,
      cart_has_side: cart_has_side || false,
      hour_of_day: now.getHours(),
      day_of_week: now.getDay(),
      active_restrictions: active_restrictions || [],
      revenue_value: revenue_value || null,
      time_to_show_ms: time_to_show_ms || null,
      source,
    });

    // 2. Actualizar estadísticas en upsell_pairs si hay par específico
    if (trigger_item_id && suggested_item_id) {
      if (event_type === "recommendation_shown") {
        await supabase.rpc("increment_upsell_pair_shown", {
          p_trigger_id: trigger_item_id,
          p_suggested_id: suggested_item_id,
        }).catch(() => {
          // RPC puede no existir aún — fallback manual
          supabase
            .from("upsell_pairs")
            .select("id, times_shown, times_accepted, times_rejected")
            .eq("trigger_item_id", trigger_item_id)
            .eq("suggested_item_id", suggested_item_id)
            .single()
            .then(({ data: pair }) => {
              if (pair) {
                const newShown = (pair.times_shown || 0) + 1;
                const newAttachRate = pair.times_accepted / newShown;
                supabase
                  .from("upsell_pairs")
                  .update({
                    times_shown: newShown,
                    attach_rate: Math.round(newAttachRate * 10000) / 10000,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("trigger_item_id", trigger_item_id)
                  .eq("suggested_item_id", suggested_item_id);
              }
            });
        });
      }

      if (event_type === "recommendation_accepted") {
        supabase
          .from("upsell_pairs")
          .select("id, times_shown, times_accepted, revenue_attributed")
          .eq("trigger_item_id", trigger_item_id)
          .eq("suggested_item_id", suggested_item_id)
          .single()
          .then(({ data: pair }) => {
            if (pair) {
              const newAccepted = (pair.times_accepted || 0) + 1;
              const newRevenue = (pair.revenue_attributed || 0) + (revenue_value || 0);
              const newAttachRate = pair.times_shown > 0
                ? newAccepted / pair.times_shown
                : 0;
              supabase
                .from("upsell_pairs")
                .update({
                  times_accepted: newAccepted,
                  revenue_attributed: newRevenue,
                  attach_rate: Math.round(newAttachRate * 10000) / 10000,
                  updated_at: new Date().toISOString(),
                })
                .eq("trigger_item_id", trigger_item_id)
                .eq("suggested_item_id", suggested_item_id);
            }
          });
      }

      if (event_type === "recommendation_rejected") {
        supabase
          .from("upsell_pairs")
          .select("id, times_rejected")
          .eq("trigger_item_id", trigger_item_id)
          .eq("suggested_item_id", suggested_item_id)
          .single()
          .then(({ data: pair }) => {
            if (pair) {
              supabase
                .from("upsell_pairs")
                .update({
                  times_rejected: (pair.times_rejected || 0) + 1,
                  updated_at: new Date().toISOString(),
                })
                .eq("trigger_item_id", trigger_item_id)
                .eq("suggested_item_id", suggested_item_id);
            }
          });
      }
    }

    // 3. También actualizar upsell_feedback legacy para compatibilidad
    if (trigger_item_id && suggested_item_id && tenant_id) {
      const legacyAction =
        event_type === "recommendation_accepted" ? "accepted"
        : event_type === "recommendation_rejected" ? "rejected"
        : null;

      if (legacyAction) {
        supabase.from("upsell_feedback").insert({
          tenant_id,
          trigger_item_id,
          trigger_item_name: trigger_item_name || "",
          suggested_item_id,
          suggested_item_name: suggested_item_name || "",
          action: legacyAction,
        }).catch(() => {});
      }
    }

  } catch (err: any) {
    console.error("[track-upsell-event] Error:", err.message);
  }
}
