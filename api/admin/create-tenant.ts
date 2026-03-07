/**
 * API Route: POST /api/admin/create-tenant
 * 
 * Crea un nuevo restaurante (tenant) con su usuario administrador en Supabase Auth.
 * Usa SUPABASE_SERVICE_ROLE_KEY para tener permisos de admin.
 * 
 * Request body:
 * {
 *   name: string,
 *   slug: string,
 *   description?: string,
 *   phone?: string,
 *   whatsapp_number?: string,
 *   address?: string,
 *   sinpe_number?: string,
 *   sinpe_owner?: string,
 *   admin_email: string,
 *   admin_password: string (minLength: 6),
 *   plan_tier: 'basic' | 'pro' | 'premium',
 *   subscription_expires_at?: string (ISO date),
 *   primary_color?: string,
 *   secondary_color?: string,
 *   accent_color?: string,
 *   background_color?: string,
 *   text_color?: string,
 *   font_family?: string,
 *   view_mode?: 'grid' | 'list'
 * }
 */

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Initialize Supabase Admin client (server-side only)
const supabaseUrl = process.env.VITE_FRONTEND_FORGE_API_URL || "https://zddytyncmnivfbvehrth.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      name,
      slug,
      description,
      phone,
      whatsapp_number,
      address,
      sinpe_number,
      sinpe_owner,
      admin_email,
      admin_password,
      plan_tier,
      subscription_expires_at,
      primary_color,
      secondary_color,
      accent_color,
      background_color,
      text_color,
      font_family,
      view_mode,
    } = req.body;

    // Validations
    if (!name || !slug) {
      return res.status(400).json({ error: "name and slug are required" });
    }

    if (!admin_email || !admin_password) {
      return res.status(400).json({ error: "admin_email and admin_password are required" });
    }

    if (admin_password.length < 6) {
      return res.status(400).json({ error: "admin_password must be at least 6 characters" });
    }

    // Step 1: Check if slug already exists
    const { data: existingTenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .single();

    if (existingTenant) {
      return res.status(409).json({ error: "Slug already in use" });
    }

    // Step 2: Create user in Supabase Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError || !authUser?.user) {
      console.error("[create-tenant] Auth error:", authError);
      return res.status(400).json({ error: `Failed to create admin user: ${authError?.message}` });
    }

    const adminUserId = authUser.user.id;

    // Step 3: Create tenant in database with admin_id
    const { data: newTenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({
        name,
        slug,
        description: description || null,
        phone: phone || null,
        whatsapp_number: whatsapp_number || null,
        address: address || null,
        sinpe_number: sinpe_number || null,
        sinpe_owner: sinpe_owner || null,
        admin_email,
        admin_id: adminUserId, // Link to auth user
        plan_tier: plan_tier || "basic",
        subscription_expires_at: subscription_expires_at ? `${subscription_expires_at}T23:59:59Z` : null,
        is_active: true,
      })
      .select()
      .single();

    if (tenantError || !newTenant) {
      console.error("[create-tenant] Tenant insert error:", tenantError);
      // If tenant creation fails, delete the auth user to keep things clean
      await supabaseAdmin.auth.admin.deleteUser(adminUserId);
      return res.status(400).json({ error: `Failed to create tenant: ${tenantError?.message}` });
    }

    // Step 4: Create theme settings for the tenant
    const { error: themeError } = await supabaseAdmin.from("theme_settings").insert({
      tenant_id: newTenant.id,
      primary_color: primary_color || "#FF6B35",
      secondary_color: secondary_color || "#004E89",
      accent_color: accent_color || "#F7C948",
      background_color: background_color || "#FFFFFF",
      text_color: text_color || "#1A1A2E",
      font_family: font_family || "Inter",
      view_mode: view_mode || "grid",
    });

    if (themeError) {
      console.error("[create-tenant] Theme insert error:", themeError);
      // Theme creation failure is not critical, but log it
    }

    // Success response
    return res.status(201).json({
      success: true,
      tenant: {
        id: newTenant.id,
        name: newTenant.name,
        slug: newTenant.slug,
        admin_id: adminUserId,
        admin_email: admin_email,
      },
      message: `Tenant "${name}" created successfully with admin user "${admin_email}"`,
    });
  } catch (error) {
    console.error("[create-tenant] Unexpected error:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
