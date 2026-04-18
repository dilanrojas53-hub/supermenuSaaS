/**
 * API Route: POST /api/admin/run-upsell-migration
 *
 * Crea las 4 tablas del motor de upsell híbrido:
 *   - product_attributes  (atributos estructurados enriquecidos por GPT)
 *   - upsell_pairs        (pares precalculados con score compuesto)
 *   - upsell_events       (tracking granular de eventos)
 *   - upsell_overrides    (control manual del admin)
 *
 * Requiere header X-Admin-Secret para autenticación.
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl = "https://zddytyncmnivfbvehrth.supabase.co";
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

  const migrations: { name: string; sql: string }[] = [
    // ── 1. product_attributes ──────────────────────────────────────────────
    {
      name: "create_product_attributes",
      sql: `
        CREATE TABLE IF NOT EXISTS public.product_attributes (
          id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
          item_id             uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
          product_role        text NOT NULL DEFAULT 'unknown',
          meal_moment         text[] DEFAULT '{}',
          satiety_level       text DEFAULT 'medium',
          is_vegan            boolean DEFAULT false,
          is_vegetarian       boolean DEFAULT false,
          is_gluten_free      boolean DEFAULT false,
          is_dairy_free       boolean DEFAULT false,
          is_halal            boolean DEFAULT false,
          is_kosher           boolean DEFAULT false,
          contains_nuts       boolean DEFAULT false,
          contains_shellfish  boolean DEFAULT false,
          contains_alcohol    boolean DEFAULT false,
          affinity_roles      text[] DEFAULT '{}',
          incompatible_roles  text[] DEFAULT '{}',
          gastro_tags         text[] DEFAULT '{}',
          suggested_pitch     text,
          enriched_by_gpt     boolean DEFAULT false,
          gpt_model           text,
          enriched_at         timestamptz,
          enrichment_version  integer DEFAULT 1,
          created_at          timestamptz DEFAULT now(),
          updated_at          timestamptz DEFAULT now(),
          UNIQUE(item_id)
        );
      `,
    },
    {
      name: "idx_product_attributes_item",
      sql: "CREATE INDEX IF NOT EXISTS idx_product_attributes_item_id ON public.product_attributes(item_id);",
    },
    {
      name: "idx_product_attributes_tenant",
      sql: "CREATE INDEX IF NOT EXISTS idx_product_attributes_tenant_id ON public.product_attributes(tenant_id);",
    },

    // ── 2. upsell_pairs ────────────────────────────────────────────────────
    {
      name: "create_upsell_pairs",
      sql: `
        CREATE TABLE IF NOT EXISTS public.upsell_pairs (
          id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
          trigger_item_id     uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
          suggested_item_id   uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
          score               numeric(5,2) DEFAULT 0,
          score_compatibility numeric(5,2) DEFAULT 0,
          score_history       numeric(5,2) DEFAULT 0,
          score_margin        numeric(5,2) DEFAULT 0,
          score_popularity    numeric(5,2) DEFAULT 0,
          score_diversity     numeric(5,2) DEFAULT 0,
          pitch               text,
          times_shown         integer DEFAULT 0,
          times_accepted      integer DEFAULT 0,
          times_rejected      integer DEFAULT 0,
          times_ignored       integer DEFAULT 0,
          attach_rate         numeric(5,4) DEFAULT 0,
          revenue_attributed  numeric(12,2) DEFAULT 0,
          is_active           boolean DEFAULT true,
          is_manual_override  boolean DEFAULT false,
          last_computed_at    timestamptz DEFAULT now(),
          created_at          timestamptz DEFAULT now(),
          updated_at          timestamptz DEFAULT now(),
          UNIQUE(trigger_item_id, suggested_item_id)
        );
      `,
    },
    {
      name: "idx_upsell_pairs_trigger",
      sql: "CREATE INDEX IF NOT EXISTS idx_upsell_pairs_trigger ON public.upsell_pairs(trigger_item_id, score DESC) WHERE is_active = true;",
    },
    {
      name: "idx_upsell_pairs_tenant",
      sql: "CREATE INDEX IF NOT EXISTS idx_upsell_pairs_tenant ON public.upsell_pairs(tenant_id, score DESC) WHERE is_active = true;",
    },

    // ── 3. upsell_events ───────────────────────────────────────────────────
    {
      name: "create_upsell_events",
      sql: `
        CREATE TABLE IF NOT EXISTS public.upsell_events (
          id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
          session_id          text,
          customer_id         uuid,
          trigger_item_id     uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
          trigger_item_name   text,
          suggested_item_id   uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
          suggested_item_name text,
          suggested_item_price numeric(10,2),
          event_type          text NOT NULL,
          surface             text NOT NULL DEFAULT 'unknown',
          cart_total          numeric(10,2),
          cart_item_count     integer,
          cart_has_drink      boolean DEFAULT false,
          cart_has_dessert    boolean DEFAULT false,
          cart_has_side       boolean DEFAULT false,
          hour_of_day         smallint,
          day_of_week         smallint,
          active_restrictions text[] DEFAULT '{}',
          revenue_value       numeric(10,2),
          time_to_show_ms     integer,
          source              text DEFAULT 'deterministic',
          created_at          timestamptz DEFAULT now()
        );
      `,
    },
    {
      name: "idx_upsell_events_tenant_created",
      sql: "CREATE INDEX IF NOT EXISTS idx_upsell_events_tenant_created ON public.upsell_events(tenant_id, created_at DESC);",
    },
    {
      name: "idx_upsell_events_trigger",
      sql: "CREATE INDEX IF NOT EXISTS idx_upsell_events_trigger ON public.upsell_events(trigger_item_id, event_type);",
    },
    {
      name: "idx_upsell_events_suggested",
      sql: "CREATE INDEX IF NOT EXISTS idx_upsell_events_suggested ON public.upsell_events(suggested_item_id, event_type);",
    },

    // ── 4. upsell_overrides ────────────────────────────────────────────────
    {
      name: "create_upsell_overrides",
      sql: `
        CREATE TABLE IF NOT EXISTS public.upsell_overrides (
          id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
          override_type       text NOT NULL,
          trigger_item_id     uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
          target_item_id      uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
          custom_pitch        text,
          priority            integer DEFAULT 0,
          is_active           boolean DEFAULT true,
          expires_at          timestamptz,
          created_by          text,
          notes               text,
          created_at          timestamptz DEFAULT now(),
          updated_at          timestamptz DEFAULT now()
        );
      `,
    },
    {
      name: "idx_upsell_overrides_tenant",
      sql: "CREATE INDEX IF NOT EXISTS idx_upsell_overrides_tenant ON public.upsell_overrides(tenant_id, override_type) WHERE is_active = true;",
    },

    // ── 5. RLS policies ────────────────────────────────────────────────────
    {
      name: "rls_product_attributes",
      sql: `
        ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_attributes' AND policyname = 'anon_all_product_attributes') THEN
            CREATE POLICY anon_all_product_attributes ON public.product_attributes FOR ALL TO anon USING (true) WITH CHECK (true);
          END IF;
        END $$;
      `,
    },
    {
      name: "rls_upsell_pairs",
      sql: `
        ALTER TABLE public.upsell_pairs ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'upsell_pairs' AND policyname = 'anon_all_upsell_pairs') THEN
            CREATE POLICY anon_all_upsell_pairs ON public.upsell_pairs FOR ALL TO anon USING (true) WITH CHECK (true);
          END IF;
        END $$;
      `,
    },
    {
      name: "rls_upsell_events",
      sql: `
        ALTER TABLE public.upsell_events ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'upsell_events' AND policyname = 'anon_all_upsell_events') THEN
            CREATE POLICY anon_all_upsell_events ON public.upsell_events FOR ALL TO anon USING (true) WITH CHECK (true);
          END IF;
        END $$;
      `,
    },
    {
      name: "rls_upsell_overrides",
      sql: `
        ALTER TABLE public.upsell_overrides ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'upsell_overrides' AND policyname = 'anon_all_upsell_overrides') THEN
            CREATE POLICY anon_all_upsell_overrides ON public.upsell_overrides FOR ALL TO anon USING (true) WITH CHECK (true);
          END IF;
        END $$;
      `,
    },
  ];

  const results: { name: string; success: boolean; error?: string }[] = [];

  for (const m of migrations) {
    try {
      const { error } = await supabaseAdmin.rpc("exec_sql", { query: m.sql });
      if (error) {
        // Try direct query as fallback
        const { error: err2 } = await (supabaseAdmin as any).from("_migrations_dummy").select().limit(0);
        results.push({ name: m.name, success: false, error: error.message });
      } else {
        results.push({ name: m.name, success: true });
      }
    } catch (e: any) {
      results.push({ name: m.name, success: false, error: e.message });
    }
  }

  const failed = results.filter((r) => !r.success);
  return res.status(200).json({
    message: failed.length === 0 ? "All migrations applied successfully" : `${failed.length} migration(s) failed`,
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: failed.length,
    results,
  });
}
