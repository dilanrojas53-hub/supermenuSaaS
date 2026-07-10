/**
 * API Route: POST /api/admin/run-landing-migration
 *
 * Crea las tablas:
 *   - restaurant_landing_settings  (configuración de la landing pública por tenant)
 *   - restaurant_landing_gallery   (galería de imágenes de la landing)
 *
 * Requiere el header X-Admin-Secret para autenticación básica.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireSuperAdmin } from "../_lib/authorization";

const SUPABASE_URL = process.env.VITE_FRONTEND_FORGE_API_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_SECRET = process.env.ADMIN_MIGRATION_SECRET;
const PROJECT_REF = "zddytyncmnivfbvehrth";

const migrations = [
  {
    name: "create_restaurant_landing_settings",
    sql: `CREATE TABLE IF NOT EXISTS public.restaurant_landing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  hero_title text,
  hero_subtitle text,
  hero_description text,
  hero_image_url text,
  menu_pdf_url text,
  about_title text,
  about_description text,
  concept text,
  highlight_text text,
  address text,
  google_maps_url text,
  google_maps_embed_url text,
  phone text,
  whatsapp text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  business_hours jsonb,
  section_visibility jsonb DEFAULT '{"hero":true,"pdf":true,"gallery":true,"about":true,"location":true,"hours":true,"social":true,"cta":true}'::jsonb,
  cta_whatsapp_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);`,
  },
  {
    name: "create_restaurant_landing_gallery",
    sql: `CREATE TABLE IF NOT EXISTS public.restaurant_landing_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  title text,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);`,
  },
  {
    name: "create_index_landing_settings_tenant",
    sql: `CREATE INDEX IF NOT EXISTS idx_landing_settings_tenant ON public.restaurant_landing_settings(tenant_id);`,
  },
  {
    name: "create_index_landing_gallery_tenant",
    sql: `CREATE INDEX IF NOT EXISTS idx_landing_gallery_tenant ON public.restaurant_landing_gallery(tenant_id, sort_order);`,
  },
  {
    name: "enable_rls_landing_settings",
    sql: `ALTER TABLE public.restaurant_landing_settings ENABLE ROW LEVEL SECURITY;`,
  },
  {
    name: "enable_rls_landing_gallery",
    sql: `ALTER TABLE public.restaurant_landing_gallery ENABLE ROW LEVEL SECURITY;`,
  },
  {
    name: "policy_landing_settings_public_read",
    sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_settings' AND policyname='landing_public_read') THEN
    CREATE POLICY landing_public_read ON public.restaurant_landing_settings FOR SELECT USING (true);
  END IF;
END $$;`,
  },
  {
    name: "policy_landing_settings_service_all",
    sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_settings' AND policyname='landing_service_all') THEN
    CREATE POLICY landing_service_all ON public.restaurant_landing_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;`,
  },
  {
    name: "policy_landing_gallery_public_read",
    sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_gallery' AND policyname='gallery_public_read') THEN
    CREATE POLICY gallery_public_read ON public.restaurant_landing_gallery FOR SELECT USING (true);
  END IF;
END $$;`,
  },
  {
    name: "policy_landing_gallery_service_all",
    sql: `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_gallery' AND policyname='gallery_service_all') THEN
    CREATE POLICY gallery_service_all ON public.restaurant_landing_gallery FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;`,
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!(await requireSuperAdmin(req, res))) return;
  if (!ADMIN_SECRET) return res.status(503).json({ error: "Migration endpoint is disabled" });

  const secret = req.headers["x-admin-secret"] || req.body?.secret;
  if (secret !== ADMIN_SECRET) return res.status(401).json({ error: "Unauthorized" });

  const mgmtToken = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!mgmtToken && !SERVICE_KEY) {
    return res.status(503).json({ error: "Migration service is not configured" });
  }
  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const m of migrations) {
    let ok = false;
    let error: string | undefined;

    // Método 1: Management API (si hay token)
    if (mgmtToken) {
      const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: m.sql }),
      });
      if (r.ok) { ok = true; } else { error = await r.text(); }
    }

    // Método 2: RPC exec_sql con service role
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
    message: allOk ? "Landing migration completed successfully" : "Partial migration",
    results,
  });
}
