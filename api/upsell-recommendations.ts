/**
 * POST /api/upsell-recommendations
 *
 * Serving de recomendaciones de upsell en tiempo real (<50ms).
 * 
 * Flujo:
 *   1. Buscar pares precalculados en upsell_pairs (instantáneo)
 *   2. Aplicar filtros de contexto del carrito (ya tiene bebida, postre, etc.)
 *   3. Aplicar overrides del admin (pin, block)
 *   4. Si no hay pares → fallback determinístico en memoria
 *   5. Disparar enriquecimiento background si el producto no tiene atributos
 *
 * Body:
 *   {
 *     trigger_item_id: string,
 *     tenant_id: string,
 *     cart: Array<{ id: string, name: string, price: number }>,
 *     session_id?: string,
 *     surface: "add_to_cart" | "cart" | "checkout",
 *     restrictions?: string[]  // "vegan" | "gluten_free" | "halal" | etc.
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

// ─── Inferencia de rol determinística (inline para velocidad) ─────────────────

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
    surface = "add_to_cart",
    restrictions = [],
  } = req.body || {};

  if (!trigger_item_id || !tenant_id) {
    return res.status(400).json({ error: "trigger_item_id and tenant_id are required" });
  }

  try {
    // ── Contexto del carrito ──────────────────────────────────────────────────
    const cartIds = new Set<string>((cart as CartItem[]).map((i) => i.id));
    cartIds.add(trigger_item_id); // el trigger no puede ser recomendado

    const cartNames = (cart as CartItem[]).map((i) => i.name.toLowerCase());
    const cartHasDrink = cartNames.some((n) => inferRoleQuick(n) === "drink" || inferRoleQuick(n) === "hot_drink");
    const cartHasDessert = cartNames.some((n) => inferRoleQuick(n) === "dessert");
    const cartHasSide = cartNames.some((n) => inferRoleQuick(n) === "side");

    // ── 1. Buscar pares precalculados ─────────────────────────────────────────
    const { data: pairs } = await supabase
      .from("upsell_pairs")
      .select(`
        suggested_item_id,
        score,
        pitch,
        source:is_manual_override
      `)
      .eq("trigger_item_id", trigger_item_id)
      .eq("is_active", true)
      .order("score", { ascending: false })
      .limit(10);

    // ── 2. Cargar overrides del admin ─────────────────────────────────────────
    const { data: overrides } = await supabase
      .from("upsell_overrides")
      .select("override_type, trigger_item_id, target_item_id, custom_pitch, priority")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .or(`trigger_item_id.eq.${trigger_item_id},trigger_item_id.is.null`);

    const blockedIds = new Set<string>(
      (overrides || [])
        .filter((o) => o.override_type === "block_pair" && o.trigger_item_id === trigger_item_id)
        .map((o) => o.target_item_id)
        .filter(Boolean) as string[]
    );

    const globalBlockedIds = new Set<string>(
      (overrides || [])
        .filter((o) => o.override_type === "block_item")
        .map((o) => o.target_item_id)
        .filter(Boolean) as string[]
    );

    const pinnedPairs = (overrides || [])
      .filter((o) => o.override_type === "pin_pair" && o.trigger_item_id === trigger_item_id)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // ── 3. Construir lista de IDs candidatos ──────────────────────────────────
    // Primero los pinned, luego los precalculados
    const pinnedIds = pinnedPairs.map((p) => p.target_item_id).filter(Boolean) as string[];
    const pairIds = (pairs || [])
      .map((p) => p.suggested_item_id)
      .filter((id) => !blockedIds.has(id) && !globalBlockedIds.has(id) && !cartIds.has(id));

    const candidateIds = [...new Set([...pinnedIds, ...pairIds])].slice(0, 8);

    // ── 4. Cargar datos completos de los candidatos ───────────────────────────
    let recommendations: UpsellRecommendation[] = [];
    let source: "precomputed" | "fallback" = "precomputed";

    if (candidateIds.length > 0) {
      const { data: items } = await supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, category_id")
        .in("id", candidateIds)
        .eq("is_available", true);

      // Cargar atributos para filtrar restricciones dietarias
      const { data: attrs } = await supabase
        .from("product_attributes")
        .select("item_id, product_role, contains_alcohol, contains_nuts, contains_shellfish, is_vegan, is_vegetarian, is_gluten_free, is_dairy_free, is_halal")
        .in("item_id", candidateIds);

      const attrMap = new Map((attrs || []).map((a) => [a.item_id, a]));

      const triggerItem = (items || []).find((i) => i.id === trigger_item_id);

      for (const item of items || []) {
        if (!item) continue;
        const attr = attrMap.get(item.id);

        // Filtrar por restricciones activas
        if (restrictions.includes("gluten_free") && attr && !attr.is_gluten_free) continue;
        if (restrictions.includes("vegan") && attr && !attr.is_vegan) continue;
        if (restrictions.includes("vegetarian") && attr && !attr.is_vegetarian) continue;
        if (restrictions.includes("halal") && attr && attr.contains_alcohol) continue;
        if (restrictions.includes("no_alcohol") && attr && attr.contains_alcohol) continue;
        if (restrictions.includes("no_nuts") && attr && attr.contains_nuts) continue;

        // Filtrar por lo que ya tiene el carrito (no recomendar otra bebida si ya tiene)
        const itemRole = attr?.product_role || inferRoleQuick(item.name);
        if (cartHasDrink && (itemRole === "drink" || itemRole === "hot_drink")) continue;
        if (cartHasDessert && itemRole === "dessert") continue;
        if (cartHasSide && itemRole === "side") continue;

        // Buscar pitch y score
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
          trigger_item_name: triggerItem?.name || "",
        });
      }

      // Ordenar: overrides primero, luego por score
      recommendations.sort((a, b) => {
        if (a.source === "override" && b.source !== "override") return -1;
        if (b.source === "override" && a.source !== "override") return 1;
        return b.score - a.score;
      });
    }

    // ── 5. Fallback: si no hay pares precalculados, usar lógica determinística ─
    if (recommendations.length < 2) {
      source = "fallback";

      const { data: allItems } = await supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, category_id, is_featured, badge")
        .eq("tenant_id", tenant_id)
        .eq("is_available", true)
        .not("id", "in", `(${[...cartIds].join(",")})`)
        .limit(30);

      // Cargar el trigger para saber su categoría
      const { data: triggerData } = await supabase
        .from("menu_items")
        .select("id, name, price, category_id")
        .eq("id", trigger_item_id)
        .single();

      const usedCategoryIds = new Set<string>(
        recommendations.map((r) => r.category_id)
      );

      for (const item of allItems || []) {
        if (recommendations.length >= 2) break;
        if (cartIds.has(item.id)) continue;
        if (blockedIds.has(item.id) || globalBlockedIds.has(item.id)) continue;
        if (triggerData && item.category_id === triggerData.category_id) continue;
        if (usedCategoryIds.has(item.category_id)) continue;
        if (triggerData && item.price > triggerData.price * 2) continue;

        const role = inferRoleQuick(item.name);
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
          trigger_item_name: triggerData?.name || "",
        });
        usedCategoryIds.add(item.category_id);
      }

      // Si no hay pares, disparar compute en background
      if (!pairs?.length) {
        fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""}/api/compute-upsell-pairs`, {
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
      .single();

    if (!existingAttr) {
      fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ""}/api/analyze-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: trigger_item_id, tenant_id }),
      }).catch(() => {});
    }

    const elapsed = Date.now() - startTime;
    console.log(`[upsell-recommendations] ${recommendations.length} recs in ${elapsed}ms (source: ${source})`);

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
