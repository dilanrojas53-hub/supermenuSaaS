/**
 * generate-upsell.ts — V19.0 (Hard Constraints Edition)
 * Única fuente de verdad del upsell en producción (Vercel Serverless).
 * server/index.ts ya NO es la fuente de verdad del upsell.
 *
 * Arquitectura:
 *  1. Inferir rol gastronómico del trigger
 *  2. Filtrar catálogo con HARD CONSTRAINTS (no scoring blando para exclusiones)
 *  3. Aplicar guardrail de precio por rol
 *  4. Penalizar saturación
 *  5. GPT elige entre top-8 curados (refinador, no árbitro)
 *  6. Fallback determinístico si GPT falla
 *  7. Respuesta enriquecida con image_url + subtitle contextual
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

type ProductRole =
  | "appetizer" | "snack" | "side" | "sauce"
  | "main" | "steak" | "burger" | "pizza" | "seafood"
  | "drink" | "hot_drink" | "dessert" | "addon" | "unknown";

interface ScoredItem {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  description: string;
  category: string;
  category_id: string;
  badge: string;
  role: ProductRole;
  _saturationCount: number;
  _acceptedCount: number;
  _rejectedCount: number;
  _score: number;
  _exclusionReason: string | null;
  _priceMultiplier: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INFERENCIA DE ROL
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_KEYWORDS: Record<ProductRole, string[]> = {
  appetizer: ["entrada", "entrante", "starter", "ceviche", "carpaccio", "bruschetta", "tapa"],
  snack:     ["snack", "chistorra", "pincho", "aro", "croqueta", "edamame", "hongo", "panko", "frito", "chips", "nachos"],
  side:      ["papa", "frita", "arroz", "ensalada", "guarnicion", "side", "yuca", "platano", "toston"],
  sauce:     ["salsa", "dip", "aderezo", "guacamole", "hummus", "mayonesa", "chimichurri"],
  main:      ["pollo", "pechuga", "filete", "lomo", "cerdo", "pasta", "risotto", "plato principal", "main"],
  steak:     ["corte", "res", "angus", "ribeye", "t-bone", "new york", "filet mignon", "churrasco", "bife", "usda", "certified"],
  burger:    ["hamburguesa", "burger", "smash", "doble carne", "triple"],
  pizza:     ["pizza", "calzone"],
  seafood:   ["mariscos", "camaron", "langosta", "pulpo", "atun", "salmon", "pescado", "del mar", "tilapia", "corvina"],
  drink:     ["bebida", "refresco", "agua", "jugo", "limonada", "cerveza", "vino", "coctel", "smoothie", "batido", "milkshake", "shake", "licor"],
  hot_drink: ["cafe", "capuchino", "latte", "espresso", "te caliente", "chocolate caliente", "americano"],
  dessert:   ["postre", "helado", "torta", "cheesecake", "brownie", "flan", "tiramisu", "crepe", "waffle", "churro", "dulce"],
  addon:     ["extra", "adicional", "topping", "ingrediente", "complemento", "addon"],
  unknown:   [],
};

function inferRole(name: string, categoryName: string): ProductRole {
  const text = (name + " " + categoryName)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS) as [ProductRole, string[]][]) {
    if (role === "unknown") continue;
    if (keywords.some((kw) => text.includes(kw))) return role;
  }
  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// HARD CONSTRAINTS — whitelist de roles permitidos por trigger
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_TARGETS: Record<ProductRole, ProductRole[]> = {
  appetizer: ["drink", "hot_drink", "side", "sauce", "addon", "snack"],
  snack:     ["drink", "hot_drink", "sauce", "side", "addon"],
  side:      ["drink", "sauce", "addon", "snack"],
  sauce:     ["side", "snack", "addon", "drink"],
  main:      ["side", "drink", "sauce", "addon", "appetizer", "snack"],
  steak:     ["side", "drink", "hot_drink", "sauce", "addon", "appetizer"],
  burger:    ["side", "drink", "sauce", "addon", "snack"],
  pizza:     ["side", "drink", "sauce", "addon", "snack"],
  seafood:   ["side", "drink", "sauce", "addon", "appetizer", "snack"],
  drink:     ["snack", "side", "dessert", "addon", "appetizer"],
  hot_drink: ["dessert", "snack", "addon"],
  dessert:   ["hot_drink", "drink", "addon"],
  addon:     ["drink", "side", "snack", "sauce"],
  unknown:   ["side", "drink", "snack", "sauce", "addon"],
};

// ─────────────────────────────────────────────────────────────────────────────
// GUARDRAILS DE PRECIO — max multiplicador sobre el precio del trigger
// ─────────────────────────────────────────────────────────────────────────────

const PRICE_GUARDRAIL: Record<ProductRole, number> = {
  appetizer: 1.6, snack: 1.6, side: 1.6, sauce: 1.6,
  main: 1.8, steak: 1.8, burger: 1.8, pizza: 1.8, seafood: 1.8,
  drink: 1.4, hot_drink: 1.4, dessert: 1.5, addon: 2.0, unknown: 1.6,
};

// ─────────────────────────────────────────────────────────────────────────────
// SUBTÍTULOS CONTEXTUALES
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_SUBTITLE: Record<ProductRole, string> = {
  appetizer: "Muchos clientes lo piden junto",
  snack:     "El acompañamiento ideal",
  side:      "Complementa tu plato",
  sauce:     "Más sabor para tu elección",
  main:      "Para completar tu experiencia",
  steak:     "El maridaje ideal para tu corte",
  burger:    "Completa la experiencia de tu burger",
  pizza:     "Extras que hacen la diferencia",
  seafood:   "El complemento perfecto del mar",
  drink:     "Algo para acompañar tu bebida",
  hot_drink: "El dulce complemento perfecto",
  dessert:   "Para cerrar con broche de oro",
  addon:     "Personaliza tu pedido",
  unknown:   "Recomendado para ti",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: diversidad de categorías en el top-N
// ─────────────────────────────────────────────────────────────────────────────

function selectDiverseTop(candidates: ScoredItem[], n: number): ScoredItem[] {
  const result: ScoredItem[] = [];
  const usedCategories = new Set<string>();
  // Primera pasada: un ítem por categoría
  for (const c of candidates) {
    if (result.length >= n) break;
    if (!usedCategories.has(c.category_id)) {
      result.push(c);
      usedCategories.add(c.category_id);
    }
  }
  // Segunda pasada: completar si no llegamos a N
  for (const c of candidates) {
    if (result.length >= n) break;
    if (!result.find((r) => r.id === c.id)) result.push(c);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const startTime = Date.now();

  try {
    const { cart, tenant_id, restaurant_name, trigger_category_id } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0)
      return res.status(400).json({ error: "Cart is required" });
    if (!tenant_id)
      return res.status(400).json({ error: "tenant_id is required" });
    if (!process.env.OPENAI_API_KEY)
      return res.json({ upsells: [], suggested_items: [], fallback: true, reason: "no_api_key" });

    const triggerItem = cart[0];
    const triggerItemId = triggerItem?.id;

    // ── 1. Fetch menu items con join a categories ──────────────────────────
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select(`id, name, description, price, image_url, badge, is_available, category_id, categories!inner(name)`)
      .eq("tenant_id", tenant_id)
      .eq("is_available", true)
      .limit(100);

    if (menuError || !menuItems) {
      console.error("[Upsell V19] Supabase error:", menuError?.message);
      return res.json({ upsells: [], suggested_items: [], fallback: true, reason: "supabase_error" });
    }

    // ── 2. Inferir rol del trigger ─────────────────────────────────────────
    const triggerCategoryName =
      (menuItems.find((m) => m.id === triggerItemId) as any)?.categories?.name || "";
    const triggerRole = inferRole(triggerItem?.name || "", triggerCategoryName);
    const allowedTargetRoles = ALLOWED_TARGETS[triggerRole] ?? ALLOWED_TARGETS.unknown;
    const maxPriceMultiplier = PRICE_GUARDRAIL[triggerRole] ?? 1.6;
    const triggerPrice = triggerItem?.price ?? 0;

    console.log(
      `[Upsell V19] trigger="${triggerItem?.name}" role=${triggerRole} ` +
      `allowed=[${allowedTargetRoles.join(",")}] maxPrice=${maxPriceMultiplier}x`
    );

    // ── 3. Fetch feedback (aprendizaje) + saturación ───────────────────────
    let acceptedPairs: string[] = [];
    let rejectedPairs: string[] = [];
    const saturationMap: Record<string, number> = {};

    if (triggerItemId) {
      const { data: feedbackData } = await supabase
        .from("upsell_feedback")
        .select("suggested_item_id, action")
        .eq("tenant_id", tenant_id)
        .eq("trigger_item_id", triggerItemId)
        .in("action", ["accepted", "rejected"])
        .order("created_at", { ascending: false })
        .limit(50);

      if (feedbackData) {
        acceptedPairs = feedbackData
          .filter((f) => f.action === "accepted")
          .map((f) => f.suggested_item_id)
          .slice(0, 10);
        rejectedPairs = feedbackData
          .filter((f) => f.action === "rejected")
          .map((f) => f.suggested_item_id)
          .slice(0, 20);
      }

      // Saturación: cuántos triggers distintos recibieron este ítem como upsell
      const { data: satData } = await supabase
        .from("upsell_feedback")
        .select("suggested_item_id, trigger_item_id")
        .eq("tenant_id", tenant_id)
        .eq("action", "accepted")
        .limit(200);

      if (satData) {
        for (const row of satData) {
          saturationMap[row.suggested_item_id] =
            (saturationMap[row.suggested_item_id] || 0) + 1;
        }
      }
    }

    // ── 4. Construir catálogo con hard constraints + scoring ───────────────
    const cartItemIds = new Set(cart.map((item: any) => item.id));
    const cartCategoryIds = new Set(
      cart.map((item: any) => item.category_id).filter(Boolean)
    );
    const excludedCategoryIds = trigger_category_id
      ? new Set([trigger_category_id, ...cartCategoryIds])
      : cartCategoryIds;

    const scoredCatalog: ScoredItem[] = [];

    for (const item of menuItems) {
      if (cartItemIds.has(item.id)) continue;
      if (excludedCategoryIds.has(item.category_id)) continue;

      const categoryName = (item.categories as any)?.name || "";
      const candidateRole = inferRole(item.name, categoryName);
      const priceMultiplier = triggerPrice > 0 ? item.price / triggerPrice : 1;
      let exclusionReason: string | null = null;

      // HARD CONSTRAINT 1: rol no permitido
      if (!allowedTargetRoles.includes(candidateRole)) {
        exclusionReason = `role_blocked(${triggerRole}→${candidateRole})`;
      }
      // HARD CONSTRAINT 2: guardrail de precio
      if (!exclusionReason && triggerPrice > 0 && priceMultiplier > maxPriceMultiplier) {
        exclusionReason = `price_guardrail(${priceMultiplier.toFixed(2)}x>max${maxPriceMultiplier}x)`;
      }
      // HARD CONSTRAINT 3: drink no recomienda drink ni hot_drink
      if (
        !exclusionReason &&
        triggerRole === "drink" &&
        (candidateRole === "drink" || candidateRole === "hot_drink")
      ) {
        exclusionReason = "drink_no_drink";
      }
      // HARD CONSTRAINT 4: dessert solo recomienda hot_drink, drink, addon
      if (
        !exclusionReason &&
        triggerRole === "dessert" &&
        !["hot_drink", "drink", "addon"].includes(candidateRole)
      ) {
        exclusionReason = "dessert_only_drinks_addons";
      }
      // HARD CONSTRAINT 5: hot_drink solo recomienda dessert o snack
      if (
        !exclusionReason &&
        triggerRole === "hot_drink" &&
        !["dessert", "snack"].includes(candidateRole)
      ) {
        exclusionReason = "hot_drink_only_dessert_snack";
      }

      // Scoring (solo para candidatos que pasaron hard constraints)
      let score = 50;
      if (!exclusionReason) {
        const acceptedCount = acceptedPairs.filter((id) => id === item.id).length;
        const rejectedCount = rejectedPairs.filter((id) => id === item.id).length;
        score += acceptedCount * 15;
        score -= rejectedCount * 10;
        if (item.badge === "más pedido" || item.badge === "popular") score += 8;
        if (item.badge === "nuevo") score += 3;
        const satCount = saturationMap[item.id] ?? 0;
        if (satCount > 10) score -= 20;
        else if (satCount > 5) score -= 10;
        else if (satCount > 3) score -= 5;
        if (priceMultiplier >= 0.5 && priceMultiplier <= 1.2) score += 5;
      }

      // Log detallado por candidato
      console.log(
        `[Upsell V19] candidate="${item.name}" role=${candidateRole} ` +
        `priceX=${priceMultiplier.toFixed(2)} score=${score} ` +
        `${exclusionReason ? "EXCLUDED(" + exclusionReason + ")" : "OK"} ` +
        `image=${item.image_url ? "YES" : "NO"}`
      );

      scoredCatalog.push({
        id: item.id,
        name: item.name,
        price: item.price,
        image_url: item.image_url ?? null,
        description: (item.description || "").slice(0, 80),
        category: categoryName,
        category_id: item.category_id,
        badge: item.badge || "",
        role: candidateRole,
        _saturationCount: saturationMap[item.id] ?? 0,
        _acceptedCount: acceptedPairs.filter((id) => id === item.id).length,
        _rejectedCount: rejectedPairs.filter((id) => id === item.id).length,
        _score: score,
        _exclusionReason: exclusionReason,
        _priceMultiplier: priceMultiplier,
      });
    }

    const validCandidates = scoredCatalog
      .filter((c) => c._exclusionReason === null)
      .sort((a, b) => b._score - a._score);

    console.log(
      `[Upsell V19] valid=${validCandidates.length} excluded=${scoredCatalog.length - validCandidates.length}`
    );

    if (validCandidates.length === 0) {
      return res.json({
        upsells: [],
        suggested_items: [],
        fallback: true,
        reason: "no_valid_candidates_after_hard_constraints",
        subtitle: ROLE_SUBTITLE[triggerRole],
      });
    }

    const top8 = selectDiverseTop(validCandidates, 8);
    let finalUpsells: Array<{ id: string; pitch: string }> = [];

    // ── 5. GPT como refinador (elige entre top8 curados) ──────────────────
    try {
      const catalogText = top8
        .map(
          (c, i) =>
            `${i + 1}. [${c.id}] ${c.name} — ${c.price} (${c.category})${c.badge ? " [" + c.badge + "]" : ""}`
        )
        .join("\n");

      const systemPrompt = `Eres un sommelier gastronómico experto en ${restaurant_name || "restaurante"}.
El cliente va a pedir: "${triggerItem?.name}" (rol: ${triggerRole}).
Elige EXACTAMENTE 2 ítems del catálogo que complementen GASTRONÓMICAMENTE este plato.
Reglas:
- Solo puedes elegir de la lista numerada. No inventes IDs.
- Los 2 ítems deben ser de CATEGORÍAS DISTINTAS.
- Escribe un pitch corto (máx 8 palabras) en español, antojador y específico.
- Responde SOLO con JSON válido.

Catálogo curado (${top8.length} opciones):
${catalogText}

Responde exactamente:
{"upsells":[{"suggested_item_id":"uuid-exacto","pitch":"frase"},{"suggested_item_id":"uuid-exacto","pitch":"frase"}]}`;

      const completion = await Promise.race([
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }],
          response_format: { type: "json_object" },
          max_tokens: 300,
          temperature: 0.5,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("OpenAI timeout")), 7000)
        ),
      ]);

      const rawContent =
        (completion as any).choices[0]?.message?.content || "{}";
      console.log(`[Upsell V19] GPT raw: ${rawContent}`);

      const parsed = JSON.parse(rawContent);
      const validIds = new Set(top8.map((c) => c.id));
      const usedCategories = new Set<string>();

      for (const u of parsed.upsells || []) {
        if (finalUpsells.length >= 2) break;
        if (!validIds.has(u.suggested_item_id)) continue;
        const candidate = top8.find((c) => c.id === u.suggested_item_id);
        if (!candidate || usedCategories.has(candidate.category_id)) continue;
        finalUpsells.push({ id: u.suggested_item_id, pitch: u.pitch });
        usedCategories.add(candidate.category_id);
      }
    } catch (gptErr: any) {
      console.warn(
        `[Upsell V19] GPT failed: ${gptErr.message} — deterministic fallback`
      );
    }

    // ── 6. Fallback determinístico si GPT no completó 2 ───────────────────
    if (finalUpsells.length < 2) {
      const usedIds = new Set(finalUpsells.map((u) => u.id));
      const usedCategories = new Set(
        finalUpsells
          .map((u) => top8.find((c) => c.id === u.id)?.category_id)
          .filter(Boolean) as string[]
      );

      for (const candidate of top8) {
        if (finalUpsells.length >= 2) break;
        if (usedIds.has(candidate.id) || usedCategories.has(candidate.category_id)) continue;
        const isDrink =
          candidate.role === "drink" || candidate.role === "hot_drink";
        finalUpsells.push({
          id: candidate.id,
          pitch: isDrink
            ? "La bebida perfecta para acompañar"
            : "Perfecto para completar tu pedido",
        });
        usedIds.add(candidate.id);
        usedCategories.add(candidate.category_id);
      }

      // Relajar restricción de categoría si aún falta uno
      if (finalUpsells.length < 2) {
        const usedIds2 = new Set(finalUpsells.map((u) => u.id));
        for (const candidate of validCandidates) {
          if (finalUpsells.length >= 2) break;
          if (!usedIds2.has(candidate.id)) {
            finalUpsells.push({ id: candidate.id, pitch: "Recomendado para ti" });
            usedIds2.add(candidate.id);
          }
        }
      }
    }

    // ── 7. Respuesta enriquecida con image_url ─────────────────────────────
    const suggestedItems = finalUpsells
      .map((u) => {
        const item = menuItems.find((m) => m.id === u.id);
        if (!item) return null;
        const scored = scoredCatalog.find((c) => c.id === u.id);
        console.log(
          `[Upsell V19] FINAL item="${item.name}" image=${item.image_url ? "YES" : "NO"} score=${scored?._score}`
        );
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: item.image_url ?? null,
          category_id: item.category_id,
          trigger_item_name: triggerItem?.name || "",
          pitch: u.pitch,
        };
      })
      .filter(Boolean);

    const subtitle = ROLE_SUBTITLE[triggerRole] ?? "Recomendado para ti";

    console.log(
      `[Upsell V19] DONE items=${suggestedItems.length} time=${Date.now() - startTime}ms subtitle="${subtitle}"`
    );

    return res.json({
      upsells: finalUpsells.map((u) => ({
        trigger_item_name: triggerItem?.name || "",
        suggested_item_id: u.id,
        pitch: u.pitch,
      })),
      suggested_items: suggestedItems,
      subtitle,
      fallback: false,
    });
  } catch (error: any) {
    console.error("[Upsell V19] Unhandled error:", error.message);
    return res.json({
      upsells: [],
      suggested_items: [],
      fallback: true,
      reason: error.message,
    });
  }
}
