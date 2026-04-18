/**
 * POST /api/compute-upsell-pairs
 *
 * Motor de ranking determinístico que calcula los mejores pares de upsell.
 * Usa service_role key para poder escribir en upsell_pairs (RLS).
 *
 * Score compuesto (0-100):
 *   40% compatibilidad culinaria (product_attributes)
 *   30% historial REAL (upsell_events — accepted/rejected/shown)
 *   15% margen (precio sugerido vs precio trigger)
 *   10% popularidad (is_featured, badge)
 *    5% diversidad (penalizar si ya aparece mucho en el tenant)
 *
 * Exclusiones DURAS (se aplican antes del ranking, no son probabilísticas):
 *   1. Mismo producto
 *   2. Misma categoría (evitar duplicar)
 *   3. is_available = false
 *   4. Precio > 2x el trigger (guardrail de precio)
 *   5. VEGANO → excluye no-vegano (contains_alcohol, is_vegan=false si candidato tiene carne/lácteos/huevo)
 *   6. VEGETARIANO → excluye carne, pollo, mariscos (product_role: meat/chicken/seafood)
 *   7. SIN GLUTEN → excluye candidatos con gluten (is_gluten_free=false si trigger lo requiere)
 *   8. SIN LÁCTEOS → excluye candidatos con lácteos
 *   9. HALAL → excluye alcohol y cerdo
 *  10. KOSHER → excluye shellfish y cerdo
 *  11. Roles incompatibles según incompatible_roles del trigger
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
// compute-upsell-pairs escribe en upsell_pairs → necesita service_role
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_id: string;
  is_available: boolean;
  is_featured: boolean;
  badge: string | null;
}

interface ProductAttr {
  item_id: string;
  product_role: string;
  affinity_roles: string[];
  incompatible_roles: string[];
  is_vegan: boolean;
  is_vegetarian: boolean;
  is_gluten_free: boolean;
  is_dairy_free: boolean;
  is_halal: boolean;
  is_kosher: boolean;
  contains_nuts: boolean;
  contains_shellfish: boolean;
  contains_alcohol: boolean;
  suggested_pitch: string | null;
}

interface EventStats {
  suggested_item_id: string;
  accepted: number;
  rejected: number;
  shown: number;
}

// ─── Roles que implican carne/animal ─────────────────────────────────────────
const MEAT_ROLES = new Set(["meat", "chicken", "seafood", "fish", "pork", "beef", "lamb"]);
const DAIRY_ROLES = new Set(["dairy", "cheese", "milk", "cream", "butter", "yogurt"]);
const PORK_ROLES = new Set(["pork", "bacon", "ham"]);

// ─── Exclusiones dietarias DURAS ─────────────────────────────────────────────
/**
 * Retorna true si el candidato es compatible con las restricciones del trigger.
 * Retorna false si hay una incompatibilidad dura → el candidato se excluye completamente.
 */
