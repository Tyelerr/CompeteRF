# Elimination Scheduler — Investigation Report

> Investigation-only trace (no code changed) of the current Single/Double Elimination
> scheduling/queue system, produced to make the upcoming scheduler-upgrade
> implementation precise. All facts are grounded in the current codebase.
> Companion docs: `CLAUDE.md`, `LIVE_TOURNAMENT_ENGINE.md`.

## 1. Authoritative queue pipeline

Ordering logic is **pure utils** in `src/utils/`; viewmodels feed them state; UI is presentational.

| Step | Function | File | Layer |
|---|---|---|---|
| bracket → concrete matches | `resolveBracket` | `utils/bracket.resolve.ts` | util (pure) |
| screen-ready match list (+routing labels, table join) | `buildLiveMatches` | `utils/match.utils.ts` | util |
| feeder/dependency → "ready at" epoch | `computeReadyAtMap` | `utils/queue.utils.ts:60` | util |
| ready determination | `isReady` | `queue.utils.ts:41` | util |
| ready → queue entries (+wait, location) | `buildQueueEntries` | `queue.utils.ts:90` | util |
| ordering | `orderQueue` (+`balancedOrder`,`manualOrder`) | `queue.utils.ts:153` | util |
| free tables | `freeTables` | `queue.utils.ts:180` | util |
| auto-assign plan | `planAutoAssign` | `queue.utils.ts:190` | util |
| startable (assigned, waiting) | `isStartable` | `queue.utils.ts:48` | util |
| compose + persist | `useManageTournament` (`setMatchState`, `saveQueueSettings`, `writeLiveSettings`) | `viewmodels/hooks/use.manage.tournament.ts` | viewmodel |
| spectator mirror | `useTournamentSpectator` | `viewmodels/useTournamentSpectator.ts` | viewmodel |
| render/act | `QueueView`, `EliminationDashboard`, `MatchesView`/`BracketCanvas`, `SpectatorOverview` | `views/components/tournament/live/*` | UI |

Runtime flow: `buildLiveMatches` → `computeReadyAtMap` → `buildQueueEntries` → `orderQueue` →
(`planAutoAssign` on Auto Assign) → `{matchId, patch}` via `runMatchPatch` → `hub.setMatchState`
→ `writeLiveSettings` (client shallow-merge of the RQ cache) → `tournamentService.updateTournament`
(plain whole-column `UPDATE` on `tournaments.live_settings`). Admin + spectator order through the
**same** `orderQueue` with the same persisted `autoAssignMode`/`queueOrder`, so they cannot diverge.

## 2. Bracket dependency representation

`GeneratedBracket.graph: BracketGraphNode[]` (`tournament-settings.types.ts:59-111`). Each node
(`id` "W1M1"/"L2M3"/"GF"/"GF2", `side` winners|losers|grand, `round`, `slot1`, `slot2`, `conditional?`)
declares slots as `BracketSlotRef`:
`{kind:"seed",seedIndex}` | `{kind:"winner",matchId}` | `{kind:"loser",matchId}` | `{kind:"empty"}`.

**Every match already knows its feeder match IDs and whether it consumes that feeder's winner or
loser**, declaratively, before any play. `resolveBracket` walks this DAG (memoized), flowing players
forward; a slot is `pending` (TBD) when its feeder isn't decided.

`ResolvedMatch` (`bracket.resolve.ts:23-35`): `{id, side, round, s1, s2, isBye, isEmpty, pending,
skipped, autoWinnerSlot, commonRace}`; `ResolvedSlot = {player, state: "player"|"empty"|"pending",
raceTo}`. Byes auto-advance (no loser → the LB slot they feed stays empty); `withdraw` removes a
player entirely (no drop); `GF2` is `skipped` when the WB finalist wins `GF`.

## 3. Can unresolved future matches already be described? — YES, fully

- The **entire** future bracket (all winners rounds, whole losers bracket, `GF`+`GF2`) is
  **materialized at draw time** by `buildBracketGraph(size, doubleElim)` (`bracket.double.ts`).
  Nothing is created later — only `matchState[id]` accretes. Node counts (power-of-two N):
  single `N-1`; double `2N-1`. 16/32/64/128 → 15/31/63/127 (single), 31/63/127/255 (double).
- Human placeholders are derivable from `graph` feeders + labels `computeRouting` already computes
  (`numberLabel` "W32"/"L1"/"Finals", `winnerToLabel`, `loserToLabel`, `loserFromLabels`,
  `match.utils.ts:131-224`): for a pending match render each side as the resolved player name
  (`s.state==="player"`) else `"Winner of " + label(slotK.matchId)` / `"Loser of " + label(...)`
  per slot `kind`. **No ready-made "Winner of W4" string helper exists today** — trivial string
  assembly over existing data. Works identically for single (winners-only) and double elim.

