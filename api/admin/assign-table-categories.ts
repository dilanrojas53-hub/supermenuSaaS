/**
 * API Route: POST /api/admin/assign-table-categories
 *
 * Asigna categorías a las mesas existentes que no tienen categoría:
 * - Mesas 1-6: mesa_grande
 * - Mesas 7-9: mesa_pequeña
 *
 * Requiere el header X-Admin-Secret para autenticación básica.
 * USAR UNA SOLA VEZ y luego eliminar este endpoint.
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl =
  process.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminSecret = req.headers["x-admin-secret"];
  const expectedSecret =
    process.env.ADMIN_MIGRATION_SECRET || "supermenu-migration-2026";

  if (adminSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!supabaseServiceKey) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Obtener todas las mesas sin categoría
    const { data: tables, error: fetchError } = await supabase
      .from("restaurant_tables")
      .select("id, table_number, category")
      .is("category", null);

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    const results: { id: string; table_number: string; assigned: string }[] = [];
    const errors: string[] = [];

    for (const table of tables || []) {
      const num = parseInt(table.table_number, 10);
      let category: string | null = null;

      if (num >= 1 && num <= 6) {
        category = "mesa_grande";
      } else if (num >= 7 && num <= 9) {
        category = "mesa_pequeña";
      }

      if (category) {
        const { error: updateError } = await supabase
          .from("restaurant_tables")
          .update({ category })
          .eq("id", table.id);

        if (updateError) {
          errors.push(`Mesa ${table.table_number}: ${updateError.message}`);
        } else {
          results.push({
            id: table.id,
            table_number: table.table_number,
            assigned: category,
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      updated: results.length,
      results,
      errors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}
