import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// notify-match-issue — push for "Contact TD" (migration 20260927120000).
//
// The RPC match_contact_td already recorded the issue and wrote the durable in-app notification
// for the event's managers; this only adds the push, so a failure here never loses the message.
//
// Authorization: the CALLER's JWT. The caller must be able to see an open, unpushed issue row for
// this match under RLS — i.e. they are the player who raised it. Recipients are read with the
// service role and are exactly the people running this event (director + active venue owners and
// venue directors, per _match_issue_recipients): never global Compete admins, never other players.
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized." }, 401);

  let body: { tournament_id?: number; match_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const tournamentId = Number(body.tournament_id);
  const matchId = String(body.match_id ?? "");
  if (!Number.isInteger(tournamentId) || tournamentId <= 0 || !matchId) return json({ error: "Bad request." }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // The caller's own open issue row (RLS scopes this to rows they may see).
  const { data: mine } = await asCaller
    .from("match_player_status")
    .select("id, registration_id, assigned_at, issue_reason, issue_message, issue_at, issue_pushed_at, resolved_at")
    .eq("tournament_id", tournamentId)
    .eq("match_id", matchId)
    .not("issue_at", "is", null)
    .is("resolved_at", null)
    .order("issue_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!mine) return json({ error: "No open issue for this match." }, 403);
  if (mine.issue_pushed_at) return json({ ok: true, status: "already_pushed", sent: 0 }, 200);

  const { data: tourn } = await admin.from("tournaments").select("id, name").eq("id", tournamentId).maybeSingle();
  const { data: reg } = await admin
    .from("tournament_players").select("player_id, guest_name").eq("id", mine.registration_id).maybeSingle();
  let who = reg?.guest_name ?? "A player";
  if (reg?.player_id) {
    const { data: p } = await admin
      .from("profiles").select("user_name, first_name, last_name").eq("id_auto", reg.player_id).maybeSingle();
    who = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || p?.user_name || who;
  }
  const label: Record<string, string> = {
    running_late: "Running late", table_missing: "Can't find table", equipment: "Equipment issue", other: "Needs help",
  };
  const title = tourn?.name ?? "Compete";
  const text = `${who} — ${label[mine.issue_reason ?? "other"] ?? "Needs help"}${mine.issue_message ? `: ${mine.issue_message}` : ""}`;
  const data = {
    type: "match_issue", tournament_id: tournamentId, match_id: matchId,
    registration_id: mine.registration_id, assigned_at: mine.assigned_at,
    deep_link: `/(tabs)/admin/manage-tournament/${tournamentId}`,
  };

  // Recipients: the people responsible for THIS event.
  const { data: recipients } = await admin.rpc("_match_issue_recipients", { p_tournament_id: tournamentId });
  // deno-lint-ignore no-explicit-any
  const idAutos = [...new Set(((recipients ?? []) as any[]).map((r) => Number(r.id_auto ?? r)))].filter(Boolean);
  let sent = 0;
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
      // push is best-effort; the in-app notification is already stored
    }
  }
  await admin.from("match_player_status").update({ issue_pushed_at: new Date().toISOString() }).eq("id", mine.id);
  return json({ ok: true, recipients: idAutos.length, sent }, 200);
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
}
