const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://zddytyncmnivfbvehrth.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkxNjU0MywiZXhwIjoyMDg3NDkyNTQzfQ.Mtyz2mSukmk2pcVqroWn2BHEI0LQaA_zkFpGKW1joaw'
);

// Use the Supabase JS client to call the pg_query function
// The service role key allows us to bypass RLS

async function run() {
  // Try using the pg endpoint directly via fetch
  const SUPABASE_URL = 'https://zddytyncmnivfbvehrth.supabase.co';
  const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTkxNjU0MywiZXhwIjoyMDg3NDkyNTQzfQ.Mtyz2mSukmk2pcVqroWn2BHEI0LQaA_zkFpGKW1joaw';

  const sql = `
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
`;

  // Use the pg endpoint
  const resp = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  
  const text = await resp.text();
  console.log(`pg/query: ${resp.status} ${text.substring(0, 200)}`);

  // Verify
  const { data, error } = await supabase.from('restaurant_landing_settings').select('id').limit(1);
  if (error) {
    console.log('❌ Tabla no existe:', error.message);
  } else {
    console.log('✅ Tabla restaurant_landing_settings existe');
  }
}

run().catch(console.error);
