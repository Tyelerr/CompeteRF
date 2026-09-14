# Chip Tournament — Device Regression Test Plan + Code-Backed Validation

**Context:** Phase G migrations are applied in production (backfilled = 27, still_eligible = 0).
`CHIP_APPLY_ENABLED` stays **false**. No code changed for this pass — this is validation first.

**What this document is.** I cannot drive your iOS device, so the PASS/FAIL of the on-device
steps is yours to record. For every test I give a **code verdict** (what the source guarantees,
with file:line) and **what the device must confirm** (the part only a device can prove: paint,
timers, keyboard, realtime). Two tests turned up **real code-level findings** — see §Findings.

Legend: ✅ code-verified (expect PASS on device) · 🟡 PARTIAL / caveat · 🔴 code finding (likely FAIL as specified) · 👁 device-only observation required.

---

## TEST 1 — Create a new Chip singles tournament
- **✅ Setup flow order** is `Settings → Players → Tables → Prize Pool → Review & Start` — defined in `CHIP_PHASE_DEFS.setup.tabs`, [admin/manage-tournament/[id].tsx:264](app/(tabs)/admin/manage-tournament/[id].tsx:264).
- **👁 Section X black screen** — CANNOT be code-confirmed. The trigger (`automaticallyAdjustKeyboardInsets` ON for setup only) is **unchanged** at [[id].tsx:6486](app/(tabs)/admin/manage-tournament/[id].tsx:6486) — no fix applied. Run the repro: open/close keyboard, scroll with keyboard open, switch setup subtabs, background/foreground, edit numeric+text fields. **If it blanks, record: exact subtab, last action, keyboard open/closed, and whether app-switch repaints it** (app-switch repaint = the known iOS compositor signature). Do not fix unless reproduced; full plan in [CHIP_SECTION_X_BLACKSCREEN.md](CHIP_SECTION_X_BLACKSCREEN.md).
- **Verdict: ✅ flow order / 👁 black screen (device observation required).**

## TEST 2 — Add players  🔴 **FINDING A**
- **✅** TD add-singles writes a `chip_entries` row with `p1_fargo`, `paid`, `paid_side_pots`, `status` (`"queued"`, `checked_in` from Ready) via `vm.addEntry` → `entryToRow` ([chip.service.ts:110](src/models/services/chip.service.ts:110)). Fargo snapshot = `p1_fargo`; TD-entered Fargo is also promoted to the player's global profile via `td_verify_player_fargo`.
- **✅ Duplicate handling** works on two layers: UI disables already-entered players (`isSinglesPlayerEntered`), and `addEntry` skips an identity already held on either side ([use.chip.tournament.ts:526](src/viewmodels/use.chip.tournament.ts:526)).
- **🔴 `fargo_at_registration` is NOT populated for newly TD-added singles** — because TD add-singles creates **no `tournament_players` row at all** (it writes only `chip_entries`). There is nothing to carry `fargo_at_registration`. See Finding A. (Doubles is different: `td_create_team`/`td_add_team_member` RPCs write `tournament_team_members.fargo_at_registration`.)
- **Verdict: 🟡 PARTIAL** — entry/Fargo-snapshot/paid/side-pot/duplicate all correct; the `fargo_at_registration` expectation does not apply to TD-added singles (no participation row is created). Confirm Ready-gating on device (payment conditions).

## TEST 3 — Registration / Ready gating
- **✅** Ready/field membership = `enteredField(e) = !!e.checkedIn` (A1). Start-gate guards (unallocated payouts, min ready, locked tables) are in Phase A (`80ccb24`).
- **👁 Device must confirm:** live Ready count updates immediately (no stale state), Continue gating, below-minimum block, unpaid-preview behavior. These depend on React Query invalidation timing — observe on device.
- **Verdict: ✅ logic present / 👁 immediacy is device-observed.**

