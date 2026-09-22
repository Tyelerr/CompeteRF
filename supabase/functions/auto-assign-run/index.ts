import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runAutoAssign } from "../_shared/auto_assign_core.ts";
import { notifyMatchAssignment } from "../_shared/notify.ts";

// ---------------------------------------------------------------------------
// auto-assign-run — server-side Auto Assign for one elimination tournament.
// Called ONLY by Postgres (pg_net) from the auto-assign triggers and the recovery sweep
// (migration 20260924120000). Deployed with --no-verify-jwt; authenticated by the shared
// secret header (Vault 'elim_auto_assign_secret' == function env AUTO_ASSIGN_SECRET).
// Input: { tournament_id }. It plans with the app's own bundled scheduler, writes only through
// elim_auto_assign_apply (assign + ifUnassigned, never start, stale-state refusal), then sends
// the deduped assignment notifications.
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const SECRET = Deno.env.get("AUTO_ASSIGN_SECRET") ?? "";
  const given = req.headers.get("x-auto-assign-secret") ?? "";
  if (SECRET.length < 32 || !safeEqual(given, SECRET)) return json({ error: "Unauthorized." }, 401);

  let body: { tournament_id?: number };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const tournamentId = Number(body.tournament_id);
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) return json({ error: "Bad request." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const outcome = await runAutoAssign(tournamentId, {
    load: async (tid) => {
      const { data: t } = await admin
        .from("tournaments")
        .select("live_settings, live_state, is_paused, tournament_format, game_type, updated_at")
        .eq("id", tid)
        .maybeSingle();
      const { data: tables } = await admin
        .from("tournament_tables").select("id, table_number, status").eq("tournament_id", tid);
      return { tournament: t ?? null, tables: tables ?? [] };
    },
    apply: async (tid, ops, expectedUpdatedAt) => {
      const { data, error } = await admin.rpc("elim_auto_assign_apply", {
        p_tournament_id: tid,
        p_ops: ops,
        p_expected_updated_at: expectedUpdatedAt,
      });
      if (error) throw error;
      return data;
    },
    notify: (tid, matchId) => notifyMatchAssignment(admin, tid, matchId),
    now: () => Date.now(),
  });
  return json({ ok: true, ...outcome }, 200);
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
