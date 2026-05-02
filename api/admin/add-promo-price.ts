/**
 * Migration endpoint: add promo_price column to promotions table.
 * POST /api/admin/add-promo-price
 * Header: x-admin-secret: supermenu-migration-2026
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ADMIN_SECRET = 'supermenu-migration-2026';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey);

  const results: { step: string; ok: boolean; error?: string }[] = [];

  // Step 1: Add promo_price column (numeric, nullable)
  try {
    const { error } = await admin.rpc('exec_sql', {
      sql: `ALTER TABLE promotions ADD COLUMN IF NOT EXISTS promo_price numeric(10,2) DEFAULT NULL;`
    });
    if (error) throw error;
    results.push({ step: 'add_promo_price_column', ok: true });
  } catch (e: unknown) {
    // Try alternative: direct query via postgres extension
    const errMsg = e instanceof Error ? e.message : String(e);
    // If exec_sql doesn't exist, try via supabase-js raw query workaround
    // We'll use a select to check if column already exists
    const { data: colCheck } = await admin
      .from('information_schema.columns' as never)
      .select('column_name')
      .eq('table_name', 'promotions')
      .eq('column_name', 'promo_price')
      .single();

    if (colCheck) {
      results.push({ step: 'add_promo_price_column', ok: true, error: 'already exists' });
    } else {
      results.push({ step: 'add_promo_price_column', ok: false, error: errMsg });
    }
  }

  return res.status(200).json({ success: true, results });
}
