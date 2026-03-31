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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// =============================================================================
// CAPA 1 — HELPERS GASTRONÓMICOS
// Lógica determinística de roles y compatibilidad. No depende de GPT.
// =============================================================================

/**
 * Roles comerciales de un producto en el contexto de un restaurante.
 * Determinan qué complementa a qué de forma gastronómica real.
 */
type ProductRole =
  | "drink"
  | "hot_drink"
  | "appetizer"
  | "side"
  | "main"
  | "pizza"
  | "burger"
  | "dessert"
  | "sauce"
  | "addon"
  | "snack"
  | "seafood"
  | "steak"
  | "kids"
  | "unknown";

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category_id: string;
  category_name: string;
  is_drink: boolean;
  dietary_tags: string[];
  image_url: string | null;
  is_available: boolean;
  // Scoring interno — CAPA 4: Explicabilidad
  _role?: ProductRole;
  _roleCompatibilityScore?: number;
  _priceCompatibilityScore?: number;
  _feedbackScore?: number;
  _finalScore?: number;
  _whyChosen?: string;
}

/** Normaliza nombre de categoría para comparaciones sin tildes ni mayúsculas */
function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Detecta si un ítem es bebida usando is_drink (metadata robusta),
 * nombre y nombre de categoría como fallback.
 */
