import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

const drinkKeywords = ["bebida", "refresco", "agua", "jugo", "café", "cerveza", "limonada", "té", "smoothie", "batido", "coctel", "cóctel", "vino", "licor", "drink", "milkshake", "shake"];

/**
 * Dual AI Upsell API v3 — V17.1
 * - Always returns EXACTLY 2 suggestions from DIFFERENT categories
 * - Learns from upsell_feedback table (accepted/rejected history)
 * - Fallback guarantees diversity even if GPT returns 1
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const startTime = Date.now();

  try {
    const { cart, tenant_id, restaurant_name, trigger_category_id } = req.body;

    console.log(`[AI Upsell v3] Request — tenant=${tenant_id}, cart=${cart?.length}`);

    if (!cart || !Array.isArray(cart) || cart.length === 0)
      return res.status(400).json({ error: "Cart is required" });
    if (!tenant_id)
      return res.status(400).json({ error: "tenant_id is required" });
    if (!process.env.OPENAI_API_KEY)
      return res.json({ upsells: [], suggested_items: [], fallback: true, reason: "no_api_key" });

    // ── 1. Fetch menu items ──────────────────────────────────────────────────
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select(`id, name, description, price, image_url, badge, is_available, category_id, categories!inner(name)`)
      .eq("tenant_id", tenant_id)
      .eq("is_available", true)
      .limit(80);

    if (menuError) {
      console.error("[AI Upsell v3] Supabase error:", menuError.message);
      return res.json({ upsells: [], suggested_items: [], fallback: true, reason: "supabase_error" });
    }

    // ── 2. Fetch learning data from upsell_feedback ──────────────────────────
    const triggerItemId = cart[0]?.id;
    let acceptedPairs: string[] = [];
    let rejectedPairs: string[] = [];

    if (triggerItemId) {
      const { data: feedbackData } = await supabase
        .from("upsell_feedback")
        .select("suggested_item_id, action")
        .eq("tenant_id", tenant_id)
        .eq("trigger_item_id", triggerItemId)
        .in("action", ["accepted", "rejected"])
        .order("created_at", { ascending: false })
        .limit(30);

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
    }

    // ── 3. Build available catalog (exclude same category + cart items) ───────
    const cartItemIds = new Set(cart.map((item: any) => item.id));
    const cartCategoryIds = new Set(cart.map((item: any) => item.category_id).filter(Boolean));
    const excludedCategoryIds = trigger_category_id
      ? new Set([trigger_category_id, ...cartCategoryIds])
      : cartCategoryIds;

    const availableCatalog = (menuItems || [])
      .filter((item) => !cartItemIds.has(item.id) && !excludedCategoryIds.has(item.category_id))
      .slice(0, 50)
      .map((item) => {
        // Score: +3 if accepted before, -2 if rejected, +1 if most ordered badge
        let score = 0;
        if (acceptedPairs.includes(item.id)) score += 3;
        if (rejectedPairs.includes(item.id)) score -= 2;
        if (item.badge === "más pedido" || item.badge === "popular") score += 1;
        return {
          id: item.id,
          name: item.name,
          price: item.price,
          image_url: item.image_url,
          description: (item.description || "").slice(0, 80),
          category: (item.categories as any)?.name || "Sin categoría",
          category_id: item.category_id,
          badge: item.badge || "",
          _score: score,
        };
      })
      .sort((a, b) => b._score - a._score);

    // ── 4. Build catalog text with learning signals ───────────────────────────
    const catalogText = availableCatalog
      .map((item) => {
        const learningTag = acceptedPairs.includes(item.id)
          ? ` ⭐ PREFERIDO (${acceptedPairs.filter((id) => id === item.id).length}x aceptado)`
          : rejectedPairs.includes(item.id)
          ? " ❌ RECHAZADO ANTES"
          : "";
        return `ID:${item.id} | ${item.name} | ₡${item.price} | Cat: ${item.category}${item.badge ? ` | ${item.badge}` : ""}${learningTag} | ${item.description}`;
      })
      .join("\n");

    const triggerItem = cart[0];
    const triggerIsDrink = triggerItem && drinkKeywords.some((kw) => triggerItem.name?.toLowerCase().includes(kw));
    const cartHasDietaryRestriction = cart.some((item: any) =>
      ["vegetarian", "vegan", "vegano", "vegetariano"].some((kw) => item.name?.toLowerCase().includes(kw))
    );

    const cartSummary = cart.map((item: any) => `- ${item.name} (₡${item.price})`).join("\n");

    // ── 5. Call GPT for 2 diverse suggestions ────────────────────────────────
    const systemPrompt = `Eres el mejor mesero del mundo trabajando en ${restaurant_name || "este restaurante"}.

El cliente está viendo este producto:
${cartSummary}

Catálogo disponible (ya filtrado — NO incluye la misma categoría del producto que está viendo):
${catalogText}

REGLAS CRÍTICAS:
1. ${triggerIsDrink ? "⚠️ El cliente ve una BEBIDA. NUNCA sugieras otra bebida, milkshake, smoothie, jugo, cóctel, licor ni nada para beber. SOLO comida: entradas, platos principales, snacks o postres." : "El cliente ve comida. Sugiere 1 complemento (papas, entrada, snack) Y 1 bebida que combine bien."}
2. ${cartHasDietaryRestriction ? "⚠️ RESTRICCIÓN: El cliente tiene platos vegetarianos/veganos. NO sugieras carne." : "Sin restricciones dietéticas."}
3. NUNCA sugieras algo de la misma categoría del producto que está viendo.
4. Los ítems con ⭐ PREFERIDO son los que otros clientes han aceptado — dales PRIORIDAD.
5. Los ítems con ❌ RECHAZADO ANTES fueron rechazados — EVÍTALOS si hay alternativa.
6. Genera EXACTAMENTE 2 sugerencias de CATEGORÍAS DIFERENTES entre sí. OBLIGATORIO: retorna 2 objetos en el array upsells.
7. Los IDs DEBEN ser exactamente del catálogo de arriba.
8. Cada pitch: máximo 12 palabras, persuasivo y específico.

Devuelve ESTRICTAMENTE un JSON (sin markdown):
{
  "upsells": [
    { "trigger_item_name": "nombre del plato del carrito", "suggested_item_id": "id-del-catalogo", "pitch": "frase corta antojadora" },
    { "trigger_item_name": "nombre del plato del carrito", "suggested_item_id": "id-del-catalogo", "pitch": "frase corta antojadora" }
  ]
}`;

    console.log(`[AI Upsell v3] Calling GPT... catalog=${availableCatalog.length}, accepted=${acceptedPairs.length}, rejected=${rejectedPairs.length}`);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OpenAI timeout after 8s")), 8000)
    );

    const openaiPromise = openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      max_tokens: 600,
      temperature: 0.7,
    });

    const completion = await Promise.race([openaiPromise, timeoutPromise]);
    const rawContent = completion.choices[0]?.message?.content || "{}";
    console.log(`[AI Upsell v3] GPT raw: ${rawContent}`);

    let parsed: { upsells?: Array<{ trigger_item_name: string; suggested_item_id: string; pitch: string }> } = {};
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return res.json({ upsells: [], suggested_items: [], fallback: true, reason: "json_parse_error" });
    }

    // ── 6. Validate and enforce diversity ────────────────────────────────────
    const validIds = new Set(availableCatalog.map((item) => item.id));
    const validUpsells = (parsed.upsells || []).filter((u) => validIds.has(u.suggested_item_id));

    const finalUpsells: Array<{ id: string; pitch: string }> = [];
    const usedIds = new Set<string>();
    const usedCategories = new Set<string>();

    // First pass: add GPT's valid suggestions, ensuring category diversity
    for (const u of validUpsells) {
      if (finalUpsells.length >= 2) break;
      if (usedIds.has(u.suggested_item_id)) continue;
      const catalogItem = availableCatalog.find((c) => c.id === u.suggested_item_id);
      if (!catalogItem) continue;
      if (usedCategories.has(catalogItem.category_id)) continue; // skip same category
      finalUpsells.push({ id: u.suggested_item_id, pitch: u.pitch });
      usedIds.add(u.suggested_item_id);
      usedCategories.add(catalogItem.category_id);
    }

    // Second pass: fallback to fill remaining slots with best-scored items from unused categories
    if (finalUpsells.length < 2) {
      // Sort: prefer items from new categories, then by score
      const remainingCandidates = availableCatalog
        .filter((c) => !usedIds.has(c.id))
        .sort((a, b) => {
          const aNew = usedCategories.has(a.category_id) ? 0 : 1;
          const bNew = usedCategories.has(b.category_id) ? 0 : 1;
          if (aNew !== bNew) return bNew - aNew;
          return b._score - a._score;
        });

      for (const candidate of remainingCandidates) {
        if (finalUpsells.length >= 2) break;
        if (usedIds.has(candidate.id)) continue;

        // If there are still different-category options, skip same-category candidates
        const hasDifferentCatAvailable = remainingCandidates.some(
          (c) => !usedCategories.has(c.category_id) && !usedIds.has(c.id)
        );
        if (usedCategories.has(candidate.category_id) && hasDifferentCatAvailable) continue;

        // Determine pitch based on context
        const isDrinkCandidate = drinkKeywords.some((kw) => candidate.name.toLowerCase().includes(kw));
        const fallbackPitch = isDrinkCandidate
          ? `La bebida perfecta para acompañar tu pedido`
          : `Perfecto para completar tu experiencia`;

        finalUpsells.push({ id: candidate.id, pitch: fallbackPitch });
        usedIds.add(candidate.id);
        usedCategories.add(candidate.category_id);
      }
    }

    // ── 7. Build enriched response ────────────────────────────────────────────
    const suggestedItems = finalUpsells
      .map((u) => {
        const item = menuItems?.find((m) => m.id === u.id);
        if (!item) return null;
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: item.image_url,
          category_id: item.category_id,
          trigger_item_name: cart[0]?.name || "",
          pitch: u.pitch,
        };
      })
      .filter(Boolean);

    console.log(`[AI Upsell v3] Final — ${suggestedItems.length} items, time=${Date.now() - startTime}ms`);

    return res.json({
      upsells: finalUpsells.map((u) => ({
        trigger_item_name: cart[0]?.name || "",
        suggested_item_id: u.id,
        pitch: u.pitch,
      })),
      suggested_items: suggestedItems,
      fallback: finalUpsells.some((u) => !validUpsells.find((v) => v.suggested_item_id === u.id)),
    });

  } catch (error: any) {
    console.error("[AI Upsell v3] Error:", error.message);
    return res.json({ upsells: [], suggested_items: [], fallback: true, reason: error.message });
  }
}
