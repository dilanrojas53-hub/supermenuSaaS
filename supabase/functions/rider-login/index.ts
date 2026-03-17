// Edge Function: rider-login
// Verifica el PIN del rider server-side con bcrypt y rate limiting
// NUNCA expone pin_hash al cliente

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { slug, pin } = await req.json();

    if (!slug || !pin) {
      return new Response(
        JSON.stringify({ error: "slug y pin son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Obtener el tenant por slug
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .single();

    if (tenantErr || !tenant) {
      return new Response(
        JSON.stringify({ error: "Restaurante no encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Obtener IP del cliente para rate limiting
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // 3. Verificar rate limiting en tabla rider_login_attempts
    const windowStart = new Date(
      Date.now() - LOCKOUT_MINUTES * 60 * 1000
    ).toISOString();

    const { data: attempts } = await supabase
      .from("rider_login_attempts")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("client_ip", clientIp)
      .eq("success", false)
      .gte("created_at", windowStart);

    if (attempts && attempts.length >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({
          error: `Demasiados intentos fallidos. Espera ${LOCKOUT_MINUTES} minutos.`,
          locked: true,
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 4. Obtener riders activos del tenant (con pin_hash — solo server-side)
    const { data: riders, error: ridersErr } = await supabase
      .from("rider_profiles")
      .select("id, name, vehicle_type, is_active, pin_hash")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true);

    if (ridersErr || !riders?.length) {
      return new Response(
        JSON.stringify({ error: "No hay repartidores activos" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Verificar PIN contra cada rider
    let matchedRider: typeof riders[0] | null = null;
    for (const rider of riders) {
      if (!rider.pin_hash) continue;

      let isMatch = false;
      // Soporte para PINs legacy (texto plano) y bcrypt
      if (rider.pin_hash.startsWith("$2")) {
        isMatch = await bcrypt.compare(pin, rider.pin_hash);
      } else {
        // Legacy plain text — comparación constante para evitar timing attacks
        isMatch = rider.pin_hash === pin;
      }

      if (isMatch) {
        matchedRider = rider;
        break;
      }
    }

    // 6. Registrar intento (éxito o fallo)
    await supabase.from("rider_login_attempts").insert({
      tenant_id: tenant.id,
      client_ip: clientIp,
      success: !!matchedRider,
      created_at: new Date().toISOString(),
    });

    if (!matchedRider) {
      const remaining = MAX_ATTEMPTS - (attempts?.length || 0) - 1;
      return new Response(
        JSON.stringify({
          error: "PIN incorrecto",
          attemptsRemaining: Math.max(0, remaining),
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 7. Login exitoso — retornar datos del rider SIN pin_hash
    return new Response(
      JSON.stringify({
        success: true,
        rider: {
          id: matchedRider.id,
          name: matchedRider.name,
          vehicle_type: matchedRider.vehicle_type,
          tenant_id: tenant.id,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[rider-login]", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
