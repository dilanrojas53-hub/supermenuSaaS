/**
 * POST /api/upsell-recommendations
 *
 * Serving de recomendaciones de upsell en tiempo real (<50ms).
 *
 * Seguridad multi-tenant:
 *   - Todos los queries filtran por tenant_id explícitamente
 *   - Los pares se validan contra el tenant del trigger item antes de servir
 *   - El fallback también filtra por tenant_id
 *
 * Reglas dietarias duras en serving:
 *   - Se aplican ANTES de devolver cualquier recomendación
 *   - Si el trigger tiene atributos dietarios, se filtran candidatos incompatibles
 *   - Las restricciones del cliente (campo `restrictions`) también se aplican
 *
 * Body:
 *   {
 *     trigger_item_id: string,
 *     tenant_id: string,
 *     cart: Array<{ id: string, name: string, price: number }>,
 *     session_id?: string,
 *     surface: "product_detail" | "cart" | "checkout",
 *     restrictions?: string[]  // "vegan" | "gluten_free" | "halal" | "dairy_free" | etc.
 *   }
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CartItem {
  id: string;
  name: string;
  price: number;
}

interface UpsellRecommendation {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string;
  pitch: string;
  score: number;
  source: "precomputed" | "fallback" | "override";
  trigger_item_name: string;
}

interface ProductAttrServing {
  item_id: string;
  product_role: string;
  is_vegan: boolean;
  is_vegetarian: boolean;
  is_gluten_free: boolean;
  is_dairy_free: boolean;
  is_halal: boolean;
  is_kosher: boolean;
  contains_nuts: boolean;
  contains_shellfish: boolean;
  contains_alcohol: boolean;
}

// ─── Roles que implican restricciones ────────────────────────────────────────
const MEAT_ROLES = new Set(["meat", "chicken", "seafood", "fish", "pork", "beef", "lamb"]);
const DAIRY_ROLES = new Set(["dairy", "cheese", "milk", "cream", "butter", "yogurt"]);
const PORK_ROLES = new Set(["pork", "bacon", "ham"]);

// ─── Inferencia de rol determinística ────────────────────────────────────────
const ROLE_KEYWORDS: Record<string, string[]> = {
  drink:     ["bebida", "refresco", "agua", "jugo", "limonada", "cerveza", "vino", "coctel", "smoothie", "batido", "milkshake", "shake"],
  hot_drink: ["cafe", "capuchino", "latte", "espresso", "te caliente", "chocolate caliente", "americano"],
  dessert:   ["postre", "helado", "torta", "cheesecake", "brownie", "flan", "tiramisu", "crepe", "waffle", "churro", "dulce"],
  side:      ["papa", "frita", "arroz", "ensalada", "guarnicion", "side", "yuca", "platano", "toston"],
  sauce:     ["salsa", "dip", "aderezo", "guacamole", "hummus", "mayonesa", "chimichurri"],
};

function inferRoleQuick(name: string): string {
  const text = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return role;
  }
  return "unknown";
}

// ─── Reglas dietarias duras para el serving ──────────────────────────────────
/**
 * Dado el atributo del trigger y del candidato, retorna false si hay
 * incompatibilidad dietaria dura. Se aplica en serving para no devolver
 * candidatos incompatibles aunque estén en upsell_pairs.
 */
