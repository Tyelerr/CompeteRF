import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// notify-match-review — push for the Forfeit Review threshold (migration 20260929120000).
//
// Called ONLY by Postgres (pg_net) from _match_review_sweep, which has already written the
// durable in-app alert and stamped review_alert_at — so a failure here never loses the alert.
// Deployed with --no-verify-jwt; authenticated by the same shared secret header as auto-assign-run.
//
// It pushes once per assignment (review_pushed_at), to the event's managers only, and re-checks
// that the match is STILL unstarted: if the TD started it in the seconds between the sweep and
// this call, nothing is sent.
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

  const { data: pending } = await admin.rpc("match_review_pending", { p_tournament_id: tournamentId });
  // deno-lint-ignore no-explicit-any
  const rows: any[] = Array.isArray(pending) ? pending : [];
  if (!rows.length) return json({ ok: true, status: "nothing_pending", sent: 0 }, 200);

  const { data: tourn } = await admin
    .from("tournaments").select("id, name, live_settings, live_state, is_paused").eq("id", tournamentId).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const matchState: Record<string, any> = (tourn?.live_settings as any)?.matchState ?? {};
  const { data: recipients } = await admin.rpc("_match_issue_recipients", { p_tournament_id: tournamentId });
  // deno-lint-ignore no-explicit-any
  const idAutos = [...new Set(((recipients ?? []) as any[]).map((r) => Number(r.id_auto ?? r)))].filter(Boolean);

  let sent = 0;
  let pushedFor = 0;
  for (const row of rows) {
    const ms = matchState[row.match_id] ?? {};
    // Still waiting? (started / completed / cleared / reassigned in the meantime → skip silently)
    const stillWaiting =
      tourn?.live_state === "in_progress" &&
      !tourn?.is_paused &&
      (ms.status ?? "scheduled") === "scheduled" &&
      typeof ms.tableId === "number" &&
      ms.assignedAt &&
      Date.parse(ms.assignedAt) === Date.parse(row.assigned_at);
    // Mark it pushed either way: one attempt per assignment, never a repeat every cron run.
    await admin.rpc("match_review_mark_pushed", {
      p_tournament_id: tournamentId, p_match_id: row.match_id,
      p_assigned_at: row.assigned_at, p_draw_number: row.draw_number,
    });
    if (!stillWaiting) continue;
    pushedFor++;

    const title = tourn?.name ?? "Compete";
    const text = `Forfeit Review — ${row.match_id} has not started. Review and decide.`;
    const data = {
      type: "match_review", tournament_id: tournamentId, match_id: row.match_id,
      assigned_at: row.assigned_at,
      deep_link: `/(tabs)/admin/manage-tournament/${tournamentId}?reviewMatch=${row.match_id}`,
    };
    for (const idAuto of idAutos) {
      const { data: prof } = await admin.from("profiles").select("id").eq("id_auto", idAuto).maybeSingle();
      if (!prof?.id) continue;
      const { data: prefs } = await admin
        .from("notification_preferences").select("tournament_updates").eq("user_id", prof.id).maybeSingle();
      if (prefs && prefs.tournament_updates === false) continue;
      const { data: tokens } = await admin
        .from("push_tokens").select("token").eq("user_id", prof.id).eq("is_active", true);
      // deno-lint-ignore no-explicit-any
      const list = [...new Set(((tokens ?? []) as any[]).map((t) => t.token as string))];
      if (!list.length) continue;
      try {
        const resp = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(list.map((to) => ({ to, sound: "default", title, body: text, data }))),
        });
        const out = await resp.json();
        // deno-lint-ignore no-explicit-any
        const receipts: any[] = Array.isArray(out?.data) ? out.data : [];
        sent += receipts.filter((r) => r?.status === "ok").length;
        const dead = receipts.map((r, i) => (r?.details?.error === "DeviceNotRegistered" ? list[i] : null)).filter(Boolean) as string[];
        if (dead.length) await admin.from("push_tokens").update({ is_active: false }).in("token", dead);
      } catch {
        // push is best-effort; the in-app alert is already stored
      }
    }
  }
  return json({ ok: true, matches: pushedFor, recipients: idAutos.length, sent }, 200);
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
