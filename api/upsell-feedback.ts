/**
 * POST /api/upsell-feedback
 * Registra si el cliente aceptó, rechazó o ignoró una sugerencia de upsell.
 * Estos datos alimentan el sistema de aprendizaje del motor de recomendaciones.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://zddytyncmnivfbvehrth.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk"
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      tenant_id,
      trigger_item_id,
      trigger_item_name,
      suggested_item_id,
      suggested_item_name,
      action,
    } = req.body;

    if (!tenant_id || !trigger_item_id || !suggested_item_id || !action)
      return res.status(400).json({ error: "Missing required fields" });

    const validActions = ["accepted", "rejected", "ignored"];
    if (!validActions.includes(action))
      return res.status(400).json({ error: "Invalid action" });

    const { error } = await supabase.from("upsell_feedback").insert({
      tenant_id,
      trigger_item_id,
      trigger_item_name: trigger_item_name || "",
      suggested_item_id,
      suggested_item_name: suggested_item_name || "",
      action,
    });

    if (error) {
      console.error("[Upsell Feedback] DB error:", error.message);
      return res.status(500).json({ error: "Failed to save feedback" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[Upsell Feedback] Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