function passesDietaryServingRules(
  triggerAttr: ProductAttrServing | null,
  candidateAttr: ProductAttrServing | null,
  clientRestrictions: string[]
): boolean {
  // ── Restricciones del cliente (explícitas en el request) ──────────────────
  if (clientRestrictions.includes("vegan") || clientRestrictions.includes("vegano")) {
    if (candidateAttr && !candidateAttr.is_vegan) return false;
    if (candidateAttr && candidateAttr.contains_alcohol) return false;
    if (candidateAttr && MEAT_ROLES.has(candidateAttr.product_role)) return false;
    if (candidateAttr && DAIRY_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (clientRestrictions.includes("vegetarian") || clientRestrictions.includes("vegetariano")) {
    if (candidateAttr && MEAT_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (clientRestrictions.includes("gluten_free") || clientRestrictions.includes("sin_gluten")) {
    if (candidateAttr && !candidateAttr.is_gluten_free) return false;
  }
  if (clientRestrictions.includes("dairy_free") || clientRestrictions.includes("sin_lacteos")) {
    if (candidateAttr && !candidateAttr.is_dairy_free) return false;
    if (candidateAttr && DAIRY_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (clientRestrictions.includes("halal")) {
    if (candidateAttr && candidateAttr.contains_alcohol) return false;
    if (candidateAttr && PORK_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (clientRestrictions.includes("no_alcohol")) {
    if (candidateAttr && candidateAttr.contains_alcohol) return false;
  }
  if (clientRestrictions.includes("no_nuts")) {
    if (candidateAttr && candidateAttr.contains_nuts) return false;
  }
  if (clientRestrictions.includes("no_shellfish")) {
    if (candidateAttr && candidateAttr.contains_shellfish) return false;
  }

  // ── Restricciones heredadas del trigger ───────────────────────────────────
  if (!triggerAttr || !candidateAttr) return true; // sin datos → no excluir

  if (triggerAttr.is_vegan) {
    if (!candidateAttr.is_vegan) return false;
    if (candidateAttr.contains_alcohol) return false;
    if (MEAT_ROLES.has(candidateAttr.product_role)) return false;
    if (DAIRY_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (triggerAttr.is_vegetarian && !triggerAttr.is_vegan) {
    if (MEAT_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (triggerAttr.is_gluten_free && !candidateAttr.is_gluten_free) return false;
  if (triggerAttr.is_dairy_free && !candidateAttr.is_dairy_free) return false;
  if (triggerAttr.is_dairy_free && DAIRY_ROLES.has(candidateAttr.product_role)) return false;
  if (triggerAttr.is_halal) {
    if (candidateAttr.contains_alcohol) return false;
    if (PORK_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (triggerAttr.is_kosher) {
    if (candidateAttr.contains_shellfish) return false;
    if (PORK_ROLES.has(candidateAttr.product_role)) return false;
  }

  return true;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const startTime = Date.now();
  const {
    trigger_item_id,
    tenant_id,
    cart = [],
    session_id,
    surface = "product_detail",
    restrictions = [],
  } = req.body || {};

  if (!trigger_item_id || !tenant_id) {
    return res.status(400).json({ error: "trigger_item_id and tenant_id are required" });
  }

  // Validar que tenant_id es un UUID válido (prevenir injection)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenant_id) || !uuidRegex.test(trigger_item_id)) {
    return res.status(400).json({ error: "Invalid tenant_id or trigger_item_id format" });
  }

  try {
    // ── Verificar que el trigger_item pertenece al tenant (tenant isolation) ──
    const { data: triggerCheck } = await supabase
      .from("menu_items")
      .select("id, name, price, category_id, tenant_id")
      .eq("id", trigger_item_id)
      .eq("tenant_id", tenant_id)  // ← CRÍTICO: tenant isolation
      .single();

    if (!triggerCheck) {
      // El item no existe en este tenant → no devolver nada
      return res.json({ recommendations: [], source: "tenant_mismatch", elapsed_ms: Date.now() - startTime });
    }

    // ── Contexto del carrito ──────────────────────────────────────────────────
    const cartIds = new Set<string>((cart as CartItem[]).map((i) => i.id));
    cartIds.add(trigger_item_id);

    const cartNames = (cart as CartItem[]).map((i) => i.name.toLowerCase());
    const cartHasDrink = cartNames.some((n) => {
      const r = inferRoleQuick(n); return r === "drink" || r === "hot_drink";
    });
    const cartHasDessert = cartNames.some((n) => inferRoleQuick(n) === "dessert");
    const cartHasSide = cartNames.some((n) => inferRoleQuick(n) === "side");

    // ── 1. Buscar pares precalculados — filtrar por tenant_id explícitamente ──
    const { data: pairs } = await supabase
      .from("upsell_pairs")
      .select("suggested_item_id, score, pitch, is_manual_override")
      .eq("trigger_item_id", trigger_item_id)
      .eq("tenant_id", tenant_id)  // ← CRÍTICO: tenant isolation
      .eq("is_active", true)
      .order("score", { ascending: false })
      .limit(10);

    // ── 2. Cargar overrides del admin — filtrar por tenant_id ─────────────────
    const { data: overrides } = await supabase
      .from("upsell_overrides")
      .select("override_type, trigger_item_id, target_item_id, custom_pitch, priority")
      .eq("tenant_id", tenant_id)  // ← CRÍTICO: tenant isolation
      .eq("is_active", true)
      .or(`trigger_item_id.eq.${trigger_item_id},override_type.eq.global_block`);

    const blockedIds = new Set<string>(
      (overrides || [])
        .filter((o) => o.override_type === "block" && o.trigger_item_id === trigger_item_id)
        .map((o) => o.target_item_id)
        .filter(Boolean) as string[]
    );
    const globalBlockedIds = new Set<string>(
      (overrides || [])
        .filter((o) => o.override_type === "global_block")
        .map((o) => o.target_item_id)
        .filter(Boolean) as string[]
    );
    const pinnedPairs = (overrides || [])
      .filter((o) => o.override_type === "pin" && o.trigger_item_id === trigger_item_id)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // ── 3. Construir lista de IDs candidatos ──────────────────────────────────
    const pinnedIds = pinnedPairs.map((p) => p.target_item_id).filter(Boolean) as string[];
    const pairIds = (pairs || [])
      .map((p) => p.suggested_item_id)
      .filter((id) => !blockedIds.has(id) && !globalBlockedIds.has(id) && !cartIds.has(id));

    const candidateIds = Array.from(new Set([...pinnedIds, ...pairIds])).slice(0, 10);

    // ── 4. Cargar datos + atributos de candidatos ─────────────────────────────
    let recommendations: UpsellRecommendation[] = [];
    let source: "precomputed" | "fallback" = "precomputed";

    if (candidateIds.length > 0) {
      // Verificar que los candidatos pertenecen al mismo tenant (tenant isolation)
      const { data: items } = await supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, category_id")
        .in("id", candidateIds)
        .eq("tenant_id", tenant_id)  // ← CRÍTICO: tenant isolation
        .eq("is_available", true);

      // Cargar atributos del trigger + candidatos para filtro dietario
      const allAttrIds = [trigger_item_id, ...candidateIds];
      const { data: attrs } = await supabase
        .from("product_attributes")
        .select("item_id, product_role, is_vegan, is_vegetarian, is_gluten_free, is_dairy_free, is_halal, is_kosher, contains_nuts, contains_shellfish, contains_alcohol")
        .in("item_id", allAttrIds);

      const attrMap = new Map<string, ProductAttrServing>(
        (attrs || []).map((a) => [a.item_id, a])
      );
      const triggerAttr = attrMap.get(trigger_item_id) || null;

      for (const item of items || []) {
        if (!item) continue;
        const candidateAttr = attrMap.get(item.id) || null;

        // ── Reglas dietarias duras en serving ─────────────────────────────
        if (!passesDietaryServingRules(triggerAttr, candidateAttr, restrictions as string[])) continue;

        // ── Filtros de contexto del carrito ───────────────────────────────
        const itemRole = candidateAttr?.product_role || inferRoleQuick(item.name);
        if (cartHasDrink && (itemRole === "drink" || itemRole === "hot_drink")) continue;
        if (cartHasDessert && itemRole === "dessert") continue;
        if (cartHasSide && itemRole === "side") continue;

        const pair = (pairs || []).find((p) => p.suggested_item_id === item.id);
        const pinnedOverride = pinnedPairs.find((p) => p.target_item_id === item.id);

        const pitch =
          pinnedOverride?.custom_pitch ||
          pair?.pitch ||
          (itemRole === "drink" ? "La bebida perfecta para acompañar" :
           itemRole === "dessert" ? "El cierre perfecto para tu pedido" :
           itemRole === "side" ? "El complemento ideal" :
           "Recomendado para ti");

        recommendations.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: item.image_url,
          category_id: item.category_id,
          pitch,
          score: pair?.score || (pinnedOverride ? 100 : 50),
          source: pinnedOverride ? "override" : "precomputed",
          trigger_item_name: triggerCheck.name,
        });
      }

      recommendations.sort((a, b) => {
        if (a.source === "override" && b.source !== "override") return -1;
        if (b.source === "override" && a.source !== "override") return 1;
        return b.score - a.score;
      });
    }

    // ── 5. Fallback determinístico — siempre filtrado por tenant_id ───────────
    if (recommendations.length < 2) {
      source = "fallback";

      // Excluir IDs del carrito de forma segura (sin spread de Set)
      const excludeIds = Array.from(cartIds);

      const { data: allItems } = await supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, category_id, is_featured, badge")
        .eq("tenant_id", tenant_id)  // ← CRÍTICO: tenant isolation
        .eq("is_available", true)
        .not("id", "in", `(${excludeIds.join(",")})`)
        .limit(40);

      // Cargar atributos del trigger para filtro dietario en fallback
      const { data: triggerAttrData } = await supabase
        .from("product_attributes")
        .select("item_id, product_role, is_vegan, is_vegetarian, is_gluten_free, is_dairy_free, is_halal, is_kosher, contains_nuts, contains_shellfish, contains_alcohol")
        .eq("item_id", trigger_item_id)
        .single();

      const triggerAttrFallback = triggerAttrData || null;

      // Cargar atributos de candidatos fallback
      const fallbackIds = (allItems || []).map((i) => i.id);
      const { data: fallbackAttrs } = fallbackIds.length > 0
        ? await supabase
            .from("product_attributes")
            .select("item_id, product_role, is_vegan, is_vegetarian, is_gluten_free, is_dairy_free, is_halal, is_kosher, contains_nuts, contains_shellfish, contains_alcohol")
            .in("item_id", fallbackIds)
        : { data: [] };

      const fallbackAttrMap = new Map<string, ProductAttrServing>(
        (fallbackAttrs || []).map((a) => [a.item_id, a])
      );

      const usedCategoryIds = new Set<string>(recommendations.map((r) => r.category_id));
      usedCategoryIds.add(triggerCheck.category_id);

      for (const item of allItems || []) {
        if (recommendations.length >= 2) break;
        if (blockedIds.has(item.id) || globalBlockedIds.has(item.id)) continue;
        if (usedCategoryIds.has(item.category_id)) continue;
        if (triggerCheck.price > 0 && item.price > triggerCheck.price * 2) continue;

        const candidateAttr = fallbackAttrMap.get(item.id) || null;

        // Reglas dietarias duras también en fallback
        if (!passesDietaryServingRules(triggerAttrFallback, candidateAttr, restrictions as string[])) continue;

        const role = candidateAttr?.product_role || inferRoleQuick(item.name);
        if (cartHasDrink && (role === "drink" || role === "hot_drink")) continue;
        if (cartHasDessert && role === "dessert") continue;
        if (cartHasSide && role === "side") continue;

        recommendations.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: item.image_url,
          category_id: item.category_id,
          pitch: role === "drink" ? "La bebida perfecta para acompañar"
            : role === "dessert" ? "El cierre perfecto para tu pedido"
            : role === "side" ? "El complemento ideal"
            : "Recomendado para ti",
          score: item.is_featured ? 70 : 50,
          source: "fallback",
          trigger_item_name: triggerCheck.name,
        });
        usedCategoryIds.add(item.category_id);
      }

      // Disparar compute en background si no hay pares
      if (!pairs?.length) {
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
        fetch(`${baseUrl}/api/compute-upsell-pairs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: trigger_item_id, tenant_id }),
        }).catch(() => {});
      }
    }

    // ── 6. Disparar enriquecimiento background si no tiene atributos ──────────
    const { data: existingAttr } = await supabase
      .from("product_attributes")
      .select("id")
      .eq("item_id", trigger_item_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!existingAttr) {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
      fetch(`${baseUrl}/api/analyze-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: trigger_item_id, tenant_id }),
      }).catch(() => {});
    }

    const elapsed = Date.now() - startTime;
    console.log(`[upsell-recommendations] ${recommendations.length} recs in ${elapsed}ms (source: ${source}, tenant: ${tenant_id.slice(0, 8)})`);

    return res.json({
      recommendations: recommendations.slice(0, 2),
      source,
      elapsed_ms: elapsed,
      cart_context: { cartHasDrink, cartHasDessert, cartHasSide },
    });

  } catch (err: any) {
    console.error("[upsell-recommendations] Error:", err.message);
    return res.json({
      recommendations: [],
      source: "error",
      error: err.message,
    });
  }
}
