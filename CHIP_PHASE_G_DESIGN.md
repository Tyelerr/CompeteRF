# Chip Tournament — Phase G Design (DATABASE / ARCHITECTURE)

> **Status: DESIGN ONLY. Nothing in this document is implemented.**
> No migrations, RPCs, or code changes for Phase G exist yet. This is for review/approval
> before any Phase G database or architecture work begins. Phase 2 "Add Late Player"
> remains PARKED and is NOT implemented here (only accommodated). Section X (intermittent
> black screen) remains an explicit, separate pending investigation — see the end.

Covers audit items **41, 42, 43** (concurrency/atomicity — CRITICAL/HIGH), **36, 38**
(participant model / elimination durability), **37** (chip_results strategy), **22**
(trusted actor). Read `LIVE_TOURNAMENT_ENGINE.md` and the chip engine
(`src/models/services/chip.engine.ts`) first.

---

## 0. Current architecture (as-built, for grounding)

**Chip state (`ChipState`) is persisted across several tables** (`src/models/services/chip.service.ts`):
- `chip_config` — one row/tournament: `queue`, `started_at`, `finished_at`, `winner_entry_id`, `reshuffle_count`, `reshuffle_pending/table_count`, `shuffle_mode/ready/round`, `round_remaining`, `restore_points`, `reshuffle_removing_ids`.
- `chip_entries` — the **owned** singles engine rows (`e.fromRegistration === false`). Chips, status, wins/losses, side-pot membership, Fargo overrides, `p1_phone`.
- `chip_matches`, `chip_tables` — engine rows.
- `chip_events` — append-only audit.
- **Projected (not owned):** registration-backed entries are re-projected from `tournament_players` / `tournament_teams` on every load and only "materialize" into `chip_entries` when they enter the live field (`materializeLive`).

**How it saves today (`chipService.save`):**
- The VM debounces the whole `ChipState` and calls `save` (~7–9 **separate** Supabase requests), each swallowing its own error.
- `syncTable(table, rows, ids)` = upsert the client's rows **and DELETE any DB rows whose id is not in the client's set ("prune")**.
- **No version check. No transaction. Whole-blob overwrite.**

**Authorization:** `is_chip_manager` (now → `can_manage_tournament` after Phase F item 40) gates chip_* writes. **Actor** on events is **client-supplied** (`by` / `payload.actorName`).

These four facts — whole-blob, non-atomic, prune-on-save, client actor — are the root of all Phase G items.

---

## G-41 · Multi-director last-write-wins  (SEVERITY: CRITICAL)

