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

  // ─── AI Upsell Endpoint (V17.0: 2 sugerencias + aprendizaje) ─────────────
  app.post("/api/generate-upsell", async (req, res) => {
    const startTime = Date.now();

    try {
      const { cart, tenant_id, restaurant_name, trigger_category_id } = req.body;

      if (!cart || !Array.isArray(cart) || cart.length === 0) {
        return res.status(400).json({ error: "Cart is required" });
      }

      if (!tenant_id) {
        return res.status(400).json({ error: "tenant_id is required" });
      }

      // ── 1. Fetch menu catalog from Supabase ──────────────────────────────
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

      // ── 2. Fetch top accepted pairs from upsell_feedback (learning data) ─
      const { data: topPairs } = await supabase
        .from("upsell_feedback")
        .select("suggested_item_id, suggested_item_name, action")
        .eq("tenant_id", tenant_id)
        .eq("trigger_item_id", cart[0]?.id)
        .eq("action", "accepted")
        .order("created_at", { ascending: false })
        .limit(10);

      // Build a ranked map: suggested_item_id → acceptance count
      const acceptanceMap: Record<string, number> = {};
      (topPairs || []).forEach((row: any) => {
        acceptanceMap[row.suggested_item_id] = (acceptanceMap[row.suggested_item_id] || 0) + 1;
      });

      // Also fetch rejected pairs so we can deprioritize them
      const { data: rejectedPairs } = await supabase
        .from("upsell_feedback")
        .select("suggested_item_id")
        .eq("tenant_id", tenant_id)
        .eq("trigger_item_id", cart[0]?.id)
        .eq("action", "rejected")
        .limit(20);

      const rejectedIds = new Set((rejectedPairs || []).map((r: any) => r.suggested_item_id));

      // ── 3. Build catalog excluding same category and cart items ──────────
      const cartItemIds = new Set(cart.map((item: any) => item.id));
      const cartCategoryIds = new Set(cart.map((item: any) => item.category_id).filter(Boolean));
      const excludedCategoryIds = trigger_category_id
        ? new Set([trigger_category_id, ...Array.from(cartCategoryIds)])
        : cartCategoryIds;

      // Drink detection keywords
      const drinkKeywords = ["bebida", "refresco", "agua", "jugo", "café", "cerveza", "limonada", "té", "smoothie", "batido", "coctel", "cóctel", "vino", "licor", "drink"];
      const triggerItem = cart[0];
      const triggerIsDrink = triggerItem && drinkKeywords.some(
        (kw: string) => triggerItem.name?.toLowerCase().includes(kw)
      );

      const availableCatalog = (menuItems || [])
        .filter((item) => {
          if (cartItemIds.has(item.id)) return false;
          if (excludedCategoryIds.size > 0 && excludedCategoryIds.has(item.category_id)) return false;
          return true;
        })
        .map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          category_id: item.category_id,
          dietary_tags: item.dietary_tags || [],
          description: item.description?.slice(0, 80) || "",
          // Boost score for previously accepted items
          _score: (acceptanceMap[item.id] || 0) * 10 - (rejectedIds.has(item.id) ? 5 : 0),
        }))
        // Sort by learning score descending so GPT sees best candidates first
        .sort((a, b) => b._score - a._score)
        .slice(0, 50);

      // Build catalog text — mark top learned items so GPT knows to prioritize
      const catalogText = availableCatalog
        .map((item) => {
          const learnedTag = acceptanceMap[item.id] ? ` [⭐ PREFERIDO x${acceptanceMap[item.id]}]` : "";
          const rejectedTag = rejectedIds.has(item.id) ? " [❌ RECHAZADO ANTES]" : "";
          return `ID:${item.id} | ${item.name}${learnedTag}${rejectedTag} | ₡${item.price} | Tags: ${item.dietary_tags.join(", ") || "ninguno"} | ${item.description}`;
        })
        .join("\n");

      // ── 4. Build prompt ──────────────────────────────────────────────────
      const cartSummary = cart
        .map((item: any) => `- ${item.name}`)
        .join("\n");

      const cartHasDietaryRestriction = cart.some(
        (item: any) =>
          item.dietary_tags?.includes("vegetariano") ||
          item.dietary_tags?.includes("vegano")
      );

      const systemPrompt = `Eres el mejor mesero del mundo trabajando en ${restaurant_name || "este restaurante"}.

El cliente está viendo este producto:
${cartSummary}

Catálogo disponible (ya filtrado — NO incluye la misma categoría del producto):
${catalogText}

REGLAS CRÍTICAS:
1. ${triggerIsDrink ? "⚠️ El cliente está viendo una BEBIDA. NUNCA sugieras otra bebida, milkshake, smoothie, jugo, refresco, cóctel, licor. SOLO sugiere comida: entradas, platos principales, snacks o postres." : "El cliente está viendo comida. Puedes sugerir bebidas o complementos que combinen bien."}
2. ${cartHasDietaryRestriction ? "⚠️ RESTRICCIÓN: El cliente tiene platos vegetarianos/veganos. NO sugieras carne." : "Sin restricciones dietéticas."}
3. NUNCA sugieras algo de la misma categoría del producto que está viendo.
4. Los ítems marcados con ⭐ PREFERIDO son los que otros clientes han aceptado antes — dales PRIORIDAD.
5. Los ítems marcados con ❌ RECHAZADO ANTES fueron rechazados — EVÍTALOS a menos que no haya alternativa.
6. Genera EXACTAMENTE 2 sugerencias distintas de CATEGORÍAS DIFERENTES entre sí. OBLIGATORIO: siempre retorna 2 objetos en el array upsells.
7. Los IDs DEBEN ser exactamente del catálogo de arriba.
8. Cada pitch debe ser corto (máximo 12 palabras), persuasivo y específico.

Devuelve ESTRICTAMENTE un JSON (sin markdown):
{
  "upsells": [
    {"id": "uuid-exacto", "pitch": "texto corto persuasivo"},
    {"id": "uuid-exacto", "pitch": "texto corto persuasivo"}
  ]
}`;

      // ── 5. Call OpenAI ───────────────────────────────────────────────────
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("OpenAI timeout")), 6000)
      );

      const openaiPromise = openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        response_format: { type: "json_object" },
        max_tokens: 300,
        temperature: 0.6,
      });

      const completion = await Promise.race([openaiPromise, timeoutPromise]);
      const rawContent = completion.choices[0]?.message?.content || "{}";

      let parsed: { upsells?: Array<{ id: string; pitch: string }> } = {};
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        console.error("[AI Upsell v2] Failed to parse OpenAI response:", rawContent);
        return res.json({ suggested_items: [], fallback: true });
      }

      // ── 6. Validate, enrich and guarantee diversity ────────────────────
      const validIds = new Set(availableCatalog.map((item) => item.id));

      // Map of id → catalog item for quick lookup
      const catalogById: Record<string, typeof availableCatalog[0]> = {};
      availableCatalog.forEach((item) => { catalogById[item.id] = item; });

      // Validate GPT's choices
      const gptUpsells = (parsed.upsells || [])
        .filter((u) => u.id && validIds.has(u.id))
        .slice(0, 2);

      // Build final list ensuring 2 items from DIFFERENT categories
      const finalUpsells: Array<{ id: string; pitch: string; _fromFallback?: boolean }> = [];
      const usedCategories = new Set<string>();
      const usedIds = new Set<string>();

      // First pass: accept GPT choices that don't repeat category
      for (const u of gptUpsells) {
        const cat = catalogById[u.id]?.category_id;
        if (!usedCategories.has(cat) && !usedIds.has(u.id)) {
          finalUpsells.push(u);
          usedCategories.add(cat);
          usedIds.add(u.id);
        }
      }

      // Second pass: ALWAYS fill up to 2 items from DIFFERENT categories
      // This guarantees diversity even if GPT returned 1 or 2 from the same category
      if (finalUpsells.length < 2) {
        // Sort candidates: prefer different category from what's already chosen, then by score
        const remainingCandidates = availableCatalog
          .filter(c => !usedIds.has(c.id))
          .sort((a, b) => {
            // Prefer items from categories not yet used
            const aNewCat = !usedCategories.has(a.category_id) ? 1 : 0;
            const bNewCat = !usedCategories.has(b.category_id) ? 1 : 0;
            if (aNewCat !== bNewCat) return bNewCat - aNewCat;
            return b._score - a._score;
          });
        for (const candidate of remainingCandidates) {
          if (finalUpsells.length >= 2) break;
          if (usedIds.has(candidate.id)) continue;
          // For the second slot, prefer a different category but allow same if no other option
          const isNewCategory = !usedCategories.has(candidate.category_id);
          if (!isNewCategory && finalUpsells.length === 1 && remainingCandidates.some(c => !usedCategories.has(c.category_id) && !usedIds.has(c.id))) {
            // Skip same-category items if there are still different-category options available
            continue;
          }
          const fallbackPitch = triggerIsDrink
            ? `Complemento ideal para acompañar`
            : candidate.category_id === availableCatalog.find(c => drinkKeywords.some(kw => c.name?.toLowerCase().includes(kw)))?.category_id
              ? `La bebida perfecta para tu pedido`
              : `Perfecto para completar tu pedido`;
          finalUpsells.push({ id: candidate.id, pitch: fallbackPitch, _fromFallback: true });
          usedCategories.add(candidate.category_id);
          usedIds.add(candidate.id);
        }
      }

      const suggestedItems = finalUpsells.map((u) => {
        const menuItem = menuItems?.find((item) => item.id === u.id);
        return menuItem ? { ...menuItem, pitch: u.pitch } : null;
      }).filter(Boolean);

      console.log(
        `[AI Upsell v2] tenant=${tenant_id} gpt_suggested=${gptUpsells.length} final=${suggestedItems.length} fallback_used=${finalUpsells.filter(u => u._fromFallback).length} learned_pairs=${Object.keys(acceptanceMap).length} time=${Date.now() - startTime}ms`
      );

      return res.json({
        suggested_items: suggestedItems,
        fallback: false,
      });

    } catch (error: any) {
      console.error("[AI Upsell v2] Error:", error.message);
      return res.json({
        suggested_items: [],
        fallback: true,
        error: error.message,
      });
    }
  });

  // ─── Upsell Feedback Endpoint (V17.0: sistema de aprendizaje) ────────────
  app.post("/api/upsell-feedback", async (req, res) => {
    try {
      const {
        tenant_id,
        trigger_item_id,
        trigger_item_name,
        suggested_item_id,
        suggested_item_name,
        action,
      } = req.body;

      if (!tenant_id || !trigger_item_id || !suggested_item_id || !action) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const validActions = ["accepted", "rejected", "ignored"];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }

      const { error } = await supabase.from("upsell_feedback").insert({
        tenant_id,
        trigger_item_id,
        trigger_item_name: trigger_item_name || "",
        suggested_item_id,
        suggested_item_name: suggested_item_name || "",
        action,
      });

      if (error) {
        console.error("[Upsell Feedback] DB error:", error.message);
        return res.status(500).json({ error: "Failed to save feedback" });
      }

      return res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("[Upsell Feedback] Unexpected error:", err);
      return res.status(500).json({ error: "Internal server error" });
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
