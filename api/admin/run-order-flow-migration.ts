/**
 * API Route: POST /api/admin/run-order-flow-migration
 *
 * Agrega columnas de configuración de flujo de estados a delivery_settings:
 *   - enable_prep_step   (boolean, default true)  → activa el paso "En preparación"
 *   - enable_billing_step (boolean, default true)  → activa el paso "Cobro"
 *
 * Requiere el header X-Admin-Secret para autenticación básica.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.VITE_FRONTEND_FORGE_API_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_SECRET = process.env.ADMIN_MIGRATION_SECRET || "supermenu-migration-2026";
const PROJECT_REF = "zddytyncmnivfbvehrth";

const migrations = [
  {
    name: "add_enable_prep_step",
    sql: `ALTER TABLE public.delivery_settings ADD COLUMN IF NOT EXISTS enable_prep_step boolean NOT NULL DEFAULT true;`,
  },
  {
    name: "add_enable_billing_step",
    sql: `ALTER TABLE public.delivery_settings ADD COLUMN IF NOT EXISTS enable_billing_step boolean NOT NULL DEFAULT true;`,
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secret = req.headers["x-admin-secret"] || req.body?.secret;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });

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

    if (!ok && SERVICE_KEY) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "apikey": SERVICE_KEY,
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: m.sql }),
      });
      if (r.ok) { ok = true; } else { error = (await r.text()).substring(0, 300); }
    }

    results.push({ name: m.name, success: ok, error });
  }

  const allOk = results.every(r => r.success);
  return res.status(allOk ? 200 : 207).json({
    message: allOk ? "Order flow migration completed successfully" : "Partial migration",
    results,
  });
}
