import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyMatchAssignment } from "../_shared/notify.ts";
import { isSafeMatchId } from "../_shared/idempotency.ts";

// ---------------------------------------------------------------------------
// notify-match-assigned — "you've been assigned to a table" in-app + push, sent to BOTH
// players after an elimination match is ASSIGNED (or moved to another table before it starts).
// Accepts ONLY { tournament_id, match_id }. Everything else — the players, opponent, table,
// and each player's race — is derived server-side from trusted live_settings (race via the
// server race port with app-parity tests). Never accepts message text or race values.
//
// Authorization: the caller must manage the tournament (public.can_manage_tournament, the same
// canonical rule as elim_live_apply), evaluated AS THE CALLER.
//
// Delivery: the in-app (Profile) notification is ALWAYS created; push is sent only when the
// player's "Tournament updates" preference is on.
//
// Dedupe: one row per (tournament, match, recipient, drawNumber, assignedAt) in
// match_assignment_notifications, claimed with INSERT … ON CONFLICT DO NOTHING before sending.
// Replays / double calls for the same assignment send nothing. A new assignment (new server
// assignedAt) is a new event; if this recipient was already notified in this draw for a
// DIFFERENT table, it is worded as a table change. SMS is NOT sent here (SMS stays at match start).
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+.+/.test(authHeader)) return json({ error: "Unauthorized." }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user?.id) return json({ error: "Unauthorized." }, 401);

  let body: { tournament_id?: number; match_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const tournamentId = Number(body.tournament_id);
  const matchId = String(body.match_id ?? "");
  if (!Number.isInteger(tournamentId) || tournamentId <= 0 || !isSafeMatchId(matchId)) {
    return json({ error: "Bad request." }, 400);
  }

  // Canonical management permission, evaluated as the caller.
  const { data: canManage, error: authzErr } = await userClient.rpc("can_manage_tournament", { p_tournament_id: tournamentId });
  if (authzErr || canManage !== true) return json({ error: "Forbidden." }, 403);

  const out = await notifyMatchAssignment(admin, tournamentId, matchId);
  return json({ ok: true, ...out }, 200);
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
