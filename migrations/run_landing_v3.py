"""
Ejecuta la migración de landing via Supabase REST API (service role key).
Usa el endpoint /rest/v1/rpc/exec_sql si existe, o crea las tablas via
llamadas directas a la API de Supabase Management.
"""
import os, sys, requests

SUPABASE_URL = "https://zddytyncmnivfbvehrth.supabase.co"

# Leer service role key desde el servidor
sys.path.insert(0, '/home/ubuntu/supermenuSaaS')
try:
    import importlib.util
    spec = importlib.util.spec_from_file_location("server_config", "/home/ubuntu/supermenuSaaS/server/index.ts")
except:
    pass

# Leer directamente del archivo
with open('/home/ubuntu/supermenuSaaS/server/index.ts', 'r') as f:
    content = f.read()

import re
match = re.search(r"SUPABASE_SERVICE_ROLE_KEY['\"]?\s*[=:]\s*['\"]([^'\"]+)['\"]", content)
if not match:
    # Buscar en .env o variables de entorno
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not key:
        print("ERROR: No se encontró SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
else:
    key = match.group(1)

print(f"Service role key encontrada: {key[:20]}...")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

# Verificar si las tablas ya existen
check = requests.get(
    f"{SUPABASE_URL}/rest/v1/restaurant_landing_settings?limit=1",
    headers=headers
)
if check.status_code == 200:
    print("✅ Tabla restaurant_landing_settings ya existe")
else:
    print(f"Tabla no existe (status {check.status_code}), necesita migración manual")
    print("Por favor ejecuta el SQL en el dashboard de Supabase:")
    print("""
CREATE TABLE IF NOT EXISTS restaurant_landing_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  hero_title TEXT, hero_subtitle TEXT, hero_description TEXT,
  hero_image_url TEXT, menu_pdf_url TEXT,
  about_title TEXT, about_description TEXT, concept TEXT, highlight_text TEXT,
  address TEXT, google_maps_url TEXT, google_maps_embed_url TEXT,
  phone TEXT, whatsapp TEXT, instagram_url TEXT, facebook_url TEXT, tiktok_url TEXT,
  business_hours JSONB DEFAULT '[]'::jsonb,
  section_visibility JSONB DEFAULT '{"hero":true,"pdf":true,"gallery":true,"about":true,"location":true,"hours":true,"social":true,"cta":true}'::jsonb,
  cta_whatsapp_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS restaurant_landing_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  title TEXT, alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE restaurant_landing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_landing_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Public read landing settings"
  ON restaurant_landing_settings FOR SELECT USING (enabled = true);
CREATE POLICY IF NOT EXISTS "Service role full access landing settings"
  ON restaurant_landing_settings USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Public read landing gallery"
  ON restaurant_landing_gallery FOR SELECT USING (is_active = true);
CREATE POLICY IF NOT EXISTS "Service role full access landing gallery"
  ON restaurant_landing_gallery USING (true) WITH CHECK (true);
""")
