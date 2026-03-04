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

    console.log(`[AI Upsell] Request received — tenant=${tenant_id}, cart items=${cart?.length}`);

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      console.log("[AI Upsell] Error: cart is empty or missing");
      return res.status(400).json({ error: "Cart is required" });
    }

    if (!tenant_id) {
      console.log("[AI Upsell] Error: tenant_id is missing");
      return res.status(400).json({ error: "tenant_id is required" });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.log("[AI Upsell] Error: OPENAI_API_KEY is not set");
      return res.json({ suggested_item_ids: [], suggested_items: [], pitch_message: null, fallback: true, reason: "no_api_key" });
    }

    // Fetch menu items + category names via JOIN
    // NOTE: menu_items does NOT have dietary_tags column — use badge and description instead
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
      console.error("[AI Upsell] Supabase error:", menuError.message);
      return res.json({ suggested_item_ids: [], suggested_items: [], pitch_message: null, fallback: true, reason: "supabase_error" });
    }

    console.log(`[AI Upsell] Fetched ${menuItems?.length || 0} menu items from Supabase`);

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

    // Build cart summary using item names (category_id is a UUID, use name instead)
    const cartSummary = cart
      .map((item: any) => `- ${item.name}`)
      .join("\n");

    const catalogText = availableCatalog
      .map(
        (item) =>
          `ID:${item.id} | ${item.name} | ₡${item.price} | Categoría: ${item.category}${item.badge ? ` | Badge: ${item.badge}` : ""} | ${item.description}`
      )
      .join("\n");

    // Detect if cart has drinks already
    const cartHasDrinks = cart.some(
      (item: any) =>
        item.name?.toLowerCase().includes("bebida") ||
        item.name?.toLowerCase().includes("refresco") ||
        item.name?.toLowerCase().includes("agua") ||
        item.name?.toLowerCase().includes("jugo") ||
        item.name?.toLowerCase().includes("café") ||
        item.name?.toLowerCase().includes("cerveza") ||
        item.name?.toLowerCase().includes("limonada")
    );

    const systemPrompt = `Eres un experto Sommelier y el mejor mesero del mundo trabajando en ${restaurant_name || "este restaurante"}.

El cliente tiene esto en su carrito:
${cartSummary}

Este es nuestro menú disponible (NO sugerir lo que ya está en el carrito):
${catalogText}

Tu tarea es hacer un 'Cross-sell' o 'Up-sell' inteligente y altamente lógico.

REGLAS ESTRICTAS:
1. BEBIDAS: ${!cartHasDrinks ? "El cliente NO lleva bebidas. DEBES sugerir una bebida que combine perfectamente con su comida." : "El cliente ya tiene bebidas."}
2. EQUILIBRIO: No ofrezcas más comida pesada si el carrito ya es abundante. Sugiere un postre o bebida.
3. DUPLICADOS: Nunca sugieras algo que ya está en el carrito.
4. Sugiere máximo 2 productos.
5. IMPORTANTE: Los IDs que uses en suggested_item_ids DEBEN ser exactamente los IDs del catálogo de arriba.

Devuelve ESTRICTAMENTE un objeto JSON con este formato exacto (sin markdown, sin texto extra):
{
  "suggested_item_ids": ["id1", "id2"],
  "pitch_message": "Mensaje persuasivo, corto y antojador (máximo 20 palabras) justificando por qué esta combinación es perfecta."
}`;

    console.log(`[AI Upsell] Calling GPT-4o-mini... catalog size=${availableCatalog.length}`);

    // Race OpenAI call against 6-second timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("OpenAI timeout after 6s")), 6000)
    );

    const openaiPromise = openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      max_tokens: 200,
      temperature: 0.7,
    });

    const completion = await Promise.race([openaiPromise, timeoutPromise]);

    const rawContent = completion.choices[0]?.message?.content || "{}";
    console.log(`[AI Upsell] GPT-4o-mini raw response: ${rawContent}`);

    let parsed: { suggested_item_ids?: string[]; pitch_message?: string } = {};

    try {
      parsed = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error("[AI Upsell] JSON parse error:", parseErr);
      return res.json({ suggested_item_ids: [], suggested_items: [], pitch_message: null, fallback: true, reason: "json_parse_error" });
    }

    // Validate IDs exist in catalog
    const validIds = new Set(availableCatalog.map((item) => item.id));
    const suggestedIds = (parsed.suggested_item_ids || []).filter((id) => validIds.has(id));

    console.log(`[AI Upsell] Suggested IDs from GPT: ${JSON.stringify(parsed.suggested_item_ids)}`);
    console.log(`[AI Upsell] Valid IDs after filter: ${JSON.stringify(suggestedIds)}`);

    // Get full item details (including image_url for the modal)
    const suggestedItems = suggestedIds
      .map((id) => menuItems?.find((item) => item.id === id))
      .filter(Boolean)
      .map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        image_url: item.image_url,
      }));

    console.log(
      `[AI Upsell] Final result — tenant=${tenant_id} suggested=${suggestedIds.length} time=${Date.now() - startTime}ms pitch="${parsed.pitch_message}"`
    );

    return res.json({
      suggested_item_ids: suggestedIds,
      suggested_items: suggestedItems,
      pitch_message: parsed.pitch_message || null,
      fallback: false,
    });
  } catch (error: any) {
    console.error("[AI Upsell] Unexpected error:", error.message, error.stack);
    return res.json({
      suggested_item_ids: [],
      suggested_items: [],
      pitch_message: null,
      fallback: true,
      reason: error.message,
    });
  }
}
