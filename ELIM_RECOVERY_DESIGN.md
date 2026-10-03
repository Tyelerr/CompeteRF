# Tournament Recovery Design — Chip (as-is) and Elimination (proposed)

Status (2026-10-02): Phase 1 (format gating), Phase 2 (revision + server audit) and Phase 3a (correction
cascade + checkpoint foundation) are implemented — migration `20261018120000_elim_recovery_foundation.sql`,
rollback in `supabase/rollback/`. Phase 3b (Undo + Restore + Recovery & History UI) is implemented too (`20261019120000_elim_undo_restore.sql`). Remaining: offline/local recovery (§3.6).

---

## 1. Chip Tournament: how recovery works today (traced from live code)

**One tournament, one authoritative state, plus restore history. There are no backup tournaments.**
Nothing ever inserts a second `tournaments` row; the only insert is `createTournament`.

| Concern | What exists |
|---|---|
| Authoritative state | `chip_config` (one row per tournament: queue, shuffle/round state, `restore_points`, `version`) plus `chip_entries`, `chip_tables`, `chip_matches` and `chip_events`. Tiers come from `tournaments.chip_ranges`; settings from `live_settings`. Built in memory as `ChipState` by `chipService.load`. |
| Restore point | One element of the jsonb array `chip_config.restore_points` (`makeRestorePoint`, chip.engine.ts). It is a **partial snapshot**: per-entry chips/status/table/W-L/streak, the full tables, the queue, *in-progress* matches with elapsed time, and the round/shuffle flags. It does **not** hold names/Fargo (taken from current state), finished matches, events or settings. |
| Retention | `RESTORE_CAP = 60`, applied on the client (`slice(-60)`). The database has no cap. Restoring also drops the points after the target. |
| When created | Inside `update()` whenever an action produces ≥1 event, once the tournament has started. It holds the state **before** the action. |
| Undo vs Restore | **The same mechanism.** Undo picks `restore_points[len-n]`; Restore picks the point for a chosen event. Both mark reverted events `superseded`, log a `restore` event and run `settleChipState`. |
| Activity / audit | `chip_events`: an append-only table, **separate** from restore points (linked only by `eventIds`). Public views hide `restore_points`, `version`, the actor and private reasons. |
| Local (web only) | IndexedDB `compete-chip-recovery`: the newest 3 snapshots per owner per tournament (full `ChipState` without phone numbers, cloud version, fingerprint), a 3-minute checkpoint, 14-day retention (3 days once finished), and at most 20 tournaments. **Native writes nothing locally.** |
| Offline (web) | After a failed save or an `offline` event, saves are paused (held, not dropped). Actions continue against IndexedDB. Reconnect then: loads the cloud copy, compares fingerprints, claims the version atomically, pushes the latest local snapshot once, and verifies. If anything differs it enters **conflict** mode (read-only) with "Use Cloud Version" or "Keep Offline Copy". |
| Cloud newer than local | Every save first claims `chip_config.version` (`UPDATE … SET version=v+1 WHERE version=v`). If the version changed, the save is aborted, mutations are refused, and the "Changed on another device" banner offers Reload Latest. Other devices poll the version every 5 seconds. |
| Save path | Multi-request, whole-state save (claim version → upsert config/entries/matches/tables → events → finalize). The atomic `chip_apply` RPC exists but is **off** (`CHIP_APPLY_ENABLED = false`). |

---

## 2. Elimination: current state (traced from live code)

- **Live state** is JSON inside `tournaments.live_settings`:
  - `bracket` (graph, seeds, draw number);
  - `matchState[matchId]` (status, winner slot 1|2, scores, timers, tableId, …);
  - queue keys (`queueOrder`, `queuePins`, `autoAssign*`) and `drawLog`.
