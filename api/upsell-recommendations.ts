/**
 * POST /api/upsell-recommendations
 *
 * V24.14 Contextual Upsell Guardrails
 * - Respeta can_trigger_upsell y can_be_upsell desde product_attributes.
 * - Evita que extras/toppings y bebidas simples disparen recomendaciones raras.
 * - Filtra combinaciones incoherentes aunque existan pares antiguos en upsell_pairs.
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.SUPABASE_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  console.warn("[upsell-recommendations] Missing SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY env var");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey || "missing-key");

type Source = "precomputed" | "fallback" | "override";

interface CartItem { id: string; name: string; price: number; }

interface ProductAttrServing {
  item_id: string;
  product_role: string | null;
  is_vegan: boolean | null;
  is_vegetarian: boolean | null;
  is_gluten_free: boolean | null;
  is_dairy_free: boolean | null;
  is_halal: boolean | null;
  is_kosher: boolean | null;
  contains_nuts: boolean | null;
  contains_shellfish: boolean | null;
  contains_alcohol: boolean | null;
  can_trigger_upsell?: boolean | null;
  can_be_upsell?: boolean | null;
}

interface MenuItemServing {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string;
  is_featured?: boolean | null;
  badge?: string | null;
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
  source: Source;
  trigger_item_name: string;
}

const ATTR_SELECT = "item_id, product_role, is_vegan, is_vegetarian, is_gluten_free, is_dairy_free, is_halal, is_kosher, contains_nuts, contains_shellfish, contains_alcohol, can_trigger_upsell, can_be_upsell";

const MEAT_ROLES = new Set(["meat", "chicken", "seafood", "fish", "pork", "beef", "lamb"]);
const DAIRY_ROLES = new Set(["dairy", "cheese", "milk", "cream", "butter", "yogurt"]);
const PORK_ROLES = new Set(["pork", "bacon", "ham"]);
const DRINK_ROLES = new Set(["drink", "hot_drink", "alcoholic_drink"]);
const MAIN_ROLES = new Set(["main", "beef", "pork", "chicken", "seafood", "fish", "meat", "lamb"]);

const ROLE_KEYWORDS: Record<string, string[]> = {
  topping: ["salsa", "pico de gallo", "cebolla", "natilla", "aguacate", "guacamole", "queso", "extra", "adicional"],
  drink: ["bebida", "refresco", "agua", "jugo", "limonada", "smoothie", "batido", "milkshake", "shake", "gaseosa", "horchata", "natural"],
  hot_drink: ["cafe", "capuchino", "latte", "espresso", "te caliente", "chocolate caliente", "americano", "macchiato"],
  alcoholic_drink: ["cerveza", "vino", "coctel", "cocktail", "licor", "ron", "whisky", "gin", "mojito", "margarita", "pilsen", "imperial", "bavaria"],
  dessert: ["postre", "helado", "tres leches", "pie", "cheesecake", "brownie", "flan", "tiramisu", "crepe", "waffle", "churro", "dulce"],
  side: ["papa", "frita", "arroz", "ensalada", "guarnicion", "side", "yuca", "platano", "toston", "sopa", "pozole", "consome"],
};

function normalizeText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function inferRoleQuick(name: string): string {
  const text = normalizeText(name);
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return role;
  }
  return "unknown";
}

function getRole(attr: ProductAttrServing | null, name?: string): string {
  return attr?.product_role || (name ? inferRoleQuick(name) : "unknown");
}

function canTriggerUpsell(attr: ProductAttrServing | null, itemName: string, price: number): boolean {
  const role = getRole(attr, itemName);
  if (attr?.can_trigger_upsell === false) return false;
  if (role === "topping") return false;
  if (DRINK_ROLES.has(role) && price <= 2500) return false;
  return true;
}

function canBeRecommended(attr: ProductAttrServing | null, itemName: string, price: number): boolean {
  const role = getRole(attr, itemName);
  if (attr?.can_be_upsell === false) return false;
  if (price <= 500 && role !== "topping") return false;
  return true;
}

function isContextuallyCompatible(triggerRole: string, candidateRole: string): boolean {
  if (triggerRole === "topping") return false;
  if (DRINK_ROLES.has(triggerRole) && DRINK_ROLES.has(candidateRole)) return false;
  if (triggerRole === "dessert" && (MAIN_ROLES.has(candidateRole) || candidateRole === "topping")) return false;
  if (triggerRole === "side" && candidateRole === "side") return false;
  if (triggerRole === candidateRole && triggerRole !== "main") return false;
  return true;
}

function defaultPitch(triggerRole: string, candidateRole: string): string {
  if (MAIN_ROLES.has(triggerRole) && DRINK_ROLES.has(candidateRole)) return "Una bebida que sí combina con tu elección.";
  if (MAIN_ROLES.has(triggerRole) && candidateRole === "side") return "Buen complemento para completar el plato.";
  if (MAIN_ROLES.has(triggerRole) && candidateRole === "topping") return "Un extra para personalizar tu pedido.";
  if (MAIN_ROLES.has(triggerRole) && candidateRole === "dessert") return "Perfecto para cerrar después de este plato.";
  if (triggerRole === "dessert" && (candidateRole === "hot_drink" || candidateRole === "drink")) return "Combina muy bien con algo dulce.";
  if (triggerRole === "side" && DRINK_ROLES.has(candidateRole)) return "Una bebida adecuada para acompañar.";
  if (candidateRole === "drink") return "La bebida perfecta para acompañar.";
  if (candidateRole === "dessert") return "El cierre perfecto para tu pedido.";
  if (candidateRole === "side") return "El complemento ideal.";
  if (candidateRole === "topping") return "Un extra para personalizar tu pedido.";
  return "También puede ir bien con tu elección.";
}

function passesDietaryRules(triggerAttr: ProductAttrServing | null, candidateAttr: ProductAttrServing | null, restrictions: string[]): boolean {
  if (restrictions.includes("vegan") || restrictions.includes("vegano")) {
    if (candidateAttr && !candidateAttr.is_vegan) return false;
    if (candidateAttr?.contains_alcohol) return false;
    if (candidateAttr?.product_role && MEAT_ROLES.has(candidateAttr.product_role)) return false;
    if (candidateAttr?.product_role && DAIRY_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (restrictions.includes("vegetarian") || restrictions.includes("vegetariano")) {
    if (candidateAttr?.product_role && MEAT_ROLES.has(candidateAttr.product_role)) return false;
  }
  if ((restrictions.includes("gluten_free") || restrictions.includes("sin_gluten")) && candidateAttr && !candidateAttr.is_gluten_free) return false;
  if (restrictions.includes("no_alcohol") && candidateAttr?.contains_alcohol) return false;
  if (restrictions.includes("no_nuts") && candidateAttr?.contains_nuts) return false;
  if (restrictions.includes("no_shellfish") && candidateAttr?.contains_shellfish) return false;

  if (!triggerAttr || !candidateAttr) return true;
  if (triggerAttr.is_vegan) {
    if (!candidateAttr.is_vegan) return false;
    if (candidateAttr.contains_alcohol) return false;
    if (candidateAttr.product_role && MEAT_ROLES.has(candidateAttr.product_role)) return false;
    if (candidateAttr.product_role && DAIRY_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (triggerAttr.is_vegetarian && !triggerAttr.is_vegan && candidateAttr.product_role && MEAT_ROLES.has(candidateAttr.product_role)) return false;
  if (triggerAttr.is_gluten_free && !candidateAttr.is_gluten_free) return false;
  if (triggerAttr.is_dairy_free && !candidateAttr.is_dairy_free) return false;
  if (triggerAttr.is_halal) {
    if (candidateAttr.contains_alcohol) return false;
    if (candidateAttr.product_role && PORK_ROLES.has(candidateAttr.product_role)) return false;
  }
  if (triggerAttr.is_kosher) {
    if (candidateAttr.contains_shellfish) return false;
    if (candidateAttr.product_role && PORK_ROLES.has(candidateAttr.product_role)) return false;
  }
  return true;
}

async function safeQuery<T>(queryFn: () => Promise<{ data: T | null; error: any }>): Promise<T | null> {
  try {
    const { data, error } = await queryFn();
    if (error) {
      if (error.code === "42P01" || String(error.message || "").includes("does not exist")) return null;
      console.warn("[upsell-recommendations] safeQuery non-fatal:", error.message);
      return null;
    }
    return data;
  } catch (error: any) {
    console.warn("[upsell-recommendations] safeQuery exception:", error?.message);
    return null;
  }
}

function shouldSkipBecauseCartAlreadyHasRole(role: string, cartHasDrink: boolean, cartHasDessert: boolean, cartHasSide: boolean): boolean {
  if (cartHasDrink && DRINK_ROLES.has(role)) return true;
  if (cartHasDessert && role === "dessert") return true;
  if (cartHasSide && role === "side") return true;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const startTime = Date.now();
  const { trigger_item_id, tenant_id, cart = [], surface = "product_detail", restrictions = [] } = req.body || {};

  if (!supabaseAnonKey) return res.status(500).json({ error: "Missing Supabase anon key env var" });
  if (!trigger_item_id || !tenant_id) return res.status(400).json({ error: "trigger_item_id and tenant_id are required" });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenant_id) || !uuidRegex.test(trigger_item_id)) return res.status(400).json({ error: "Invalid tenant_id or trigger_item_id format" });

  try {
    const { data: triggerItem } = await supabase
      .from("menu_items")
      .select("id, name, price, category_id, tenant_id")
      .eq("id", trigger_item_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (!triggerItem) return res.json({ recommendations: [], source: "tenant_mismatch", elapsed_ms: Date.now() - startTime });

    const triggerAttr = await safeQuery<ProductAttrServing>(() =>
      supabase.from("product_attributes").select(ATTR_SELECT).eq("item_id", trigger_item_id).eq("tenant_id", tenant_id).maybeSingle()
    );
    const triggerRole = getRole(triggerAttr, triggerItem.name);

    if (!canTriggerUpsell(triggerAttr, triggerItem.name, Number(triggerItem.price || 0))) {
      return res.json({ recommendations: [], source: "trigger_not_eligible", elapsed_ms: Date.now() - startTime, trigger_context: { triggerRole } });
    }

    const cartIds = new Set<string>((cart as CartItem[]).map((item) => item.id));
    cartIds.add(trigger_item_id);
    const cartRoles = (cart as CartItem[]).map((item) => inferRoleQuick(item.name));
    const cartHasDrink = cartRoles.some((role) => DRINK_ROLES.has(role));
    const cartHasDessert = cartRoles.includes("dessert");
    const cartHasSide = cartRoles.includes("side");

    const overrides = await safeQuery<any[]>(() =>
      supabase.from("upsell_overrides").select("override_type, trigger_item_id, target_item_id, custom_pitch, priority").eq("tenant_id", tenant_id).eq("is_active", true).or(`trigger_item_id.eq.${trigger_item_id},override_type.eq.global_block`)
    );
    const blockedIds = new Set<string>((overrides || []).filter((row) => row.override_type === "block" && row.trigger_item_id === trigger_item_id).map((row) => row.target_item_id).filter(Boolean));
    const globalBlockedIds = new Set<string>((overrides || []).filter((row) => row.override_type === "global_block").map((row) => row.target_item_id).filter(Boolean));
    const pinnedPairs = (overrides || []).filter((row) => row.override_type === "pin" && row.trigger_item_id === trigger_item_id).sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const pairs = await safeQuery<any[]>(() =>
      supabase.from("upsell_pairs").select("suggested_item_id, score, pitch, is_manual_override").eq("trigger_item_id", trigger_item_id).eq("tenant_id", tenant_id).eq("is_active", true).order("score", { ascending: false }).limit(12)
    );

    const candidateIds = Array.from(new Set([
      ...pinnedPairs.map((row) => row.target_item_id).filter(Boolean),
      ...(pairs || []).map((row) => row.suggested_item_id).filter((id) => !blockedIds.has(id) && !globalBlockedIds.has(id) && !cartIds.has(id)),
    ])).slice(0, 12);

    let recommendations: UpsellRecommendation[] = [];
    let source: "precomputed" | "fallback" = "precomputed";

    if (candidateIds.length > 0) {
      const { data: items } = await supabase.from("menu_items").select("id, name, description, price, image_url, category_id").in("id", candidateIds).eq("tenant_id", tenant_id).eq("is_available", true);
      const attrs = await safeQuery<ProductAttrServing[]>(() => supabase.from("product_attributes").select(ATTR_SELECT).in("item_id", [trigger_item_id, ...candidateIds]));
      const attrMap = new Map<string, ProductAttrServing>((attrs || []).map((attr) => [attr.item_id, attr]));

      for (const item of items || []) {
        const candidateAttr = attrMap.get(item.id) || null;
        const candidateRole = getRole(candidateAttr, item.name);
        if (!canBeRecommended(candidateAttr, item.name, Number(item.price || 0))) continue;
        if (!isContextuallyCompatible(triggerRole, candidateRole)) continue;
        if (!passesDietaryRules(triggerAttr, candidateAttr, restrictions as string[])) continue;
        if (shouldSkipBecauseCartAlreadyHasRole(candidateRole, cartHasDrink, cartHasDessert, cartHasSide)) continue;

        const pair = (pairs || []).find((row) => row.suggested_item_id === item.id);
        const pinned = pinnedPairs.find((row) => row.target_item_id === item.id);
        recommendations.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: item.image_url,
          category_id: item.category_id,
          pitch: pinned?.custom_pitch || pair?.pitch || defaultPitch(triggerRole, candidateRole),
          score: pair?.score || (pinned ? 100 : 50),
          source: pinned ? "override" : "precomputed",
          trigger_item_name: triggerItem.name,
        });
      }

      recommendations.sort((a, b) => {
        if (a.source === "override" && b.source !== "override") return -1;
        if (b.source === "override" && a.source !== "override") return 1;
        return b.score - a.score;
      });
    }

    if (recommendations.length < 2) {
      source = "fallback";
      const excludeIds = Array.from(cartIds);
      const { data: allItems } = await supabase
        .from("menu_items")
        .select("id, name, description, price, image_url, category_id, is_featured, badge")
        .eq("tenant_id", tenant_id)
        .eq("is_available", true)
        .not("id", "in", `(${excludeIds.join(",")})`)
        .limit(60);

      const fallbackIds = (allItems || []).map((item) => item.id);
      const fallbackAttrs = fallbackIds.length ? await safeQuery<ProductAttrServing[]>(() => supabase.from("product_attributes").select(ATTR_SELECT).in("item_id", fallbackIds)) : null;
      const fallbackAttrMap = new Map<string, ProductAttrServing>((fallbackAttrs || []).map((attr) => [attr.item_id, attr]));
      const usedIds = new Set<string>(recommendations.map((item) => item.id));
      const usedCategories = new Set<string>(recommendations.map((item) => item.category_id));
      usedCategories.add(triggerItem.category_id);

      const tryAdd = (item: MenuItemServing, requireDifferentCategory: boolean) => {
        if (recommendations.length >= 2) return;
        if (usedIds.has(item.id)) return;
        if (blockedIds.has(item.id) || globalBlockedIds.has(item.id)) return;
        if (requireDifferentCategory && usedCategories.has(item.category_id)) return;
        const candidateAttr = fallbackAttrMap.get(item.id) || null;
        const candidateRole = getRole(candidateAttr, item.name);
        if (!canBeRecommended(candidateAttr, item.name, Number(item.price || 0))) return;
        if (!isContextuallyCompatible(triggerRole, candidateRole)) return;
        if (!passesDietaryRules(triggerAttr, candidateAttr, restrictions as string[])) return;
        if (shouldSkipBecauseCartAlreadyHasRole(candidateRole, cartHasDrink, cartHasDessert, cartHasSide)) return;

        recommendations.push({
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: item.image_url,
          category_id: item.category_id,
          pitch: defaultPitch(triggerRole, candidateRole),
          score: item.is_featured ? 70 : item.badge ? 60 : 50,
          source: "fallback",
          trigger_item_name: triggerItem.name,
        });
        usedIds.add(item.id);
        usedCategories.add(item.category_id);
      };

      for (const item of allItems || []) tryAdd(item, true);
      for (const item of allItems || []) tryAdd(item, false);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[upsell-recommendations] ${recommendations.length} recs in ${elapsed}ms (source: ${source}, surface: ${surface}, tenant: ${tenant_id.slice(0, 8)}, triggerRole: ${triggerRole})`);

    return res.json({
      recommendations: recommendations.slice(0, 2),
      source,
      elapsed_ms: elapsed,
      cart_context: { cartHasDrink, cartHasDessert, cartHasSide },
      trigger_context: { triggerRole },
    });
  } catch (error: any) {
    console.error("[upsell-recommendations] Fatal error:", error.message);
    return res.json({ recommendations: [], source: "error", error: error.message });
  }
}
