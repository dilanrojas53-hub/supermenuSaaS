/**
 * API Route: POST /api/admin/run-migration
 *
 * Ejecuta la migración SQL para agregar las columnas de metadatos del hero
 * a la tabla theme_settings.
 *
 * IMPORTANTE: Este endpoint solo debe usarse una vez para migrar la base de datos.
 * Requiere el header X-Admin-Secret para autenticación básica.
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = process.env.VITE_FRONTEND_FORGE_API_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verificación básica de seguridad
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

  const migrations = [
    `ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS hero_image_mobile_url text`,
    `ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS hero_image_tablet_url text`,
    `ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS hero_image_desktop_url text`,
    `ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS hero_image_type text`,
    `ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS hero_focal_x float DEFAULT 0.5`,
    `ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS hero_focal_y float DEFAULT 0.5`,
    `ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS hero_object_fit text DEFAULT 'cover'`,
    `ALTER TABLE theme_settings ADD COLUMN IF NOT EXISTS hero_object_position text DEFAULT 'center center'`,
  ];

  const results: { sql: string; success: boolean; error?: string }[] = [];

  for (const sql of migrations) {
    try {
      const { error } = await supabaseAdmin.rpc("exec_sql", { query: sql });
      if (error) {
        // Intentar via REST directo
        results.push({ sql: sql.substring(0, 60), success: false, error: error.message });
      } else {
        results.push({ sql: sql.substring(0, 60), success: true });
      }
    } catch (e: any) {
      results.push({ sql: sql.substring(0, 60), success: false, error: e.message });
    }
  }

  return res.status(200).json({
    message: "Migration attempted",
    results,
  });
}
