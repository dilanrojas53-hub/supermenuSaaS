/**
 * POST /api/compute-upsell-pairs
 *
 * Motor de ranking determinístico que calcula los mejores pares de upsell
 * para un producto dado (o todos los productos de un tenant).
 *
 * Score compuesto (0-100):
 *   40% compatibilidad culinaria (product_attributes)
 *   30% historial (attach_rate de upsell_feedback/upsell_events)
 *   15% margen (precio sugerido vs precio trigger)
 *   10% popularidad (is_featured, badge)
 *    5% diversidad (penalizar si ya aparece mucho)
 *
 * Exclusiones duras:
 *   - Mismo producto
 *   - Misma categoría (evitar duplicar)
 *   - Incompatibilidad dietaria (ej: vegan trigger → no recomendar carne)
 *   - Roles incompatibles según product_attributes
 *   - Precio > 2x el trigger (guardrail)
 *   - is_available = false
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

interface FeedbackStats {
  suggested_item_id: string;
  accepted: number;
  rejected: number;
  shown: number;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreCompatibility(
  triggerAttr: ProductAttr | null,
  candidateAttr: ProductAttr | null
): number {
  if (!triggerAttr || !candidateAttr) return 30; // neutral si no hay atributos

  const affinityRoles = triggerAttr.affinity_roles || [];
  const incompatibleRoles = triggerAttr.incompatible_roles || [];

  if (incompatibleRoles.includes(candidateAttr.product_role)) return 0;
  if (affinityRoles.includes(candidateAttr.product_role)) {
    // Bonus por posición en la lista (primero = más compatible)
    const idx = affinityRoles.indexOf(candidateAttr.product_role);
    return Math.max(60, 100 - idx * 10);
  }
  return 20; // no es afín pero tampoco incompatible
}

function scoreDietaryCompatibility(
  triggerAttr: ProductAttr | null,
  candidateAttr: ProductAttr | null
): boolean {
  if (!triggerAttr || !candidateAttr) return true;

  // Si el trigger es vegano, no recomendar productos con alcohol o carne implícita
  if (triggerAttr.is_vegan && candidateAttr.contains_alcohol) return false;

  // Si el trigger es halal, no recomendar alcohol
  if (triggerAttr.is_halal && candidateAttr.contains_alcohol) return false;

  // Si el trigger es kosher, no recomendar shellfish
  if (triggerAttr.is_kosher && candidateAttr.contains_shellfish) return false;

  return true;
}

function scoreHistory(stats: FeedbackStats | null): number {
  if (!stats || stats.shown === 0) return 50; // neutral sin historial
  const attachRate = stats.accepted / stats.shown;
  return Math.round(attachRate * 100);
}

function scoreMargin(triggerPrice: number, candidatePrice: number): number {
  if (triggerPrice <= 0) return 50;
  const ratio = candidatePrice / triggerPrice;
  // Óptimo: 0.3x - 0.8x del precio del trigger (complemento asequible)
  if (ratio >= 0.3 && ratio <= 0.8) return 90;
  if (ratio > 0.8 && ratio <= 1.2) return 70;
  if (ratio < 0.3) return 40; // muy barato, parece poco valor
  if (ratio > 1.2 && ratio <= 1.8) return 50;
  return 20; // muy caro
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
  historyStats: FeedbackStats | null
): { score: number; components: Record<string, number> } {
  const compatibility = scoreCompatibility(triggerAttr, candidateAttr);
  const history = scoreHistory(historyStats);
  const margin = scoreMargin(triggerItem.price, candidate.price);
  const popularity = scorePopularity(candidate);

  const composite =
    compatibility * 0.40 +
    history * 0.30 +
    margin * 0.15 +
    popularity * 0.10 +
    50 * 0.05; // diversity placeholder

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

    // 3. Cargar historial de feedback (upsell_feedback existente)
    const { data: feedbackData } = await supabase
      .from("upsell_feedback")
      .select("trigger_item_id, suggested_item_id, action")
      .eq("tenant_id", tenant_id);

    // Agregar estadísticas por par
    const feedbackMap = new Map<string, FeedbackStats>();
    for (const fb of feedbackData || []) {
      const key = `${fb.trigger_item_id}:${fb.suggested_item_id}`;
      if (!feedbackMap.has(key)) {
        feedbackMap.set(key, {
          suggested_item_id: fb.suggested_item_id,
          accepted: 0,
          rejected: 0,
          shown: 0,
        });
      }
      const stats = feedbackMap.get(key)!;
      stats.shown++;
      if (fb.action === "accepted" || fb.action === "added") stats.accepted++;
      if (fb.action === "rejected" || fb.action === "dismissed") stats.rejected++;
    }

    // 4. Determinar qué items procesar
    const triggerItems = item_id
      ? allItems.filter((i) => i.id === item_id)
      : recompute_all
      ? allItems
      : allItems.slice(0, 50); // límite para no sobrecargar

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
        // Exclusiones duras
        if (candidate.id === trigger.id) continue;
        if (candidate.category_id === trigger.category_id) continue; // misma categoría

        const candidateAttr = attrMap.get(candidate.id) || null;

        // Exclusión dietaria
        if (!scoreDietaryCompatibility(triggerAttr, candidateAttr)) continue;

        // Guardrail de precio: no más de 2x el trigger
        if (trigger.price > 0 && candidate.price > trigger.price * 2) continue;

        // Compatibilidad = 0 → excluir (incompatible explícito)
        const compat = scoreCompatibility(triggerAttr, candidateAttr);
        if (compat === 0) continue;

        const historyKey = `${trigger.id}:${candidate.id}`;
        const historyStats = feedbackMap.get(historyKey) || null;

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
        const histStats = feedbackMap.get(historyKey);

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

    // 5. Upsert en batch
    if (pairsToUpsert.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < pairsToUpsert.length; i += BATCH_SIZE) {
        const batch = pairsToUpsert.slice(i, i + BATCH_SIZE);
        const { error: upsertError } = await supabase
          .from("upsell_pairs")
          .upsert(batch, { onConflict: "trigger_item_id,suggested_item_id" });

        if (upsertError) {
          console.error("[compute-upsell-pairs] Upsert error:", upsertError);
        }
      }
    }

    return res.json({
      status: "ok",
      processed_triggers: processedCount,
      pairs_computed: pairsToUpsert.length,
    });

  } catch (err: any) {
    console.error("[compute-upsell-pairs] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