## 4. Auto-Assign modes (current behavior)

**All five modes order ONLY currently-ready matches** — `orderQueue` receives
`buildQueueEntries(...) = matches.filter(isReady)`, and `isReady` (`queue.utils.ts:41`) excludes
pending/bye/empty/started/already-assigned (`m.status==="scheduled" && !m.pending && !m.bye &&
!m.empty && m.tableId == null`). None are future-aware; none consider tables/stream tables (tables
enter only in `planAutoAssign`, which pairs the ordered front with `freeTables` by lowest
`table_number`).

- **Balanced** (`balancedOrder`, `queue.utils.ts:112`): grand first, then merge winners/losers always
  taking the lower outstanding round; tie → longer wait; dead-even → loser side first.
- **Winners First**: `[grand, ...winners, ...losers]` (each `round asc, then wait desc`).
- **Losers First**: `[grand, ...losers, ...winners]`.
- **Longest Waiting**: pure `waitMs` desc, ignores side/round.
- **Manual** (`manualOrder`): by index in `queueOrder`; unlisted sink to bottom by wait.

**"Losers First" today does NOT understand future losers-bracket dependencies** — it only
prioritizes losers matches that are *already ready*.

## 5. Manual ordering / persistence

`live_settings.queueOrder: string[]` (match ids), consumed by `manualOrder`. UI is **adjacent
Up/Down arrows only** (`QueueView.move()` → `onSetQueueOrder` → `saveQueueSettings({queueOrder,
autoAssignMode:"manual"})`; reordering forces Manual mode). **No Move-to-Top/Bottom in elimination**
— those exist only in the Chip engine (`chip.engine.ts reorderQueue` up/down/top/bottom), a ready
pattern to mirror.

## 6. Drag-and-drop feasibility → Recommendation B (fallback buttons)

No drag-reorder code exists now and none was left behind (no `DraggableFlatList`/
`react-native-draggable`/`PanResponder` reorder/`onDragEnd`; gesture-handler is used **only** for
`BracketCanvas` pan/zoom). Reliable DnD list reordering on react-native-web with this stack is the
higher-risk path and the ready queue is short. **Recommend button controls + add Move to Top / Move
to Bottom** (mirror the chip engine). If DnD is attempted later, keep the buttons as fallback.

## 7. Table / stream data model

`TournamentTable` = `{id, tournament_id, table_number, label?, status, is_streaming, stream_link?,
match_id?, timestamps}` (`tournament-table.types.ts`), via `tournamentTableService` (plain Supabase
CRUD, no RPC). **Stream table = `is_streaming` (+`stream_link`)**; flows onto matches as
`m.isStream`/`m.isLiveActive`/`m.streamLink`. Actual assignment lives in `matchState[id].tableId`,
**not** `tournament_tables.match_id` (vestigial/Phase-2). **No table-preference/lock field anywhere**
(repo-wide search: zero).

## 8. Best place for a future soft table preference

Add optional **`preferredTableId?: number | null` on `MatchLiveState`** in the existing
`live_settings.matchState[id]` JSONB. Honor it in `planAutoAssign` as a *soft* hint (prefer that
table when free; never hold a table empty for a not-yet-ready match). Separate from actual `tableId`.
No schema change.

## 9. Migration required? — NO

The derived scheduler, projected schedule, and a soft table preference all live in the existing
`live_settings` JSONB (free-form, read defensively).

**Atomicity flag (not a migration, but concurrency):** the admin table/queue path writes the **whole
`live_settings` column** from a client cache snapshot (last-write-wins). Player scoring uses an
atomic, row-locked RPC `submit_match_state` (`supabase/migrations/20260607120000_submit_match_state.sql`)
that whitelists **scoring fields only** (no `tableId`/`timerSeconds`). If the upgrade makes assignment
writes heavier/batchier, the safe fix is a SECURITY-DEFINER server-side JSONB-merge RPC for
match/table patches — **flag for approval before building; do not create it unprompted.**

## 10. Best architecture for "Scheduled Matches"

Three concepts:
- **On Tables** — `matchState[id].tableId != null` & not completed. *Exists.*
- **Ready** — `isReady`. *Exists.*
- **Scheduled/Projected** — full ordered remaining schedule incl. unresolved future matches. **New,
  but purely derivable** from `graph` + `matchState` + `autoAssignMode`/`queueOrder`; no second
  persisted copy.

Recommend **(B) derive-and-memoize in the viewmodel**, keyed on `(bracket, matchState,
autoAssignMode, queueOrder)`. Persist **only TD overrides** (existing `queueOrder`; future
`matchState[id].preferredTableId`). Extend the pipeline: keep `orderQueue` for the ready set, then
append pending matches ordered by projected `readyAt` (forward simulation seeded from actual
`completedAt`s) using the same feeder graph.

