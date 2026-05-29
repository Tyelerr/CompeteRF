# Live Tournament Engine â€” Build Tracker

> Master reference for the live tournament engine feature in CompeteRF.
> Open in any window, check items off with `[x]`, add notes inline.
> Branch: `feature/live-tournament-engine`

**Legend:** `[ ]` todo Â· `[x]` done Â· `[~]` in progress Â· `[DECIDE LATER]` open question Â· `[CONFIRM]` needs a final yes

---

## 0. Guiding principles (do not violate)

- [ ] All NEW data access goes through the layered stack: `*.types.ts` â†’ `*.service.ts` â†’ `use*.ts` hook â†’ screen. Do **not** put Supabase calls inline in screens (the existing `app/(tabs)/profile.tsx` does this for favorites â€” we are not copying that pattern for new work).
- [ ] Naming conventions: hooks `use*.ts`, services `*.service.ts`, types `*.types.ts`.
- [ ] Use `COLORS`, `SPACING`, `FONT_SIZES`, `RADIUS` constants â€” never hardcode hex or px.
- [ ] `.maybeSingle()` for optional records; `.select().single()` after updates to catch silent failures.
- [ ] No 1â€“2 char module-level identifiers in RN/Expo files (Hermes minifier collision). Import `webMs`/`webSc` from `src/utils/scaling.ts`; never redefine locally.
- [ ] Handle web vs mobile styling separately where they differ.
- [ ] **Transparency is a core product requirement.** Every TD action that changes a started tournament is logged AND broadcast to affected players.

---

## 1. The two profile implementations (important context)

- **`app/(tabs)/profile.tsx`** â€” the LIVE, in-use profile screen. Rich (favorites, messages, alerts). Does Supabase calls inline. This is what the dashboard mockup replaces/extends.
- **`src/views/screens/profile/profile.screen.tsx`** â€” an OLDER, UNUSED MVVM screen with a different data shape (`profile.name`, `profile.role`). **Do not touch unless we decide to consolidate.**

- [DECIDE LATER] Do we eventually delete/retire the unused `profile.screen.tsx`?

---

## 2. Build order (smallest safe slices first)

The dashboard is the *consumer* of data that does not exist yet, so it is built LAST.
The build follows the data, not the screens.

- [ ] **Phase 0 â€” Data model & types.** New tables + TS types + enum extensions. No UI.
- [ ] **Phase 1 â€” TD registration & check-in.** Preregistration, queue, check-in, payment ticking, starter Fargo, no-show status.
- [ ] **Phase 2 â€” Live engine.** Bracket generation (single + double elim), match play, live scoring, match states, event log, payouts/chop.
- [ ] **Phase 3 â€” Results & placements.** Final placements derived from elimination order; earnings records.
- [ ] **Phase 4 â€” Profile dashboard (read side).** The mockup: Player Header, You Play Next, My Tournaments buckets, Performance Snapshot, Recent Activity, detail pages, spectator view.

---

## 3. Locked design decisions

