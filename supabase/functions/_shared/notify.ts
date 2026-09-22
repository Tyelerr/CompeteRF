// supabase/functions/_shared/notify.ts
// Core of the "you've been assigned to a table" notification, shared by notify-match-assigned
// (TD-triggered, caller-authorized) and auto-assign-run (server-triggered). Callers must have
// ALREADY authorized the request; this function only reads trusted state with the service-role
// client it is given.
//
// Delivery: in-app (Profile) notification ALWAYS; push only when the player's "Tournament
// updates" preference is on. No SMS (SMS stays at match start).
// Dedupe: one match_assignment_notifications row per (tournament, match, recipient, drawNumber,
// server assignedAt), claimed with INSERT … ON CONFLICT DO NOTHING before sending — replays and
// double calls for the same assignment send nothing. If this recipient was already notified in
// this draw for a DIFFERENT table, the message is worded as a table change.
import { resolveMatchSides } from "./bracket.ts";
import { computeMatchRace } from "./race.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface NotifyOutcome {
  skipped?: string;
  results: { registrationId: number; status: string }[];
}

export async function notifyMatchAssignment(admin: Admin, tournamentId: number, matchId: string): Promise<NotifyOutcome> {
  const { data: tourn } = await admin
    .from("tournaments").select("id, name, tournament_format, live_settings").eq("id", tournamentId).maybeSingle();
  if (!tourn || tourn.tournament_format === "chip-tournament") return { skipped: "not_found", results: [] };
  // deno-lint-ignore no-explicit-any
  const ls: any = tourn.live_settings ?? {};
  const ms = (ls.matchState ?? {})[matchId] ?? {};
  const tableId = typeof ms.tableId === "number" ? ms.tableId : null;
  const assignedAt = typeof ms.assignedAt === "string" ? ms.assignedAt : null;
  if (tableId == null || !assignedAt || (ms.status !== "scheduled" && ms.status !== "in_progress" && ms.status != null)) {
    return { skipped: "not_assigned", results: [] };
  }
  const sides = resolveMatchSides(ls.bracket ?? {}, ls.matchState ?? {}, matchId);
  if (!sides?.p1 || !sides?.p2) return { skipped: "players_unknown", results: [] };

  const { data: table } = await admin
    .from("tournament_tables").select("id, table_number, label").eq("id", tableId).eq("tournament_id", tournamentId).maybeSingle();
  if (!table) return { skipped: "table_missing", results: [] };
  const tableLabel = table.label?.trim() ? `${table.label.trim()} ${table.table_number}` : `Table ${table.table_number}`;

  const race = computeMatchRace(ls, matchId, { p1: sides.p1, p2: sides.p2 });
  const drawNumber = Number(ls.bracket?.drawNumber ?? 0);

  // Registered players of the two sides (guests without an account can't be notified).
  const { data: regs } = await admin
    .from("tournament_players").select("id, player_id, status")
    .eq("tournament_id", tournamentId).in("id", [sides.p1.registrationId, sides.p2.registrationId]);

  const results: { registrationId: number; status: string }[] = [];
  for (const side of [1, 2] as const) {
    const me = side === 1 ? race.p1 : race.p2;
    const opp = side === 1 ? race.p2 : race.p1;
    // deno-lint-ignore no-explicit-any
    const reg = (regs ?? []).find((r: any) => r.id === me.registrationId);
    if (!reg?.player_id || reg.status === "cancelled" || reg.status === "no_show") {
      results.push({ registrationId: me.registrationId, status: "no_account" });
      continue;
    }
    const recipientIdAuto = reg.player_id as number;
    const { data: rp } = await admin.from("profiles").select("id").eq("id_auto", recipientIdAuto).maybeSingle();
    if (!rp?.id) { results.push({ registrationId: me.registrationId, status: "no_profile" }); continue; }

    // First vs. changed-table wording: was this recipient already told about ANOTHER table?
    const { data: prior } = await admin
      .from("match_assignment_notifications").select("table_id")
      .eq("tournament_id", tournamentId).eq("match_id", matchId)
      .eq("recipient_id_auto", recipientIdAuto).eq("draw_number", drawNumber)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const kind = prior && prior.table_id !== tableId ? "table_changed" : "assigned";

    // Claim this assignment instance (dedupe). Losing the race = already handled → send nothing.
    const { data: claim } = await admin
      .from("match_assignment_notifications")
      .upsert({
        tournament_id: tournamentId, match_id: matchId, recipient_id_auto: recipientIdAuto,
        draw_number: drawNumber, assigned_at: assignedAt, table_id: tableId, kind,
      }, { onConflict: "tournament_id,match_id,recipient_id_auto,draw_number,assigned_at", ignoreDuplicates: true })
      .select("id");
    const claimId = Array.isArray(claim) && claim.length ? claim[0].id : null;
    if (!claimId) { results.push({ registrationId: me.registrationId, status: "duplicate" }); continue; }

    // In-app (Profile) message: ALWAYS. Push: only if "Tournament updates" is enabled.
    const { data: prefs } = await admin
      .from("notification_preferences").select("tournament_updates").eq("user_id", rp.id).maybeSingle();
    const pushAllowed = !(prefs && prefs.tournament_updates === false);

    const title = kind === "table_changed" ? "Your table has changed" : `Table assigned: ${tableLabel}`;
    const text = kind === "table_changed"
      ? `Your table has changed.\n\n${race.p1.name} vs ${race.p2.name}\nNow playing on ${tableLabel}\n\n${race.text}`
      : `You have been assigned to ${tableLabel} against ${opp.name}.\n\n${race.text}\n\nReport to your table when ready.`;
    const data = { type: "match_assigned", kind, tournament_id: tournamentId, match_id: matchId, table_id: tableId };

    const { data: notif } = await admin.from("notifications").insert({
      user_id: recipientIdAuto, title, body: text, category: "tournament_update", data,
      status: "sent", sent_at: new Date().toISOString(),
    }).select("id").maybeSingle();

    const { data: tokens } = pushAllowed
      ? await admin.from("push_tokens").select("token").eq("user_id", rp.id).eq("is_active", true)
      : { data: [] as { token: string }[] };
    // deno-lint-ignore no-explicit-any
    const tokenList = [...new Set((tokens ?? []).map((t: any) => t.token as string))] as string[];
    let pushSent = 0;
    if (tokenList.length) {
      try {
        const resp = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(tokenList.map((to) => ({ to, sound: "default", title, body: text, data }))),
        });
        const out = await resp.json();
        // deno-lint-ignore no-explicit-any
        const receipts: any[] = Array.isArray(out?.data) ? out.data : [];
        pushSent = receipts.filter((r) => r?.status === "ok").length;
        const dead = receipts
          .map((r, i) => (r?.details?.error === "DeviceNotRegistered" ? tokenList[i] : null))
          .filter(Boolean) as string[];
        if (dead.length) await admin.from("push_tokens").update({ is_active: false }).in("token", dead);
      } catch {
        // push is best-effort; the in-app notification is already stored
      }
    }
    await admin.from("match_assignment_notifications")
      .update({ notification_id: notif?.id ?? null, push_attempted: tokenList.length, push_sent: pushSent })
      .eq("id", claimId);
    results.push({ registrationId: me.registrationId, status: pushAllowed ? kind : `${kind}_in_app_only` });
  }
  return { results };
}