## TEST 4 — Tables
- **✅** Duplicate table-name protection (including different casing) and recommended-section hide — Phase C (`8cfc344`); recommendation via shared `getChipRecommendedTableCount`.
- **👁 Device must confirm:** rename persists, case-insensitive duplicate is rejected with a message, recommended section disappears after tables added, count updates immediately.
- **Verdict: ✅ logic present / 👁 confirm on device.**

## TEST 5 — Start tournament
- **✅** `runStart` → `vm.start()` → `goLiveAfterStart()` transitions **straight to Live — no separate "Go Live" step** ([chip-manage.screen.tsx:3065](src/views/screens/admin/chip/chip-manage.screen.tsx:3065)). The later "Go to Live →" button only re-enters an already-started tournament.
- **✅** Setup locks after start: `setupLocked = readOnly || vm.isLive` ([chip-manage.screen.tsx:589](src/views/screens/admin/chip/chip-manage.screen.tsx:589)); the VM also enforces the lock on every mutation. Settings temporary unlock is reason-gated + audited.
- **Verdict: ✅ expect PASS.** Confirm the unlock-with-reason flow on device if you use it.

## TEST 6 — Initial queue
- **✅** `reconcileQueue` de-dupes on **entry id** (distinct players have distinct ids, so legitimate players are never removed); drops only a repeated id or non-queueable (eliminated/seated) ([chip.engine.ts:510](src/models/services/chip.engine.ts:510)). Orphaned alive entries are re-appended.
- **Verdict: ✅ expect PASS** (every Ready player once, no dup ids, no missing players). Confirm holder/queue display on device.

## TEST 7 — Shuffle
- **✅** `shuffle` is Fisher-Yates on a copy — permutes only, never inserts/drops/clones ([chip.engine.ts:39](src/models/services/chip.engine.ts:39)); entrant set preserved across repeated reshuffles.
- **✅** Winner-stays: winner anchored to table, loser −1 chip to **back** of queue ([chip.engine.ts:989](src/models/services/chip.engine.ts:989)).
- **Verdict: ✅ expect PASS.** Confirm visual holder behavior on device.

## TEST 8 — Match play
- **✅** Loser `chips = max(0, chips-1)`; at ≤0 → `status="eliminated"`, `eliminatedAt` set ([chip.engine.ts:1046](src/models/services/chip.engine.ts:1046)); `eliminated_at` persists via `entryToRow` ([chip.service.ts:142](src/models/services/chip.service.ts:142)).
- **✅** Eliminated cannot return to active queue — `aliveEntries` and every requeue path guard `status!=="eliminated"` (re-entry only via explicit TD `buyBackEntry`/`restoreEntry`).
- **👁 Device must confirm:** multi-table concurrency, table release/reassignment, and **spectator↔admin sync** (realtime/refresh timing is device-observed).
- **Verdict: ✅ engine correct / 👁 confirm cross-view sync + multi-table on device.**

## TEST 9 — Undo / restore
- **✅** `restoreToPoint` restores chips, status, `eliminatedAt`, queue, and table state from the snapshot ([chip.engine.ts:683](src/models/services/chip.engine.ts:683)).
- **✅ No duplicate history on re-complete:** reverted events are flagged `superseded=true` (not deleted), the live match is reused **by id**, and `chip_events` upserts with `onConflict:"id", ignoreDuplicates:true` ([chip.service.ts:641](src/models/services/chip.service.ts:641)). `finalPlacements` skips superseded events.
- **Verdict: ✅ expect PASS.** Confirm activity log reflects undo on device.

## TEST 10 — Pause / background / foreground
- **👁 Device-only.** Timers use shared `formatElapsedClock` from persisted `startedAt` (elapsed preserved across restore), and React Query focus is bridged to AppState. But timer recovery, and "no stale/blank screens" when switching Admin ↔ spectator ↔ profile, can only be confirmed on device — and this overlaps the Section X surface. Record any blank screen per TEST 1.
- **Verdict: 👁 device observation required.**