function isLikelyDrink(item: {
  name: string;
  category_name: string;
  is_drink: boolean;
}): boolean {
  if (item.is_drink) return true;
  const drinkKeywords = [
    "bebida", "refresco", "agua", "jugo", "cafe", "cerveza",
    "limonada", "te", "smoothie", "batido", "coctel", "vino",
    "licor", "drink", "espresso", "capuccino", "americano",
    "latte", "chorreado", "chocolate caliente", "natural", "gaseosa",
    "chelada", "artesanal",
  ];
  const haystack = `${item.name} ${item.category_name}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return drinkKeywords.some((kw) => haystack.includes(kw));
}

/**
 * Infiere el rol comercial de un producto a partir de nombre,
 * categoría, precio y metadata disponible.
 * Si en el futuro se agrega un campo `role` en la BD, este helper
 * puede usarlo directamente y seguir funcionando.
 */
function inferProductRole(item: {
  name: string;
  description: string;
  price: number;
  category_name: string;
  is_drink: boolean;
}): ProductRole {
  const n = item.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const cat = normalizeCategoryName(item.category_name);

  // Bebidas calientes (más específico que bebidas en general)
  if (
    cat.includes("caliente") ||
    ["espresso", "capuccino", "americano", "latte", "chorreado", "chocolate caliente"].some(
      (kw) => n.includes(kw)
    )
  )
    return "hot_drink";

  // Bebidas frías
  if (isLikelyDrink({ name: item.name, category_name: item.category_name, is_drink: item.is_drink }))
    return "drink";

  // Pizza y focaccia
  if (cat.includes("pizza") || n.includes("pizza") || n.includes("focaccia")) return "pizza";

  // Extras / addons (para pizza u otros)
  if (cat.includes("extra") || cat.includes("addon")) return "addon";

  // Hamburguesas
  if (cat.includes("hambur") || n.includes("hambur")) return "burger";

  // Menú niños
  if (cat.includes("nino") || cat.includes("kids")) return "kids";

  // Mariscos / Del mar
  if (
    cat.includes("mar") ||
    ["salmon", "corvina", "trucha", "camaron", "marisco", "pescado"].some((kw) => n.includes(kw))
  )
    return "seafood";

  // Cortes / carnes premium
  if (
    cat.includes("carne") ||
    cat.includes("corte") ||
    cat.includes("usda") ||
    cat.includes("angus") ||
    ["steak", "rib eye", "new york", "t-bone", "tomahawk", "entrania", "picanha", "culotte"].some(
      (kw) => n.includes(kw)
    )
  )
    return "steak";

  // Entradas / appetizers
  if (
    cat.includes("entrada") ||
    cat.includes("aperitivo") ||
    [
      "chistorra", "pincho", "aros", "papas fritas", "edamame", "hongo",
      "concha", "cazuela", "taquito", "tabla", "nachos", "croqueta",
    ].some((kw) => n.includes(kw))
  )
    return "appetizer";

  // Postres
  if (
    cat.includes("postre") ||
    cat.includes("dessert") ||
    ["flan", "brownie", "helado", "torta", "pastel", "cheesecake", "tiramisu"].some((kw) =>
      n.includes(kw)
    )
  )
    return "dessert";

  // Platos principales: pasta, ensaladas, platos de la casa
  if (
    cat.includes("selva") ||
    cat.includes("pasta") ||
    cat.includes("ensalada") ||
    ["pollo", "pasta", "raviole", "tagliatelle", "ensalada", "tacos de"].some((kw) => n.includes(kw))
  )
    return "main";

  // Sides baratos
  if (
    ["arroz", "pure", "papas", "yuca", "platano"].some((kw) => n.includes(kw)) &&
    item.price < 5000
  )
    return "side";

  // Fallback por precio
  if (item.price < 3000) return "snack";
  if (item.price < 7000) return "appetizer";
  return "main";
}

/**
 * Tabla de compatibilidad de roles.
 * triggerRole → lista ordenada de roles complementarios (más compatible primero).
 */
const ROLE_COMPATIBILITY: Record<ProductRole, ProductRole[]> = {
  appetizer: ["drink", "hot_drink", "sauce", "side", "snack"],
  snack:     ["drink", "hot_drink", "sauce", "side"],
  main:      ["drink", "side", "addon", "dessert", "sauce"],
  steak:     ["drink", "side", "addon", "sauce", "appetizer"],
  seafood:   ["drink", "side", "appetizer", "sauce"],
  burger:    ["drink", "side", "addon", "snack"],
  pizza:     ["drink", "addon", "side", "snack"],
  kids:      ["drink", "side", "snack", "dessert"],
  drink:     ["appetizer", "snack", "dessert", "side"],
  hot_drink: ["dessert", "snack", "appetizer"],
  dessert:   ["hot_drink", "drink"],
  sauce:     ["main", "steak", "burger", "appetizer"],
  side:      ["main", "steak", "seafood", "burger"],
  addon:     ["pizza", "main", "burger"],
  unknown:   ["drink", "side", "appetizer"],
};

/**
 * CAPA 4 — Score de compatibilidad de rol (0-100).
 * El primer compatible = 100, luego decrece 15 por posición.
 */
function getRoleCompatibilityScore(
  triggerRole: ProductRole,
  candidateRole: ProductRole
): number {
  const compatible = ROLE_COMPATIBILITY[triggerRole] || [];
  const idx = compatible.indexOf(candidateRole);
  if (idx === -1) return 0;
  return Math.max(100 - idx * 15, 10);
}

/**
 * CAPA 4 — Score de compatibilidad de precio (0-100).
 * Evita que un producto barato sugiera platos muy caros como primera opción.
 */
function getPriceCompatibilityScore(
  triggerPrice: number,
  candidatePrice: number
): number {
  const ratio = candidatePrice / Math.max(triggerPrice, 1);
  if (ratio <= 1.0) return 100;
  if (ratio <= 1.5) return 85;
  if (ratio <= 2.0) return 60;
  if (ratio <= 3.0) return 30;
  return 5;
}

/**
 * CAPA 1 — Preselección determinística con scoring explicable.
 * Construye candidatos válidos con reglas de negocio reales.
 * accepted: +30 por cada aceptación (hasta +60 máx)
 * rejected: -40
 * ignored:  -10
 * La lógica gastronómica domina (70%), el feedback refuerza (30%).
 */
function buildUpsellCandidates(
  catalog: CatalogItem[],
  triggerItem: CatalogItem,
  cartItemIds: Set<string>,
  acceptanceMap: Record<string, number>,
  rejectedIds: Set<string>,
  ignoredIds: Set<string>
): CatalogItem[] {
  const triggerRole = triggerItem._role!;

  return catalog
    .filter((item) => {
      if (cartItemIds.has(item.id)) return false;
      if (item.category_id === triggerItem.category_id) return false;
      if (!item.is_available) return false;
      return true;
    })
    .map((item) => {
      const role = item._role!;
      const roleScore = getRoleCompatibilityScore(triggerRole, role);
      const priceScore = getPriceCompatibilityScore(triggerItem.price, item.price);

      const accepted = Math.min(acceptanceMap[item.id] || 0, 2); // cap en 2 para no dominar
      const feedbackScore = accepted * 30 - (rejectedIds.has(item.id) ? 40 : 0) - (ignoredIds.has(item.id) ? 10 : 0);

      // Lógica gastronómica domina; feedback solo ajusta
      const baseScore = roleScore * 0.6 + priceScore * 0.4;
      const finalScore = Math.max(0, baseScore + Math.min(feedbackScore, 40));

      const whyChosen = `role=${role}(${roleScore}) price=${priceScore} fb=${feedbackScore} final=${finalScore.toFixed(1)}`;

      return {
        ...item,
        _role: role,
        _roleCompatibilityScore: roleScore,
        _priceCompatibilityScore: priceScore,
        _feedbackScore: feedbackScore,
        _finalScore: finalScore,
        _whyChosen: whyChosen,
      };
    })
    .filter((item) => (item._finalScore || 0) > 5)
    .sort((a, b) => (b._finalScore || 0) - (a._finalScore || 0));
}

/**
 * Selecciona los mejores N candidatos garantizando diversidad de rol.
 */
function selectTopDiverseCandidates(candidates: CatalogItem[], count: number): CatalogItem[] {
  const usedRoles = new Set<ProductRole>();
  const selected: CatalogItem[] = [];

  // Primera pasada: un ítem por rol
  for (const c of candidates) {
    if (selected.length >= count) break;
    if (!usedRoles.has(c._role!)) {
      selected.push(c);
      usedRoles.add(c._role!);
    }
  }

  // Segunda pasada: completar si no llegamos a count
  if (selected.length < count) {
    const usedIds = new Set(selected.map((c) => c.id));
    for (const c of candidates) {
      if (selected.length >= count) break;
      if (!usedIds.has(c.id)) {
        selected.push(c);
        usedIds.add(c.id);
      }
    }
  }

  return selected;
}

/**
 * CAPA 5 — Subtítulo contextual para el header de sugerencias en la UI.
 * Se basa en el rol del trigger para que se sienta natural y creíble.
 */
function buildUpsellSubtitle(triggerRole: ProductRole, lang = "es"): string {
  if (lang !== "es") {
    const map: Partial<Record<ProductRole, string>> = {
      appetizer: "Many customers order this together",
      snack:     "Perfect to complete your order",
      main:      "Goes great with this dish",
      steak:     "The perfect pairing for your steak",
      seafood:   "Pairs beautifully with seafood",
      burger:    "Complete your burger experience",
      pizza:     "Great additions to your pizza",
      drink:     "Something to go with your drink",
      hot_drink: "A perfect sweet companion",
      dessert:   "Finish on a high note",
    };
    return map[triggerRole] || "You might also enjoy";
  }
  const map: Partial<Record<ProductRole, string>> = {
    appetizer: "Muchos clientes lo piden junto",
    snack:     "Para completar tu pedido",
    main:      "Combina muy bien con este platillo",
    steak:     "El maridaje ideal para tu corte",
    seafood:   "Complemento perfecto para el mar",
    burger:    "Completa la experiencia de tu burger",
    pizza:     "Extras que hacen la diferencia",
    drink:     "Algo para acompañar tu bebida",
    hot_drink: "El dulce complemento perfecto",
    dessert:   "Para cerrar con broche de oro",
    kids:      "Los niños lo piden siempre junto",
  };
  return map[triggerRole] || "Combina bien con este platillo";
}

/**
 * CAPA 2 — Pitch de fallback determinístico cuando GPT falla.
 * Creíble y específico según la relación trigger → candidato.
 */
function getFallbackPitch(triggerRole: ProductRole, candidateRole: ProductRole): string {
  const pitches: Partial<Record<ProductRole, Partial<Record<ProductRole, string>>>> = {
    appetizer: {
      drink:     "La bebida ideal para acompañar",
      hot_drink: "Perfecto para empezar la noche",
      sauce:     "Llévalo con salsa extra",
      side:      "El complemento perfecto",
    },
    steak: {
      drink:     "Marida perfecto con tu corte",
      side:      "El acompañamiento clásico",
      appetizer: "Para abrir el apetito antes",
      sauce:     "Realza el sabor del corte",
    },
    seafood: {
      drink:     "Refresca el paladar",
      side:      "Complemento ligero del mar",
      appetizer: "Para empezar con buen pie",
    },
    main: {
      drink:     "La bebida perfecta para tu plato",
      side:      "El acompañamiento ideal",
      dessert:   "Para cerrar con dulzura",
    },
    burger: {
      drink:     "La combo perfecta",
      side:      "Papas o más para completar",
      addon:     "Agrégale algo especial",
    },
    pizza: {
      drink:     "La bebida que pide la pizza",
      addon:     "Personaliza tu pizza",
    },
    drink: {
      appetizer: "Algo para picar con tu bebida",
      snack:     "El snack perfecto",
      dessert:   "El dulce final",
    },
    hot_drink: {
      dessert:   "El dulce compañero perfecto",
      snack:     "Algo para acompañar tu café",
    },
  };
  return pitches[triggerRole]?.[candidateRole] || "Perfecto para completar tu pedido";
}

// =============================================================================
// SERVIDOR
// =============================================================================

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "1mb" }));

  // ─── AI Upsell Endpoint ──────────────────────────────────────────────────
  // IMPORTANTE: En producción (Vercel), /api/generate-upsell es manejado
  // directamente por api/generate-upsell.ts (V19 — Hard Constraints Edition).
  // Este handler solo corre en desarrollo local con Express.
  // NO agregar lógica de negocio aquí — mantener sincronizado con api/generate-upsell.ts.
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

      // ── CAPA 3: Catálogo completo con image_url + metadata de categorías ─
      const [menuResult, categoriesResult] = await Promise.all([
        supabase
          .from("menu_items")
          .select("id, name, description, price, category_id, dietary_tags, is_available, image_url")
          .eq("tenant_id", tenant_id)
          .eq("is_available", true)
          .limit(120),
        supabase
          .from("categories")
          .select("id, name, is_drink")
          .eq("tenant_id", tenant_id),
      ]);

      if (menuResult.error) {
        console.error("[Upsell V18] Supabase menu error:", menuResult.error);
        return res.status(500).json({ error: "Failed to fetch menu" });
      }

      // Mapa categoría_id → { name, is_drink }
      const categoryMap: Record<string, { name: string; is_drink: boolean }> = {};
      (categoriesResult.data || []).forEach((cat: any) => {
        categoryMap[cat.id] = { name: cat.name || "", is_drink: !!cat.is_drink };
      });

      // Enriquecer catálogo con metadata de categoría y rol inferido
      const enrichedCatalog: CatalogItem[] = (menuResult.data || []).map((item: any) => {
        const catMeta = categoryMap[item.category_id] || { name: "", is_drink: false };
        const enriched: CatalogItem = {
          id: item.id,
          name: item.name,
          description: item.description?.slice(0, 100) || "",
          price: item.price,
          category_id: item.category_id,
          category_name: catMeta.name,
          is_drink: catMeta.is_drink,
          dietary_tags: item.dietary_tags || [],
          image_url: item.image_url || null,
          is_available: item.is_available,
        };
        enriched._role = inferProductRole({
          name: enriched.name,
          description: enriched.description,
          price: enriched.price,
          category_name: enriched.category_name,
          is_drink: enriched.is_drink,
        });
        return enriched;
      });

      // ── CAPA 6: Feedback histórico (accepted, rejected, ignored) ─────────
      const triggerItemRaw = cart[0];
      const [acceptedResult, rejectedResult, ignoredResult] = await Promise.all([
        supabase
          .from("upsell_feedback")
          .select("suggested_item_id")
          .eq("tenant_id", tenant_id)
          .eq("trigger_item_id", triggerItemRaw?.id)
          .eq("action", "accepted")
          .limit(30),
        supabase
          .from("upsell_feedback")
          .select("suggested_item_id")
          .eq("tenant_id", tenant_id)
          .eq("trigger_item_id", triggerItemRaw?.id)
          .eq("action", "rejected")
          .limit(30),
        supabase
          .from("upsell_feedback")
          .select("suggested_item_id")
          .eq("tenant_id", tenant_id)
          .eq("trigger_item_id", triggerItemRaw?.id)
          .eq("action", "ignored")
          .limit(30),
      ]);

      const acceptanceMap: Record<string, number> = {};
      (acceptedResult.data || []).forEach((r: any) => {
        acceptanceMap[r.suggested_item_id] = (acceptanceMap[r.suggested_item_id] || 0) + 1;
      });
      const rejectedIds = new Set((rejectedResult.data || []).map((r: any) => r.suggested_item_id));
      const ignoredIds = new Set((ignoredResult.data || []).map((r: any) => r.suggested_item_id));

      // ── CAPA 1: Trigger con rol inferido ─────────────────────────────────
      const triggerCatMeta = categoryMap[triggerItemRaw?.category_id] || {
        name: trigger_category_id || "",
        is_drink: false,
      };
      const triggerItem: CatalogItem = {
        id: triggerItemRaw?.id || "",
        name: triggerItemRaw?.name || "",
        description: triggerItemRaw?.description || "",
        price: triggerItemRaw?.price || 0,
        category_id: triggerItemRaw?.category_id || "",
        category_name: triggerCatMeta.name,
        is_drink: triggerCatMeta.is_drink,
        dietary_tags: triggerItemRaw?.dietary_tags || [],
        image_url: null,
        is_available: true,
      };
      triggerItem._role = inferProductRole({
        name: triggerItem.name,
        description: triggerItem.description,
        price: triggerItem.price,
        category_name: triggerItem.category_name,
        is_drink: triggerItem.is_drink,
      });

      const cartItemIds = new Set(cart.map((item: any) => item.id));

      // ── CAPA 1: Preselección determinística ───────────────────────────────
      const scoredCandidates = buildUpsellCandidates(
        enrichedCatalog,
        triggerItem,
        cartItemIds,
        acceptanceMap,
        rejectedIds,
        ignoredIds
      );

      // Top 6 candidatos curados con diversidad de rol para pasarle a GPT
      const top6 = selectTopDiverseCandidates(scoredCandidates, 6);

      // ── CAPA 4: Log de scoring explicable ────────────────────────────────
      console.log(
        `[Upsell V18] tenant=${tenant_id} trigger="${triggerItem.name}" role=${triggerItem._role} candidates=${scoredCandidates.length} top6=[${top6.map((c) => `${c.name}(${c._role},${c._finalScore?.toFixed(0)})`).join(", ")}]`
      );
      top6.forEach((c) => console.log(`  [Score] ${c.name} | ${c._whyChosen}`));

      // Subtítulo contextual para la UI
      const upsellSubtitle = buildUpsellSubtitle(triggerItem._role!);

      if (top6.length === 0) {
        console.log(`[Upsell V18] No viable candidates for "${triggerItem.name}"`);
        return res.json({ suggested_items: [], fallback: true, subtitle: upsellSubtitle });
      }

      // ── CAPA 2: GPT solo como refinador de los top 6 ─────────────────────
      const catalogText = top6
        .map((item, i) => {
          const accepted = acceptanceMap[item.id];
          const learnedTag = accepted ? ` [PREFERIDO x${accepted}]` : "";
          const rejectedTag = rejectedIds.has(item.id) ? " [RECHAZADO]" : "";
          return `${i + 1}. ID:${item.id} | ${item.name}${learnedTag}${rejectedTag} | CRC${item.price} | Rol:${item._role} | ${item.description}`;
        })
        .join("\n");

      const cartHasDietaryRestriction = cart.some(
        (item: any) =>
          item.dietary_tags?.includes("vegetariano") ||
          item.dietary_tags?.includes("vegano")
      );

      const systemPrompt = `Eres el mejor mesero de ${restaurant_name || "este restaurante"}.
El cliente ve: "${triggerItem.name}" (CRC${triggerItem.price}, rol: ${triggerItem._role})

Candidatos ya validados gastronómicamente (SOLO elige de estos):
${catalogText}

REGLAS:
1. Elige EXACTAMENTE 2 de los candidatos de arriba. IDs exactos — no inventes.
2. ${cartHasDietaryRestriction ? "RESTRICCION: cliente vegetariano/vegano, NO sugieras carne." : "Sin restricciones dietéticas."}
3. Prioriza los marcados PREFERIDO si son buena opción gastronómica.
4. Evita los marcados RECHAZADO salvo que no haya alternativa.
5. Escribe un pitch corto (máximo 10 palabras), natural y persuasivo.

JSON sin markdown:
{"upsells":[{"id":"uuid","pitch":"texto"},{"id":"uuid","pitch":"texto"}]}`;

      let gptUpsells: Array<{ id: string; pitch: string }> = [];
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("OpenAI timeout")), 6000)
        );
        const openaiPromise = openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }],
          response_format: { type: "json_object" },
          max_tokens: 250,
          temperature: 0.4,
        });
        const completion = await Promise.race([openaiPromise, timeoutPromise]);
        const raw = completion.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(raw);
        const validIds = new Set(top6.map((c) => c.id));
        gptUpsells = (parsed.upsells || [])
          .filter((u: any) => u.id && validIds.has(u.id))
          .slice(0, 2);
      } catch (gptErr: any) {
        console.warn(`[Upsell V18] GPT failed (${gptErr.message}), using deterministic fallback`);
      }

      // ── Combinar GPT + fallback determinístico ────────────────────────────
      const finalUpsells: Array<{ id: string; pitch: string }> = [];
      const usedIds = new Set<string>();
      const usedRoles = new Set<ProductRole>();

      // Primera pasada: aceptar sugerencias de GPT con diversidad de rol
      for (const u of gptUpsells) {
        const candidate = top6.find((c) => c.id === u.id);
        if (!candidate || usedIds.has(u.id)) continue;
        // Permitir mismo rol solo si no hay otra opción
        if (
          usedRoles.has(candidate._role!) &&
          finalUpsells.length === 1 &&
          top6.some((c) => !usedIds.has(c.id) && !usedRoles.has(c._role!))
        )
          continue;
        finalUpsells.push({ id: u.id, pitch: u.pitch });
        usedIds.add(u.id);
        usedRoles.add(candidate._role!);
      }

      // Segunda pasada: completar con fallback determinístico
      if (finalUpsells.length < 2) {
        for (const candidate of top6) {
          if (finalUpsells.length >= 2) break;
          if (usedIds.has(candidate.id)) continue;
          if (
            usedRoles.has(candidate._role!) &&
            top6.some((c) => !usedIds.has(c.id) && !usedRoles.has(c._role!))
          )
            continue;
          const pitch = getFallbackPitch(triggerItem._role!, candidate._role!);
          finalUpsells.push({ id: candidate.id, pitch });
          usedIds.add(candidate.id);
          usedRoles.add(candidate._role!);
        }
      }

      // Construir respuesta final con todos los campos (incluyendo image_url)
      const catalogById: Record<string, CatalogItem> = {};
      enrichedCatalog.forEach((item) => { catalogById[item.id] = item; });

      const suggestedItems = finalUpsells
        .map((u) => {
          const menuItem = catalogById[u.id];
          if (!menuItem) return null;
          return {
            id: menuItem.id,
            name: menuItem.name,
            description: menuItem.description,
            price: menuItem.price,
            category_id: menuItem.category_id,
            image_url: menuItem.image_url,
            dietary_tags: menuItem.dietary_tags,
            pitch: u.pitch,
          };
        })
        .filter(Boolean);

      console.log(
        `[Upsell V18] DONE gpt_ok=${gptUpsells.length} final=${suggestedItems.length} time=${Date.now() - startTime}ms`
      );

      return res.json({
        suggested_items: suggestedItems,
        subtitle: upsellSubtitle,
        fallback: false,
      });
    } catch (error: any) {
      console.error("[Upsell V18] Unexpected error:", error.message);
      return res.json({ suggested_items: [], fallback: true, error: error.message });
    }
  });

  // ─── Upsell Feedback Endpoint ─────────────────────────────────────────────
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

  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
