#!/usr/bin/env python3
"""Ejecuta la migración de landing y crea buckets de storage."""
import requests
import json

SUPABASE_URL = "https://zddytyncmnivfbvehrth.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkxNjU0MywiZXhwIjoyMDg3NDkyNTQzfQ.Mtyz2mSukmk2pcVqroWn2BHEI0LQaA_zkFpGKW1joaw"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

def run_sql(sql: str, description: str):
    """Ejecuta SQL via Supabase REST API."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers=HEADERS,
        json={"sql": sql},
    )
    if resp.status_code in (200, 204):
        print(f"  ✅ {description}")
        return True
    # Intentar con query directa
    resp2 = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/sql",
        headers=HEADERS,
        json={"query": sql},
    )
    if resp2.status_code in (200, 204):
        print(f"  ✅ {description}")
        return True
    print(f"  ⚠️  {description}: {resp.status_code} {resp.text[:200]}")
    return False

def create_bucket(name: str, public: bool = True):
    """Crea un bucket de storage si no existe."""
    resp = requests.post(
        f"{SUPABASE_URL}/storage/v1/bucket",
        headers=HEADERS,
        json={"id": name, "name": name, "public": public},
    )
    if resp.status_code in (200, 201):
        print(f"  ✅ Bucket '{name}' creado")
    elif resp.status_code == 409 or "already exists" in resp.text.lower():
        print(f"  ℹ️  Bucket '{name}' ya existe")
    else:
        print(f"  ⚠️  Bucket '{name}': {resp.status_code} {resp.text[:200]}")

print("\n=== Migración: restaurant_landing_settings ===\n")

# Tabla principal
run_sql("""
CREATE TABLE IF NOT EXISTS restaurant_landing_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled               boolean NOT NULL DEFAULT false,
  hero_title            text,
  hero_subtitle         text,
  hero_description      text,
  hero_image_url        text,
  menu_pdf_url          text,
  about_title           text,
  about_description     text,
  concept               text,
  highlight_text        text,
  address               text,
  google_maps_url       text,
  google_maps_embed_url text,
  phone                 text,
  whatsapp              text,
  instagram_url         text,
  facebook_url          text,
  tiktok_url            text,
  business_hours        jsonb,
  section_visibility    jsonb DEFAULT '{"hero":true,"pdf":true,"gallery":true,"about":true,"location":true,"hours":true,"social":true,"cta":true}'::jsonb,
  cta_whatsapp_message  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
)
""", "Tabla restaurant_landing_settings")

# Tabla galería
run_sql("""
CREATE TABLE IF NOT EXISTS restaurant_landing_gallery (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  image_url   text NOT NULL,
  title       text,
  alt_text    text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
)
""", "Tabla restaurant_landing_gallery")

# Índices
run_sql("CREATE INDEX IF NOT EXISTS idx_landing_settings_tenant ON restaurant_landing_settings(tenant_id)", "Índice landing_settings_tenant")
run_sql("CREATE INDEX IF NOT EXISTS idx_landing_gallery_tenant ON restaurant_landing_gallery(tenant_id, sort_order)", "Índice landing_gallery_tenant")

# RLS
run_sql("ALTER TABLE restaurant_landing_settings ENABLE ROW LEVEL SECURITY", "RLS landing_settings")
run_sql("ALTER TABLE restaurant_landing_gallery ENABLE ROW LEVEL SECURITY", "RLS landing_gallery")

# Políticas
run_sql("""
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_settings' AND policyname='landing_settings_public_read') THEN
    CREATE POLICY landing_settings_public_read ON restaurant_landing_settings FOR SELECT USING (true);
  END IF;
END $$
""", "Policy landing_settings_public_read")

run_sql("""
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_gallery' AND policyname='landing_gallery_public_read') THEN
    CREATE POLICY landing_gallery_public_read ON restaurant_landing_gallery FOR SELECT USING (true);
  END IF;
END $$
""", "Policy landing_gallery_public_read")

run_sql("""
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_settings' AND policyname='landing_settings_service_write') THEN
    CREATE POLICY landing_settings_service_write ON restaurant_landing_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$
""", "Policy landing_settings_service_write")

run_sql("""
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='restaurant_landing_gallery' AND policyname='landing_gallery_service_write') THEN
    CREATE POLICY landing_gallery_service_write ON restaurant_landing_gallery FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$
""", "Policy landing_gallery_service_write")

print("\n=== Buckets de Storage ===\n")
create_bucket("landing-images", public=True)
create_bucket("menu-pdfs", public=True)

print("\n=== Verificación ===\n")
# Verificar tablas creadas
resp = requests.get(
    f"{SUPABASE_URL}/rest/v1/restaurant_landing_settings?limit=1",
    headers=HEADERS,
)
if resp.status_code == 200:
    print("  ✅ restaurant_landing_settings accesible")
else:
    print(f"  ❌ restaurant_landing_settings: {resp.status_code}")

resp2 = requests.get(
    f"{SUPABASE_URL}/rest/v1/restaurant_landing_gallery?limit=1",
    headers=HEADERS,
)
if resp2.status_code == 200:
    print("  ✅ restaurant_landing_gallery accesible")
else:
    print(f"  ❌ restaurant_landing_gallery: {resp2.status_code}")

print("\n✅ Migración completada\n")