## TEST 11 — Finish tournament
- **✅** Finish writes durable `chip_results` (`saveResults`, idempotent upsert onConflict `tournament_id,entry_id`) then `completeTournament` sets status/live_state/completed_at ([use.chip.tournament.ts:712](src/viewmodels/use.chip.tournament.ts:712)). `finalPlacements` = champion first, then elimination-event order with `eliminatedAt`/chips tiebreaks — deterministic.
- **👁 Device must confirm:** champion/standings/payout/paid-state render correctly; match history available.
- **Verdict: ✅ results persist / 👁 confirm display.** See Finding A re: which source the displayed standings use.

## TEST 12 — Durable completed-results reads  🔴 **FINDING B (item 37)**
- **🔴** The durable `chip_results` → `bundle.results` path is **written on finish and passed to the spectator hook, but no surface renders it as the primary standings list:**
  - **Spectator:** `orderedEntries` prefers `durableResults`, but the visible Final Standings list renders `fullStandings`/`standingsPreview`, which are **live-recomputed** from residual chip state ([use.chip.spectator.ts:519](src/viewmodels/hooks/use.chip.spectator.ts:519)). Only **side-pot finisher names** consume the durable order; `view.finalPlacements` (durable-backed) is never referenced by the screen.
  - **Profile:** reads no `chip_results`; completed view hands off to the spectator screen; its own player hub discards `bundle.results`.
  - **Admin:** discards `bundle.results` entirely; recomputes via `finalPlacements(chip)` over live state.
- **Important nuance:** standings **do survive app restart**, because they're recomputed from **persisted `chip_entries` + `chip_events`** (which `chipService.load` reads back), not because `chip_results` is read. So TEST 12's "survives reload/restart" will PASS, but "standings come from durable `chip_results`" will **FAIL as literally specified** on all three surfaces.
- **Verdict: 🟡/🔴 PARTIAL — this is the remaining item 37.** Report, do not patch, per your instruction.