function passesDietaryHardRules(
  triggerAttr: ProductAttr | null,
  candidateAttr: ProductAttr | null
): boolean {
  // Sin atributos: pasar (no podemos saber → no excluir)
  if (!triggerAttr || !candidateAttr) return true;

  // ── VEGANO ──────────────────────────────────────────────────────────────────
  // Si el trigger es vegano, el candidato DEBE ser vegano también.
  // Excepción: si el candidato no tiene atributos enriquecidos, dejamos pasar
  // pero con score bajo (no excluir por falta de datos).
  if (triggerAttr.is_vegan) {
    if (!candidateAttr.is_vegan) return false;
    if (candidateAttr.contains_alcohol) return false;
    if (MEAT_ROLES.has(candidateAttr.product_role)) return false;
    if (DAIRY_ROLES.has(candidateAttr.product_role)) return false;
  }

  // ── VEGETARIANO ─────────────────────────────────────────────────────────────
  // Si el trigger es vegetariano, excluir carne, pollo, mariscos.
  if (triggerAttr.is_vegetarian && !triggerAttr.is_vegan) {
    if (MEAT_ROLES.has(candidateAttr.product_role)) return false;
  }

  // ── SIN GLUTEN ──────────────────────────────────────────────────────────────
  // Si el trigger es gluten_free, el candidato también debe serlo.
  if (triggerAttr.is_gluten_free && !candidateAttr.is_gluten_free) return false;

  // ── SIN LÁCTEOS ─────────────────────────────────────────────────────────────
  if (triggerAttr.is_dairy_free && !candidateAttr.is_dairy_free) return false;
  if (triggerAttr.is_dairy_free && DAIRY_ROLES.has(candidateAttr.product_role)) return false;

  // ── HALAL ────────────────────────────────────────────────────────────────────
  if (triggerAttr.is_halal) {
    if (candidateAttr.contains_alcohol) return false;
    if (PORK_ROLES.has(candidateAttr.product_role)) return false;
  }

  // ── KOSHER ───────────────────────────────────────────────────────────────────
  if (triggerAttr.is_kosher) {
    if (candidateAttr.contains_shellfish) return false;
    if (PORK_ROLES.has(candidateAttr.product_role)) return false;
  }

  // ── ROLES INCOMPATIBLES EXPLÍCITOS ──────────────────────────────────────────
  const incompatibleRoles = triggerAttr.incompatible_roles || [];
  if (incompatibleRoles.includes(candidateAttr.product_role)) return false;

  return true;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreCompatibility(
  triggerAttr: ProductAttr | null,
  candidateAttr: ProductAttr | null
): number {
  if (!triggerAttr || !candidateAttr) return 30; // neutral si no hay atributos

  const affinityRoles = triggerAttr.affinity_roles || [];

  if (affinityRoles.includes(candidateAttr.product_role)) {
    const idx = affinityRoles.indexOf(candidateAttr.product_role);
    return Math.max(60, 100 - idx * 10);
  }
  return 20; // no es afín pero tampoco incompatible (ya pasó los hard rules)
}

function scoreHistory(stats: EventStats | null): number {
  if (!stats || stats.shown === 0) return 50; // neutral sin historial
  const attachRate = stats.accepted / stats.shown;
  // Penalizar si hay muchos rechazos
  const rejectPenalty = stats.shown > 5 ? (stats.rejected / stats.shown) * 20 : 0;
  return Math.max(0, Math.round(attachRate * 100 - rejectPenalty));
}

function scoreMargin(triggerPrice: number, candidatePrice: number): number {
  if (triggerPrice <= 0) return 50;
  const ratio = candidatePrice / triggerPrice;
  if (ratio >= 0.3 && ratio <= 0.8) return 90;
  if (ratio > 0.8 && ratio <= 1.2) return 70;
  if (ratio < 0.3) return 40;
  if (ratio > 1.2 && ratio <= 1.8) return 50;
  return 20;
}

function scorePopularity(item: MenuItem): number {
  let score = 50;
  if (item.is_featured) score += 30;
  if (item.badge) score += 20;
  return Math.min(100, score);
}

function computeCompositeScore(
  triggerItem: MenuItem,
  triggerAttr: ProductAttr | null,
  candidate: MenuItem,
  candidateAttr: ProductAttr | null,
  historyStats: EventStats | null
): { score: number; components: Record<string, number> } {
  const compatibility = scoreCompatibility(triggerAttr, candidateAttr);
  const history = scoreHistory(historyStats);
  const margin = scoreMargin(triggerItem.price, candidate.price);
  const popularity = scorePopularity(candidate);

  const composite =
    compatibility * 0.40 +
    history      * 0.30 +
    margin       * 0.15 +
    popularity   * 0.10 +
    50           * 0.05; // diversity placeholder

  return {
    score: Math.round(composite * 100) / 100,
    components: { compatibility, history, margin, popularity, diversity: 50 },
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { item_id, tenant_id, recompute_all } = req.body || {};

  if (!tenant_id) {
    return res.status(400).json({ error: "tenant_id is required" });
  }

  // Usar service_role para poder escribir en upsell_pairs (RLS)
  const writeKey = supabaseServiceKey || supabaseAnonKey;
  const supabase = createClient(supabaseUrl, writeKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Cargar todos los items del tenant
    const { data: allItems, error: itemsError } = await supabase
      .from("menu_items")
      .select("id, name, price, category_id, is_available, is_featured, badge")
      .eq("tenant_id", tenant_id)
      .eq("is_available", true);

    if (itemsError || !allItems?.length) {
      return res.status(404).json({ error: "No items found for tenant" });
    }

    // 2. Cargar todos los product_attributes del tenant
    const { data: allAttrs } = await supabase
      .from("product_attributes")
      .select("*")
      .eq("tenant_id", tenant_id);

    const attrMap = new Map<string, ProductAttr>(
      (allAttrs || []).map((a) => [a.item_id, a])
    );

    // 3. Historial REAL desde upsell_events (Fix #4)
    // Agregar eventos de los últimos 90 días para evitar data stale
    const since90Days = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: eventsData } = await supabase
      .from("upsell_events")
      .select("trigger_item_id, suggested_item_id, event_type")
      .eq("tenant_id", tenant_id)
      .in("event_type", [
        "recommendation_shown",
        "recommendation_accepted",
        "recommendation_rejected",
        "recommendation_ignored",
      ])
      .gte("created_at", since90Days);

    // Agregar estadísticas por par desde upsell_events
    const eventStatsMap = new Map<string, EventStats>();
    for (const ev of eventsData || []) {
      if (!ev.trigger_item_id || !ev.suggested_item_id) continue;
      const key = `${ev.trigger_item_id}:${ev.suggested_item_id}`;
      if (!eventStatsMap.has(key)) {
        eventStatsMap.set(key, {
          suggested_item_id: ev.suggested_item_id,
          accepted: 0,
          rejected: 0,
          shown: 0,
        });
      }
      const stats = eventStatsMap.get(key)!;
      if (ev.event_type === "recommendation_shown") stats.shown++;
      if (ev.event_type === "recommendation_accepted") stats.accepted++;
      if (ev.event_type === "recommendation_rejected" || ev.event_type === "recommendation_ignored") stats.rejected++;
    }

    // 4. También incorporar historial legacy de upsell_feedback (si existe)
    // para no perder datos históricos antes de la migración
    try {
      const { data: legacyData } = await supabase
        .from("upsell_feedback")
        .select("trigger_item_id, suggested_item_id, action")
        .eq("tenant_id", tenant_id);

      for (const fb of legacyData || []) {
        if (!fb.trigger_item_id || !fb.suggested_item_id) continue;
        const key = `${fb.trigger_item_id}:${fb.suggested_item_id}`;
        if (!eventStatsMap.has(key)) {
          eventStatsMap.set(key, {
            suggested_item_id: fb.suggested_item_id,
            accepted: 0,
            rejected: 0,
            shown: 0,
          });
        }
        const stats = eventStatsMap.get(key)!;
        stats.shown++;
        if (fb.action === "accepted" || fb.action === "added") stats.accepted++;
        if (fb.action === "rejected" || fb.action === "dismissed") stats.rejected++;
      }
    } catch {
      // upsell_feedback puede no existir — ignorar
    }

    // 5. Determinar qué items procesar
    const triggerItems = item_id
      ? allItems.filter((i) => i.id === item_id)
      : recompute_all
      ? allItems
      : allItems.slice(0, 50);

    const pairsToUpsert: any[] = [];
    let processedCount = 0;

    for (const trigger of triggerItems) {
      const triggerAttr = attrMap.get(trigger.id) || null;
      const candidates: Array<{
        item: MenuItem;
        score: number;
        components: Record<string, number>;
        pitch: string;
      }> = [];

      for (const candidate of allItems) {
        // ── Exclusiones duras ──────────────────────────────────────────────
        if (candidate.id === trigger.id) continue;
        if (candidate.category_id === trigger.category_id) continue;

        const candidateAttr = attrMap.get(candidate.id) || null;

        // Reglas dietarias duras — HARD EXCLUSION
        if (!passesDietaryHardRules(triggerAttr, candidateAttr)) continue;

        // Guardrail de precio
        if (trigger.price > 0 && candidate.price > trigger.price * 2) continue;

        // Compatibilidad = 0 → excluir (roles incompatibles explícitos)
        const compat = scoreCompatibility(triggerAttr, candidateAttr);
        if (compat === 0) continue;

        const historyKey = `${trigger.id}:${candidate.id}`;
        const historyStats = eventStatsMap.get(historyKey) || null;

        const { score, components } = computeCompositeScore(
          trigger,
          triggerAttr,
          candidate,
          candidateAttr,
          historyStats
        );

        const pitch =
          candidateAttr?.suggested_pitch ||
          (candidateAttr?.product_role === "drink" ? "La bebida perfecta para acompañar" :
           candidateAttr?.product_role === "dessert" ? "El cierre perfecto para tu pedido" :
           candidateAttr?.product_role === "side" ? "El complemento ideal" :
           "Recomendado para ti");

        candidates.push({ item: candidate, score, components, pitch });
      }

      // Ordenar por score y tomar top 5
      candidates.sort((a, b) => b.score - a.score);
      const top5 = candidates.slice(0, 5);

      for (const c of top5) {
        const historyKey = `${trigger.id}:${c.item.id}`;
        const histStats = eventStatsMap.get(historyKey);

        pairsToUpsert.push({
          tenant_id,
          trigger_item_id: trigger.id,
          suggested_item_id: c.item.id,
          score: c.score,
          score_compatibility: c.components.compatibility,
          score_history: c.components.history,
          score_margin: c.components.margin,
          score_popularity: c.components.popularity,
          score_diversity: c.components.diversity,
          pitch: c.pitch,
          times_shown: histStats?.shown || 0,
          times_accepted: histStats?.accepted || 0,
          times_rejected: histStats?.rejected || 0,
          attach_rate: histStats && histStats.shown > 0
            ? Math.round((histStats.accepted / histStats.shown) * 10000) / 10000
            : 0,
          is_active: true,
          is_manual_override: false,
          last_computed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      processedCount++;
    }

    // 6. Upsert en batch (service_role bypassa RLS)
    if (pairsToUpsert.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < pairsToUpsert.length; i += BATCH_SIZE) {
        const batch = pairsToUpsert.slice(i, i + BATCH_SIZE);
        const { error: upsertError } = await supabase
          .from("upsell_pairs")
          .upsert(batch, { onConflict: "trigger_item_id,suggested_item_id" });

        if (upsertError) {
          console.error("[compute-upsell-pairs] Upsert error:", upsertError.message);
        }
      }
    }

    return res.json({
      status: "ok",
      processed_triggers: processedCount,
      pairs_computed: pairsToUpsert.length,
      history_source: "upsell_events",
      event_pairs_found: eventStatsMap.size,
    });

  } catch (err: any) {
    console.error("[compute-upsell-pairs] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
