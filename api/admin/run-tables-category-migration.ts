/**
 * API Route: POST /api/admin/run-tables-category-migration
 *
 * Agrega la columna `category` a restaurant_tables con CHECK constraint.
 * Categorías: mesa_grande | mesa_pequeña | taburete
 *
 * Requiere header X-Admin-Secret para autenticación básica.
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.VITE_FRONTEND_FORGE_API_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminSecret = req.headers["x-admin-secret"];
  const expectedSecret = process.env.ADMIN_MIGRATION_SECRET || "supermenu-migration-2026";
  if (adminSecret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!supabaseServiceKey) {
    return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 1: Add column without constraint (IF NOT EXISTS is safe to re-run)
  // Step 2: Add CHECK constraint separately (idempotent via DO block)
  const migrations = [
    `ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS category text DEFAULT NULL`,
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM information_schema.check_constraints
         WHERE constraint_name = 'restaurant_tables_category_check'
       ) THEN
         ALTER TABLE restaurant_tables
           ADD CONSTRAINT restaurant_tables_category_check
           CHECK (category IN ('mesa_grande', 'mesa_pequeña', 'taburete'));
       END IF;
     END $$`,
    `CREATE INDEX IF NOT EXISTS idx_restaurant_tables_category ON restaurant_tables(tenant_id, category)`,
  ];

  const results: { sql: string; success: boolean; error?: string }[] = [];

  for (const sql of migrations) {
    try {
      const { error } = await (supabaseAdmin as any).rpc("exec_sql", { query: sql });
      if (error) {
        results.push({ sql: sql.substring(0, 80), success: false, error: error.message });
      } else {
        results.push({ sql: sql.substring(0, 80), success: true });
      }
    } catch (e: any) {
      results.push({ sql: sql.substring(0, 80), success: false, error: e.message });
    }
  }

  const allOk = results.every(r => r.success);
  return res.status(allOk ? 200 : 207).json({
    message: allOk ? "Migration completed successfully" : "Migration partially completed",
    results,
  });
}
