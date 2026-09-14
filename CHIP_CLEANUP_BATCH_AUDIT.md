# Chip Cleanup Batch — Audit & Implementation Plan

Audit-first, per your instruction. Each item: current code path · root cause (if a bug) ·
partial-implementation status · files/functions · plan. **No item needs a DB migration.**
`CHIP_APPLY_ENABLED` stays false throughout.

---

## 1. Setup black screen on fast overscroll + Review opens mid-page — **BUG (two symptoms)**
- **Code path:** one shared `KeyboardAwareScroll` (`ref=pageScrollRef`) at [[id].tsx:6475](app/(tabs)/admin/manage-tournament/[id].tsx:6475). It's a thin `forwardRef` wrapper over a **plain RN ScrollView** ([keyboard-aware-scroll.tsx:25](src/views/components/common/keyboard-aware-scroll.tsx:25)) — no JS scroll math; relies on iOS `automaticallyAdjustKeyboardInsets`. The same ScrollView instance persists across setup subtabs (no `key`, no remount). `bounces` unset (defaults true); no `maintainVisibleContentPosition`.
- **Root cause (A) black screen:** `automaticallyAdjustKeyboardInsets={ios && selectedPhase==="setup"}` ([id].tsx:6486) is still **on for setup** (the live/results mitigation scoped it off there). A fast overscroll coinciding with a content-size change re-triggers the documented iOS inset-blanking on Fabric.
- **Root cause (B) mid-page:** entering Review swaps only the child of the persistent ScrollView; nothing resets `y`, so the offset from the previous longer subtab carries over. No `scrollTo` on Review entry.
- **Plan:** (B) reset `pageScrollRef.scrollTo({y:0})` when the setup subtab changes (esp. → review) — small, safe. (A) on setup, add `maintainVisibleContentPosition={{minIndexForVisible:0}}` and set `bounces={false}` **only for setup on iOS** (kills the overscroll that co-triggers the blank) while keeping `automaticallyAdjustKeyboardInsets` for keyboard behavior; if that proves insufficient, fall back to wrapping setup text-input pages in `KeyboardAvoidingView` and turning the native flag off (per the Section X doc's candidate #1). Do not disable scrolling. **No migration.**

## 2. Prize Pool duplicate summary — **redundant UI**
- **Code path:** `PrizePoolView` ([PrizePoolView.tsx:483](src/views/components/tournament/live/PrizePoolView.tsx:483)), rendered by setup host ([id].tsx:5765). Top **"Prize Pool Summary"** card = lines 551–584; bottom **"Summary"** card = 616–640 (the detailed reconciliation: total collected / fees / net pool / assigned / unassigned).
- **Root cause:** top card's rows are a strict subset of the bottom card. Only unique control in it is the **Added-money include ToggleSwitch** (573–582).
- **Plan:** remove the top "Prize Pool Summary" (551–584); relocate the Added-money toggle next to the Added-money rows in the bottom Summary (625–634). Keep `PayoutCard` config controls (587–613) untouched. **No migration.**

## 3. Recommended table count — **formula change**
- **Code path:** `getChipRecommendedTableCount = entryCount<2 ? 0 : max(1, floor(entryCount/4))` ([chip.engine.ts:1743](src/models/services/chip.engine.ts:1743)); setup wrapper `recommendedSetupTables` (1790) delegates to it. Basis = `playableEntryCount` (all non-eliminated; **not** ready-filtered). Shown only on the Tables step ([chip-manage.screen.tsx:3004](src/views/screens/admin/chip/chip-manage.screen.tsx:3004)); applied by `useRecommended()` (2995).
- **Change (your spec):** `recommendedTables = ceil(readyPlayers / 4)`, min 1, **capped at `floor(readyPlayers/2)`**, and capped at configured physical tables where that limit exists. Use **Ready** players (checkedIn field entrants), not playable/registered.
  - Check: 6→2, 8→2, 9→3, 10→3, 11→3, 12→3, 13→4, 16→4, 20→5 ✓ (ceil(n/4), and the /2 cap only binds at very small n).
- **Plan:** update the setup helper to `ceil(ready/4)` with the caps; keep the live-play `recommendedActiveTables` (1751) unchanged (different concern). Recommendation-only (no auto-apply beyond the existing "Use N Tables" button). **No migration.**

## 4. Paid-but-Not-Ready should block leaving Players — **gap**
- **Code path:** `paidNotReady` is computed **only** on Review ([chip-manage.screen.tsx:3079](src/views/screens/admin/chip/chip-manage.screen.tsx:3079)). Players step counters ([chip-manage.screen.tsx:2557](src/views/screens/admin/chip/chip-manage.screen.tsx:2557)) are Pre-Reg/Registered/Ready/No-Show only — a paid-not-ready entry looks identical to unpaid-registered. "Continue to Tables" ([id].tsx:6526) disables only on `!setupStepComplete.players` (= `chipReadyCount>=2`, [id].tsx:2288); `advanceFromPlayers` shows a non-blocking prompt with "Continue Anyway".
- **Plan:** (1) add a tappable **"Paid · Not Ready"** chip to the Players step counters reusing the `paidNotReady` predicate, filtering the roster to those entries on tap; (2) add `paidNotReady` to `buildReadinessSummary` ([player-readiness.ts:34](src/utils/player-readiness.ts:34)), publish via the embedded `onReadinessChange` bridge, and **block** Continue-to-Tables while any paid-not-ready exists (message: mark Ready or resolve); (3) keep the Review warning + Start guard as the final safety net (3122–3290). Do not auto-mark Ready. **No migration.**

## 5. Payout-ready alert shows WRONG placement — **CONFIRMED BUG (display only)**
- **Code path:** alert builder [chip-manage.screen.tsx:3865](src/views/screens/admin/chip/chip-manage.screen.tsx:3865) → `authoritativePlacements()` (1291) → while live, `finalPlacements(chip)` ([chip.engine.ts:2128](src/models/services/chip.engine.ts:2128)).
- **Root cause:** `finalPlacements` is **champion-first** (place 1 = last standing). During live there's no champion, so place 1 is filled by the **most-recently-eliminated** player. The payout loop matches `place===1` → 1st prize, so a just-eliminated last-place finisher is announced as owed 1st-place money; later eliminations shift to 2nd/3rd. **No payout records are written — display/state only** (onPress is navigation).
- **Plan:** compute an eliminated entry's **true finishing place** from elimination order vs field size: place = `fieldEntrantCount − kFromFirstElimination` (first out = Nth; champion, when finished = 1st). Only surface "Payout Ready" when that true place ≤ configured paid places, showing that place's prize. Add a small engine helper (e.g. `liveFinishingPlace(s, entryId)`) so the alert and Results agree; don't merely fix the ordinal. **No migration.**

## 6. "View Payouts" CTA opens Standings — **BUG**
- **Code path:** payout alert CTA `onPress: onOpenResults` (chip-manage.screen.tsx:3893); `onOpenResults` is host-wired to the **standings** subtab ([id].tsx:5744 → `handleSelectPage("results","standings")`). Results subviews are chosen by tab: `payouts` → `renderPayouts()` (chip-manage.screen.tsx:5167).
- **Plan:** add an `onOpenPayouts` host prop wired to `handleSelectPage("results","payouts")` and use it for the payout alert CTA (and the completed payout-ready alerts). **No migration.**

## 7. Alerts modal / Take Action / freeze — **BUG (stacked modals)**
- **Code path:** expanded Alerts modal `visible={alertsModalOpen}` ([chip-manage.screen.tsx:3998](src/views/screens/admin/chip/chip-manage.screen.tsx:3998)). Take-Action handlers `openShuffleModal` (3447), `openReduce` (1916), and `onOpenResults` (3893) **do not close `alertsModalOpen`** first → a second `<Modal>` mounts over the still-open Alerts modal → same stacked-modal/lingering-backdrop freeze class as the forfeit bug. (Take Action *does* correctly reach the shuffle setup flow otherwise.)
- **Plan:** `setAlertsModalOpen(false)` before opening any secondary modal from an alert action (mirror the `openForfeit` centralized-close fix). **No migration.**

## 8. Reshuffle recommendation logic — **redesign**
- **Code path:** `recommendedShuffleThreshold = base<4?0:floor(base/2^(reshuffleCount+1))` ([chip.engine.ts:1765](src/models/services/chip.engine.ts:1765)); alert fires when `playersRemaining ≤ threshold` ([chip-manage.screen.tsx:3838](src/views/screens/admin/chip/chip-manage.screen.tsx:3838)).
- **Change (your spec):** recommend when the **waiting queue** is materially below ~50% of remaining field. Target queued ≈ `round(remaining/2)`; fire when `queueLen < target − hysteresis`. Add cooldown so it doesn't spam (suppress until a shuffle happens or queue recovers above target). Take Action opens the existing shuffle flow. Winner-stays mechanics unchanged.
- **Plan:** replace the threshold rule with a queue-vs-remaining comparison using `chip.queue.length` and alive count; add hysteresis + a "recommended since" guard. **No migration.**

## 9. False "Stream table available" alert — **BUG / decision**
- **Code path:** `streamAvail = chip.tables.some(t => t.isStream && !t.matchId && !t.inactive)` (chip-manage.screen.tsx:3826); pushes a **passive, no-action** alert (3863).
- **Root cause:** fires whenever a stream-flagged table is simply idle (normal between winner-stays matches); no action attached.
- **Plan (needs your call):** **(a) Remove** the passive alert (recommended — it has no action), or **(b)** make it actionable: only show when a stream table is open **and** there's a queued team to seat on it, with a "Seat on stream" Take Action. **No migration.**

## 10. Forfeit modal keyboard safety + shared reason model — **BUG + partial**
- **Code path:** ONE modal, two modes (`commitForfeit("match"|"tournament")`), reasons as chips [No-show/Player left/Rule violation/Injury·emergency/Other] + one notes TextInput ([chip-manage.screen.tsx:6683](src/views/screens/admin/chip/chip-manage.screen.tsx:6683)). **No `KeyboardAvoidingView`/`ScrollView`** → keyboard hides the notes field + Forfeit/Cancel buttons; 70% height cap can overflow.
- **Plan:** wrap in `KeyboardAvoidingView` + inner `ScrollView`, mirroring the chip-adjust modal (item 11 reference). Show the free-text field only when **Other** is selected; keep optional notes separate; keep audit meta. Reason model already matches your spec. **No migration.**

## 11. Manual chip-adjust modal keyboard — **already correct**
- **Code path:** [chip-manage.screen.tsx:6602](src/views/screens/admin/chip/chip-manage.screen.tsx:6602) already uses `KeyboardAvoidingView` + inner `ScrollView` (deliberate, commented). This is the reference pattern for item 10.
- **Plan:** no change needed beyond confirming it stays the shared pattern (I'll verify no regression while doing item 10).

## 12. Active Tables "Winner" quick button — **enhancement**
- **Code path:** existing "Who won?" confirm modal `completeMatch != null` ([chip-manage.screen.tsx:6572](src/views/screens/admin/chip/chip-manage.screen.tsx:6572)); the ⋮ menu's "Set Winner" row (4609) sets `completeMatch`. Card render `renderTableCard` (3698) already has a parallel "Start Match" button (3786).
- **Plan:** add a visible **Winner** button on each live-match card that sets `completeMatch({matchId:m.id,aId:m.aId,bId:m.bId})` — opens the SAME modal, records nothing immediately. Keep ⋮ for secondary actions. Reuses `vm.recordWinner`; no new mutation. **No migration.**

## 13. Completed spectator Overview redesign — **redesign**
- **Code path:** spectator `OverviewTab` when finished ([chip-live.screen.tsx:595](src/views/screens/tournament/chip-live.screen.tsx:595)): Champion+Matches cards → **Chip Leader card (over-emphasized)** → Final Standings → Recent Activity.
- **Available data:** hook already exposes per-player wins/winPct/bestStreak/perf/match history + `summary.completedMatches`; **tournament duration is NOT surfaced** (startedAt/finishedAt exist on ChipState but aren't exposed).
- **Plan (your hierarchy):** Champion → compact stats/performance summary → Final Standings → Recent Activity → Chip Leader lower/removed. Derive stats from real ordered match history (no fabrication); surface startedAt/finishedAt for duration. **No migration.**

## 14. Completed tab: replace Tables with Stats — **redesign**
- **Code path:** spectator tabs are one const `TABS = overview|tables|players|payouts` ([chip-live.screen.tsx:49](src/views/screens/tournament/chip-live.screen.tsx:49)), used for both live and completed; `TablesTab` shows "No active tables" when finished. Admin has no such tab set (phase pages), and already shows these stats in Results→Summary ([chip-manage.screen.tsx:5006](src/views/screens/admin/chip/chip-manage.screen.tsx:5006)).
- **Plan:** when `view.finished`, swap the spectator `tables` tab for a **Stats** tab (line-by-line: Duration, Matches Played, Most Wins, Best Win Rate, Longest Win Streak, Most Active Player, Top Performance). Admin already has equivalents in Summary; I'll align labels. **No migration.**

## 15. Player performance card copy — **restyle**
- **Code path:** the arrow card is the spectator ProfileModal ([chip-live.screen.tsx:1147](src/views/screens/tournament/chip-live.screen.tsx:1147)): headline `355 → 539`, inline `+184 vs Fargo`, detail rows Team Fargo / Performance Rating / **vs Fargo (redundant)** / Opponent Avg. (Other variants: profile `ChipTournamentHubView.tsx:418`, live `StatsView.tsx:227`, admin `chip-manage.screen.tsx:6476` — all from `computePerformance`.)
- **Plan:** headline → `355 → 539 +184` (355 neutral, arrow dim, 539 green, +184 green); drop "vs Fargo" wording; remove the redundant vs-Fargo detail row; keep Team Fargo / Performance Rating / Opponent Avg. Label the Stats-page category "Top Performance". Scope to the spectator arrow card (primary); other variants left unless you want them aligned. **No migration.**

## 16. Spectator payouts recipient names — **gap**
- **Code path:** spectator `PayoutsTab` entry breakdown shows **place + % + amount only** ([chip-live.screen.tsx:994](src/views/screens/tournament/chip-live.screen.tsx:994)); `SpecPayoutRow` has no name. Side-pot finishers already show names (1038). No paid flag in the spectator payload (confirmed — no leak).
- **Plan:** add an optional `name` to `SpecPayoutRow`, populated from `orderedEntries`/`durableOrdered` (the durable finish order the hook already computes) when finished; render `1st — Name — $amt`. Keep side-pot names. Spectator still never sees paid/unpaid. **No migration.**

## 17. Admin payout tracking (Mark Paid) — **mostly done; add confirm**
- **Code path:** already implemented — Mark Paid / green ✓ Paid toggle ([chip-manage.screen.tsx:4942](src/views/screens/admin/chip/chip-manage.screen.tsx:4942)), backed by manager-only `chip_payouts_paid` via `getPayoutsPaid`/`setPayoutPaid` ([chip.service.ts:730](src/models/services/chip.service.ts:730)), React Query key `["chip-payouts-paid",id]`, persists across restart, excluded from spectator. `chip_payouts_paid` migration already applied.
- **Gap:** `togglePayoutPaid` (chip-manage.screen.tsx:958) fires immediately — **no confirmation**.
- **Plan:** add a confirm modal "Mark {name}'s ${amount} payout as paid?" before `togglePayoutPaid` (name/amount already available via `teamAtPlace`/`finishers` + `row.amount`). No duplicate state impl. **No migration.**

## 18. Regression guards (verify while in these areas)
- Non-Ready/Registered players never leak into the live queue at 0 chips (reconcileQueue `enteredField`).
- Eliminate/forfeit modal never stacks/freezes (openForfeit centralized close) — item 7 extends the same discipline to the alerts modal.
- Completed standings still read `chip_results` when present (Fix 2).
- Forward completed participant sync intact (Fix 1).
- `CHIP_APPLY_ENABLED` stays false.

---

## Proposed commit sequence (small, logical)
1. **Setup scroll** (item 1)
2. **Prize Pool summary dedupe** (item 2)
3. **Recommended tables formula** (item 3)
4. **Paid-not-Ready gating** (item 4)
5. **Payout alert placement + View Payouts CTA** (items 5, 6)
6. **Alerts modal freeze + reshuffle recommendation + stream alert** (items 7, 8, 9)
7. **Forfeit modal keyboard + reason model** (item 10; verify 11)
8. **Active Tables Winner button** (item 12)
9. **Completed spectator redesign: Overview + Stats tab + performance card** (items 13, 14, 15)
10. **Spectator payout names + admin Mark Paid confirm** (items 16, 17)

**No migrations. `CHIP_APPLY_ENABLED` stays false.**