### Registration & check-in
- [x] Registration opens ~1hr before start OR TD opens manually. *(defaults configurable per tournament)*
- [x] Online registration LOCKS 1hr before start.
- [x] Online registration capped at **75%** of capacity (walk-ins fill the rest). *(configurable)*
- [x] Player has a **30-min** window before they are "expected." *(configurable)*
- [x] If no cap is set â†’ TD can offer preregistration without worrying about no-shows.
- [x] TD can offer preregistration as an option per tournament.
- [x] Player names are **hidden** from other players during registration (privacy â€” don't want "I won't play if so-and-so is in").
- [x] Capped tournament that fills â†’ overflow goes to a **queue**; queued players are told they're in the queue.
- [x] When a spot frees (cancel/no-show) â†’ **auto-promote** next in queue.
- [x] TD must **approve** registrations.
- [x] At check-in the TD: asks if preregistered â†’ finds them in preregistered box (or adds them) â†’ opens a per-player prompt.

### Per-player check-in prompt (TD view)
- [x] Checkboxes: **Entry Fee [ ]**, **Side Pot 1 [ ]**, **Side Pot 2 [ ]** â€¦ (one per side pot the tournament defines).
- [x] Fargo field: shows current Fargo; a **"No Fargo" [ ]** option that, when checked, prompts the TD to assign a **starter rating**.
- [x] Per-TD **"reallow preregistration"** toggle (see strikes).
- [x] Money/payment is **ticked off by the TD** for their own tracking + payout math. No transactions.

### Side pots
- [x] Already modeled as `SidePot { name, amount }[]` â€” multiple allowed, variable count, each its own amount, all **optional**.
- [x] Player opts in per side pot at registration (checks the ones they enter).
- [x] Tournament settings define entry fee + each named side pot + amount.
- [DECIDE LATER] Staggered entry fees â€” OUT OF SCOPE for now.

### Fargo
- [x] TD looks up Fargo before the tournament to verify identity. **Never player-entered.**
- [x] Real FargoRate API integration â†’ later.
- [x] **Starter rating** = what the player is entered AS for that tournament. **Per-tournament for now**, not written back to profile.

### Strikes / no-shows
- [x] Full strikes system **DEFERRED**.
- [x] Phase 1 only records a **no-show status** on the registration.
- [x] "Reallow preregistration" is **per-TD** â€” one TD blocking someone does NOT block them with other TDs.

### Bracket
- [x] Seeding: **random draw** for now.
- [x] Formats first: **single-elim** and **double-elim** (round-robin etc. later).
- [x] **Byes** required from day one (non-power-of-2 player counts auto-advance).
- [x] Registration **hard-closes** when the bracket generates.
- [x] **Start confirmation**: strong prompt â€” "Confirm you want to start â€” any changes will notify all players."
- [x] TD CAN reopen to add/remove/swap a player, but: change is **logged** AND TD must enter a **note** that **broadcasts** to everyone's match center (existing broadcast system).
- [x] Double elim is **TRUE double elimination** (loser of winners' final must be beaten twice).

### Scoring & match states
- [x] Players self-report: tap **+1** per game won.
- [x] Score updates **live and publicly** â€” main bracket + online spectators see the pending/current score in real time.
- [x] Bracket **advances automatically** when the race is met. (No hard confirmation gate.)
- [x] No 5-minute auto-complete. **Players end the match themselves**; if there's a problem they go talk to the TD.
- [x] TD can **adjust any score up or down at any time**, including after completion (dispute handling).
- [x] Full **match event log** with timestamps: every game won, every score change, who did it, when; plus match start/end times. Append-only.

### TD match controls
- [x] **Forfeit a player** â†’ record current score at that moment + reason; opponent advances; logged.
- [x] **Complete early** â†’ TD sets/records final score + reason (same mechanism as forfeit).
- [x] **Hold / pause** â†’ match goes `paused` status; **table stays bound to that match** (never reassigned). For breaks in long matches. Rare.
- [DECIDE LATER] **Void / replay** a match â€” flagged as a possible state; design later.
- [DECIDE LATER] Reopen/correct an already-completed match â€” TD adjust covers most of this; confirm if more is needed.

### Chop (split)
- [x] Chop allowed at **final positions only** (money positions).
- [x] A chop is a match-completion type (`chopped`) AND a payout event.
- [x] **Money split respects pot membership.** Entry pool splits between chopping finalists. A winner-take-all side pot only splits among players actually IN that pot â€” if only one finalist is in it, they keep it outright and only the entry money is chopped.
- [x] Payout display must show, per player, exactly what they get and from which pots, so the TD sees it clearly.
- [x] **Chops can be UNEVEN.** Even split is just the default starting point; the TD can override the per-player amounts (e.g. the player who's up takes more, the other takes less). Whatever the TD enters must still sum to exactly the pool(s) being chopped, per pot, respecting membership.
- [x] **Confirmation prompt** before a chop commits (it resolves the match + payouts).
- [x] **Undo** available after committing â€” reverts the chop, match returns to prior state, payouts cleared. Undo is itself behind a confirm.
- [x] Both the chop commit AND the undo write to the **match event log** (`chop`, `reopened`/undo events).

### Payouts / money (record-keeping only)
- [x] Whole money layer = **record-keeping / reporting**. No transactions.
- [x] **Payout calculator** at tournament creation: set prize pool + number of paid places (3 to 10+), auto-distribute standard percentages, TD can drag **per-place sliders** that stay locked to **exactly 100%** of the pool.
- [x] **"Added money"** box at creation: an amount that, when checked, adds to the prize pool.
- [x] **Entry winnings and side-pot winnings tracked separately.**
- [x] Per-player **yearly earnings** reporting ("how much they made this year").

---

## 4. Phase 0 â€” Data model spec (DRAFT â€” reconcile against live DB)

> No registration/match/result tables exist yet. All new.
> `[CONFIRM]` = verify exact column before migration.

### Enum extensions (`src/models/types/common.types.ts`)
- [ ] **Extend** `TournamentStatus` (keep existing `active | cancelled | completed | archived`), add:
  `registration_open | registration_closed | in_progress`
  *(extend, do not replace â€” existing code depends on current values)*
- [x] `TournamentFormat` already has `single-elim` + `double-elim` â€” no change.
- [ ] Add `RegistrationStatus`: `preregistered | queued | approved | checked_in | no_show | cancelled`
- [ ] Add `MatchStatus`: `scheduled | in_progress | paused | completed | forfeited | chopped | void`
- [ ] Add `MatchResultType`: `normal | forfeit | early_complete | chop | bye`
- [ ] Add `MatchEventType`: `created | score_change | game_won | started | paused | resumed | completed | forfeit | chop | td_adjust | reopened`

### New tables (proposed)
- [ ] `tournament_players` (registrations)
  - links `tournament_id` â†” player (profile or guest name)
  - `status` (RegistrationStatus), `queue_position`, `seed`
  - `fargo_rating` (the starter/entered rating â€” per-tournament), `is_starter_rating` bool
  - payment ticks: `paid_entry` bool, plus side-pot opt-ins (see below)
  - `checked_in_at`, `registered_at`, timestamps
- [ ] `registration_side_pots` (or JSON on registration) â€” which side pots a player opted into + paid
  - [DECIDE LATER] separate table vs JSON column â€” decide at migration time
- [ ] `matches`
  - `tournament_id`, `round`, `bracket` (winners/losers for double elim), `match_number`
  - `table_number`, `race_to`
  - `player1_id`, `player2_id` (nullable for byes / TBD)
  - `player1_score`, `player2_score`
  - `status` (MatchStatus), `result_type` (MatchResultType)
  - `winner_id`, `loser_id`, `completed_reason`
  - `started_at`, `ended_at`, timestamps
  - links to next match(es) for bracket advancement (`winner_to_match_id`, `loser_to_match_id`)
- [ ] `match_events` (append-only audit log)
  - `match_id`, `event_type` (MatchEventType), `actor_id`, `payload` (JSON: old/new score, reason, note), `created_at`
- [ ] `placements` (final results)
  - `tournament_id`, `player_id`, `place`, derived from elimination order
  - `entry_winnings`, `side_pot_winnings` (separate), `chop` bool
- [ ] `tournament_payouts` (payout calculator output)
  - `tournament_id`, prize pool, added money, paid places, per-place percentages/amounts
- [DECIDE LATER] Exact table for "TD reallow preregistration" per-TD blocklist (Phase 1+).
- [ ] Confirm Supabase **Realtime** enabled on `matches` + `match_events` (live scoring/spectator view).
- [ ] Confirm RLS policies: public read on live bracket data (spectator view); writes restricted to TD + the two players in a match.

### New type/service/hook stacks (Phase 0 scaffolding)
- [ ] `src/models/types/registration.types.ts`
- [ ] `src/models/types/match.types.ts`
- [ ] `src/models/types/payout.types.ts`
- [ ] `src/models/services/registration.service.ts`
- [ ] `src/models/services/match.service.ts`
- [ ] `src/models/services/payout.service.ts`
- [ ] `src/viewmodels/hooks/use.registrations.ts`
- [ ] `src/viewmodels/hooks/use.match.ts`
- [ ] `src/viewmodels/hooks/use.payouts.ts`

---

## 5. Phase 1 â€” TD registration & check-in (tasks TBD)
- [ ] Tournament settings: entry fee + named side pots + amounts + added money + payout calculator.
- [ ] Registration window logic (open/lock times, 75% cap, 30-min expected window).
- [ ] Preregistration flow (player side) + queue + auto-promote.
- [ ] TD preregistered box (names hidden from players, visible to TD).
- [ ] TD approve registrations.
- [ ] Check-in per-player prompt (payment ticks, side-pot opt-ins, Fargo / starter rating, reallow-preregistration toggle).
- [ ] No-show status recording.

## 6. Phase 2 â€” Live engine (tasks TBD)
- [ ] Bracket generator: single elim + byes + random draw.
- [ ] Bracket generator: true double elim + byes.
- [ ] Start-tournament confirmation + lock.
- [ ] Reopen/edit-after-start: log + mandatory note + broadcast.
- [ ] Match center (player): +1 scoring, end match.
- [ ] Live bracket view + spectator (public, read-only, realtime).
- [ ] TD controls: adjust score, forfeit, complete early, pause/resume.
- [ ] Match event log writing on every action.
- [ ] Payout calculator UI (sliders locked to 100%).
- [ ] Chop flow (final positions, pot-membership-aware split, **uneven splits supported**, confirm prompt, undo with confirm, both logged).

## 7. Phase 3 â€” Results & placements (tasks TBD)
- [ ] Derive placement from elimination order (single + double elim).
- [ ] Record entry vs side-pot winnings separately.
- [ ] Yearly earnings reporting.

## 8. Phase 4 â€” Profile dashboard (tasks TBD, from mockup)
- [ ] Player Header (avatar, @username, Fargo, location, member since, messages + alerts).
- [ ] You Play Next (live status) â†’ Live Match Center.
- [ ] My Tournaments buckets: Live / Registered / Favorites / Completed â†’ full page.
- [ ] Performance Snapshot: Win % / Wins / Top 3 / Fargo â†’ Performance Stats page.
- [ ] Recent Activity â†’ Activity History page.
- [ ] Settings.

---

## 9. Open questions parking lot
- [DECIDE LATER] Retire unused `profile.screen.tsx`?
- [DECIDE LATER] `registration_side_pots` separate table vs JSON column.
- [DECIDE LATER] Void/replay match state design.
- [DECIDE LATER] Reopen completed match beyond TD score-adjust?
- [DECIDE LATER] Staggered entry fees (explicitly out of scope now).
- [DECIDE LATER] Per-TD reallow-preregistration blocklist table (when strikes get built).

---

## 10. Git workflow reminder (per session)
1. Paste `git -C C:\Users\T\CompeteRF branch; git -C C:\Users\T\CompeteRF status` before significant changes.
2. Lead with branch/setup command.
3. Do all file work (full-file replacements via `[System.IO.File]::WriteAllText()` with UTF8).
4. End with merge commands.
