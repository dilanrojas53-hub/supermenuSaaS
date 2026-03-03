import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase client (server-side, uses anon key since RLS is public for menu_items)
const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "1mb" }));

  // ─── AI Upsell Endpoint ───────────────────────────────────────────────────
  app.post("/api/generate-upsell", async (req, res) => {
    const startTime = Date.now();

    try {
      const { cart, tenant_id, restaurant_name } = req.body;

      if (!cart || !Array.isArray(cart) || cart.length === 0) {
        return res.status(400).json({ error: "Cart is required" });
      }

      if (!tenant_id) {
        return res.status(400).json({ error: "tenant_id is required" });
      }

      // Fetch menu catalog from Supabase
      const { data: menuItems, error: menuError } = await supabase
        .from("menu_items")
        .select("id, name, description, price, category_id, dietary_tags, is_available")
        .eq("tenant_id", tenant_id)
        .eq("is_available", true)
        .limit(80);

      if (menuError) {
        console.error("Supabase error fetching menu:", menuError);
        return res.status(500).json({ error: "Failed to fetch menu" });
      }

      // Build cart summary for the prompt
      const cartSummary = cart
        .map((item: any) => `- ${item.name} (${item.category || "sin categoría"})`)
        .join("\n");

      // Build catalog summary (limit to avoid token overflow)
      const cartItemIds = new Set(cart.map((item: any) => item.id));
      const availableCatalog = (menuItems || [])
        .filter((item) => !cartItemIds.has(item.id))
        .slice(0, 50)
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          dietary_tags: item.dietary_tags || [],
          description: item.description?.slice(0, 80) || "",
        }));

      const catalogText = availableCatalog
        .map(
          (item) =>
            `ID:${item.id} | ${item.name} | ₡${item.price} | Tags: ${item.dietary_tags.join(", ") || "ninguno"} | ${item.description}`
        )
        .join("\n");

      // Check if cart has vegetarian/vegan items
      const cartHasDietaryRestriction = cart.some(
        (item: any) =>
          item.dietary_tags?.includes("vegetariano") ||
          item.dietary_tags?.includes("vegano") ||
          item.dietary_tags?.includes("vegetarian") ||
          item.dietary_tags?.includes("vegan")
      );

      // Check if cart has drinks
      const cartHasDrinks = cart.some(
        (item: any) =>
          item.category?.toLowerCase().includes("bebida") ||
          item.category?.toLowerCase().includes("té") ||
          item.category?.toLowerCase().includes("café") ||
          item.category?.toLowerCase().includes("drink")
      );

      const systemPrompt = `Eres un experto Sommelier y el mejor mesero del mundo trabajando en ${restaurant_name || "este restaurante"}.

El cliente tiene esto en su carrito:
${cartSummary}

Este es nuestro menú disponible (NO sugerir lo que ya está en el carrito):
${catalogText}

Tu tarea es hacer un 'Cross-sell' o 'Up-sell' inteligente y altamente lógico.

REGLAS ESTRICTAS DE LÓGICA:
1. RESTRICCIÓN DIETÉTICA (CRÍTICO): ${cartHasDietaryRestriction ? "El carrito contiene platos vegetarianos o veganos. TIENES ESTRICTAMENTE PROHIBIDO sugerir cualquier producto que contenga carne." : "No hay restricciones dietéticas detectadas."}
2. LÓGICA DE BEBIDAS (MARIDAJE): ${!cartHasDrinks ? "El cliente lleva comida pero NO lleva bebidas. DEBES sugerir una o dos bebidas que combinen perfectamente con la comida seleccionada." : "El cliente ya tiene bebidas en su carrito."}
3. EQUILIBRIO DE SABORES: No ofrezcas más comida pesada si el carrito ya es muy abundante. En su lugar, sugiere un postre ligero o una bebida refrescante.
4. DUPLICADOS: Nunca sugieras algo que ya está en el carrito.
5. Sugiere máximo 2 productos.

Devuelve ESTRICTAMENTE un objeto JSON con este formato exacto (sin markdown, sin texto extra):
{
  "suggested_item_ids": ["id1", "id2"],
  "pitch_message": "Mensaje persuasivo, corto y antojador (máximo 20 palabras) justificando por qué esta combinación exacta es perfecta para su pedido."
}`;

      // Call OpenAI with 4-second timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("OpenAI timeout")), 4000)
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
      let parsed: { suggested_item_ids?: string[]; pitch_message?: string } = {};

      try {
        parsed = JSON.parse(rawContent);
      } catch {
        console.error("Failed to parse OpenAI response:", rawContent);
        return res.json({ suggested_item_ids: [], pitch_message: null, fallback: true });
      }

      // Validate suggested IDs exist in catalog
      const validIds = new Set(availableCatalog.map((item) => item.id));
      const suggestedIds = (parsed.suggested_item_ids || []).filter((id) => validIds.has(id));

      // Fetch full item details for the suggested IDs
      const suggestedItems = suggestedIds
        .map((id) => menuItems?.find((item) => item.id === id))
        .filter(Boolean);

      console.log(
        `[AI Upsell] tenant=${tenant_id} cart=${cart.length} items suggested=${suggestedIds.length} time=${Date.now() - startTime}ms`
      );

      return res.json({
        suggested_item_ids: suggestedIds,
        suggested_items: suggestedItems,
        pitch_message: parsed.pitch_message || null,
        fallback: false,
      });
    } catch (error: any) {
      console.error("[AI Upsell] Error:", error.message);
      // Fallback: return empty so frontend skips modal and goes to checkout
      return res.json({
        suggested_item_ids: [],
        suggested_items: [],
        pitch_message: null,
        fallback: true,
        error: error.message,
      });
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
