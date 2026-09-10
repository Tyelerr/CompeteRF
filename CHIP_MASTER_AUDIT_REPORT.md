# Master Chip Tournament Audit — Final Report

Branch: `feature/live-tournament-engine`. Baseline before the audit: `9150d4d`.
Everything below is committed & pushed. **Nothing was applied to the live database by the
assistant** — the user applied the Phase B + Phase F migrations manually and ledger-repaired
them; the Phase G migrations are authored and **pending** manual application.

> All code is **pending full device regression validation** (no device test runner exists;
> the user validates on iOS Expo Go). Static typecheck/lint held throughout: **TypeScript
> 47 (baseline, 0 new)**; **0 new lint errors** per changed file (pre-existing SDK-57
> baselines preserved).

---

## 1. Status of every audit item (1–43 + Sections U, X)

Legend: DONE = implemented & committed (pending device validation). "pending apply" = needs
the authored SQL applied. PARTIAL / DEFERRED / NOT REPRODUCED as labelled.

| # | Item | Phase | Commit(s) | Status |
|---|------|-------|-----------|--------|
| 1 | Ghost/non-ready entrants | A | 80ccb24 | DONE |
| 2 | Payout basis mismatch | A | 80ccb24 | DONE |
| 3 | Start gate for unallocated payouts | A | 80ccb24 | DONE |
| 4 | Forfeit Match vs Tournament (+closing/reshuffle) | A | 80ccb24 | DONE |
| 5 | Locked-table start guards | A | 80ccb24 | DONE |
| 6 | Champion during shuffle-drain | A | 80ccb24 | DONE |
| 7 | Register/unregister propagation | B | 5fb1e08 | DONE (+scoped realtime; migs applied) |
| 8 | New preregistration visibility | B, E3 | 5fb1e08, 070a2df | DONE (modal + cross-client realtime + Players highlight banner) |
| 9 | Side-pot toggle persistence | B | 5fb1e08 | DONE |
| 10 | Bottom Actions menu flip-up | C | 8cfc344 | DONE |
| 11 | Players scroll/state preservation | B, C | 5fb1e08, 8cfc344 | PARTIAL (search/filter/sort preserved; scroll-offset DEFERRED — host-owned scroll in embedded mode) |
| 12 | Waiting-to-Start table priority | C | 8cfc344 | DONE |
| 13 | Dynamic live table/shuffle recommendation | C | 8cfc344 | DONE |
| 14 | Alert verbiage / Take Action | C | 8cfc344 | DONE (passive dismissible cards; no re-popup — deliberate) |
| 15 | Alerts scale / dismiss / View All | C | 8cfc344 | DONE |
| 16 | Chip Adjust modal off-screen | C | 8cfc344 | DONE |
| 17 | Chip Adjust keyboard avoidance | C | 8cfc344 | DONE |
| 18 | Audit every meaningful action | D | 2edb5c2 | DONE |
| 19 | Full public reason/notes/timestamp | A, D | 80ccb24, 2edb5c2 | DONE |
| 20 | Spectator Recent Activity parity | D | 2edb5c2 | DONE (actor shown only for override events) |
| 21 | Gameplay events missing actor | D | 2edb5c2 | DONE |
| 22 | Trusted server-side actor | G3 | 2e3b032 | DONE (in chip_apply RPC; live after you apply G3 + enable the flag) |
| 23 | Pull-to-refresh all spectator tabs | D | 2edb5c2 | DONE |
| 24 | Chip Leader "View Standings" CTA | C | 8cfc344 | DONE |
| 25 | Performance Rating layout | E1, E3 | c3231be, 070a2df | DONE (Profile + Spectator) |
| 26 | Best Streak | E1, E3 | c3231be, 070a2df | DONE (Profile + Spectator) |
| 27 | Chip Leaders / Final Standings terminology | E1, E3 | c3231be, 070a2df | DONE (Profile + Spectator) |
| 28 | Payout-ready alert | E2 | 665e56b | DONE |
| 29 | Admin paid/unpaid tracking | E2, G5a | 665e56b, 38e2a75 | DONE (manager-only store hardening pending apply) |
| 30 | Side Pot player names + eligibility | E1, E3 | c3231be, 070a2df | DONE (Admin + Spectator; buyers-only ranking) |
| 31 | Double-digit placement wrap | E1 | c3231be | DONE |
| 32 | Completed spectator view | E2 | 665e56b | DONE core (hide live sections, Matches Played, terminology); champion-stat **block** PARTIAL (champion is tappable to full profile) |
| 33 | Confetti reuse | E1 | c3231be | DONE |
| 34 | Completed 8-day default discovery | E2 | 665e56b | DONE (service window); card **winner-name** PARTIAL (not on discovery row — overlaps G-37) |
| 35 | Completed 90-day Status filter | E2 | 665e56b | DONE |
| 36 | TD-added singles vanish from history | G4, Fix 1 | 5a8dff5, d32aa8d, 68f9115 | DONE — G4 backfill (historical, **pending apply**) + Fix 1 forward sync at completion prevents recurrence (**RPC pending apply**; pending device verify) |
| 37 | chip_results durable completed source | G5b, Fix 2 | 072188a, 3d576d0 | **CORRECTED:** was only PARTIAL (see note) — G5b wired the durable plumbing but all three surfaces still rendered live-recomputed standings. Fix 2 switches Spectator + Admin to read chip_results and Profile inherits it via the spectator screen. DONE pending device verification across all three |
| 38 | Chip elimination sync to participants | G4, Fix 1 | 5a8dff5, 68f9115 | DONE — eliminated_at in G4 backfill (**pending apply**) + copied forward by Fix 1 completion sync (pending device verify) |
| 39 | chip_entries PII SELECT | F | 8d15766, c3ef1bd | DONE (**applied** + ledger-repaired by user) |
| 40 | Manager authorization role mismatch | F | c52a1b2 | DONE (**applied** + ledger-repaired by user) |
| 41 | Multi-director last-write-wins | G3 | 2e3b032 | DONE (version CAS RPC authored, flag OFF; **pending apply + enable + verify**) |
| 42 | Non-atomic multi-request save | G3 | 2e3b032 | DONE (transactional RPC; **pending apply**) |
| 43 | Prune hard-delete concurrency | G3 | 2e3b032 | DONE (delta-under-CAS; **pending apply**) |
| U | Low/medium cleanup | U + prior | 0f3aead, (A–G) | PARTIAL — queue de-dupe DONE; see §6 |
| X | Intermittent black screen | X | 6390eb9 | NOT REPRODUCED — root cause identified + candidate fix + repro/verify plan (not device-verified) |

