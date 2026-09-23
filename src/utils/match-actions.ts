// src/utils/match-actions.ts
// Which Match Actions are legal for a NOT-STARTED (scheduled) elimination match — the single
// rule behind the MatchActionsModal menu, used for both a Ready queue row (no table) and a match
// parked on a table. Pure so it can be tested without React.
//
//   Ready (no table):  Assign Table · Forfeit · Withdraw           (+ View Match Details)
//   Assigned:          Start Match · Change Table · Clear Table ·
//                      Forfeit · Withdraw                          (+ View Match Details)
//
// Start needs a table (starting a match on no table is not a supported state), Clear Table needs
// one to clear, and Set Time Limit belongs to a live match — none of them are offered on a Ready
// row. Forfeit / Withdraw / details run through the existing modal steps unchanged, so a queued
// match keeps the same administrative control as one on a table.
export type MatchActionKey = "start" | "assignTable" | "changeTable" | "clearTable" | "forfeit" | "withdraw";

export const scheduledMatchActions = (args: {
  tableId: number | null | undefined;
  canClearTable?: boolean; // false when the screen provides no Clear Table handler
}): MatchActionKey[] => {
  const assigned = args.tableId != null;
  return [
    ...(assigned ? (["start"] as const) : []),
    assigned ? "changeTable" : "assignTable",
    ...(assigned && args.canClearTable !== false ? (["clearTable"] as const) : []),
    "forfeit",
    "withdraw",
  ];
};
