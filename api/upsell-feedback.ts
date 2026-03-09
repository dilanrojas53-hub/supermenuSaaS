/**
 * POST /api/upsell-feedback
 * Registra si el cliente aceptó, rechazó o ignoró una sugerencia de upsell.
 * Estos datos alimentan el sistema de aprendizaje del motor de recomendaciones.
 *
 * Body:
 *   tenant_id: string
 *   trigger_item_id: string
 *   trigger_item_name: string
 *   suggested_item_id: string
 *   suggested_item_name: string
 *   action: 'accepted' | 'rejected' | 'ignored'
 */
import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      tenant_id,
      trigger_item_id,
      trigger_item_name,
      suggested_item_id,
      suggested_item_name,
      action,
    } = req.body;

    // Validación mínima
    if (!tenant_id || !trigger_item_id || !suggested_item_id || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validActions = ['accepted', 'rejected', 'ignored'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const { error } = await supabase.from('upsell_feedback').insert({
      tenant_id,
      trigger_item_id,
      trigger_item_name: trigger_item_name || '',
      suggested_item_id,
      suggested_item_name: suggested_item_name || '',
      action,
    });

    if (error) {
      console.error('[Upsell Feedback] DB error:', error.message);
      return res.status(500).json({ error: 'Failed to save feedback' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Upsell Feedback] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
