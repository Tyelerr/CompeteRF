# Phase 5 — Pending Accounts + Unified Registration: migration review

Companion to `supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql`
(down: `supabase/rollback/20260805120000_phase5_rollback.sql`; tests:
`supabase/tests/phase5_verification.sql`). **Nothing is applied.** This document answers
the review items and is the go/no-go artifact.

---

## 1. How each role qualifies to manage a tournament (`can_manage_tournament`)

A caller passes if **any** branch is true (each documented in the SQL):

| Branch | Condition | Who |
|---|---|---|
| (a) | `profiles.role IN ('compete_admin','super_admin')` | Compete/Super admin (global) |
| (b) | `tournaments.director_id = caller.id_auto` | The assigned tournament director |
| (c) | active `venue_owners(venue_id = tournament.venue_id, owner_id = caller.id_auto, archived_at IS NULL)` | **Bar owner who owns the venue** |
| (d) | active `venue_directors(venue_id = tournament.venue_id, director_id = caller.id_auto, archived_at IS NULL)` | Manager assigned to the venue |

A bar owner qualifies through **(c) alone** — no director row required, as you asked.
Existing helpers weren't sufficient (`is_chip_manager`/`td_create_team` only do (a)+(b)),
so authorization is **extended** here to include venue ownership/direction. It is a **new**
helper — no existing policy/RPC is modified, so nothing that relied on the old, narrower
check is loosened.

> **One decision for you:** branch **(d) venue_directors** is included because they are
> "management authority through the venue." If you want bar-owner-only (drop (d)), say so and
> I'll remove that one branch.

## 2 & 3. Signup + claim: exact end-to-end (no broken state, verified-email only)

One idempotent core, `_ensure_player_for_user(uid)`, is invoked from **three** places so a
user can never end up with a profile and no linked player:

```
Normal signup (no pending email match)
  auth.users INSERT ──▶ profiles INSERT ──▶ (i) profiles trigger ──▶ _ensure ──▶ creates ACTIVE player ✅

Signup whose email matches a PENDING player
  profiles INSERT ──▶ (i) trigger ──▶ _ensure: email NOT yet verified ──▶ leaves it (no dup) 
  …later…
  auth.users email_confirmed_at set ──▶ (ii) auth trigger ──▶ _ensure: verified ──▶ CLAIMS the
                                         existing pending player (profile_id set, ACTIVE) ✅  [no manual action]

Confirm-before-profile ordering
  auth confirm fires with no profile yet (can't link) ──▶ later profiles INSERT ──▶ (i) trigger ──▶
    _ensure: verified + profile now exists ──▶ claims ✅

Belt-and-suspenders
  (iii) app calls claim_pending_player() on every session hydration ──▶ _ensure ──▶ links if pending,
        returns the id if already linked (idempotent) ✅
```

- **(i)** `on_profile_created_provision_player` — AFTER INSERT on `public.profiles`.
- **(ii)** `on_auth_email_confirmed_claim_player` — AFTER UPDATE OF `email_confirmed_at` on
  `auth.users`, fires **only** on the null→set transition. This is the **server-side guarantee**
  that a pending identity is claimed the instant ownership is proven, with no app or user action.
- **(iii)** `claim_pending_player()` — the app should call this once after the session resolves
  (e.g. in `AuthProvider` after hydration). It's a fast path + manual retry; harmless if (ii)
  already ran.

**Retry-safe / idempotent:** `_ensure` first returns any already-linked player; a race throws
`unique_violation` which is caught and resolved to the now-linked row. It **never** creates a
second identity (the `email_normalized` partial-unique index forbids it).

**Verified-email only (point 3):** a pending identity is claimed **only** when
`auth.users.email_confirmed_at IS NOT NULL` and the normalized emails match. It is **never**
matched on name, phone, username, or profile similarity, and **never** taken from another
account (`profile_id` already set to someone else → refused).

> **One dependency for you:** (ii) creates a trigger on `auth.users`. Supabase's migration role
> normally can (the classic `handle_new_user` pattern), but if your project restricts it, the
> push will error on that statement — in which case we drop (ii) and rely on (i)+(iii), which
> still close the gap (the app calls claim on hydration). Tell me if you'd rather not touch
> `auth.users` at all.

## 4. Invitations are decoupled (create/register never depend on email)

`create_pending_player` and the registration RPCs **do not** touch invitations — a TD can create
and register a pending player with invitations disabled or email delivery down. The token
subsystem is separate:

- `issue_player_invitation(player, tournament, ttl_hours)` — supersedes the prior live token,
  stores only a **SHA-256 hash**, returns the raw token **once** for the email edge function,
  rate-limited (60s). Resend = call again; it **never** creates a new player identity.
- `revoke_player_invitation(player, tournament)` — sets `revoked_at`.
- `get_player_invitation_status(player)` → `sent | accepted | superseded | expired | revoked`.
- States tracked on `player_invitations`: `sent_at`, `accepted_at` (set by claim), `expires_at`,
  `superseded_at`, and the new **`revoked_at`**. The "one live invite per player" partial-unique
  index now also excludes revoked.
