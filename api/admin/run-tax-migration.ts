/**
 * API Route: POST /api/admin/run-tax-migration
 *
 * Crea la tabla tax_settings y agrega campos de IVA/servicio a orders.
 * Usa fetch directo al endpoint de Supabase con service_role key.
 *
 * Requiere header X-Admin-Secret para autenticación básica.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.VITE_FRONTEND_FORGE_API_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_SECRET = process.env.ADMIN_MIGRATION_SECRET || "supermenu-migration-2026";

async function runSQL(sql: string): Promise<{ ok: boolean; error?: string }> {
  // Usar el endpoint de Supabase que acepta SQL arbitrario con service_role
  // Método: crear una función temporal via rpc si existe, sino usar fetch directo
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (res.ok) return { ok: true };

  // exec_sql no existe — usar el endpoint de database directo de Supabase Management API
  // Este endpoint requiere un Personal Access Token, no service_role.
  // Alternativa: usar supabase-js con from() para operaciones que lo soporten.
  const errText = await res.text();
  return { ok: false, error: errText };
}

async function runSQLViaManagementAPI(sql: string): Promise<{ ok: boolean; result?: any; error?: string }> {
  const PROJECT_REF = "zddytyncmnivfbvehrth";
  const MGMT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN; // Personal Access Token

  if (!MGMT_TOKEN) {
    return { ok: false, error: "SUPABASE_MANAGEMENT_TOKEN not set" };
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MGMT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const data = await res.json() as any;
  if (res.ok) return { ok: true, result: data };
  return { ok: false, error: JSON.stringify(data) };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const adminSecret = req.headers["x-admin-secret"];
  if (adminSecret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });

  if (!SERVICE_KEY) return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });

  const migrations: { name: string; sql: string }[] = [
    {
      name: "create_exec_sql_function",
      sql: `
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
END;
$$;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
      `.trim(),
    },
    {
      name: "create_tax_settings_table",
      sql: `
CREATE TABLE IF NOT EXISTS public.tax_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tax_enabled boolean NOT NULL DEFAULT true,
  tax_rate numeric(5,2) NOT NULL DEFAULT 13,
  prices_include_tax boolean NOT NULL DEFAULT true,
  service_enabled boolean NOT NULL DEFAULT true,
  service_rate numeric(5,2) NOT NULL DEFAULT 10,
  service_applies_to text NOT NULL DEFAULT 'dine_in_only'
    CHECK (service_applies_to IN ('dine_in_only','all_orders','disabled')),
  service_calculation_base text NOT NULL DEFAULT 'subtotal_before_tax'
    CHECK (service_calculation_base IN ('subtotal_before_tax','subtotal_after_tax')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
)
      `.trim(),
    },
    { name: "orders_items_subtotal", sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items_subtotal numeric(12,2) DEFAULT NULL" },
    { name: "orders_tax_rate", sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) DEFAULT NULL" },
    { name: "orders_tax_amount", sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) DEFAULT NULL" },
    { name: "orders_prices_include_tax", sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS prices_include_tax boolean DEFAULT NULL" },
    { name: "orders_service_rate", sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_rate numeric(5,2) DEFAULT NULL" },
    { name: "orders_service_amount", sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_amount numeric(12,2) DEFAULT NULL" },
    { name: "orders_service_applied", sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_applied boolean DEFAULT NULL" },
    { name: "orders_service_calculation_base", sql: "ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS service_calculation_base text DEFAULT NULL" },
    { name: "rls_enable", sql: "ALTER TABLE public.tax_settings ENABLE ROW LEVEL SECURITY" },
    {
      name: "rls_select",
      sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_settings' AND policyname='tax_settings_select_all') THEN
    CREATE POLICY "tax_settings_select_all" ON public.tax_settings FOR SELECT USING (true);
  END IF;
END $$`,
    },
    {
      name: "rls_insert",
      sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_settings' AND policyname='tax_settings_insert_own') THEN
    CREATE POLICY "tax_settings_insert_own" ON public.tax_settings FOR INSERT WITH CHECK (true);
  END IF;
END $$`,
    },
    {
      name: "rls_update",
      sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tax_settings' AND policyname='tax_settings_update_own') THEN
    CREATE POLICY "tax_settings_update_own" ON public.tax_settings FOR UPDATE USING (true);
  END IF;
END $$`,
    },
  ];

  const results: { name: string; success: boolean; error?: string }[] = [];

  // Primero intentar crear exec_sql via Management API si hay token
  const mgmtToken = process.env.SUPABASE_MANAGEMENT_TOKEN;
  const PROJECT_REF = "zddytyncmnivfbvehrth";

  for (const m of migrations) {
    let ok = false;
    let error: string | undefined;

    // Método 1: Management API (si hay token personal)
    if (mgmtToken) {
      const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mgmtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: m.sql }),
      });
      if (r.ok) {
        ok = true;
      } else {
        const d = await r.text();
        error = d;
      }
    }

    // Método 2: exec_sql RPC (si ya existe)
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
      if (r.ok) {
        ok = true;
        error = undefined;
      } else {
        const d = await r.text();
        error = d.substring(0, 200);
      }
    }

    results.push({ name: m.name, success: ok, error });
  }

  const allOk = results.every(r => r.success);
  return res.status(allOk ? 200 : 207).json({
    message: allOk ? "Tax migration completed successfully" : "Tax migration partially completed",
    results,
    hint: !allOk ? "If exec_sql RPC is missing, add SUPABASE_MANAGEMENT_TOKEN env var in Vercel with your Personal Access Token from https://supabase.com/dashboard/account/tokens" : undefined,
  });
}
