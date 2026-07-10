import { createClient, type User } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://zddytyncmnivfbvehrth.supabase.co";

const supabasePublicKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkZHl0eW5jbW5pdmZidmVocnRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTY1NDMsImV4cCI6MjA4NzQ5MjU0M30.aNQBiSsV-RXHze7D6LF4WGBwEdHyov-umuTh0t-Patk";

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "admin@digitalatlas.com").toLowerCase();

function bearerToken(req: VercelRequest): string | null {
  const raw = req.headers.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function isSuperAdmin(user: User): boolean {
  return (
    user.app_metadata?.role === "superadmin" ||
    user.email?.toLowerCase() === superAdminEmail
  );
}

async function authenticatedUser(
  req: VercelRequest,
  res: VercelResponse,
): Promise<User | null> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  if (!supabasePublicKey) {
    console.error("[authorization] Missing Supabase public key");
    res.status(500).json({ error: "Server authentication is not configured" });
    return null;
  }

  const authClient = createClient(supabaseUrl, supabasePublicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }

  return data.user;
}

export async function requireSuperAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<User | null> {
  const user = await authenticatedUser(req, res);
  if (!user) return null;

  if (!isSuperAdmin(user)) {
    res.status(403).json({ error: "Super administrator access required" });
    return null;
  }

  return user;
}

export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse,
): Promise<User | null> {
  const user = await authenticatedUser(req, res);
  if (!user) return null;
  if (isSuperAdmin(user)) return user;

  if (!supabaseServiceKey) {
    console.error("[authorization] Missing Supabase service role key");
    res.status(500).json({ error: "Server authorization is not configured" });
    return null;
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: byId } = await adminClient
    .from("tenants")
    .select("id")
    .eq("admin_id", user.id)
    .limit(1)
    .maybeSingle();

  if (byId) return user;

  const { data: legacyTenant } = user.email
    ? await adminClient
        .from("tenants")
        .select("id")
        .is("admin_id", null)
        .eq("admin_email", user.email)
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (!legacyTenant) {
    res.status(403).json({ error: "Restaurant administrator access required" });
    return null;
  }

  return user;
}

export async function requireTenantAdmin(
  req: VercelRequest,
  res: VercelResponse,
  tenantId: unknown,
): Promise<User | null> {
  const user = await authenticatedUser(req, res);
  if (!user) return null;
  if (isSuperAdmin(user)) return user;

  if (typeof tenantId !== "string" || !tenantId) {
    res.status(400).json({ error: "tenant_id is required" });
    return null;
  }

  if (!supabaseServiceKey) {
    console.error("[authorization] Missing Supabase service role key");
    res.status(500).json({ error: "Server authorization is not configured" });
    return null;
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: tenant, error } = await adminClient
    .from("tenants")
    .select("admin_id, admin_email")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !tenant) {
    res.status(404).json({ error: "Restaurant not found" });
    return null;
  }

  const ownsTenant =
    tenant.admin_id === user.id ||
    (!tenant.admin_id && tenant.admin_email?.toLowerCase() === user.email?.toLowerCase());

  if (!ownsTenant) {
    res.status(403).json({ error: "You do not have access to this restaurant" });
    return null;
  }

  return user;
}
