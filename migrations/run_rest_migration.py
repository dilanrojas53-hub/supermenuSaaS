import requests
import json

SUPABASE_URL = "https://zddytyncmnivfbvehrth.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkxNjU0MywiZXhwIjoyMDg3NDkyNTQzfQ.Mtyz2mSukmk2pcVqroWn2BHEI0LQaA_zkFpGKW1joaw"

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

# Use the pg_dump endpoint or RPC
# Try calling a custom RPC or use the REST API to execute SQL via pg functions

# Method: Use the Supabase REST API to call pg_query via rpc
# First, let's try the /rest/v1/rpc/exec_sql approach if it exists
# Or use the Management API

# Alternative: use the Supabase JS SDK approach via fetch to the pg endpoint
# The correct way is via the Management API with the project ref

PROJECT_REF = "zddytyncmnivfbvehrth"
MANAGEMENT_TOKEN = SERVICE_KEY  # This won't work for management API

# Let's try using the pg REST endpoint directly
sql_statements = [
    """CREATE TABLE IF NOT EXISTS restaurant_landing_settings (
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
)""",
    """CREATE TABLE IF NOT EXISTS restaurant_landing_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  title text,
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)""",
    "CREATE INDEX IF NOT EXISTS idx_landing_settings_tenant ON restaurant_landing_settings(tenant_id)",
    "CREATE INDEX IF NOT EXISTS idx_landing_gallery_tenant ON restaurant_landing_gallery(tenant_id, sort_order)",
    "ALTER TABLE restaurant_landing_settings ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE restaurant_landing_gallery ENABLE ROW LEVEL SECURITY",
    "CREATE POLICY landing_public_read ON restaurant_landing_settings FOR SELECT USING (true)",
    "CREATE POLICY landing_service_all ON restaurant_landing_settings FOR ALL USING (true) WITH CHECK (true)",
    "CREATE POLICY gallery_public_read ON restaurant_landing_gallery FOR SELECT USING (true)",
    "CREATE POLICY gallery_service_all ON restaurant_landing_gallery FOR ALL USING (true) WITH CHECK (true)",
]

# Use the Supabase Management API
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"

# Try with service key as bearer
for i, stmt in enumerate(sql_statements):
    resp = requests.post(
        MGMT_URL,
        headers={
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json"
        },
        json={"query": stmt}
    )
    if resp.status_code in [200, 201]:
        print(f"  ✅ [{i+1}/{len(sql_statements)}] OK")
    else:
        print(f"  ⚠️  [{i+1}/{len(sql_statements)}] {resp.status_code}: {resp.text[:100]}")

# Verify
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/restaurant_landing_settings?limit=1",
    headers=headers
)
if resp.status_code == 200:
    print("✅ Tabla restaurant_landing_settings verificada")
else:
    print(f"❌ Verificación: {resp.status_code} {resp.text[:100]}")