- `tournament_tables`, `match_player_status` and `match_assignment_status` sit beside it.
- **Writes:**
  - Most TD match operations go through the `elim_live_apply` RPC (ops `assign`, `start`, `unassign`, `patch_match`, `set_queue`). It row-locks the tournament and enforces per-op `expect {status, winner, tableId}` preconditions (`stale_state`) and lifecycle guards.
  - Draw / redraw, tables add/remove, pause and complete are **direct client writes** (draw is a last-write-wins read-modify-write of `live_settings`).
  - Auto Assign runs server-side (`elim_auto_assign_apply`). Players score and start through RPCs.
- **No revision/version** for elimination. Concurrency control is the per-op `expect` (sent only by match patches and Clear Table), plus Auto Assign's `updated_at` token.
- **Audit today:** `tournament_events` (append-only, public read, manager-only write). It is written **only by the client**, fire-and-forget after a successful mutation, with a client-supplied `actor_id`.
  - Gaps: score edits, queue mode/pins, tables add/remove, pause, finish and the initial draw aren't logged.
  - Nothing server-side is logged (Auto Assign, player scoring/start).
  - Reopen Match is mislabelled as `match_started`.
  - `tx_id` exists but is never set for elimination.
- **No undo / restore / snapshots.** The only "undo" is the Recently Applied batch unassign.
- **Advancement is derived, never stored.** `resolveBracket` (client) and `_elim_resolve` (server) flow players through the graph from each match's winner **slot**.

### ⚠ Existing correctness hazard (Phase 3 must fix this first)

Reset Match / Reopen Match only patch the target match; downstream `matchState` is never cleared.
Results are stored as *slot 1 / slot 2 won*, so if an earlier result changes and a different
player now occupies a downstream slot, **that downstream match's recorded result silently
transfers to the new occupant**. This is exactly the "old results attached to new players"
failure. `bracket.correction.ts` (`downstreamMatchIds`, `correctionImpact`) already computes
the affected set and is tested, but no production code uses it.

---

## 3. Proposed elimination architecture

```
LIVE STATE (authoritative)   tournaments.live_settings  + live_revision (NEW bigint)
AUDIT LOG (append-only)      tournament_events          written SERVER-SIDE in the same txn
RESTORE CHECKPOINTS          elim_checkpoints (NEW)      bounded, milestone-based
LOCAL RECOVERY (device)      IndexedDB (web) / AsyncStorage (native), last-known-good + revision
```

### 3.1 Revision
- Add `tournaments.live_revision bigint not null default 0`.
- Every elimination mutation increments it in the same transaction: `elim_live_apply`, Auto Assign, a new `elim_draw` RPC (replacing the client-side draw write), and table/pause/complete moved into RPCs.
- Clients send `p_expected_revision` (optional at first, for compatibility with installed builds). On mismatch the RPC returns `stale_revision` and the latest revision, so the client reloads instead of overwriting. Per-op `expect` stays as the fine-grained check.

### 3.2 Audit log (server-written)
- `elim_live_apply` (and the new RPCs) insert one `tournament_events` row **per applied op** inside the same transaction. Actor = `auth.uid()`, which can't be spoofed. Each row carries:
  - `tx_id` = the call's operation id, a client-supplied idempotency key;
  - `payload` = `{revision, matchId, tableId, before:{status,winner,p1Score,p2Score,tableId}, after:{…}, source:'td'|'auto_assign'|'player', client:'web'|'ios'|'android'}`.
- "Recorded exactly once": a unique index on `(tournament_id, tx_id, op_index)`. Retried calls with the same `tx_id` are idempotent no-ops.
- Remove the client-side `logMatchDerivedEvent` writes once the server writes them. That avoids duplicates and fixes the Reopen mislabel and the missing score/queue/table/pause/finish events.
- No state blobs in audit rows: before/after holds only the changed fields (~150–300 bytes).

### 3.3 Restore checkpoints
- New table `elim_checkpoints(id, tournament_id, revision, created_at, actor_id, reason, label, match_id null, state jsonb)`.
  - `state` = `matchState` plus the queue keys plus the bracket draw number. The graph and seeds are only included when the checkpoint precedes a redraw.
  - RLS: manager read; writes only via RPC.