- **Actual email delivery stays out of the DB** — a separate edge function (not in this migration)
  calls `issue_player_invitation` and sends the link.

## 5 & 6. `create_pending_player` outcomes (structured, non-destructive)

Returns `(player_id, outcome, account_status, display_name, email_masked)`:

- `CREATED_PENDING` — new pending identity created.
- `MATCHED_PENDING` — existing pending reused; **name/phone left untouched** (editing is a
  separate authorized op, intentionally not part of find-or-create).
- `MATCHED_ACTIVE` — email belongs to an ACTIVE player; returned for selection, no pending created.
- DISABLED match → rejected (`check_violation`) for admin review.

The UI gets `display_name` + masked email so it can say "found existing player: Casey N. (j***@g***.com)".

## 7. Every `player_uuid` read/write path (so a UUID-only row never disappears)

The migration relaxes the insert constraint and relies on the **existing** Phase-3 uuid indexes.
But correctness end-to-end requires the app/edge paths below to recognize `player_uuid`. These are
**app-layer commits** (services/integration), enumerated here so none is missed:

| Path | File / object | Today | Required change |
|---|---|---|---|
| Roster read | `registration.service.ts:43,121` (`profiles:player_id` embed) | resolves name via id_auto only | also embed/join `players:player_uuid`; render `players.display_name` when the profile embed is null (pending) |
| Roster filter/keys | `registration.service.ts:71,85,99,137`, `use.registrations.ts` | `.eq('player_id', …)` (id_auto) | add/prefer `player_uuid`; **reads stay working** (both cols populated for active) |
| Client dedupe | `manage-tournament/[id].tsx:3041` (`r.player_id === profile.id_auto`) | id_auto compare | dedupe on `player_uuid` (server index already enforces it) |
| Delete/update | TD remove/check-in/status | by `tournament_players.id` (row id) | **already UUID-agnostic** — verify no id_auto assumption |
| Chip entry mapping | `chip.service.ts:106` `regToEntry` (`p1ProfileId ← reg.player_id`) | id_auto | carry `player_uuid` → `p1_player_id` for uuid-only regs |
| Chip roster | `chip.service.ts:156` `rosterTeamToEntry` (RPC returns id_auto) | id_auto | extend `get_tournament_team_roster` projection with uuid (read-only) |
| Team roster read | `team.service.ts:19,91` | `profiles:player_id/captain_id` | embed `players:player_uuid/captain_player_id`; name fallback for pending |
| Match-ready SMS | `supabase/functions/sms-send-match-ready:83,104` | recipient by id_auto | pending players have **no verified phone** → correctly excluded (documented, not a regression) |
| Bracket / seeding | `live_settings` JSON uses `tournament_players.id` (registrationId) | already uuid-agnostic | none — bracket keys on registration row id, not player id |
| Standings (`chip_results`) | `chip.service.ts:518,538` | p1/p2_profile_id | carry p1/p2_player_id (already synced) |

RLS is not a blocker: `tournament_players` read is public `USING(true)`, so uuid-only rows are
readable; the Phase-4C accept-either write policies already authorize the uuid basis. The unique
index `tournament_players_unique_real_player_uuid (tournament_id, player_uuid)` dedupes uuid rows.

## 8. Team captain source of truth

- **`captain_player_id` (uuid → players) is the source of truth** going forward; new/updated code
  reads and writes it.
- **`captain_id` (id_auto) is legacy compatibility only** — dual-written for ACTIVE captains, and
  **dropped in Phase 7**. A pending captain has `captain_player_id` with `captain_id` NULL.
- **No two competing identities long-term:** after Phase 7 only `captain_player_id` remains.
- **When a pending captain claims their account:** `players.profile_id` is set on the same
  `players.id`; the team already references that `players.id` via `captain_player_id`, so **no team
  migration runs** and authorization flips automatically (Phase-4C accept-either matches
  `captain_player_id = current_player_id()`). `captain_id` stays NULL — harmless, since every
  competitor-authz path already accepts the uuid basis. (We deliberately do **not** backfill the
  legacy id_auto on claim.)

## 9. Waiting-for-teammate flow (confirmed against the RPCs)

