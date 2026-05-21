/**
 * API Route: POST /api/admin/run-promo-schedule-migration
 * Agrega campos de programación por horario a la tabla promotions.
 * Campos: always_active, visible_only_when_active, timezone
 * (active_days y active_hours_start/end ya existen)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
const SUPABASE_URL = process.env.VITE_FRONTEND_FORGE_API_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_SECRET = process.env.ADMIN_MIGRATION_SECRET || "supermenu-migration-2026";

const migrations = [
  {
    name: "add_always_active",
    sql: `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS always_active boolean DEFAULT false;`,
  },
  {
    name: "add_visible_only_when_active",
    sql: `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS visible_only_when_active boolean DEFAULT true;`,
  },
  {
    name: "add_timezone",
    sql: `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Costa_Rica';`,
  },
  {
    name: "backfill_always_active_no_days",
    sql: `UPDATE promotions SET always_active = true WHERE (active_days IS NULL OR active_days = '[]'::jsonb) AND always_active = false;`,
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = req.headers["x-admin-secret"] || req.body?.secret;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });

  const PROJECT_REF = "zddytyncmnivfbvehrth";
  const mgmtToken = process.env.SUPABASE_MANAGEMENT_TOKEN;
  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const m of migrations) {
    let ok = false;
    let error: string | undefined;
    if (mgmtToken) {
      const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: m.sql }),
      });
      if (r.ok) { ok = true; } else { error = await r.text(); }
    }
    if (!ok) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: m.sql }),
      });
      if (r.ok) { ok = true; } else { error = (await r.text()).substring(0, 200); }
    }
    results.push({ name: m.name, success: ok, error });
  }
  const allOk = results.every(r => r.success);
  return res.status(allOk ? 200 : 207).json({ message: allOk ? "Migration completed" : "Partial", results });
}