- Created **server-side, only before destructive or milestone operations**:
  - changing or clearing a recorded winner (set winner on a completed match, reset, reopen);
  - forfeit / withdraw;
  - redraw;
  - removing a player after the draw;
  - finalize / complete;
  - an explicit "Create checkpoint";
  - not on assigns, starts, timers or queue moves (these are cheap to redo and are covered by the audit log).
- **Retention:** keep the newest **30** per tournament, plus **milestones** that are never pruned while the tournament is live: the draw, the first match started, and the pre-finalize checkpoint. A trigger prunes on insert. Once the tournament is completed, keep only the milestones plus the last 5.

### 3.4 Undo vs Restore
- **Undo** = reverse the most recent *reversible* op by its audit record (before → after) through `elim_live_apply` with `expect` = the recorded `after`. If anything downstream changed since, the server refuses (`stale_state`) and the TD is offered Restore instead.
- **Restore** = `elim_restore(tid, checkpoint_id, expected_revision)`, a deliberate admin action from Actions → Recovery & History:
  - It first computes an **impact preview** (`elim_restore_preview`) using the cascade rules below: "will clear N downstream results, return M matches to Waiting, reset K table assignments".
  - The TD confirms.
  - The server re-checks `expected_revision` (two TDs can't restore over each other), writes a pre-restore checkpoint (so the restore can itself be undone), applies the state, bumps the revision and logs a `restore` event.

### 3.5 Double-elimination cascade rules (applied by Reset/Reopen/winner change *and* by Restore)
For a changed match M:

1. Compute `downstreamMatchIds(M)` from the graph: winner **and** loser slots, transitively, including the GF reset.
2. For each downstream D, in topological order:
   - Re-resolve D's occupants with the new upstream results.
   - If D's occupants are **unchanged**, keep its result (option A: preserve unaffected results).
   - If an occupant **changed** and D has a recorded/started result, **clear** it (status → waiting, winner/scores → null, table released) and continue the walk from D (option B: explicit clearing).
3. Never keep a slot-based winner when the player in that slot changed. *This closes the hazard in §2.*
4. Champion and standings are derived, so they recompute automatically.

**Impact model by operation:**

| Operation | Direct change | Downstream effect | Reversible how |
|---|---|---|---|
| assign / unassign table | `tableId` | none | Undo (inverse op) |
| start match | `status`, `startedAt` | none | Undo → back to assigned |
| score change (no winner) | scores | none | Undo |
| queue order / pins / auto mode | queue keys | none | Undo |
| set winner (first time) | winner, completed | occupants of the next W/L matches | Undo while those haven't started; otherwise Restore with preview |
| change an existing winner | winner | cascade per §3.5 | Restore with preview (checkpoint taken first) |
| reset / reopen | status / winner cleared | cascade per §3.5 | Restore with preview |
| forfeit / withdraw | winner + result | as for a winner; withdrawals skip the losers drop | Restore with preview |
| redraw | whole bracket | everything | Restore to the pre-redraw checkpoint |
| player removed after draw | seeds/occupant | as for a changed occupant | Restore |
| finalize | `status` completed | standings frozen | Reopen = restore to the pre-finalize checkpoint |

### 3.6 Offline and local recovery

**Current behavior:**

| Platform | Chip | Single / Double Elimination |
|---|---|---|
| Web | Full offline mode: IndexedDB snapshots, paused save queue, fingerprinted reconnect, conflict mode | No local persistence. React Query **pauses** mutations while the browser reports offline and replays them on reconnect with their tap-time `expect` (can come back `stale_state`). Otherwise the last screen stays visible from the in-memory cache; a refresh loses it. |
| Native | No local persistence. Saves fail; the "Changed on another device" / cloud logic still applies | Mutations fail; the optimistic update rolls back; an Alert is shown. No offline banner. |

**Proposed long-term model (shared by all six cells):**
- **Cloud is authoritative.** Each client tracks `{tournamentId, cloudRevision, lastKnownGood state, pendingOps[], savedAt}` in IndexedDB (web) / AsyncStorage (native), keeping the newest 2 per tournament for 7 days.
- **While offline:**
  - The screen stays usable read-only from last-known-good, with the banner "Offline — changes will sync when connection returns".
  - **Safe to queue** (do not depend on other devices' bracket decisions): table assign/unassign, start match, timer and score edits on a match this device already holds.
  - **Never queued:** set/change winner, reset/reopen, forfeit/withdraw, redraw, restore, finalize. These are disabled offline with a short reason.
- **On reconnect:** fetch `live_revision`.
  - Equal to the base: replay `pendingOps` with `expected_revision` + `expect`.
  - Newer: **conflict flow** "Another device changed this tournament while you were offline." with **Load Latest** / **Review Local Changes** / **Retry compatible actions**. Retry re-submits each op with `expect`; the server accepts only ops whose preconditions still hold. Never a blind overwrite, never a merge of bracket results.

---

## 4. Scale impact

- **Extra writes per TD operation:** one audit row (≈200 B), written in the same transaction, so no extra round trip.
- **Checkpoints:** only on destructive/milestone ops, typically 5–20 per event. One checkpoint (`matchState` + queue) is ≈ 0.2 KB per match: about 6 KB for a 32-player double, about 25 KB for 64 players.
- **Worst case per tournament:** 30 rolling + milestones ≈ **0.2–1 MB**. After completion it shrinks to about 8 checkpoints.
- **Audit:** about 300–800 rows per event ≈ **60–200 KB**.
- **Compared with Chip:** Chip keeps up to 60 points inline in a single row, and that row is re-uploaded on saves. The elimination design stores checkpoints as separate rows that are only written on milestones and **never polled**, so live polling payloads don't grow.
- There is no tournament cloning, no unlimited history, and no full-state blob per audit row. The live state stays a single row.

---

## 5. Phase plan

| Phase | Scope | Needs | Status |
|---|---|---|---|
| 1 | Chip architecture documented; this design; Setup format gating | client only | **Done** (commit 8831b72) |
| 2 | `live_revision` (trigger-owned, covers every writer) + server-written audit in `elim_live_apply`; idempotent op id; sanitized public activity; client no longer logs match events | migration `20261018120000` + client | **Implemented** (Auto Assign / draw still write no audit rows — they bump the revision and produce milestones) |
| 3a | **Cascade fix** (§3.5) inside `elim_live_apply` for every outcome-changing op; dry-run impact preview; checkpoints (30 rolling + milestones) | migration `20261018120000` + client | **Implemented** |
| 3b | Undo-by-audit (`elim_undo`) + Restore (`elim_restore`, dry-run previews) + Recovery & History UI (Actions → Recovery & History) | migration `20261019120000` + client | **Implemented** |
| 4 | Local last-known-good + offline banner + safe-op queue + conflict flow (web + native) | client | Proposed |

## 6. Decisions needed

1. **Cascade policy (3a):** auto-clear affected downstream results (with the impact shown in the confirm dialog)? Recommended. Or refuse the change until the TD resets downstream manually?
2. **Server-written audit (Phase 2):** OK to move elimination audit writes server-side and stop client writes? The Activity feed is unchanged for viewers.
3. **Audit privacy:** `tournament_events` is public-read today. Should actor ids and before/after details be hidden from spectators via a public view, as Chip already does?
4. **Retention:** 30 rolling + milestones (recommended), or Chip's 60?
5. **Offline scope:** is read-only offline + the safe-op queue (no offline winner selection) acceptable for elimination?
6. **Old installed builds:** keep `expected_revision` optional until the next native release is the store minimum, then enforce it (via `app_config` minimums).