---

## 2. All commit hashes (oldest → newest)
`80ccb24` A · `5fb1e08` B · `8cfc344` C · `2edb5c2` D · `c3231be` E1 · `665e56b` E2 ·
`c52a1b2` F-40 · `8d15766` F-39 · `c3ef1bd` F-39 grant tweak · `070a2df` E3 ·
`cb70361` G design doc · `3be18d4` G1 · `74ae470` G2 · `2e3b032` G3 · `5a8dff5` G4 ·
`d32aa8d` G4 fix · `38e2a75` G5a · `072188a` G5b · `0f3aead` Section U · `6390eb9` Section X.
**Post-validation fixes:** `68f9115` Fix 1 (forward participant sync) · `3d576d0` Fix 2
(completed standings read chip_results). (Plus this report.)

> **Post-validation correction (item 37).** An earlier version of this report listed item 37
> as "DONE for Spectator completed reads." That was inaccurate. Device-validation code tracing
> found that G5b wrote the durable `chip_results` rows and passed them to the spectator hook,
> but **all three surfaces (Spectator, Profile, Admin) still rendered standings recomputed from
> live/persisted chip state** — only side-pot finisher names consumed the durable order. Item 37
> was therefore **PARTIAL across all three**, not DONE for any. **Fix 2 (`3d576d0`)** makes
> `chip_results` the authoritative order on Spectator and Admin, and Profile inherits it via the
> spectator screen; item 37 is marked DONE only once this is verified on device across all three.
> Separately, validation found that TD-added chip singles never created a `tournament_players`
> row going forward (the G4 backfill only repaired historical tournaments) — the forward
> participant-model gap — now closed by **Fix 1 (`68f9115`)** with a completion-time sync RPC
> (migration `20260910160000`, **pending apply**).

