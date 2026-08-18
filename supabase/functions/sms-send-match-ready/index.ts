import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTelnyxSms } from "../_shared/telnyx.ts";
import { resolveMatchSides } from "../_shared/bracket.ts";
import { bracketMatchReadyKey, chipMatchReadyKey, isSafeMatchId } from "../_shared/idempotency.ts";

// ---------------------------------------------------------------------------
// sms-send-match-ready — server-authorized "your match is ready" text.
// Accepts ONLY { tournament_id, match_id, recipient_user_id }. Everything else
// (recipient phone, opponent, table, message) is derived server-side from
// trusted data. Idempotent per readiness event. Never accepts destination/body,
// never trusts client verification/consent, never logs/returns full numbers.
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const GENERIC = "Couldn't send the alert.";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+.+/.test(authHeader)) return json({ error: "Unauthorized." }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const TELNYX_API_KEY = Deno.env.get("TELNYX_API_KEY") ?? "";
  const FROM = Deno.env.get("TELNYX_FROM_NUMBER") ?? "";
  if (!TELNYX_API_KEY || !FROM) return json({ error: "SMS is unavailable." }, 500);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const callerUid = userData?.user?.id;
  if (userErr || !callerUid) return json({ error: "Unauthorized." }, 401);

  let body: { tournament_id?: number; match_id?: string; recipient_id_auto?: number };
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const tournamentId = Number(body.tournament_id);
  const matchId = String(body.match_id ?? "");
  const recipientIdAutoIn = Number(body.recipient_id_auto);
  if (!Number.isFinite(tournamentId) || !isSafeMatchId(matchId) || !Number.isFinite(recipientIdAutoIn)) {
    return json({ error: "Bad request." }, 400);
  }

  // Caller identity + authorization (director OR admin) — validated id, not body.
  const { data: caller } = await admin.from("profiles").select("id_auto, role").eq("id", callerUid).maybeSingle();
  if (!caller?.id_auto) return json({ error: "Unauthorized." }, 401);
  const { data: tourn } = await admin
    .from("tournaments").select("director_id, name, tournament_format, live_settings").eq("id", tournamentId).maybeSingle();
  if (!tourn) return json({ error: GENERIC }, 403);
  const isAuthorized = tourn.director_id === caller.id_auto
    || caller.role === "compete_admin" || caller.role === "super_admin";
  if (!isAuthorized) return json({ error: GENERIC }, 403);

  // Recipient identity + canonical verified phone (resolved from id_auto).
  const { data: rp } = await admin
    .from("profiles").select("id, id_auto, phone_number, phone_verified_at").eq("id_auto", recipientIdAutoIn).maybeSingle();
  if (!rp?.id || !rp.id_auto) return json({ error: GENERIC }, 403);
  const recipientIdAuto = rp.id_auto as number;
  const recipientUserId = rp.id as string;

  // ── Resolve the EXACT match server-side (chip or bracket) ──────────────────
  let opponentName: string | null = null;
  let tableLabel: string | null = null;
  let idemKey: string | null = null;

  if (tourn.tournament_format === "chip-tournament") {
    const { data: cm } = await admin
      .from("chip_matches").select("id, tournament_id, table_id, a_id, b_id, status, started_at")
      .eq("id", matchId).eq("tournament_id", tournamentId).maybeSingle();
    if (!cm || cm.status !== "in_progress") return json({ error: GENERIC }, 403);

    const { data: myEntry } = await admin
      .from("chip_entries").select("id, p1_name")
      .eq("tournament_id", tournamentId)
      .or(`p1_profile_id.eq.${recipientIdAuto},p2_profile_id.eq.${recipientIdAuto}`)
      .maybeSingle();
    if (!myEntry || (myEntry.id !== cm.a_id && myEntry.id !== cm.b_id)) return json({ error: GENERIC }, 403);

    const oppId = myEntry.id === cm.a_id ? cm.b_id : cm.a_id;
    const { data: opp } = await admin.from("chip_entries").select("p1_name").eq("id", oppId).maybeSingle();
    opponentName = opp?.p1_name || null;
    if (cm.table_id) {
      const { data: t } = await admin.from("chip_tables").select("label").eq("id", cm.table_id).eq("tournament_id", tournamentId).maybeSingle();
      tableLabel = t?.label || null;
    }
    idemKey = chipMatchReadyKey({ tournamentId, matchId, recipientIdAuto, startedAt: String(cm.started_at ?? "") });
  } else {
    const ls: any = tourn.live_settings ?? {};
    const sides = resolveMatchSides(ls.bracket ?? {}, ls.matchState ?? {}, matchId);
    if (!sides || !sides.p1 || !sides.p2) return json({ error: GENERIC }, 403);
    const ms = (ls.matchState ?? {})[matchId] ?? {};
    if (ms.status !== "in_progress" || ms.tableId == null || !ms.startedAt) return json({ error: GENERIC }, 403);

    // Recipient's active registration id must be one of the resolved sides.
    const { data: reg } = await admin
      .from("tournament_players").select("id, status").eq("tournament_id", tournamentId).eq("player_id", recipientIdAuto).maybeSingle();
    if (!reg || reg.status === "cancelled" || reg.status === "no_show") return json({ error: GENERIC }, 403);
    if (reg.id !== sides.p1.registrationId && reg.id !== sides.p2.registrationId) return json({ error: GENERIC }, 403);

    opponentName = reg.id === sides.p1.registrationId ? sides.p2.name : sides.p1.name;
    const { data: t } = await admin.from("tournament_tables").select("table_number, label").eq("id", ms.tableId).maybeSingle();
    tableLabel = t?.label || (t?.table_number != null ? `Table ${t.table_number}` : null);
    idemKey = bracketMatchReadyKey({
      tournamentId, matchId, recipientIdAuto,
      drawNumber: Number(ls.bracket?.drawNumber ?? 0), startedAt: String(ms.startedAt),
    });
  }

  // Phone + consent (recipient).
  if (!rp.phone_number || !rp.phone_verified_at) return json({ error: GENERIC }, 200); // silently skip — not an error to the TD
  const { data: prefs } = await admin
    .from("notification_preferences").select("sms_enabled, sms_match_alerts").eq("user_id", recipientUserId).maybeSingle();
  if (!prefs?.sms_enabled || !prefs.sms_match_alerts) return json({ ok: true, skipped: "no_consent" }, 200);

  // Atomic reserve/claim per readiness event.
  if (!idemKey) return json({ error: GENERIC }, 500);
  const { data: claim } = await admin.rpc("claim_sms_send", {
    p_idempotency_key: idemKey, p_user_id: recipientUserId, p_message_type: "match_ready",
    p_to_e164: rp.phone_number, p_tournament_id: tournamentId, p_match_id: matchId,
  });
  if (typeof claim !== "string" || (!claim.startsWith("ok:") && !claim.startsWith("retry:"))) {
    // already_sent | terminal | in_flight — none resend the same key.
    return json({ ok: true, skipped: typeof claim === "string" ? claim : "error" }, 200);
  }
  const rowId = Number(claim.split(":")[1]);

  let text: string;
  if (tourn.tournament_format === "chip-tournament") {
    // Default Chip Tournament match-ready template. Blank lines are intentional
    // for readability. Chip table labels are stored as "Table N"; strip the
    // prefix so the "Table:" line reads cleanly (e.g. "Table: 3").
    const opponentValue = opponentName || "TBD";
    const tableValue = tableLabel ? tableLabel.replace(/^table\s+/i, "").trim() : "TBD";
    text =
      "🎱 Compete\n\n" +
      "Your next chip match is ready!\n\n" +
      `Opponent: ${opponentValue}\n` +
      `Table: ${tableValue}\n\n` +
      "Please report to your table.\n\n" +
      "Good luck! 🎱";
  } else {
    const where = tableLabel ? `Report to ${tableLabel}` : "You're up next";
    const vs = opponentName ? ` to play ${opponentName}` : "";
    text = `Compete Tournaments: your match is ready. ${where}${vs}. Reply STOP to opt out, HELP for help.`;
  }
  const result = await sendTelnyxSms({ apiKey: TELNYX_API_KEY, from: FROM, to: rp.phone_number as string, text });

  // Ambiguous network error: the request MAY have been accepted — leave the row
  // 'queued' (in_flight) so it is NOT auto-retried. Only a definite provider
  // rejection is marked retryable ('sending_failed').
  const failStatus = result.errorCode === "network_error" ? "queued" : "sending_failed";
  await admin.from("sms_messages").update({
    status: result.ok ? "sent" : failStatus,
    provider_message_id: result.providerMessageId ?? null,
    telnyx_message_id: result.providerMessageId ?? null,
    error_code: result.ok ? null : result.errorCode ?? "provider_rejected",
    accepted_at: result.ok ? new Date().toISOString() : null,
    last_status_at: new Date().toISOString(),
  }).eq("id", rowId);

  if (!result.ok) return json({ error: GENERIC }, 502);
  return json({ ok: true }, 200);
});

function json(b: unknown, status: number): Response {
  return new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
