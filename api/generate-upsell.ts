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

/**
 * Multi-Upsell API v2
 *
 * New response schema:
 * {
 *   upsells: [
 *     { trigger_item_name, suggested_item_id, pitch },
 *     ...
 *   ],
 *   suggested_items: [ { id, name, description, price, image_url, trigger_item_name, pitch } ],
 *   fallback: boolean,
 *   reason?: string
 * }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const startTime = Date.now();

  try {
    const { cart, tenant_id, restaurant_name } = req.body;

    console.log(`[AI Upsell v2] Request — tenant=${tenant_id}, cart items=${cart?.length}`);

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart is required" });
    }

    if (!tenant_id) {
      return res.status(400).json({ error: "tenant_id is required" });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.log("[AI Upsell v2] No OPENAI_API_KEY set");
      return res.json({ upsells: [], suggested_items: [], fallback: true, reason: "no_api_key" });
    }

    // Fetch menu items + category names via JOIN
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select(`
        id,
        name,
        description,
        price,
        image_url,
        badge,
        is_available,
        categories!inner(name)
      `)
      .eq("tenant_id", tenant_id)
      .eq("is_available", true)
      .limit(80);

    if (menuError) {
      console.error("[AI Upsell v2] Supabase error:", menuError.message);
      return res.json({ upsells: [], suggested_items: [], fallback: true, reason: "supabase_error" });
    }

    console.log(`[AI Upsell v2] Fetched ${menuItems?.length || 0} menu items`);

    // Exclude cart items from catalog
    const cartItemIds = new Set(cart.map((item: any) => item.id));
    const availableCatalog = (menuItems || [])
      .filter((item) => !cartItemIds.has(item.id))
      .slice(0, 50)
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        image_url: item.image_url,
        description: (item.description || "").slice(0, 80),
        category: (item.categories as any)?.name || "Sin categoría",
        badge: item.badge || "",
      }));

    // Build cart summary with item names
    const cartSummary = cart
      .map((item: any) => `- ${item.name} (₡${item.price})`)
      .join("\n");

    const catalogText = availableCatalog
      .map(
        (item) =>
          `ID:${item.id} | ${item.name} | ₡${item.price} | Cat: ${item.category}${item.badge ? ` | ${item.badge}` : ""} | ${item.description}`
      )
      .join("\n");

    // Detect if cart has drinks
    const drinkKeywords = ["bebida", "refresco", "agua", "jugo", "café", "cerveza", "limonada", "té", "smoothie", "batido"];
    const cartHasDrinks = cart.some(
      (item: any) => drinkKeywords.some(kw => item.name?.toLowerCase().includes(kw))
    );

    const systemPrompt = `Eres un experto Sommelier y el mejor mesero del mundo trabajando en ${restaurant_name || "este restaurante"}.

El cliente tiene esto en su carrito:
${cartSummary}

Catálogo disponible (NO sugerir lo que ya está en el carrito):
${catalogText}

Tu tarea: Genera recomendaciones INDIVIDUALES de cross-sell/up-sell para cada plato principal del carrito.

REGLAS:
1. Analiza CADA item del carrito y genera una sugerencia personalizada para los que tengan sentido.
2. ${!cartHasDrinks ? "El cliente NO lleva bebidas. Al menos una sugerencia DEBE ser una bebida." : "El cliente ya tiene bebidas."}
3. No sugieras más comida pesada si el carrito ya es abundante. Prioriza complementos, bebidas o postres.
4. NUNCA sugieras algo que ya está en el carrito.
5. Puedes generar entre 1 y ${Math.min(cart.length, 4)} sugerencias. No es obligatorio una por cada item.
6. Los IDs DEBEN ser exactamente del catálogo de arriba.
7. Cada pitch debe ser corto (máximo 15 palabras), persuasivo y específico al trigger_item.

Devuelve ESTRICTAMENTE un JSON con este formato (sin markdown, sin texto extra):
{
  "upsells": [
    {
      "trigger_item_name": "Nombre exacto del plato del carrito que detona esta sugerencia",
      "suggested_item_id": "id-del-catalogo",
      "pitch": "Frase corta y antojadora explicando por qué combina perfecto."
    }
  ]
}`;

    console.log(`[AI Upsell v2] Calling GPT-4o-mini... catalog=${availableCatalog.length}, cart=${cart.length}`);

    // Race OpenAI call against 7-second timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OpenAI timeout after 7s")), 7000)
    );

    const openaiPromise = openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.7,
    });

    const completion = await Promise.race([openaiPromise, timeoutPromise]);

    const rawContent = completion.choices[0]?.message?.content || "{}";
    console.log(`[AI Upsell v2] GPT raw: ${rawContent}`);

    let parsed: { upsells?: Array<{ trigger_item_name: string; suggested_item_id: string; pitch: string }> } = {};

    try {
      parsed = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error("[AI Upsell v2] JSON parse error:", parseErr);
      return res.json({ upsells: [], suggested_items: [], fallback: true, reason: "json_parse_error" });
    }

    // Validate IDs exist in catalog
    const validIds = new Set(availableCatalog.map((item) => item.id));
    const validUpsells = (parsed.upsells || []).filter((u) => validIds.has(u.suggested_item_id));

    console.log(`[AI Upsell v2] GPT returned ${parsed.upsells?.length || 0} upsells, ${validUpsells.length} valid`);

    // Build enriched suggested_items with trigger info and pitch
    const suggestedItems = validUpsells
      .map((u) => {
        const item = menuItems?.find((m) => m.id === u.suggested_item_id);
        if (!item) return null;
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          price: item.price,
          image_url: item.image_url,
          trigger_item_name: u.trigger_item_name,
          pitch: u.pitch,
        };
      })
      .filter(Boolean);

    console.log(
      `[AI Upsell v2] Final — ${suggestedItems.length} items, time=${Date.now() - startTime}ms`
    );

    return res.json({
      upsells: validUpsells,
      suggested_items: suggestedItems,
      fallback: false,
    });
  } catch (error: any) {
    console.error("[AI Upsell v2] Error:", error.message);
    return res.json({
      upsells: [],
      suggested_items: [],
      fallback: true,
      reason: error.message,
    });
  }
}