## 11. Full-schedule cost — cheap

`resolveBracket`/`computeReadyAtMap` O(N); `buildLiveMatches`/`orderQueue` O(N log N) (sorts);
`depthOf` + node resolution memoized. N ≤ 255 (128-player double). Projecting the whole remaining
schedule is microseconds — safe to derive on demand, trivially memoizable. The only O(n^2) in the
codebase is a setup-only duration estimate, not in the live path.

## 12. Recommended recomputation triggers

Recompute when inputs change: **match completed / advancement (`matchState`), table assignment
changed (`matchState`), manual reorder (`queueOrder`), auto-assign mode changed, bracket (re)drawn,
table availability changed (`tournament_tables`)**. Memoize on those keys → no continuous recompute.
A ~1s ticker refreshes wait/ETA display only, not order.

## 13. Single vs Double elimination

- **Single:** graph is **winners-only** — no `losers`, no `grand`. `loserToLabel`/`loserFromLabels`
  empty; top winners round is the final. Loser-feeders / `losersFirst` are effectively no-ops.
- **Double:** winners + full losers + `GF` (WB champ vs LB champ) + conditional `GF2` reset
  (`skipped` unless the LB finalist wins `GF`). WB final = "Hotseat". `hasLosers` is **derived**
  (`graph.some(side==="losers")`), not read from `bracket.doubleElim`.
- The projected scheduler must treat loser-feeders and the two-loss/reset path as double-only; the
  graph encodes both, so one code path handles both if it keys off slot `kind` and `side`.

## 14. ETA support later — yes, no rewrite needed

All inputs exist: live `p1Score`/`p2Score`, `raceTo`/`p1Race`/`p2Race`, `startedAt`/`completedAt`
(`MatchLiveState`/`LiveMatch`), `avgMatchMs`/fastest/longest + remaining-match counts
(`tournament.stats.ts computeTournamentStats`), `allowedSeconds` model, `freeTables`, and per-match
`readyAt` epochs (`computeReadyAtMap`). A projection that timelines forward from actual `completedAt`s
yields per-match ETAs (e.g. remaining-of-live ~= `(raceTo - maxScore) * perGameMinutes`; downstream =
accumulated projected finishes / tables). Build the scheduler as a forward simulation now; ETA drops
in later.

## 15. Risks / race conditions

- **TD write clobbering a player's score:** admin whole-column `updateTournament` can overwrite a
  score just committed via the atomic RPC (last-write-wins) — main correctness risk for
  auto-assign-during-play.
- **Multi-director / two admin tabs:** `writeLiveSettings` only serializes one client's chained
  saves; two clients overwrite each other.
- **Un-awaited `applyAll` (Auto Assign "Assign All"):** loops un-awaited `onAssign` writes with a
  `cancelQueries` yield window where two invocations read the same pre-optimistic snapshot
  (`handleStartAll` avoids this by awaiting sequentially — the model to follow).
- **Stale projection** if not re-keyed on all inputs (mitigate via §12 memo keys).
- Mitigation for a heavier scheduler = a server-side JSONB-merge RPC for match/table patches (flag
  for approval).

## 16. Files/functions an implementation pass would touch

- `src/utils/queue.utils.ts` — add `projectSchedule(...)` (ready set via `orderQueue`, then pending
  by projected `readyAt`); teach `planAutoAssign` to honor a soft `preferredTableId`; add
  `moveToTop`/`moveToBottom` order helpers.
- `src/utils/match.utils.ts` — add a pure "Winner of Wx / Loser of Ly" placeholder helper from
  `graph` feeders + `computeRouting` labels.
- `src/models/types/tournament-settings.types.ts` — optional `preferredTableId?` on `MatchLiveState`
  (JSONB, no migration).
- `src/viewmodels/hooks/use.manage.tournament.ts` — expose memoized projected schedule; a
  `setPreferredTable` writer (reuse `setMatchState`); keep writes awaited/atomic.
- `src/viewmodels/useTournamentSpectator.ts` — expose the same projection (read-only) for spectator
  Schedule/ETA.
- `src/views/components/tournament/live/QueueView.tsx` — Scheduled Matches (next ~10) + View Full
  Schedule, Move Top/Bottom, per-future-match preferred-table control.
- `src/views/components/tournament/live/EliminationDashboard.tsx` + `SpectatorOverview.tsx` —
  Scheduled list wording/next-10 + (later) ETA.
- **Flag only (no build):** a SECURITY-DEFINER merge RPC for atomic match/table patches if
  concurrency hardening is wanted.