---

## 3. Migrations & 4. Rollback files

All rollbacks live in `supabase/rollback/<same-name>_rollback.sql`.

| Migration | Purpose | State | Rollback |
|-----------|---------|-------|----------|
| 20260909120000_realtime_registration_tables | publish 3 reg tables + REPLICA IDENTITY FULL on team tables | **APPLIED + repaired** | ✅ |
| 20260909130000_ttm_read_manager_scope | ttm_read → can_manage_tournament | **APPLIED + repaired** | ✅ |
| 20260909140000_is_chip_manager_venue_owners | is_chip_manager → can_manage_tournament | **APPLIED + repaired** | ✅ |
| 20260909150000_chip_entries_pii_view | manager-only base + public PII-safe view | **APPLIED + repaired** | ✅ |
| 20260910120000_chip_config_version | CAS version anchor | **APPLIED** (by user) | ✅ |
| 20260910130000_chip_apply_rpc | transactional CAS apply RPC | **APPLIED** (by user) | ✅ |
| 20260910140000_chip_participant_backfill | historical participant backfill | **APPLIED** (by user; backfilled=27, still_eligible=0) | ✅ (log-based, precise) |
| 20260910150000_chip_payouts_paid | manager-only paid store + data move | **APPLIED** (by user) | ✅ |
| 20260910160000_chip_sync_completed_participants | Fix 1 — forward participant sync RPC | **PENDING** | ✅ (drops fn only; keeps data) |

(Pre-audit `20260907140000_chip_config_reshuffle_removing_ids` was applied + repaired earlier; not part of this audit.)

---

## 5. Pending SQL to apply manually + verification + ledger

**The four G migrations (20260910120000 / 130000 / 140000 / 150000) are now APPLIED in
production by the user** (backfill verified: backfilled=27, still_eligible=0). The **only
remaining pending migration** is the Fix 1 RPC:

1. **20260910160000_chip_sync_completed_participants** (Fix 1) — creates the manager-gated,
   idempotent `public.chip_sync_completed_participants(bigint)` RPC that upserts
   `tournament_players` for a completed chip singles tournament (forward recurrence guard).
   Until applied, the client call is a **soft no-op** (completion never breaks).
   Verify: `select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname='chip_sync_completed_participants';`
   Dry-run row count for a given completed tournament is in the migration header comment.

**Ledger repair (after applying it):**
```bash
supabase migration repair --status applied 20260910160000
```
Then `supabase db push --dry-run` should report the remote is up to date.

**Enabling strict CAS (item 41):** only after #1/#2 are applied and `chip_apply` is verified,
set `CHIP_APPLY_ENABLED = true` in `src/models/services/chip.service.ts` and device-test live
play + a two-director conflict (expect reload + notice, no double-apply).

---

## 6. Section U — disposition of each cleanup item
- **queue defensive de-dupe** — DONE (`0f3aead`, reconcileQueue).
- **eliminated ordering / spectator vs engine placement consistency** — addressed: A1 unified `finalPlacements` (+ defensive unplaced pass); Fix 2 (`3d576d0`) makes the completed Spectator + Admin standings read the durable `chip_results` order (Profile inherits it), so all surfaces agree once finished.
- **missing defensive finalPlacements fallback** — DONE in A1.
- **stale/poll-based propagation** — addressed by B1 targeted invalidation + scoped realtime.
- **large full-state save scaling** — addressed architecturally by G3 `chip_apply` (delta/CAS; enable after verification).
- **tie-break consistency, >999 Fargo tier edge, clear-to-null persistence (max_fargo/entry_fee/added_money), review-screen table-rec hint, profile leaderboard eliminated behavior, vestigial state/comments** — DEFERRED (low severity, and most need device verification of exact current behavior). None are correctness-critical; recommend a small dedicated pass with device testing.

