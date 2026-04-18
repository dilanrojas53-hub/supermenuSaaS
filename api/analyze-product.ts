/**
 * POST /api/analyze-product
 *
 * Enriquece un producto con atributos estructurados usando GPT en background.
 * Este endpoint NO bloquea la UI — se llama de forma asincrónica cuando:
 *   - Se crea un producto nuevo
 *   - Se edita un producto existente
 *   - Se ejecuta el job nocturno de re-enriquecimiento
 *
 * El resultado se guarda en product_attributes y se usan para:
 *   - Exclusiones duras (dietarias)
 *   - Ranking de compatibilidad
 *   - Pitch de upsell precalculado
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ProductAttributes {
  product_role: string;
  meal_moment: string[];
  satiety_level: string;
  is_vegan: boolean;
  is_vegetarian: boolean;
  is_gluten_free: boolean;
  is_dairy_free: boolean;
  is_halal: boolean;
  is_kosher: boolean;
  contains_nuts: boolean;
  contains_shellfish: boolean;
  contains_alcohol: boolean;
  affinity_roles: string[];
  incompatible_roles: string[];
  gastro_tags: string[];
  suggested_pitch: string;
}

// ─── Inferencia determinística de rol (sin GPT) ───────────────────────────────

const ROLE_KEYWORDS: Record<string, string[]> = {
  appetizer: ["entrada", "entrante", "starter", "ceviche", "carpaccio", "bruschetta", "tapa"],
  snack:     ["snack", "chistorra", "pincho", "aro", "croqueta", "edamame", "hongo", "panko", "frito", "chips", "nachos"],
  side:      ["papa", "frita", "arroz", "ensalada", "guarnicion", "side", "yuca", "platano", "toston"],
  sauce:     ["salsa", "dip", "aderezo", "guacamole", "hummus", "mayonesa", "chimichurri"],
  main:      ["pollo", "pechuga", "filete", "lomo", "cerdo", "pasta", "risotto", "plato principal", "main"],
  steak:     ["corte", "res", "angus", "ribeye", "t-bone", "new york", "filet mignon", "churrasco", "bife", "usda"],
  burger:    ["hamburguesa", "burger", "smash", "doble carne", "triple"],
  pizza:     ["pizza", "calzone"],
  seafood:   ["mariscos", "camaron", "langosta", "pulpo", "atun", "salmon", "pescado", "tilapia", "corvina"],
  drink:     ["bebida", "refresco", "agua", "jugo", "limonada", "cerveza", "vino", "coctel", "smoothie", "batido", "milkshake", "shake"],
  hot_drink: ["cafe", "capuchino", "latte", "espresso", "te caliente", "chocolate caliente", "americano"],
  dessert:   ["postre", "helado", "torta", "cheesecake", "brownie", "flan", "tiramisu", "crepe", "waffle", "churro", "dulce"],
  addon:     ["extra", "adicional", "topping", "ingrediente", "complemento", "addon"],
};

const AFFINITY_MAP: Record<string, string[]> = {
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

function inferRoleDeterministic(name: string, categoryName: string): string {
  const text = (name + " " + categoryName)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return role;
  }
  return "unknown";
}

function buildDeterministicAttributes(
  name: string,
  description: string,
  categoryName: string
): ProductAttributes {
  const role = inferRoleDeterministic(name, categoryName);
  const text = (name + " " + description + " " + categoryName).toLowerCase();

  return {
    product_role: role,
    meal_moment: role === "hot_drink" ? ["breakfast", "brunch"]
      : role === "dessert" ? ["dinner", "lunch"]
      : role === "drink" ? ["anytime"]
      : ["lunch", "dinner"],
    satiety_level: ["main", "steak", "burger", "pizza", "seafood"].includes(role) ? "heavy"
      : ["side", "appetizer", "snack"].includes(role) ? "light"
      : "medium",
    is_vegan: /\b(vegano|vegan|plant.based)\b/.test(text),
    is_vegetarian: /\b(vegetariano|vegetarian|veggie)\b/.test(text),
    is_gluten_free: /\b(sin gluten|gluten.free|sin trigo)\b/.test(text),
    is_dairy_free: /\b(sin lacteos|dairy.free|sin leche|sin queso)\b/.test(text),
    is_halal: /\b(halal)\b/.test(text),
    is_kosher: /\b(kosher)\b/.test(text),
    contains_nuts: /\b(nuez|nueces|almendra|mani|cacahuate|pistache|avellana|nuts)\b/.test(text),
    contains_shellfish: /\b(camaron|langosta|cangrejo|mariscos|shellfish)\b/.test(text),
    contains_alcohol: /\b(cerveza|vino|coctel|licor|ron|vodka|whiskey|alcohol|beer|wine)\b/.test(text),
    affinity_roles: AFFINITY_MAP[role] || AFFINITY_MAP["unknown"],
    incompatible_roles: [],
    gastro_tags: [],
    suggested_pitch: role === "drink" ? "La bebida perfecta para acompañar"
      : role === "dessert" ? "El cierre perfecto para tu pedido"
      : role === "side" ? "El complemento ideal"
      : "Recomendado para ti",
  };
}

// ─── Enriquecimiento GPT ──────────────────────────────────────────────────────

async function enrichWithGPT(
  name: string,
  description: string,
  categoryName: string,
  price: number,
  baseAttrs: ProductAttributes
): Promise<ProductAttributes> {
  const prompt = `Eres un experto en gastronomía y sistemas de recomendación.
Analiza este producto de restaurante y devuelve atributos estructurados en JSON.

Producto: "${name}"
Descripción: "${description || 'N/A'}"
Categoría: "${categoryName}"
Precio: ${price}

Basándote en el análisis culinario, devuelve EXACTAMENTE este JSON (sin texto extra):
{
  "product_role": "appetizer|snack|side|sauce|main|steak|burger|pizza|seafood|drink|hot_drink|dessert|addon|unknown",
  "meal_moment": ["breakfast"|"brunch"|"lunch"|"dinner"|"snack"|"anytime"],
  "satiety_level": "light|medium|heavy",
  "is_vegan": boolean,
  "is_vegetarian": boolean,
  "is_gluten_free": boolean,
  "is_dairy_free": boolean,
  "is_halal": boolean,
  "is_kosher": boolean,
  "contains_nuts": boolean,
  "contains_shellfish": boolean,
  "contains_alcohol": boolean,
  "affinity_roles": ["roles que combinan bien con este producto"],
  "incompatible_roles": ["roles que NO deben recomendarse juntos"],
  "gastro_tags": ["tags culinarios relevantes, máx 5"],
  "suggested_pitch": "frase de venta corta y antojadora (máx 10 palabras)"
}

Reglas:
- Si es vegano, is_vegetarian también debe ser true
- affinity_roles y incompatible_roles deben usar solo los roles válidos listados
- gastro_tags deben ser específicos (ej: "ahumado", "cremoso", "picante", "tropical")
- suggested_pitch debe ser en español, específico al producto, no genérico`;

  const completion = await Promise.race([
    openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 400,
      temperature: 0.2,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("GPT timeout")), 8000)
    ),
  ]);

  const raw = (completion as any).choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);

  // Merge con base determinística como fallback para campos faltantes
  return {
    product_role: parsed.product_role || baseAttrs.product_role,
    meal_moment: Array.isArray(parsed.meal_moment) ? parsed.meal_moment : baseAttrs.meal_moment,
    satiety_level: parsed.satiety_level || baseAttrs.satiety_level,
    is_vegan: typeof parsed.is_vegan === "boolean" ? parsed.is_vegan : baseAttrs.is_vegan,
    is_vegetarian: typeof parsed.is_vegetarian === "boolean" ? parsed.is_vegetarian : baseAttrs.is_vegetarian,
    is_gluten_free: typeof parsed.is_gluten_free === "boolean" ? parsed.is_gluten_free : baseAttrs.is_gluten_free,
    is_dairy_free: typeof parsed.is_dairy_free === "boolean" ? parsed.is_dairy_free : baseAttrs.is_dairy_free,
    is_halal: typeof parsed.is_halal === "boolean" ? parsed.is_halal : baseAttrs.is_halal,
    is_kosher: typeof parsed.is_kosher === "boolean" ? parsed.is_kosher : baseAttrs.is_kosher,
    contains_nuts: typeof parsed.contains_nuts === "boolean" ? parsed.contains_nuts : baseAttrs.contains_nuts,
    contains_shellfish: typeof parsed.contains_shellfish === "boolean" ? parsed.contains_shellfish : baseAttrs.contains_shellfish,
    contains_alcohol: typeof parsed.contains_alcohol === "boolean" ? parsed.contains_alcohol : baseAttrs.contains_alcohol,
    affinity_roles: Array.isArray(parsed.affinity_roles) ? parsed.affinity_roles : baseAttrs.affinity_roles,
    incompatible_roles: Array.isArray(parsed.incompatible_roles) ? parsed.incompatible_roles : baseAttrs.incompatible_roles,
    gastro_tags: Array.isArray(parsed.gastro_tags) ? parsed.gastro_tags : baseAttrs.gastro_tags,
    suggested_pitch: typeof parsed.suggested_pitch === "string" ? parsed.suggested_pitch : baseAttrs.suggested_pitch,
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { item_id, tenant_id, force_refresh } = req.body || {};

  if (!item_id || !tenant_id) {
    return res.status(400).json({ error: "item_id and tenant_id are required" });
  }

  try {
    // 1. Verificar si ya existe y es reciente (< 7 días)
    if (!force_refresh) {
      const { data: existing } = await supabase
        .from("product_attributes")
        .select("id, enriched_at, enriched_by_gpt")
        .eq("item_id", item_id)
        .single();

      if (existing?.enriched_by_gpt && existing.enriched_at) {
        const age = Date.now() - new Date(existing.enriched_at).getTime();
        if (age < 7 * 24 * 60 * 60 * 1000) {
          return res.json({ status: "cached", item_id });
        }
      }
    }

    // 2. Cargar el producto
    const { data: item, error: itemError } = await supabase
      .from("menu_items")
      .select("id, name, description, price, category_id")
      .eq("id", item_id)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 3. Cargar nombre de categoría
    const { data: category } = await supabase
      .from("categories")
      .select("name")
      .eq("id", item.category_id)
      .single();

    const categoryName = category?.name || "";

    // 4. Análisis determinístico base (instantáneo)
    const baseAttrs = buildDeterministicAttributes(item.name, item.description || "", categoryName);

    // 5. Enriquecimiento GPT (puede fallar — usamos base como fallback)
    let finalAttrs = baseAttrs;
    let enrichedByGPT = false;

    if (process.env.OPENAI_API_KEY) {
      try {
        finalAttrs = await enrichWithGPT(
          item.name,
          item.description || "",
          categoryName,
          item.price,
          baseAttrs
        );
        enrichedByGPT = true;
      } catch (gptErr: any) {
        console.warn(`[analyze-product] GPT failed for ${item.name}: ${gptErr.message} — using deterministic`);
      }
    }

    // 6. Guardar en product_attributes (upsert)
    const { error: upsertError } = await supabase
      .from("product_attributes")
      .upsert({
        tenant_id,
        item_id,
        ...finalAttrs,
        enriched_by_gpt: enrichedByGPT,
        gpt_model: enrichedByGPT ? "gpt-4.1-mini" : null,
        enriched_at: new Date().toISOString(),
        enrichment_version: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: "item_id" });

    if (upsertError) {
      console.error("[analyze-product] Upsert error:", upsertError);
      return res.status(500).json({ error: upsertError.message });
    }

    // 7. Disparar recomputación de pares para este producto (fire and forget)
    // No esperamos la respuesta para no bloquear
    fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/api/compute-upsell-pairs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id, tenant_id }),
    }).catch(() => {}); // fire and forget

    return res.json({
      status: enrichedByGPT ? "enriched_by_gpt" : "enriched_deterministic",
      item_id,
      product_role: finalAttrs.product_role,
      enriched_by_gpt: enrichedByGPT,
    });

  } catch (err: any) {
    console.error("[analyze-product] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