## TEST 13 — Historical backfill validation
- **✅** Backfill (`20260910140000`) created `tournament_players` for historical completed singles with reliable identity; idempotent; team tournaments excluded; `eliminated_at` copied; `fargo_at_registration` set. backfilled=27 / still_eligible=0 confirms it ran.
- **👁 Device must confirm:** historical players reappear, no visible duplicate rows, reasonable Fargo, no team tournament backfilled.
- **🔴 Forward-regression risk (Finding B'):** the backfill was **one-shot**. For a **newly** created chip singles tournament, TD-added singles still get **no `tournament_players` row** at completion (no forward sync exists). **Add this test:** create a new chip singles tournament → TD-add a player who is NOT self-registered → complete it → view that player's profile tournament history. Per code, the tournament will **likely be missing** from their history (item 36 regresses forward). Record the result.
- **Verdict: ✅ historical repaired / 🔴 forward gap to confirm.**

## TEST 14 — Payout paid-state
- **✅** Paid state moved to manager-only `chip_payouts_paid` (G5a, applied); React Query `["chip-payouts-paid",id]`; public `live_settings.payoutsPaid` stripped. Spectators never see paid state.
- **👁 Device must confirm:** mark paid → reload → app restart → persists; unrelated payouts unaffected.
- **Verdict: ✅ store correct / 👁 confirm persistence on device.**

## TEST 15 — Database sanity (read-only)
Run [scratchpad_test15_sanity.sql](scratchpad_test15_sanity.sql). Expected: dup participation rows = 0, dup queue ids = 0, completed chip tournaments missing `chip_results` = 0, backfill log = 27, still_eligible = 0, public `payoutsPaid` = 0, no team tournament backfilled. A few FK/discriminator column names are marked `-- adjust` to match your schema. Do not run cleanup SQL without reviewing output.

---

## Findings (bugs / gaps — NOT fixed)

### FINDING A — TD-added chip singles create no `tournament_players` record
- **Repro:** chip singles setup → Add Player (TD) → inspect DB: a `chip_entries` row exists; no `tournament_players` row. `fargo_at_registration` is therefore never set for TD-added singles.
- **DB/console error:** none (silent by design).
- **Affected:** `onAddSingles` ([chip-manage.screen.tsx:5270](src/views/screens/admin/chip/chip-manage.screen.tsx:5270)) → `vm.addEntry` ([use.chip.tournament.ts:520](src/viewmodels/use.chip.tournament.ts:520)) → `entryToRow` ([chip.service.ts:110](src/models/services/chip.service.ts:110)). No `tournament_players` writer in `chip.service.ts`.
- **Pre-Phase-G or Phase-G?** Pre-existing architecture; Phase G (G4) only repaired historical rows, so Phase G **exposed** it rather than caused it.
- **Recommended fix (do not implement yet):** add a forward participant sync — either (a) upsert a `tournament_players` row when a TD adds a chip single (mirroring the self-registration RPC + the backfill's identity/status/fargo_at_registration rules), or (b) upsert participants into `tournament_players` at finish inside `saveResults`/`completeTournament`. Option (b) is the smallest durable fix and matches the backfill's shape. Gate behind review — it writes participation data.

### FINDING B — item 37: completed standings are live-recomputed, not read from `chip_results`
- **Repro:** complete a chip tournament → view completed standings on spectator / profile / admin → the rendered order comes from live chip state (`fullStandings` / `finalPlacements(chip)`), not `chip_results`. Confirmed by absence of any `bundle.results` → standings-list wiring on all three surfaces.
- **DB/console error:** none.
- **Affected:** spectator standings [use.chip.spectator.ts:519](src/viewmodels/hooks/use.chip.spectator.ts:519); admin VM discards `b.results` ([use.chip.tournament.ts:281](src/viewmodels/use.chip.tournament.ts:281)); profile hub discards `bundle.results`.
- **Pre-Phase-G or Phase-G?** Phase-G-related: G5b added the durable plumbing (write + spectator pass-through) but did **not** switch the rendered standings source. Functionally safe today (persisted chip_entries/chip_events reconstruct the same order), so this is durability-of-source, not a user-visible wrong order.
- **Recommended fix (do not implement yet, per your "decide first"):** point the rendered standings at `bundle.results` when the tournament is finished — spectator `fullStandings`/`standingsPreview` first, then expose `bundle.results` in the admin VM and profile hub. Small and isolated, but it changes what users see on completed tournaments, so decide before patching.

---

## Explicit status

- **Section X (black screen):** 👁 **NOT reproducible by code.** Trigger code unchanged ([[id].tsx:6486](app/(tabs)/admin/manage-tournament/[id].tsx:6486)); root cause + candidate fix documented. Run TEST 1 repro on device; do not mark fixed or apply a fix until reproduced.
- **Item 37 (Profile/Admin durable reads):** 🔴 **Confirmed remaining PARTIAL — and broader than previously reported:** the spectator standings list is also live-recomputed (only side-pot finishers use durable order). My master report's "DONE for spectator" was too optimistic; I'll correct it on your go-ahead. Not patched.
- **`CHIP_APPLY_ENABLED` readiness:** ❌ **Keep OFF.** Do not enable until: all critical device tests (5–11) pass, `chip_apply` is separately verified (valid version → ok + version+1; stale version → conflict, no writes; non-manager → 42501; two-director conflict → reload+notify, no double-apply), and Findings A/B are dispositioned. Nothing here clears it.

## Note on my earlier master report
`CHIP_MASTER_AUDIT_REPORT.md` lists item 37 as "DONE for Spectator completed reads." That is
inaccurate given Finding B — the spectator *standings list* is live-recomputed. I did not edit
that file in this pass (no code/doc changes without your word). Say the word and I'll correct
the item 37 row there to match this finding.