- Team is created **only** when the TD calls `td_create_team_by_uuid` (i.e. on "Save as Waiting for
  Teammate") — captain-only, `status='pending_partner'`, `captain_player_id` set, `managed_by_profile_id`
  = the TD.
- Partner added later via `td_add_team_member_by_uuid` using the same stable-uuid system; it preserves
  the captain's `suggested_fargo` and the team's `chip_override` (only the partner row + team
  approved/locked/status change).
- **Same player can't hold both slots:** the "already on a non-declined team member row" guard matches
  the captain's own `player_uuid`.
- **Incomplete teams aren't seated:** `_recompute_team_status` keeps them out of `'registered'`; seeding
  reads `status='registered'` and entrant/prize counts already exclude `pending_partner`.

## 10. Search privacy

- Search + recent return a **masked** email (`j***@g***.com`) via `mask_email`, and **no phone**.
- Exact matching still works: the server matches on `players.email_normalized`; only the **output** is
  masked. Raw email/phone are never returned by search.

## 11. Migration safety

- **Full migration diff:** the file is new — the entire
  `supabase/migrations/20260805120000_phase5_pending_accounts_registration.sql` is the diff.
- **Rollback diff:** `supabase/rollback/20260805120000_phase5_rollback.sql` (drops all new objects;
  restores the two constraints — those two restores fail by design if pending-only rows already exist).
- **Transactional:** every statement is transactional DDL/PLPGSQL — no `CREATE INDEX CONCURRENTLY`, no
  `ALTER TYPE … ADD VALUE`. `supabase db push` applies the file atomically; a failure rolls the whole
  thing back.

**Existing objects affected**

| Object | Change | Risk |
|---|---|---|
| `tournament_players_identity_chk` | dropped + re-added, **relaxed** to accept `player_uuid` | none — superset of the old rule |
| `tournament_teams.captain_id` | `DROP NOT NULL` | none — widening |
| `tournament_teams` | `+ managed_by_profile_id` (nullable), `+ captain_identity_chk` | none — new col; check holds for all existing rows |
| `player_invitations` | `+ revoked_at`; `one_live_uidx` dropped + re-created to also exclude revoked | none — existing rows have `revoked_at` NULL |
| `on_profile_created_provision_player` | **new** trigger on `profiles` | low — adds a player row per new signup |
| `on_auth_email_confirmed_claim_player` | **new** trigger on `auth.users` | low — fires only on confirm transition; see the §2/3 permission note |

No existing **function**, **RLS policy**, or **Phase 1–4C object** is modified. The Phase-4A sync
triggers remain authoritative for `id_auto → uuid` and are consistent with every insert here (dual
values are equal by construction; pending rows set uuid only and are left untouched).

**Non-reversible operations:** none at the schema level *before data exists*. Once a pending-only
`tournament_players` row or a pending-captain team exists, the two constraint restorations in the
rollback can't run until those rows are resolved (by design — flagged ⚠ in the rollback). Data
created (pending players, registrations) is not auto-deleted by rollback.

**Static review**

- **Ambiguous columns:** all query references are table/alias-qualified; `RETURNS TABLE` output names
  never appear unqualified inside queries → no column/variable ambiguity.
- **`SECURITY DEFINER` search_path:** every definer function pins `search_path = public, pg_temp`.
- **Grants:** `players`/`player_invitations` have **no** anon/authenticated table grants (RLS-locked,
  service_role only). Every RPC `REVOKE … FROM public, anon` then `GRANT EXECUTE … TO authenticated`;
  `_ensure_player_for_user` and `mask_email` have **no** client grant (internal only, reachable only
  from within definer functions/triggers).
- **RPC exposure:** search/recent are tournament-manager-gated and return masked email + no phone;
  create/register/team RPCs are manager-gated; invitation status is `is_staff`-gated; `claim` acts only
  on the caller's own verified identity. No RPC returns raw contact info or another user's data.

## 12. Test coverage

`supabase/tests/phase5_verification.sql` (rolled-back, staging) covers all 18 scenarios: search
active+pending (1), no-dup (2), create pending (3), reuse pending (4), match active (5), unauthorized
rejected (6), bar-owner allowed (7), register pending by uuid (8), register active dual-write (9),
waiting team pending captain (10), add teammate later (11), same-player-twice blocked (12), claim after
verified email (13), history preserved (14), idempotent claim (15), new signup one ACTIVE (16),
pending-email signup never orphaned (17), invite decoupled (18).

---

## Implementation plan (commits) — after you approve the migration

1. **Backend** (this migration) — apply via `supabase db push`; run `phase5_verification.sql` in staging.
2. **Services** — `player.search.service` (unified, returns `players.id` + masked email), `create_pending_player`,
   `register_player_for_tournament`, `td_*_by_uuid`, invitation wrappers, `claim_pending_player`; extend
   `registration.types`/team types to carry `player_uuid`/`captain_player_id`; update the §7 read paths.
3. **UI** — one adaptive search-first modal: dynamic search, Recent Players, no-result inline Create
   (prefilled), inline Fargo (replaces the popup), Scotch Player 1 of 2 → 2 of 2, Save as Waiting for
   Teammate, Team Review before create, singles reuse (Player 1 of 1).
4. **Integration** — replace `AddPlayerModal` + chip-manage add surfaces; wire waiting-team "+ Add
   Teammate"; call `claim_pending_player()` on session hydration; a small invite-email edge function
   (optional, gated). Verify on Expo Go across bracket, chip, teams.
