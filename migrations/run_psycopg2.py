import psycopg2
import os

# Connection string de Supabase (pooler transaction mode)
conn_str = "postgresql://postgres.zddytyncmnivfbvehrth:Dilan2003.@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

sql = """
CREATE TABLE IF NOT EXISTS restaurant_landing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
);

CREATE TABLE IF NOT EXISTS restaurant_landing_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  title text,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_settings_tenant ON restaurant_landing_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_landing_gallery_tenant ON restaurant_landing_gallery(tenant_id, sort_order);

ALTER TABLE restaurant_landing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_landing_gallery ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_settings' AND policyname='landing_public_read') THEN
    CREATE POLICY landing_public_read ON restaurant_landing_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_settings' AND policyname='landing_service_all') THEN
    CREATE POLICY landing_service_all ON restaurant_landing_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_gallery' AND policyname='gallery_public_read') THEN
    CREATE POLICY gallery_public_read ON restaurant_landing_gallery FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_gallery' AND policyname='gallery_service_all') THEN
    CREATE POLICY gallery_service_all ON restaurant_landing_gallery FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
"""

try:
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(sql)
    print("✅ Migración ejecutada exitosamente")
    
    # Verificar
    cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('restaurant_landing_settings','restaurant_landing_gallery')")
    count = cur.fetchone()[0]
    print(f"✅ Tablas creadas: {count}/2")
    cur.close()
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