## 7. Known remaining risks
- **G3 `chip_apply` RPC is untested by the assistant** (can't execute plpgsql). Verify via the G3 test steps before enabling `CHIP_APPLY_ENABLED`. Keep the flag OFF until proven.
- **G4 backfill touches historical data.** It's additive/idempotent/skip-ambiguous with a precise log-based rollback, but run the dry-run report queries first and review counts.
- **Cross-director concurrency is only fully protected once G3 is applied + the flag enabled.** Until then, soft-CAS logs conflicts but the legacy whole-blob save still last-write-wins.
- **Completed-results source (item 37)** — RESOLVED IN CODE by Fix 2 (`3d576d0`): Spectator + Admin now read `chip_results`, Profile inherits via the spectator screen. Pending device verification that all three agree. Legacy completed tournaments without `chip_results` rows intentionally fall back to the live recompute.
- **Forward participant sync (Fix 1, `68f9115`)** — the `chip_sync_completed_participants` RPC (migration `20260910160000`) is **pending apply**; until applied, newly completed tournaments' TD-added singles are not written to `tournament_players` (the client call soft-no-ops). A failed sync after apply is surfaced (not swallowed) with an idempotent retry; completion itself always stands.
- **Section X** is not device-verified; apply the candidate fix and reproduce before considering it resolved.
- **Discovery window change (items 34/35)** affects all tournament formats' public browse; verify on staging (PostgREST `or(and(...))` filter).
- Items 11 (scroll offset), 32 (champion-stat block), 34 (card winner-name) remain PARTIAL as noted.

## 8. Complete device regression checklist
**Phase A:** ghost entrants excluded from field/standings/placements; payout basis consistent across Setup/Review/Results/Spectator/Profile; Start blocked on unallocated payouts; Forfeit Match (−1, back of queue, opponent wins; 0→eliminated; counts in shuffle round) vs Forfeit Tournament; forfeit honors closing/reshuffle; no match starts on a locked table via any path; champion crowned mid-shuffle-drain.
**Phase B:** self/team register+unregister update roster + profile without pull-to-refresh; cross-device admin roster updates via realtime (after migs applied); side-pot toggle persists (singles + teams); side-pot rename/remove propagates to players/chip_entries/teams; Players search/filter/sort survive tab switches.
**Phase C:** bottom player ⋮ menu opens fully on-screen; Active Tables shows all Waiting-to-Start first; recommendation/shuffle alerts + Take Action + dismiss (no re-popup); Chip Adjust modal scrolls + keyboard-avoids; Chip Leader → View Standings scrolls to the section.
**Phase D:** admin Audit Log shows actor for gameplay; spectator Recent Activity shows timestamp/actor/reason/notes for overrides (clean for routine play); pull-to-refresh on every spectator tab.
**Phase E:** side-pot RESULTS rank buyers-only with names (singles + teams); eliminated ranks 10+ one line; Best Streak + Fargo→Rating→vs-Fargo (profile + spectator); Chip Leaders vs Final Standings labels; payout-ready alert; paid/unpaid toggle (spectators never see paid); completed spectator hides live sections + Matches Played; review confetti radial; completed tournaments in browse 8 days + Completed filter 90 days.
**Phase F:** (applied) spectator reads still work (no p1_phone exposed); venue owners/directors can manage chip tournaments.
**Phase G (after applying migrations):** apply #1–#4; run G4 dry-run; verify `chip_apply`; enable flag; two-director conflict → reload+notify; backfilled participants appear in completed history; manager-only paid not visible to spectators; spectator completed placements read from chip_results.
**Section X:** reproduce the setup black-screen, apply candidate fix #1, confirm resolved + keyboard still works.

## 9. Final audit matrix
See §1 (every item → phase → commit → status). Parked: **Phase 2 Add Late Player** (untouched; the G4 participant model is compatible with it for the future). Not-yet-verified on device: all of the above per the standing note.