- **Current problem:** Two authorized directors editing the same live tournament each save the entire `ChipState` with no version check. The later save silently overwrites the other's match results / chips / queue / tables. (Phase B's `writeLiveSettings` fixed this for the *host's* `live_settings` only, single-client; the chip engine state is unprotected and cross-director.)
- **Proposed source of truth:** `chip_config` becomes the **version anchor**. Add `chip_config.version bigint not null default 0`. Every mutating write performs an **optimistic CAS**: it reads the version it started from, and the write only applies `where chip_config.version = :expected`, bumping to `:expected+1`. If 0 rows match → the client is stale → **reject** and have the client reconcile.
- **Client behavior on conflict:** the VM holds the current version. On a rejected write it does a silent reload (fresh server state + new version) and **re-derives** — it does *not* blindly replay a stale whole-blob. (Because writes become deltas — see G-42/43 — replay is safe: re-apply the specific delta onto fresh state, or drop it and surface "another director just changed this; reloaded.")
- **Tables/functions affected:** `chip_config` (+`version`); new transactional RPC `chip_apply(...)` (G-42) does the CAS; VM `use.chip.tournament.ts` (`save`/`update`) threads the version.
- **Migration required:** add `version` column (additive). Create the RPC (G-42).
- **Risk level:** HIGH (touches the core save path).
- **Rollout order:** (1) add `version` col; (2) client starts *sending* its base version but server still applies whole-blob (observability); (3) switch to delta RPC with soft CAS (log conflicts); (4) enforce strict CAS (reject stale).
- **Existing live/completed safety:** `version` defaults 0; the first save bumps to 1 — fully backward compatible. Completed tournaments are read-only (the engine's finished-guard blocks writes), so CAS never triggers on them.

---

## G-42 · Non-atomic multi-request save  (SEVERITY: HIGH)

- **Current problem:** `chipService.save` spans ~7–9 requests; a partial failure can commit the queue but not the chip decrement, or the table pointer but not the match row — leaving inconsistent state.
- **Proposed source of truth:** a **single transactional RPC** `chip_apply(p_tid, p_expected_version, p_delta jsonb)` (SECURITY DEFINER, gated by `can_manage_tournament`) that applies **all** sections (config, entries, matches, tables, events) in **one DB transaction**, atomically, then bumps `version`. All-or-nothing.
- **Tables/functions affected:** new `chip_apply` RPC; `chipService.save` becomes a thin wrapper that builds the delta and calls it; `chip_events` still append-only (within the txn).
- **Migration required:** the RPC (reversible: drop it, client falls back to the legacy multi-request save kept behind a flag during transition).
- **Risk level:** HIGH (co-designed and shipped with G-41 and G-43 — they are one change).
- **Rollout order:** ship with G-41/43. Keep the legacy `save` path available behind a feature flag until the RPC is proven on device.
- **Existing safety:** data shapes unchanged; the RPC writes the same columns. Rollback = flip the flag back to multi-request save.

---

## G-43 · Prune hard-delete concurrency risk  (SEVERITY: HIGH)

- **Current problem:** `syncTable` deletes any row not in the *client's* set. A stale director's save can **delete rows another director just added** (e.g., a newly added entry/table).
- **Proposed source of truth:** **delta writes** — the client sends only (a) upserts for rows it changed and (b) an **explicit list of removed ids** for rows it intentionally deleted. The RPC never does "delete everything not in my set." Combined with G-41 CAS, a stale delta is rejected before it can delete anything.
- **Tables/functions affected:** `chip_apply` delta payload (`{ upserts, removedIds }` per entity); removes the prune semantics from the write path.
- **Migration required:** none beyond the RPC.
- **Risk level:** HIGH (part of the G-41/42/43 unit).
- **Rollout order:** with G-41/42.
- **Existing safety:** delta-only writes touch strictly what changed; nothing is deleted implicitly.

---

## G-36 · Participant model — TD-added chip singles vanish from completed history  (SEVERITY: HIGH)

- **Current problem:** A TD-added chip **single** exists only in `chip_entries` — it has **no `tournament_players` participation row**. So after completion it disappears from completed profile history, the completed list, review eligibility, and surfaced results. (Teams are fine: they have `tournament_teams` + `tournament_team_members`.) This exists for normal **pre-start** TD Add Player, independent of the parked Late Player flow.
- **Proposed source of truth:** `tournament_players` is the authoritative **participant** record for every entrant (singles); `tournament_teams`/`_members` for teams. `chip_entries` becomes chip-**engine** state (chips/queue/status) **linked** to its participant via a stable key (reuse existing `p1_player_id` / a `registration_id` link).
- **Approach:** when a TD adds a chip single, create (or link) a `tournament_players` row atomically alongside the `chip_entries` row (an RPC — the same "add participant" primitive the parked Late Player would later reuse). Engine reads/writes stay on `chip_entries`; completed history/reviews read participants.
- **Tables/functions affected:** `tournament_players` (participant), `chip_entries` (link column if not already sufficient via `p1_player_id`), a `chip_add_participant` RPC, `chipService` add path, `chip.service.load` projection/dedupe (already merges by `player_id`).
- **Migration required:** (a) ensure a link column; (b) **backfill** — create missing `tournament_players` rows for existing `chip_entries` singles (idempotent, matched by `p1_player_id`/name) so completed tournaments regain history.
- **Risk level:** HIGH (data-model + backfill of historical rows).
- **Rollout order:** additive link + backfill first (safe, read-side improves immediately); then route new TD adds through the participant RPC.
- **Existing safety:** backfill is idempotent and additive (creates participant rows only where missing); it never deletes chip_entries. Live tournaments keep working (engine unchanged). **Do NOT** paper over this with scattered UI fallbacks (audit's explicit instruction).
- **Singles/teams:** singles are the gap; teams already have participants. The fix unifies both under "every entrant has a participant row."
- **Add Late Player interaction:** this participant model is the **prerequisite** for a safe late-add, but G only builds the pre-start participant path; the Late Player UX stays PARKED.

---

## G-38 · Chip eliminations not synced to tournament_players  (SEVERITY: MEDIUM)

- **Current problem:** Chip elimination/placement state isn't written back to participation rows, contributing to history/result inconsistencies.
- **Proposed source of truth:** the **finalize** step (and/or per-elimination) writes final placement/status to the participant record — ideally into the durable results table (G-37) and/or `tournament_players.status`.
- **Tables/functions affected:** `tournament_players` (status/placement) and/or `chip_results`; a `chip_finalize` RPC (co-designed with G-37).
- **Migration required:** none if reusing existing columns; a backfill of final placements for already-completed tournaments.
- **Risk level:** MEDIUM.
- **Rollout order:** after G-36 (needs participants to sync to); ship with G-37 finalize.
- **Existing safety:** backfill is additive/idempotent; live play unaffected.

---

## G-37 · chip_results is write-only — durable completed results  (PRODUCT DECISION NEEDED)

- **Current problem:** `chip_results` is written on Finish but **never read**; completed views recompute placements from live chip state. There's no durable, authoritative completed-results snapshot (and item 29's paid-state currently lives in `live_settings`, not a durable results row).
- **Two options (need your ruling):**
  - **(A) Make `chip_results` the authoritative durable completed source** — extend it with payout `amount`, `paid`/`paid_at`, and side-pot placements; write once at finalize (idempotent); point completed spectator/profile/results reads at it. *(Recommended — durable history, and it gives item 29 a proper home.)*
  - **(B) Simplify/remove `chip_results`** — derive completed results from `tournament_players` placements (G-36/38) and drop the redundant table.
- **Tables/functions affected (option A):** `chip_results` (+columns), `chip_finalize` RPC (write), completed read paths (`use.chip.spectator`, profile hub, completed screens).
- **Migration required (A):** add columns; backfill `chip_results` for already-completed tournaments from current state.
- **Risk level:** MEDIUM.
- **Rollout order:** define finalize write first; switch completed reads once backfilled.
- **Existing safety:** completed reads fall back to live derivation until `chip_results` is populated/backfilled; additive columns are non-breaking.

---

## G-22 · Trusted server-side actor attribution  (SEVERITY: MEDIUM)

- **Current problem:** the audit `actor_id` on `chip_events` is **client-supplied** (spoofable). Phase D made attribution *reliable* (always stamped) but still client-trusted.
- **Proposed source of truth:** inside the mutating RPC (`chip_apply`), stamp each event's actor from the **server auth context** (`auth.uid()` → `profiles.id_auto`), ignoring any client-supplied actor id. The actor **display name** can still be resolved for UI, but the trusted id comes from auth.
- **Tables/functions affected:** `chip_apply` RPC (actor stamping); `chip_events`.
- **Migration required:** none beyond the RPC.
- **Risk level:** MEDIUM (falls out of the RPC path — once writes go through `chip_apply`, this is nearly free).
- **Rollout order:** with/after G-42 (needs the RPC).
- **Existing safety:** historical events unchanged; new events gain trusted attribution.

---

## Consolidated migration plan (order)

1. **Additive columns (safe, non-breaking):** `chip_config.version`; `chip_results` (`amount`, `paid`, `paid_at`, side-pot rows or a companion table); `chip_entries` participant link (if `p1_player_id` is insufficient).
2. **Backfills (idempotent, additive):** participant rows for orphaned chip singles (G-36); `chip_results` for completed tournaments (G-37); final placements → `tournament_players` (G-38).
3. **RPCs (SECURITY DEFINER, `can_manage_tournament`-gated):** `chip_apply` (transactional delta + CAS + trusted actor — G-41/42/43/22); `chip_finalize` (durable results + participant sync — G-37/38); `chip_add_participant` (G-36).
4. **Client switch:** VM `save` → `chip_apply` delta with base version + conflict reconcile; completed reads → `chip_results`/participants. Keep the legacy multi-request save behind a flag during transition.
5. **Enforce:** flip CAS from soft (log) to strict (reject) once device-proven.

## Rollback plan

- Every migration ships with a `supabase/rollback/*_rollback.sql` (drop column / drop RPC / drop backfilled rows where safe — backfills are additive and generally safe to leave).
- The client keeps the **legacy whole-blob save behind a feature flag** through the transition, so a problem with `chip_apply` is reverted by flipping the flag (no redeploy of the DB needed).
- CAS starts **soft** (log conflicts, don't reject) so a bad version interaction can't brick live saves before it's proven.

## Backward compatibility for existing tournaments

- Live in-progress tournaments: `version` defaults 0; whole-blob save keeps working until the delta RPC is switched on. No data reshape.
- Completed tournaments: read paths fall back to live derivation until backfills populate `chip_results`/participants; backfills only *add* missing rows.

## Impact on singles & teams

- **Singles:** gain a `tournament_players` participant row (G-36) — the main gap.
- **Teams:** already have `tournament_teams`/`_members`; G-36/38 sync their placement/status the same way.
- CAS/delta/atomic-save/trusted-actor (41/42/43/22) are format-agnostic (they operate on `chip_config`/`chip_entries`/`chip_matches`/`chip_tables`/`chip_events`).

## Interaction with the PARKED "Add Late Player" (not implemented here)

- G builds the **participant model** (G-36) and the **atomic add-participant + delta RPC** primitives that a safe Late Player flow would require. G does **not** build the Late Player UX, mid-tournament seeding rules, or its chip/queue insertion policy. Those stay PARKED until you unpark them; G simply removes the data-model blockers so the future feature isn't built on sand.

---

## Open decisions needed before implementing Phase G

1. **G-37 A vs B** — make `chip_results` the durable authoritative completed source (recommended, also houses item 29 paid-state), or simplify/remove it?
2. **CAS UX on conflict** — on a rejected stale write, prefer *silent reload + notify* ("another director just updated this — reloaded") vs. *reload + auto-replay the delta*? (Recommended: reload + notify for destructive actions, auto-replay only for idempotent ones.)
3. **Rollout aggressiveness** — ship 41/42/43 together behind a flag with soft CAS first (recommended), or go straight to strict CAS?
4. **Backfill window** — backfill participants/results for *all* historical completed chip tournaments, or only the last N days?

Nothing is built until these are answered and Phase G is approved for implementation.

---

## Section X — intermittent black screen (STILL PENDING — do not forget)

Not part of Phase G. Explicitly tracked as its own diagnostic investigation (device-observed; a screenshot/app-switch/foreground repaints it → likely a render/layout/lifecycle issue, not data loss). To be scheduled separately with diagnostic logging (navigation focus, modal visibility, loading/error overlays, Animated/opacity values, app-state, mount/unmount, Fabric/New-Arch). **Must not be marked fixed without a device reproduction.**
