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
