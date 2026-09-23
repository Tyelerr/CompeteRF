// supabase/functions/_shared/assignment_message.ts
// Wording of the table-assignment notification (push + in-app, identical). Pure and import-free
// so it runs under Deno (Edge Functions) and Node (tests).
//
//   {Tournament Name}                      {Tournament Name}
//   Table Assigned: Diamond 1              Table Changed: Diamond 6
//   vs Test Hhhh                           vs John Smith
//                                          Race to 5
//   Test Hhhh — Race to 5
//   Teat Aniyah — Race to 4
//
//   Report to your table when ready.
//
// Title = the tournament name ("Compete" only when it is unavailable). The table name appears
// once; raceText is the server-computed race ("Race to 7" when equal, one line per player when
// not — see race.ts).

export type AssignmentKind = "assigned" | "table_changed";

export const FALLBACK_TITLE = "Compete";

export function buildAssignmentMessage(input: {
  tournamentName: string | null | undefined;
  kind: AssignmentKind;
  tableLabel: string;
  opponentName: string;
  raceText: string;
}): { title: string; body: string } {
  const title = input.tournamentName?.trim() || FALLBACK_TITLE;
  const race = input.raceText.trim();
  const body =
    input.kind === "table_changed"
      ? [`Table Changed: ${input.tableLabel}`, `vs ${input.opponentName}`, race].filter(Boolean).join("\n")
      : [`Table Assigned: ${input.tableLabel}`, `vs ${input.opponentName}`, "", race, "", "Report to your table when ready."]
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
  return { title, body };
}

/**
 * Where a "Table Assigned" / "Table Changed" notification tap must land: the player's own
 * Tournament View in Profile, with the exact assignment identified so the app can open the
 * Check-In modal for it (and detect a stale tap). Parsed by src/utils/player-match-link.ts.
 */
export function buildAssignmentDeepLink(input: {
  tournamentId: number;
  matchId: string;
  assignedAt: string;
}): string {
  const q = new URLSearchParams({
    liveId: String(input.tournamentId),
    matchId: input.matchId,
    assignedAt: input.assignedAt,
    action: "check_in",
  });
  return `/(tabs)/profile?${q.toString()}`;
}
