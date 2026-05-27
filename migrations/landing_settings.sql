-- Migration: restaurant_landing_settings + restaurant_landing_gallery
-- SuperMenu SaaS — Landing pública por tenant

-- ─── Tabla principal de configuración de landing ───────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_landing_settings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled               boolean NOT NULL DEFAULT false,

  -- Hero
  hero_title            text,
  hero_subtitle         text,
  hero_description      text,
  hero_image_url        text,

  -- Menú PDF
  menu_pdf_url          text,

  -- Sobre nosotros
  about_title           text,
  about_description     text,
  concept               text,
  highlight_text        text,

  -- Información práctica
  address               text,
  google_maps_url       text,
  google_maps_embed_url text,
  phone                 text,
  whatsapp              text,
  instagram_url         text,
  facebook_url          text,
  tiktok_url            text,
  business_hours        jsonb,

  -- Visibilidad de secciones
  section_visibility    jsonb DEFAULT '{"hero":true,"pdf":true,"gallery":true,"about":true,"location":true,"hours":true,"social":true,"cta":true}'::jsonb,

  -- CTA WhatsApp
  cta_whatsapp_message  text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id)
);

-- ─── Tabla de galería de fotos ─────────────────────────────────────────────
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

-- ─── Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_landing_settings_tenant ON restaurant_landing_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_landing_gallery_tenant  ON restaurant_landing_gallery(tenant_id, sort_order);

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE restaurant_landing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_landing_gallery  ENABLE ROW LEVEL SECURITY;

-- Lectura pública (solo registros enabled)
CREATE POLICY "landing_settings_public_read"
  ON restaurant_landing_settings FOR SELECT
  USING (true);

CREATE POLICY "landing_gallery_public_read"
  ON restaurant_landing_gallery FOR SELECT
  USING (true);

-- Escritura: solo service_role (el admin usa service_role key via API route)
CREATE POLICY "landing_settings_service_write"
  ON restaurant_landing_settings FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "landing_gallery_service_write"
  ON restaurant_landing_gallery FOR ALL
  USING (true)
  WITH CHECK (true);
