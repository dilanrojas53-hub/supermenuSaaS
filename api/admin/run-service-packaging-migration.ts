/**
 * API Route: POST /api/admin/run-service-packaging-migration
 *
 * Agrega a tax_settings:
 *   - prices_include_service: boolean (los precios del menú ya incluyen el 10% de servicio)
 *   - packaging_enabled: boolean
 *   - packaging_amount: numeric(10,2)
 *   - packaging_per: 'order' | 'item'
 *   - packaging_applies_to: 'takeout' | 'delivery' | 'both'
 *
 * Agrega a orders:
 *   - packaging_amount: numeric(12,2)
 *   - service_stripped: boolean (true si se quitó el servicio incluido)
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.VITE_FRONTEND_FORGE_API_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_SECRET = process.env.ADMIN_MIGRATION_SECRET || "supermenu-migration-2026";

const migrations = [
  {
    name: "tax_settings_prices_include_service",
    sql: `ALTER TABLE public.tax_settings ADD COLUMN IF NOT EXISTS prices_include_service boolean NOT NULL DEFAULT false;`,
  },
  {
    name: "tax_settings_packaging_enabled",
    sql: `ALTER TABLE public.tax_settings ADD COLUMN IF NOT EXISTS packaging_enabled boolean NOT NULL DEFAULT false;`,
  },
  {
    name: "tax_settings_packaging_amount",
    sql: `ALTER TABLE public.tax_settings ADD COLUMN IF NOT EXISTS packaging_amount numeric(10,2) NOT NULL DEFAULT 0;`,
  },
  {
    name: "tax_settings_packaging_per",
    sql: `ALTER TABLE public.tax_settings ADD COLUMN IF NOT EXISTS packaging_per text NOT NULL DEFAULT 'order' CHECK (packaging_per IN ('order','item'));`,
  },
  {
    name: "tax_settings_packaging_applies_to",
    sql: `ALTER TABLE public.tax_settings ADD COLUMN IF NOT EXISTS packaging_applies_to text NOT NULL DEFAULT 'both' CHECK (packaging_applies_to IN ('takeout','delivery','both'));`,
  },
  {
    name: "orders_packaging_amount",
    sql: `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS packaging_amount numeric(12,2) DEFAULT NULL;`,
  },
  {
    name: "orders_service_stripped",
    sql: `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_stripped boolean DEFAULT NULL;`,
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
    message: allOk ? "Service & packaging migration completed" : "Partial migration",
    results,
  });
}
