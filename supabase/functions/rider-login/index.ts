// Edge Function: rider-login
// Verifica el PIN del rider server-side dado un rider_id específico
// NUNCA expone pin_hash al cliente

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const body = await req.json();
    const { slug, pin, rider_id } = body;

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

    // 3. Verificar rate limiting
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
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Obtener el rider específico (si se provee rider_id) o buscar por PIN entre todos
    let matchedRider: { id: string; name: string; vehicle_type: string; tenant_id: string; pin_hash: string } | null = null;

    if (rider_id) {
      // Flujo nuevo: rider_id específico → solo verificar su PIN
      const { data: rider, error: riderErr } = await supabase
        .from("rider_profiles")
        .select("id, name, vehicle_type, is_active, pin_hash, tenant_id")
        .eq("id", rider_id)
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .single();

      if (riderErr || !rider) {
        return new Response(
          JSON.stringify({ error: "Repartidor no encontrado o inactivo" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar PIN (texto plano)
      if (rider.pin_hash === pin) {
        matchedRider = rider;
      }
    } else {
      // Flujo legacy: buscar por PIN entre todos los riders del tenant
      const { data: riders } = await supabase
        .from("rider_profiles")
        .select("id, name, vehicle_type, is_active, pin_hash, tenant_id")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true);

      for (const rider of (riders || [])) {
        if (rider.pin_hash === pin) {
          matchedRider = rider;
          break;
        }
      }
    }

    // 5. Registrar intento
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Login exitoso — retornar datos del rider SIN pin_hash
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[rider-login]", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
