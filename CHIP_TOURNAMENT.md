# Compete Chip Tournament — Master Plan

A **completely separate** tournament type built around a live **winner-stays chip
queue** — not brackets. The experience centers on live queue management, match
timers, storytelling (story cards), statistics, and spectator engagement.

This doc is the source of truth (like `LIVE_TOURNAMENT_ENGINE.md`). Read it before
touching chip code. Build order is **data-first**, in reviewable slices.

---

## Locked architecture decisions

1. **State lives in real relational tables** — `chip_config` (1:1 settings + run
   meta + queue order), `chip_entries`, `chip_tables`, `chip_matches`,
   `chip_events` (migration `20260624120000_chip_tournament_tables.sql`). This was
   chosen over a JSONB blob so the data is **owned and queryable** (player stats,
   match history, eliminations, reporting). IDs are TEXT, matching the engine's
   client-generated ids. RLS: **public read** (spectator-friendly); writes
   restricted to the tournament's director or an admin via `is_chip_manager()`.
   `chip.service.ts` hydrates a `ChipState` from the rows and writes it back
   (upsert + prune); the engine stays pure and table-agnostic.
2. **The engine is pure app code.** `chip.engine.ts` holds the winner-stays queue
   logic (advance, anti-repeat, eliminations, reshuffle, derived stats) as pure
   functions over a `ChipState`. Persistence is a thin service that loads/saves the
   blob. This keeps all rules in one place and makes them testable.
3. **No bracket inheritance.** Chip tournaments do not use `live_settings.bracket`,
   `matchState`, the Draw page, or the bracket PhaseNav. `tournament_format =
   "chip-tournament"` routes to a dedicated chip manage flow.
4. **Format**: `singles` (1 player/entry) or `scotch_doubles` (2 players/entry).
   Team name is always `"P1 / P2"` — no custom team names.
5. **Chips from Fargo**: the TD defines a customizable Fargo→chips table
   (`ChipTier[]`). Singles uses the player's Fargo; doubles uses the **combined**
   team Fargo (P1 + P2).

## Data model — `live_settings.chip: ChipState`

See `src/models/types/chip.types.ts`. Summary:

- `settings`: format, performanceTracking, streamEnabled, winnerStays, autoEliminate, `tiers: ChipTier[]`.
- `entries: ChipEntry[]`: one per player/team — names, Fargos, teamFargo, startChips/chips, paid/checkedIn, status (queued/playing/eliminated), wins/losses, streak/bestStreak, eliminations, timestamps.
- `tables: ChipTable[]`: label, isStream, streamUrl, status (open/in_use), current `matchId`, `lastLoserId` (drives table-specific anti-repeat).
- `matches: ChipMatch[]`: append-only log — tableId, aId/bId, winnerId/loserId, startedAt/endedAt, status.
- `queue: string[]`: entry ids, front = next up.
- `events: ChipEvent[]`: history timeline (results, chip losses, eliminations, additions, shuffles, manual actions, forfeits, table changes).
- run state: startedAt, finishedAt, winnerId, reshuffleCount.

## Core logic (the heart)

- **Winner stays.** Loser loses **one** chip. If chips remain → back of the queue.
  If chips hit zero → eliminated. The open seat is filled by the next eligible
  player from the front of the queue; a new match starts.
- **Table-specific anti-repeat.** Anti-repeat applies **only to the same table**.
  If the player at the front of the queue is the one the staying player just beat
  **on that table** (`table.lastLoserId`), skip them and take the next — they can
  still be drawn to a *different* table. Prevents two players getting stuck on one
  table while one holds it.
- **Reshuffles are manual** and act as a **complete reset**: let current matches
  finish, pause, randomly rebuild tables + queue, ignore streaks and anti-repeat,
  resume. (`reshuffleCount++`, streaks for anti-repeat cleared.)
- **Last player/team remaining wins.**

## Performance tracking

Reuses the Fargo performance algorithm. Singles = individual Fargo; doubles =
combined team Fargo. Labels: 🔥 Exceptional / 🟢 Above / ⚪ Expected / 🟡 Below /
🔴 Underperformed.

## Match timers

Store `startedAt` / `endedAt` / `status` only — **compute elapsed locally**, no
per-second DB writes. A match over **10 minutes** turns the table card (and
optionally the player row) **red** to flag long matches. No red countdown.

---

## Phased build order

**Phase 0 — Data foundation (this slice)**
- [x] Master plan (this doc)
- [x] `chip.types.ts` (ChipState and friends)
- [x] Extend `TournamentLiveSettings` with `chip?: ChipState`
- [x] `chip.engine.ts` — pure core logic (chips-from-Fargo, start, recordWinner,
      anti-repeat queue advance, eliminate, reshuffle, derived stats)
- [ ] `chip.service.ts` — load/save the blob (thin wrapper over tournamentService)
- [ ] `use.chip.tournament.ts` viewmodel hook

**Phase 1 — TD / Bar Owner views** (same permissions)
- Setup: Settings, Fargo Chip Table editor, Registration (singles + doubles),
  Tables (add/remove/stream), Review & Start.
- Live: Dashboard (cards + story cards), Tables (collapsible cards + winner
  buttons + timers), Queue (full), Players, History; the floating Admin Actions
  button (add/delete/move player, give/take chip, forfeit, add/remove table,
  shuffle, undo, history, settings, end).
- Results: Standings (sort by chips/wins/win%/performance/Fargo; eliminated shown
  separately), special features (Chip Leader, Hot Streak, Last Chip, Death Row,
  Giant Killer, Elimination Leader, Final Four).

**Future** (not scheduled): Player Portal, Spectator Mode, push, QR check-in,
venue display boards, achievements, strength of schedule, most improved, team
chemistry, match quality rating, stream priority.

---

## Conventions

Follow the repo's layered MVVM (`*.types.ts → *.service.ts → use*.ts → screen`),
theme tokens (never raw hex/px), and `webMs`/`webSc` scaling. Keep the engine pure
and UI-free. Persist by writing the whole `chip` blob back to `live_settings`
(merge, don't clobber sibling keys).
