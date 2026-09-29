import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleUsernameLogin } from "../_shared/username_login.ts";

// ---------------------------------------------------------------------------
// login-with-username — username + password sign-in WITHOUT exposing the email.
//
// Replaces the client-side "resolve username -> profiles.email (signed out) -> signIn" flow
// (M3 profiles privacy, Stage 0). The email is resolved server-side with the service-role-only
// RPC _login_email_for_username and used for a server-side password sign-in; the response is
// only { session: { access_token, refresh_token, expires_in, expires_at, token_type } } — the
// client then calls supabase.auth.setSession(session). Every failure returns the same generic
// message. Supabase Auth's own sign-in rate limits still apply to the password attempt.
//
// Public endpoint (the caller is signed out): deploy with --no-verify-jwt; the anon apikey is
// still sent by supabase.functions.invoke. Never logs the username, email or password.
//
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  let input: unknown;
  try { input = await req.json(); } catch { return json({ error: "Invalid username or password." }, 400); }

  const result = await handleUsernameLogin(input, {
    resolveEmail: async (username) => {
      const { data, error } = await admin.rpc("_login_email_for_username", { p_username: username });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    signIn: async (email, password) => {
      // Fresh, non-persisting anon client per request — no session is shared between callers.
      const anon = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password });
      return { session: data?.session ?? null, error };
    },
  });
  if (result.status === 500) console.error("[login-with-username] lookup failed");
  return json(result.body, result.status);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
