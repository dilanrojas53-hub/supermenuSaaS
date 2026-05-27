#!/usr/bin/env python3
"""Ejecuta la migración de landing usando la API de Supabase Management."""
import requests
import json

SUPABASE_URL = "https://zddytyncmnivfbvehrth.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkxNjU0MywiZXhwIjoyMDg3NDkyNTQzfQ.Mtyz2mSukmk2pcVqroWn2BHEI0LQaA_zkFpGKW1joaw"
PROJECT_REF = "zddytyncmnivfbvehrth"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

def run_sql_management(sql: str, description: str):
    """Ejecuta SQL via Supabase Management API."""
    resp = requests.post(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        headers={
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
    )
    if resp.status_code in (200, 201, 204):
        print(f"  ✅ {description}")
        return True
    print(f"  ⚠️  {description}: {resp.status_code} {resp.text[:300]}")
    return False

def insert_row(table: str, data: dict, description: str):
    """Inserta un registro via REST API."""
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=data,
    )
    if resp.status_code in (200, 201, 204):
        print(f"  ✅ {description}")
        return True
    print(f"  ⚠️  {description}: {resp.status_code} {resp.text[:300]}")
    return False

def create_bucket(name: str, public: bool = True):
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

print("\n=== Migración via Management API ===\n")

SQL_MAIN = """
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
);
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

run_sql_management(SQL_MAIN, "Tablas + índices + RLS + políticas")

print("\n=== Buckets de Storage ===\n")
create_bucket("landing-images", public=True)
create_bucket("menu-pdfs", public=True)

print("\n=== Verificación ===\n")
resp = requests.get(f"{SUPABASE_URL}/rest/v1/restaurant_landing_settings?limit=1", headers=HEADERS)
if resp.status_code == 200:
    print("  ✅ restaurant_landing_settings accesible")
else:
    print(f"  ❌ restaurant_landing_settings: {resp.status_code} {resp.text[:200]}")

resp2 = requests.get(f"{SUPABASE_URL}/rest/v1/restaurant_landing_gallery?limit=1", headers=HEADERS)
if resp2.status_code == 200:
    print("  ✅ restaurant_landing_gallery accesible")
else:
    print(f"  ❌ restaurant_landing_gallery: {resp2.status_code} {resp2.text[:200]}")

print("\n✅ Proceso completado\n")
