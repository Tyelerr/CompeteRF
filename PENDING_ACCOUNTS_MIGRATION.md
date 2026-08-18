# Pending Accounts + Standalone `players` Table — Audit & Migration Plan

> **Status: AUDIT / PROPOSAL ONLY. No migration or application code has been written.**
> This document is the read-only reconnaissance and staged plan requested before implementation.
> Approve / adjust the "Open decisions" at the end before Phase 1 begins.

## Goal (as directed)

- `profiles` = **authenticated Compete users / account identity** (`profiles.id = auth.users.id`, unchanged).
- `players` = **competitive identity + tournament history**. A player may exist with **no** auth account.
- On activation, the **existing** player row links to the authenticated profile (`players.user_id = auth.uid()`, `status = ACTIVE`) — history is **not moved or recreated**, no manual "claim history" step.
- Do **not** create fake auth users or synthetic profile rows for pending players.

---

## 0. Finalized Phase 1 decisions (LOCKED — supersede earlier proposals)

1. **`players.id` = `uuid`** (own id space). Migration stays purely **additive**: competitor tables gain a new nullable `player_id uuid` alongside the legacy `id_auto` column; both coexist through the compatibility window until backfill **and** authorization checks are validated (Phase 4), then the legacy column is dropped (Phase 7).
2. **Backfill one `players` row per real `profiles` row**, **excluding system/service accounts** that cannot represent a person. Link via `players.profile_id → profiles.id`, **unique** (one profile ↔ at most one player). Caller resolution becomes `auth.uid() → profiles.id → players.profile_id → players.id` (and since `profiles.id = auth.uid()`, this is just `players.profile_id = auth.uid()`).
3. **Verification stays auth-side.** No `email_verified_at` / `phone_verified_at` on `players`. But a pending player stores an **UNVERIFIED** contact (`email`, `email_normalized`, `phone_e164`) because no profile exists yet. A TD/Admin-entered email is **never** treated as verified — only the activation flow, via the resulting authenticated account, verifies email ownership. `profiles.phone_verified_at` + Supabase email verification remain the post-activation source of truth.
4. **`tournament_teams.captain_id` is split** (the captain is confirmed a playing member — inserted into `tournament_team_members` with `role='captain'`): the **competitor** captain → `captain_player_id uuid references players(id)`; **administrative ownership** → a new profile-based `managed_by_profile_id uuid references profiles(id)`. This also lets a **pending player be a captain** (captain_player_id = pending player, managed_by_profile_id = the TD who built the team).
5. **Guest and Pending Account are distinct paths** — guests are never silently upgraded (see §E.3).
6. **Confirmed ACTOR/bug reclassifications:** `chip_events.actor_id` and `profiles.fargo_verified_by` stay profile/account-based (ACTOR, not migrated). `notifications.user_id` uuid/id_auto inconsistency is a **separate** account-scoped fix, documented but out of scope here.
7. **The #1 risk is authorization**, not data: the caller-as-competitor check must flip to `players` in the **same** phase as the column. Ordering is everything.

> **Live-schema gate:** No migration DDL is written until a `pg_dump --schema-only` of the live DB is compared against this repo audit (§F). The base tables (`profiles`, `tournament_players`, `tournaments`, `favorites`, `venue_*`) are not in the migration ledger, so their real definitions must be confirmed from the dump first.

---

## A. Database inventory

### A.1 Identity spaces
- `profiles.id` — `uuid` = `auth.users.id` (auth identity).
- `profiles.id_auto` — `bigint` serial = the **"player_id space"**; the migration `20260607120000_submit_match_state.sql:39` literally calls it that. Every competitor/actor FK points here.
- **Base tables (`profiles`, `tournaments`, `tournament_players`, `favorites`, `tournament_analytics`, `venue_owners`, `venue_directors`) are NOT in the migration ledger** — they predate it. Their exact `CREATE TABLE` (and any DB views/functions defined outside migrations) **cannot be audited from the repo** and require a live schema dump to confirm. ⚠️

### A.2 FKs into `profiles` (from generated types — authoritative)
- **10 FKs → `profiles.id` (uuid):** all messaging / notifications / reports — `conversation_messages.sender_id`, `conversation_participants.user_id`, `conversations.created_by`, `message_rate_limits.sender_id`, `notification_message_recipients.user_id`, `notification_messages.sender_id`, `notification_preferences.user_id`, `push_tokens.user_id`, `reports.reporter_id`, `reports.reviewed_by`. → **all ACCOUNT-SCOPED / ACTOR; none migrate.**
- **42 FKs → `profiles.id_auto` (bigint):** mixed COMPETITOR / ACTOR / ACCOUNT-SCOPED (see A.5 + classification).

### A.3 Player-like columns **without** a FK (need explicit handling)
| Column | Table | Type | Holds | Class |
|---|---|---|---|---|
| `p1_profile_id` | `chip_entries` | bigint | id_auto | **COMPETITOR** |
| `p2_profile_id` | `chip_entries` | bigint | id_auto | **COMPETITOR** |
| `p1_profile_id` | `chip_results` | bigint | id_auto | **COMPETITOR** |
| `p2_profile_id` | `chip_results` | bigint | id_auto | **COMPETITOR** |
| `actor_id` | `chip_events` | bigint | id_auto | ACTOR |

(`chip_entries.p*` added in `20260707120000_chip_entry_profile_ids.sql:9-10`; `chip_results.p*` in `20260727130000_chip_results.sql:20-21`.)

### A.4 chip_* and bracket / match identity
- **Not people (never migrate):** `chip_matches.a_id/b_id/winner_id/loser_id`, `chip_tables.holder_id/last_loser_id/match_id`, `chip_results.entry_id` are all **text `chip_entries.id`** (e.g. `"reg_12"`), and `chip_entries.id` itself is a client-generated entry id. Per-player chip stats (wins/losses/streak) are columns **on `chip_entries`**, resolvable to a person only via `p1/p2_profile_id`.
- **Bracket lives in JSON:** `tournaments.live_settings → bracket / matchState`. The in-bracket player id is the **`registrationId` = `tournament_players.id`** (the registration row id), *not* id_auto and *not* profiles.id (`supabase/functions/_shared/bracket.ts:7,16-17,44-45`). `matchState` winners are positional (`winner: 1|2`). **Consequence: re-pointing `tournament_players.player_id` covers the entire bracket without touching any JSON.**
- **No** `standings` / `placement` / `payout` / `winnings` / `stats` tables exist; `chip_results` (place + p1/p2_profile_id) is the only persisted standings structure. Payout **amounts are derived**, never stored.

### A.5 The 7 columns to migrate (COMPETITOR only)
| Column | Table | Type | Current FK | Nullable? |
|---|---|---|---|---|
| `player_id` | `tournament_players` | bigint id_auto | (base) | ✅ (guests) |
| `player_id` | `tournament_team_members` | bigint id_auto | → profiles(id_auto) | ✅ (temp partner) |
| `captain_id` | `tournament_teams` | bigint id_auto | → profiles(id_auto) | ❌ |
| `p1_profile_id` | `chip_entries` | bigint id_auto | none | ✅ |
| `p2_profile_id` | `chip_entries` | bigint id_auto | none | ✅ |
| `p1_profile_id` | `chip_results` | bigint id_auto | none | ✅ |
| `p2_profile_id` | `chip_results` | bigint id_auto | none | ✅ |

Note: `tournament_players.player_id` and `tournament_team_members.player_id` are **already nullable for guests / temp partners** — the "competitor without an account" case partly exists today via `null` + snapshot `guest_name`/`p1_name`/fargo columns. Pending players supersede that for the *activatable* case.

### A.6 RLS policies depending on `profiles.id = auth.uid()`
- **`(select id_auto from profiles where id = auth.uid())` pattern:**
  - `tournament_settings_templates` — 4 own-row policies (`20260615120000:22-38`), `user_id` = id_auto → **ACCOUNT-SCOPED**.
  - `tournament_team_members.ttm_read` (`20260709130000:74-85`) — resolves caller as `player_id` (COMPETITOR), `captain_id` (COMPETITOR), or `director_id`/role (ACTOR).
  - `chip_config/entries/tables/matches/events/results` — writes gated by `is_chip_manager(tournament_id)` (director check, ACTOR); reads `using (true)`.
  - `tournament_teams` — reads `using (true)`; all writes via SECURITY DEFINER RPCs.
- **`user_id = auth.uid()` directly (uuid):** `sms_consent_events`, `sms_messages`, `sms_verification_attempts` → **ACCOUNT-SCOPED, unchanged.**

### A.7 SECURITY DEFINER RPCs mapping `auth.uid()` → id_auto (must learn `profiles → players`)
- **Helpers:** `_team_caller()` (`20260709130000:92`), `is_chip_manager(bigint)` (`20260624120000:14`).
- **Match/registration:** `submit_match_state(bigint,text,jsonb)` (`20260607120000:21`) — authorizes as `director_id` (ACTOR) **OR** active `tournament_players.player_id` (COMPETITOR); `approve_registration_with_fargo` (`20260709120000:36`) — writes `profiles.fargo*` incl. `fargo_verified_by` (ACTOR id_auto).
- **Team RPCs (all resolve uid→id_auto, check director/captain/player_id):** `create_team`, `invite_team_partner`, `respond_to_team_invite`, `cancel_team_partner`, `cancel_team`, `td_create_team`, `td_add_team_member`, `set_team_side_pots`, `get_tournament_team_roster`, plus the chain across `20260709140000`–`20260713180000` (join-by-token, approvals, TD actions, check-in/paid).

### A.8 Direct FKs to `auth.users` (only 3, all SMS, all ACCOUNT-SCOPED)
`sms_consent_events.user_id`, `sms_messages.user_id`, `sms_verification_attempts.user_id` (uuid → `auth.users(id)`).

### A.9 Triggers / views
- **No views** in the tracked migrations (live-DB views can't be seen from the repo — needs a schema dump). ⚠️
- Triggers: `venue_staging_updated_at` (irrelevant); `profiles_guard_phone` (`20260729120000:150`) guards phone-verification columns on `profiles` (auth-scoped boundary; unaffected).

---

## B. TypeScript / app inventory

### B.1 Competitor identity = `profile.id_auto` (bigint) everywhere
- **Registration:** `registration.service.ts` reads `profiles:player_id (id_auto, …)` (L43,121) and keys `getPlayerRegistrations/History` on `player_id` (L67-138). TD `handleAddPlayer` inserts `player_id: profile.id_auto` (`manage-tournament/[id].tsx:3054`); dedupe on `r.player_id === profile.id_auto` (3041). `handleAddGuest` inserts `guest_name` only (3066-3080). `useSelfRegistration` inserts `player_id: playerId`, called with `profile?.id_auto` (`TournamentDetailModal.tsx:46`).
- **Chip:** `chip.service.ts` maps `p1_profile_id↔p1ProfileId` etc. (L37-85); `regToEntry` sets `p1ProfileId: r.player_id` (L106); dedupe `Set<number>` of id_auto (L334-365); `saveResults`/`loadResults` write/read `p1_profile_id`/`p2_profile_id` (L517-539). `chip-manage.screen.tsx` uses `addFargo.player.id_auto` for entries/teams (L1343-1348) and `actorId = profile?.id_auto` (L321). `use.player.chip.tournament.ts` matches viewer by `e.p1ProfileId === playerId` (L127), called with `storeProfile?.id_auto`.
- **History / performance:** `use.profile.tournaments.ts` (`useProfileTournaments(playerId: number)`), `player.performance.ts` — all keyed on id_auto; `profile.tsx` passes `storeProfile?.id_auto` to every player-keyed hook (L199-203,509). Bracket match winner is positional `winner: 1|2` (not an id).
- **Teams:** `team.service.ts` joins `profiles:player_id/captain_id (id_auto,…)`, filters `.eq("player_id", playerId)`; RPC args `p_captain_player_id`, `p_player_id`. Types: `TeamMember.player_id: number|null`, `TournamentTeam.captain_id: number` — commented "profiles.id_auto".

### B.2 Auth plumbing (uuid vs bigint)
- `AuthProvider.tsx` — identity is auth **uuid**: hydrates via `get_auth_session` (returns full `Profile` incl. both `id` and `id_auto`); `fallbackFetchProfile`/`pingLastActive`/push tokens/`signOut` all key on `user.id` (uuid).
- `auth.store.ts` holds the full `Profile`; **`id_auto` is a column on it** — the current user's competitor id is just `profile.id_auto`, never fetched separately.
- **uuid call sites:** profile CRUD, `last_active_at`, push tokens. **bigint call sites:** favorites, registrations, chip, teams, history, notifications `user_id` filter, venue ownership.

### B.3 Player search
- `profile.service.ts:searchProfiles` → `.select("*").or(name.ilike, user_name.ilike).eq("status","active")` — **does not search email**, excludes non-active. `use.player.search.ts` (debounced) returns full `Profile[]`; consumers read `.id_auto`. Other lookups: `getProfile(uuid)`, `getProfileByIdAuto(bigint)`, `getProfileByUsername`.

### B.4 Types carrying ids
`Profile.id: string` / `id_auto: number` / `email: string`; `ProfileUpdate` has **no email** (email is effectively immutable client-side, always mirrors `auth.users.email`). `Registration.player_id: number|null`. `ChipEntry.p1ProfileId/p2ProfileId: number|null`. Auth-scoped ids are uuid strings (`PushToken.user_id`, `NotificationPreferences.user_id`, sms `user_id`).

### B.5 Email handling
- **No client-side normalization anywhere.** Register validates only `email.includes("@")`; sign-up sends the raw typed email but the profile is written from the **auth-canonical** `authData.user.email!`. Login `.trim()`s but doesn't lowercase. Outbound email helpers don't normalize.

---

## Classification (every reference)

### 1. COMPETITOR → eventually `players.id`
`tournament_players.player_id`, `tournament_team_members.player_id`, `tournament_teams.captain_id`, `chip_entries.p1/p2_profile_id`, `chip_results.p1/p2_profile_id`; **indirect:** bracket `registrationId` (= `tournament_players.id`), chip per-entry stats.

### 2. ACTOR → stays on `profiles` / auth
`tournaments.director_id/cancelled_by/archived_by`, `venue_owners.owner_id/assigned_by/archived_by`, `venue_directors.director_id/assigned_by/archived_by`, `venues.archived_by`, `venue_audits.owner_id`, `giveaways.created_by/winner_drawn_by`, `giveaway_draws.*`, `giveaway_winner_history.*`, `tournament_templates.director_id/archived_by/user_id`, `audit_log.user_id`, `reassignment_logs.*`, `support_tickets.assigned_to/resolved_by`, `chip_events.actor_id`, `profiles.fargo_verified_by`, `conversations.created_by`.

### 3. ACCOUNT-SCOPED → stays on `profiles` / auth
`favorites`, `saved_searches`, `search_alerts`, `notification_preferences`, `push_tokens`, `conversations`/`conversation_*`, `messages`/`message_*`, `notification*`, `reports`, `support_tickets.user_id`, `giveaway_entries`, `tournament_settings_templates`, all `sms_*`.

### 4. AMBIGUOUS / DUAL-PURPOSE (RESOLVED per decisions)
| Table.column | Current FK | Use today | Resolved future ref | Risk |
|---|---|---|---|---|
| `tournament_teams.captain_id` | profiles(id_auto) | Captain is a **competitor** (confirmed: also inserted as a `tournament_team_members` `role='captain'` row) **and** the account that manages the team | **SPLIT** → `captain_player_id uuid → players(id)` (competitor) **+** new `managed_by_profile_id uuid → profiles(id)` (administrative owner) | Team RPCs authorize the captain as caller — the *manage* check moves to `managed_by_profile_id`; the *competitor* identity moves to `captain_player_id` |
| `chip_events.actor_id` / `ChipEvent.by` | none (id_auto) | The **TD who performed** a chip action | **Stays profiles/auth (ACTOR)** — TS audit lumped this into "re-point to player_id"; it should **not** migrate | Mis-migrating breaks the actor audit trail |
| `profiles.fargo_verified_by` | none (id_auto) | The **TD who verified** a fargo | **Stays profiles/auth (ACTOR)** | Same as above |
| `notifications.user_id` | profiles(id_auto) | Typed `uuid` in `notification.types.ts` but **queried with `id_auto`** (`notifications.tsx:303,382`) | **ACCOUNT-SCOPED → reconcile to one id** (recommend auth uid); **not** a players target | Pre-existing inconsistency; fixing touches notification reads |
| `submit_match_state` participant branch | — | Authorizes caller as director (ACTOR) **or** participant (COMPETITOR) | Participant branch → **`players`** | Central authz; must flip with the column |
| `tournament_players.player_id` / `tournament_team_members.player_id` = NULL + `guest_name` | — | Anonymous guest / temp partner (no account) | Pending **player** row (activatable) supersedes; keep `guest_name` only for truly anonymous one-offs | Two "no-account" mechanisms during transition |

---

## C. RLS & permission impact

- **Unchanged (auth-ownership policies):** all `sms_*`, `push_tokens`, `favorites`, `saved_searches`, `notification_preferences`, `tournament_settings_templates`, conversations/messages/reports. These key on `auth.uid()` / `profiles.id` and are ACCOUNT-SCOPED.
- **Must learn `profiles → players` (tournament-management):** `submit_match_state` (participant branch), `ttm_read`, all team RPCs, `is_chip_manager`-gated chip writes. The universal change is the caller resolver:
  - **Today:** `caller_id_auto := (select id_auto from profiles where id = auth.uid())`, then compare to `player_id`/`captain_id`.
  - **After:** `caller_player_id := (select id from players where user_id = auth.uid())`, then compare to the new `player_id` columns. (Director/ACTOR checks are unaffected — they stay on id_auto/profiles.)
- **Creating Pending Accounts safely (TD / Bar Owner / Compete Admin / Master Admin):**
  - A `SECURITY DEFINER` RPC `create_pending_player(...)` is the **only** write path (no direct client `insert` on `players`). It checks the caller's role, and for TD/Bar Owner additionally checks they manage the target tournament (reuse `is_chip_manager` / `director_id` / venue-director checks). Normal players (`basic_user`) are rejected.
  - A new permission `CREATE_PENDING_ACCOUNT: [TOURNAMENT_DIRECTOR, BAR_OWNER, COMPETE_ADMIN, SUPER_ADMIN]` in `src/permissions/permissions.ts` gates the UI; the RPC is the real enforcement.
  - **TD/Bar Owner update RPC whitelists contact columns only** (`first_name/last_name/display_name/email/phone`). Status transitions, `user_id` linking, and role changes are **never** exposed to them.
- **Pending accounts can't log in — structurally:** they have **no `auth.users` row**, so there is nothing to authenticate. Activation creates the auth user **only after** the invitee verifies email ownership. TDs never set a password. This satisfies "cannot log in until activation" by construction (no synthetic auth user).

---

## D. Staged migration (additive, reversible per phase)

**Phase 1 — Structures, no behavior change.** Create `players` (`id uuid pk default gen_random_uuid()`, `display_name`, `first_name`, `last_name`, `email citext/text`, `phone`, `status text check in (PENDING,ACTIVE,DISABLED)`, `user_id uuid null references auth.users(id)`, `created_by_user_id uuid`, `created_by_role text`, `created_at`, `updated_at`). Add `unique index on lower(email)` **deferred to after Phase 2 validation**. Create `player_invitations` (activation token, sent_at, expires_at, accepted_at) for the invite/resend flow. RLS: no direct writes; reads gated to TD+/admin (privacy — emails). Nothing else references `players` yet.

**Phase 2 — Backfill players from profiles.** Insert one `players` row per **ALL** `profiles` rows (no exclusions — see §E.0): `profile_id = profiles.id`, `account_status` per the **LOCKED status mapping** in §E.0 (ACTIVE if live; DISABLED if `deleted_at`/`is_disabled`/non-active `status`), `activated_at = created_at`, `display_name = profiles.name`, names/email/`email_normalized`/phone copied, `created_by_* = null` (system). **Validation gate:** run the F.3 duplicate/malformed-email pre-check (case-only dupes, whitespace, blank strings, multiple profiles sharing an email) *before* adding the partial unique index; resolve any conflicts first. Then add `unique (email_normalized) where email_normalized is not null`.

**Phase 3 — Add nullable `player_id uuid` to the 7 competitor columns' tables; backfill.** For each of `tournament_players`, `tournament_team_members`, `tournament_teams`, `chip_entries` (×2), `chip_results` (×2), add `..._player_id uuid references players(id)` and backfill from the old id_auto value via `old_id_auto → profiles.id_auto → profiles.id → players.user_id → players.id`. Guests/temp partners (null id_auto) stay null. **Both columns coexist** — no reads change yet.

**Phase 4 — Flip reads/writes to `player_id`; keep old columns dual-written.** Update the app (services/hooks/screens) and the RPCs in A.7 to read/write `player_id`, while **continuing to also write the legacy id_auto column** for rollback safety. Update the caller resolver in every tournament-management RPC (C). This is the highest-risk phase — column flip and authz flip must land together per RPC.

**Phase 5 — Pending Account create / dedup / search / invite / activate** (see E).

**Phase 6 — Validation.** Exercise every tournament format (elimination bracket, chip, teams/scotch), match-ready SMS lookup, standings/`chip_results`, profile history/performance, and full pending→activation. Confirm no second competitive record on activation, and history continuity.

**Phase 7 — Retire legacy.** Only after Phase 6 sign-off: stop dual-writing, drop the obsolete competitor id_auto columns (`tournament_players.player_id` bigint etc.), leaving `players.id`. ACTOR/ACCOUNT-SCOPED id_auto references remain untouched.

---

## E.0 Finalized `players` + `player_invitations` schema (Phase 1)

**`public.players`** (uuid PK; every row is a competitive identity; guests are NOT stored here):
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK default `gen_random_uuid()` | competitor identity |
| `display_name` | `text not null` | backfill = `profiles.name`; pending = `first + last` |
| `first_name` | `text` | required for pending |
| `last_name` | `text` | required for pending |
| `email` | `text` | **as entered — UNVERIFIED**; nullable (see rule below) |
| `email_normalized` | `text` | `lower(trim(email))`; **dedup key**; nullable |
| `phone_e164` | `text` | nullable, normalized; **UNVERIFIED** |
| `account_status` | `text not null default 'PENDING'` | check in `('PENDING','ACTIVE','DISABLED')` (or an enum — confirm from dump) |
| `profile_id` | `uuid references profiles(id)` | nullable; set on activation; **UNIQUE** (1 profile ↔ 1 player) |
| `created_by_profile_id` | `uuid references profiles(id)` | actor who created a pending account (null for system backfill). **Creator role NOT stored** — derived from the profile; point-in-time audit goes to `audit_log` |
| `invited_at` | `timestamptz` | first activation invite sent |
| `activated_at` | `timestamptz` | when linked to a profile |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | |

Email/uniqueness rules:
- **Pending players must have a non-null `email_normalized`** → `check (account_status <> 'PENDING' or email_normalized is not null)`.
- Active players copy the authenticated email when available. **Null email stays allowed** for legacy active players (guests never live in `players`).
- Dedup index is **partial**: `unique (email_normalized) where email_normalized is not null` — added **after** the Phase-2 duplicate/malformed-email validation gate.
- `unique (profile_id) where profile_id is not null`.

Backfill rows: **one player per profile (ALL profiles)**; `profile_id` set, `email`/`email_normalized` from `profiles.email`, `activated_at = created_at`, `created_by_* = null`.

**Status mapping (LOCKED):**
- `account_status = 'ACTIVE'` when the profile is live: `deleted_at IS NULL AND is_disabled = false AND status = 'active'`.
- `account_status = 'DISABLED'` when the profile is disabled, inactive, or soft-deleted: `deleted_at IS NOT NULL OR is_disabled = true OR status <> 'active'`.
- No profile becomes `PENDING` via backfill (PENDING is reserved for TD/Admin-created pending accounts).

**System/service-account exclusion — RESOLVED:** No reliable identifier exists (no allowlist, no SYSTEM/SERVICE role, no `is_system` flag, no exclusive domain). Backfill covers **ALL existing profiles**, with **no exclusions** on role, activity, history, missing phone, unverified email, or name. **Q5 result: 8 possible test/review accounts surfaced — decision is to backfill all 8 as `ACTIVE` (all currently active); do not auto-exclude, merge, delete, or disable them.** Any clearly non-human account found later is **listed for approval before any exclusion** — never dropped silently.

**`public.player_invitations`** (**APPEND-ONLY** history; rate-limited resend):
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `player_id` | `uuid not null references players(id) on delete cascade` | |
| `email_normalized` | `text not null` | target snapshot |
| `token_hash` | `text not null` | **hash** of the token, never the raw token; `unique` |
| `sent_at` | `timestamptz not null default now()` | row creation = send time |
| `expires_at` | `timestamptz not null` | `check (expires_at > sent_at)` |
| `accepted_at` | `timestamptz` | set once on activation (terminal) |
| `superseded_at` | `timestamptz` | set when a newer invite replaces this one (terminal) |
| `created_by_profile_id` | `uuid references profiles(id)` | |
| `updated_at` | `timestamptz not null default now()` | trigger-maintained |

**Model: append-only.** Each send/resend inserts a new row (full audit trail; mirrors `sms_verification_attempts`). A resend **supersedes** the current live row then inserts a new one. A **partial unique index** `(player_id) where accepted_at is null and superseded_at is null` guarantees **at most one live invite (one valid token) per player**. Resend is gated by a rate-limit RPC mirroring `reserve_sms_verification_attempt` (advisory lock + cooldown/caps).

## E. Pending Account design (Phase 5 detail, mapping every requirement)

- **Who can create:** `create_pending_player` RPC gated to TD / Bar Owner / Compete Admin / Master Admin. **TD & Bar Owner only within tournaments they manage** (director/venue check inside the RPC). ✔
- **Required input:** `first_name`, `last_name`, `email` required; `phone` optional. ✔
- **Email normalization:** server-side `lower(trim(email))` before any search or write (client also normalizes for display, but the RPC is authoritative). ✔
- **Search-before-create (exact normalized email):**
  - Matches an **ACTIVE** player → return it (reuse, select existing). ✔
  - Matches a **PENDING** player → return it (reuse). ✔
  - **Conflict** (e.g. an email that maps to more than one record, or a DISABLED/edge case) → do **not** create; return a "flagged for admin review" result. ✔
  - Enforced structurally by the `unique(lower(email))` index — a duplicate insert cannot succeed. ✔
- **No auth user / cannot log in:** pending player has `profile_id = null`, no `auth.users` row. ✔
- **Starting state:** `account_status = 'PENDING'`, `profile_id = null`, `created_by_profile_id = auth.uid()`, `created_by_role = <caller role>`, `invited_at = now()` (on first invite). ✔
- **History attaches to `players.id`:** all competitor columns reference `players.id`, so a pending player accrues history immediately. ✔
- **Invitation:** one activation email sent **once on creation**. Token is **secure-random, expiring, single-use**, and only its **hash** is stored (`player_invitations.token_hash`). A **rate-limited Resend Invite** RPC (advisory lock + cooldown/caps) is the only way to re-send. **Adding the same pending player to another tournament does NOT re-send the invite.** **No auth user or profile is created until the recipient activates.** On activation the token is invalidated (`accepted_at` set). ✔
- **Activation (links, never duplicates):** invitee follows the emailed link → Supabase auth sign-up + **email-ownership verification**. On verified email, a `SECURITY DEFINER` activation function: (a) creates/uses the authenticated `profiles` row (`id = auth.uid()`), (b) sets `players.profile_id = auth.uid()`, `account_status = 'ACTIVE'`, `activated_at = now()` on the **existing** matched-by-`email_normalized` player. **No second competitive record; no separate Claim History step.** ✔
- **TD/Bar Owner edits:** contact-info-only update RPC before activation (`first/last/display_name/email/phone` — re-normalizes `email_normalized`); they can **never** mark ACTIVE, set `profile_id`, verify email/phone, set passwords, or link to an arbitrary user. ✔

## E.3 Guest Player vs Pending Account (kept strictly separate)

| | **Guest Player** | **Pending Account** |
|---|---|---|
| Storage | `tournament_players.guest_name` (or team member snapshot), **no `players` row** | a real `players` row (`account_status='PENDING'`) |
| Email | not required / not collected | **required** |
| First/last name | name only | **both required** |
| Reusable across tournaments | no | yes (searchable by `email_normalized`) |
| Activation invite | none | one on creation + rate-limited resend |
| Account linking | never | links to a profile on activation |
| Accumulates history | only within that one event (no cross-event identity) | yes, on `players.id` |

**No silent conversion.** A name-only guest is never auto-upgraded. Upgrading requires an **authorized user to explicitly add the required email** and create/attach a Pending Account (find-or-create by `email_normalized`, then set that roster row's `player_id`). The Pending Account path is the **preferred** flow when an email can be collected.

---

## F. Live schema export procedure (run this before any DDL)

Goal: capture the authoritative live schema — tables/columns, constraints, FKs, indexes, views, functions, triggers, RLS policies, and grants — so it can be diffed against this audit before Phase 2/3 DDL is written. **Schema only, no table data.**

### F.1 Primary — `pg_dump --schema-only` (captures everything above in one file)
Get the **direct** connection URI from the Supabase dashboard: *Project Settings → Database → Connection string → URI* (port `5432`). Then:

```bash
pg_dump \
  "postgresql://postgres:[YOUR-DB-PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --schema-only \
  --schema=public \
  --no-owner \
  --file=compete_public_schema.sql
```

Notes:
- **Keep grants:** do **not** pass `--no-privileges` (we want `GRANT`/RLS). `--no-owner` only strips ownership noise; `GRANT` and `CREATE POLICY` statements are still emitted.
- RLS policies, triggers, functions, views, indexes, constraints, and FKs are **all** included by a schema-only dump.
- **Version match:** use a `pg_dump` whose major version ≥ the server (Supabase is PostgreSQL 15/17). If you get a version-mismatch error, use the Supabase CLI (F.2), which bundles a matching `pg_dump`.
- To also confirm the `auth.users` shape behind the FKs, add `--schema=auth` (optional).

### F.2 Alternative — Supabase CLI (handles the pg_dump version for you)
```bash
supabase link --project-ref [PROJECT_REF]
supabase db dump --schema public --file compete_public_schema.sql
```
If this variant omits `GRANT`s or policies in your CLI version, supplement with the catalog queries in F.3.

### F.3 Verification queries (paste results back — cross-check, and a fallback if pg_dump is unavailable)
Run in the SQL editor; each targets one item on your list:

```sql
-- RLS policies
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname='public' order by tablename, policyname;

-- Grants
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' order by table_name, grantee;

-- Foreign keys (child -> parent, with columns)
select tc.table_name, kcu.column_name, ccu.table_name as ref_table, ccu.column_name as ref_column, tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name
where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
order by tc.table_name, kcu.column_name;

-- Functions (incl. SECURITY DEFINER flag + language)
select p.proname, pg_get_function_identity_arguments(p.oid) as args, l.lanname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_language l on l.oid=p.prolang
where n.nspname='public' order by p.proname;

-- Triggers
select event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers where trigger_schema='public'
order by event_object_table, trigger_name;

-- Views
select table_name from information_schema.views where table_schema='public' order by table_name;

-- Full columns for the base tables not in the migration ledger
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name in ('profiles','tournament_players','tournaments','favorites','venue_owners','venue_directors')
order by table_name, ordinal_position;

-- Existing email uniqueness on profiles? (confirms the dedup assumption)
select indexname, indexdef from pg_indexes
where schemaname='public' and tablename='profiles' and indexdef ilike '%email%';

-- Duplicate-email pre-check for the players unique index (Phase-2 gate)
select lower(trim(email)) as e, count(*) from public.profiles
group by 1 having count(*) > 1;
```

### F.4 Safety
- The dump is **schema-only** (no rows), so it contains no user data — safe to share.
- **Do not paste the DB password** anywhere when sharing the command you ran; redact it.
- After I diff the dump against this audit and confirm no surprises (extra views/functions/columns, existing email constraints, base-table definitions), we proceed to Phase 1 DDL.

### F.5 Live-schema comparison checklist (run when the dump + query results arrive)
Object coverage — confirm each is captured **and inspected** (not just present):
- [ ] tables + columns, incl. **generated columns** and defaults
- [ ] constraints (PK / unique / check)
- [ ] **foreign keys** — full child→parent map; reconcile against the 52-FK repo map (10 → `id`, 42 → `id_auto`)
- [ ] **indexes**, incl. **partial** and **expression** indexes (any `lower(email)`?)
- [ ] **views** and **materialized views**
- [ ] **functions / RPCs** — full **source bodies** + `SECURITY DEFINER` flags
- [ ] **triggers**
- [ ] **RLS policies** (`pg_policies`)
- [ ] **grants** (`role_table_grants`)
- [ ] **sequences**
- [ ] **enum types** — is `account_status` / `role` an enum or `text`?

Specific reconciliations vs. this audit:
- [ ] Real base `CREATE TABLE profiles` — every column; esp. `email` (nullable? unique? `citext`?), the `id_auto` sequence, `status`/`role` types.
- [ ] Real base `tournament_players` — its **RLS**, and whether a `player_id = caller id_auto` self-check exists (see §G.2 — this is the biggest untracked unknown).
- [ ] Grep the **dumped function bodies** for `id_auto` — catch raw / dynamic-SQL comparisons the FK map can't see.
- [ ] Existing email constraints/indexes on `profiles`.
- [ ] Duplicate/malformed emails: case-only dupes, leading/trailing whitespace, blank strings, multiple profiles sharing an email (F.3 pre-check).
- [ ] Untracked functions/policies absent from the migration ledger.
- [ ] A reliable **system/service-account identifier** (allowlist UUIDs / emails / a SYSTEM role / `is_system` flag / reserved email domain) — or confirm none exists → backfill **all** profiles and document that no exclusions applied.

---

## G. Authorization cutover inventory (every competitor `id_auto` comparison)

The single check to replace, everywhere a **competitor** is authorized:
- **OLD:** `<competitor_col> = (select id_auto from public.profiles where id = auth.uid())`
- **NEW:** `<new player_id col> = (select id from public.players where profile_id = auth.uid())`
- Pending players (`profile_id = null`) can never satisfy this — which is correct (they can't log in). Actor/director checks are **unchanged** (they stay on `id_auto`/profiles).

### G.1 In-repo competitor-comparison sites (flip in the SAME phase as the column)
**Database:**
- `submit_match_state` (`20260607120000:42,59-60`) — participant branch `tournament_players.player_id = v_uid`. *(Director branch = ACTOR, leave.)*
- `tournament_teams` RLS `ttm_read` (`20260709130000:74,78`) — `player_id = caller` and `captain_id = caller`.
- `_team_caller()` (`20260709130000:94`) and every team RPC comparing `captain_id`/`player_id` to the caller: create/respond/cancel (`20260709130000`), partner self-entry (`20260709140000`), invite-token/join (`20260709160000` / `170000` / join-by-token), TD actions (`20260709190000:25,60`), roster rpc (`20260709210000:32`), approved (`20260713130000:19`), edit actions (`20260713150000:21,39`), td_team_build (`20260713160000:21,56`), side pots (`20260713170000:24`), check-in/paid (`20260713180000:24,41`), invite-captain-fargo (`20260709200000`).

**Explicitly NOT competitor (leave as id_auto/actor):** `is_chip_manager` (director/role — so **all chip writes are actor-gated; chip competitor columns are data, not authz**), `settings_templates` policies (own templates = account-scoped), `fargo_verification` caller (actor), venue/storage `super_admin` role checks, all `sms_*` (auth uid).

**App layer (client — not a security boundary, but must switch to `player_id` for correctness):**
- `use.player.chip.tournament.ts:127` `e.p1ProfileId === playerId`.
- `manage-tournament/[id].tsx:3041` `r.player_id === profile.id_auto` (dedupe).
- self-registration insert `player_id: profile.id_auto`; every `storeProfile?.id_auto` hook arg (favorites/history/performance/live/chip).

### G.2 Untracked base-schema authz — RESOLVED from the live dump (see §H)
- **`tournament_players` RLS: CONFIRMED as competitor-authz.** Three policies compare `player_id = (select id_auto from public.profiles where id = auth.uid())` (OR a TD/director check): INSERT `"Player self-register or TD adds players"`, UPDATE `"Player updates own or TD updates any"`, DELETE `"Player deletes own or TD deletes any"`. Plus public read `"Anyone can read tournament players"` USING(true). **→ added to the cutover set (§G.1).**
- No other base-table competitor `id_auto` comparison found; `delete_user_account()` and the venue/giveaway functions operate on ACTOR/ACCOUNT-SCOPED id_auto only (they never touch `tournament_players`/`chip`/`teams`).

---

## H. Live-schema comparison results (`compete_public_schema.sql` — PG 17.6, schema-only, `public`)

**Verdict: the repo audit matches the live schema. No contradictions; every §G.2 unknown resolved.** Inventory: 60 tables, 159 policies, 48 functions (bodies present), 6 triggers, 31 sequences, **0 views/matviews, 0 enum types** (so `account_status`/`role` are plain `text`).

**Confirmed base definitions:**
- `profiles`: `id uuid` PK → **FK `profiles_id_fkey REFERENCES auth.users(id)`**; `id_auto bigint` GENERATED ALWAYS AS IDENTITY, UNIQUE; **`email text NOT NULL` UNIQUE (`profiles_email_key`, case-SENSITIVE)** + plain `idx_profiles_email`; `role`/`status` `text` + CHECK (roles = the 5; status = active/suspended/banned/deleted); **no `account_status`/`email_verified_at`**.
- `tournament_players`: `id integer` identity (= bracket registrationId); `player_id integer` FK→`profiles(id_auto)` ON DELETE SET NULL; CHECK `player_id IS NOT NULL OR guest_name IS NOT NULL`; UNIQUE `(tournament_id, player_id) WHERE player_id IS NOT NULL`.
- Competitor column types: `tournament_players.player_id` **integer**; `tournament_team_members.player_id` **bigint** (FK→id_auto SET NULL); `tournament_teams.captain_id` **bigint** (FK→id_auto **ON DELETE CASCADE**); `chip_entries.p1/p2_profile_id` **bigint, no FK**; `chip_results.p1/p2_profile_id` **bigint, no FK**. (Pre-existing integer/bigint inconsistency; the new `uuid` columns sidestep it.)

**Three deltas the earlier audit lacked (now folded in):**
1. **`tournament_players` 3 competitor-authz policies** (INSERT/UPDATE/DELETE) — added to §G.1/§G.2.
2. **`tournament_teams.captain_id` FK is ON DELETE CASCADE** — deleting a profile deletes its captained teams. When `captain_id → players`, the delete semantics change (a pending captain has no profile). Reconsider in Phase 3.
3. **Trigger `on_profile_created_create_notif_prefs`** (AFTER INSERT on `profiles`) auto-creates `notification_preferences`. On activation, creating the profile auto-creates prefs; the activation function must *additionally* link the existing player (no trigger does that). `delete_user_account()` deletes only account-scoped rows — competitive history already survives account deletion (aligns with our model).

**Gaps not in this dump (still required):**
- **Data-level facts** — duplicate/malformed emails, row counts, orphan refs, soft-deleted profiles. Schema-only ⇒ no rows ⇒ run the §F.3-plus data queries (delivered to you separately).
- **`--schema=public` excluded `auth`/`storage`/`graphql`.** Storage RLS (e.g. `venue_flyers` super-admin checks) isn't captured — role-based (actor), low risk, noted.

---

## I. Pre-migration risk report (data-validated) + updated plan

### I.1 Data validation (Q1–Q5, live DB)
| Check | Result | Implication |
|---|---|---|
| Q1 duplicate normalized email | **0** (provable: `UNIQUE(email)` + Q2 shows all-lowercase/no-whitespace) | Partial unique index on `lower(email)` applies with **zero conflicts** |
| Q2 malformed email | **0** null / blank / whitespace / no-`@` / uppercase (of 110) | Emails are pristine; `email_normalized = email` for every backfilled row |
| Q3 profiles | **110 total; 0 soft-deleted, 0 disabled, 0 non-active** | **All 110 → ACTIVE players.** No DISABLED rows produced now (mapping kept for future) |
| Q3 tournament_players | **94 total; 16 real, 78 guest-only** | Only **16** get a backfilled `player_id`; **78 guests stay name-only** (untouched) |
| Q3 team members / teams | **20 members (0 null), 10 teams** | All 20 members + 10 captains map cleanly |
| Q3 chip | **10 entries, 0 results** | 10 chip entries to map; no `chip_results` rows yet |
| Q4 orphaned competitor refs | **0 across all 7 columns** | Backfill mapping `id_auto → profile → player` is **100% clean** |
| Q5 possible non-human | 8 test/review accounts, all active | Backfilled as ACTIVE (locked); none excluded |

### I.2 Risk assessment
- **Data-integrity risk: effectively eliminated.** No duplicate/malformed emails, no orphans, no null-player team members, all profiles active. Phase 2/3 backfills are deterministic with nothing to clean first.
- **Backfill volume is tiny:** 110 players; new-column backfill = 16 (tp) + 20 (ttm) + 10 (captains) + ~10 (chip entry p1/p2) + 0 (chip_results). Fast, easily verified row-for-row.
- **#1 remaining risk = authorization cutover (code, not data)** — the §G set: the 3 `tournament_players` policies, `submit_match_state` participant branch, `ttm_read`, and the team RPCs. Column flip + authz flip must land together per object (Phase 4).
- **Guest reality (78/94):** most registrations are name-only guests — this *validates* the Pending Accounts feature. Guests are **not** touched by the migration; they remain until an authorized user explicitly upgrades one (adds email → pending player).
- **Secondary items:** `tournament_teams.captain_id` FK is `ON DELETE CASCADE` (revisit when adding `captain_player_id`); `tournament_players.player_id` is `integer` vs `id_auto` `bigint` (the new `uuid` columns sidestep it); the `on_profile_created_create_notif_prefs` trigger must be complemented by player-linking in the activation function.

### I.3 Go / no-go
**GO for Phase 1.** The data review surfaced **no blockers** — no email conflicts, no orphans, no disabled/deleted edge cases in scope. The migration is additive, low-volume, and the only real complexity is the authorization cutover, which is isolated to §G and staged for Phase 4.

### I.4 Updated staged plan (with validated numbers)
- **Phase 1 — ✅ APPLIED** (`20260731120000_players_pending_accounts.sql`, pushed via `supabase db push`; recorded remote). Created `players` (§E.0) + `player_invitations`, both RLS-enabled with no policies and `service_role`-only grants. No competitor table touched.
- **Phase 2 — ✅ APPLIED & verified** — `20260801120000_backfill_players_from_profiles.sql` pushed; recorded remote. Backfilled **110** players (all ACTIVE), 1:1 with profiles. Verified: 110 linked, 0 missing, 0 dup `profile_id`, 0 dup normalized email, 0 orphans (Q4–Q7 all matched).
- **Phase 3 — ✅ APPLIED & verified** — `20260802120000_add_player_uuid_columns.sql`. Added 7 nullable uuid cols + 7 FKs (SET NULL) + 9 indexes. Backfilled tp=16, ttm=20, teams=10, chip_e p1=10/p2=10, chip_results=0; 78 tp guests NULL. QV1–QV6 all matched: columns uuid/nullable, backfill == legacy counts, 0 round-trip mismatches, FKs/indexes present, legacy cols untouched. **`managed_by_profile_id` DEFERRED**. New cols NOT yet authoritative — authz cutover is Phase 4.
- **Phase 4** — Flip reads/writes + the §G authorization checks to `players`, dual-writing legacy `id_auto`. Highest-risk phase; validate per format.
- **Phase 5** — Pending Account create / dedup / search / invite / activate (§E).
- **Phase 6** — Validate every format (bracket, chip, teams), match-ready SMS, history/standings, and full pending→activation (no second competitive record).
- **Phase 7** — Drop legacy competitor `id_auto` columns after sign-off.

---

## J. Forward-compatibility audit (Phase 1 tables)

**Verdict: the Phase 1 schema supports every listed future direction with NO redesign of `players`/`player_invitations`.** The properties that make this hold:
- **`players.id` is an immutable uuid that survives activation** (linking `profile_id` never changes `id`) → all history/earnings/stats/rankings attach once and never move.
- **`players` is pure, sport-agnostic identity** → per-sport ratings/rankings/stats live in satellite tables keyed on `players.id`.
- **`profile_id` nullable + `ON DELETE SET NULL`** → deletion and re-linking work without losing the competitive record.
- **Auth-scoped concerns (notifications) stay on `profiles`** → correctly separated from competitive identity.

| Future capability | Supported? | Notes |
|---|---|---|
| Player earnings/history | ✅ as-is | Satellite tables FK `players.id`; survives activation |
| Multiple sports | ✅ as-is | `players` is sport-neutral; per-sport data in satellite tables |
| Team memberships | ✅ as-is | M:N via `tournament_team_members.player_id` (Phase 3); nothing on `players` constrains it |
| Player merges/dedup | ✅ + additive later | Re-point FKs to survivor; add `merged_into_player_id` + `'MERGED'` status (check-constraint edit) and **tombstone, never hard-delete**. Not a redesign |
| Profile deletion/re-linking | ✅ as-is | `ON DELETE SET NULL` keeps the player; re-link sets `profile_id` again (partial unique allows it). Deletion flow should also flip `account_status` → DISABLED |
| Notification history | ✅ as-is | Account-scoped → stays on `profiles`; pending players get email invites, not in-app notifications |
| SMS activation | ✅ + additive later | `token_hash`/expiry/single-use are channel-agnostic; add a `channel`/`phone_e164` column to `player_invitations` for SMS delivery. `email_normalized` stays NOT NULL because pending accounts always have an email |
| Email activation | ✅ as-is | The primary designed flow |
| Statistics | ✅ as-is | Derived/satellite tables keyed on `players.id` |
| Rankings | ✅ as-is | Satellite ranking tables keyed on `players.id` (per-sport/region/period) |
| Fargo synchronization | ✅ + additive later | Recommend a satellite `player_ratings` table keyed on `players.id` (multi-rating/multi-sport friendly) so pending players can carry a Fargo pre-activation; or additive columns on `players`. Not a redesign |

**Additive extensions to expect later (all non-breaking, none touch Phase 1 shape):** merge-tracking (`merged_into_player_id` + `MERGED` status), an activation `channel` on invitations, and a `player_ratings` satellite. **Standing rule: never hard-delete a `players` row** (history FKs depend on it) — DISABLE/MERGE/tombstone instead.

---

## K. Phase 4 — Authorization cutover implementation plan (PROPOSAL — no code written)

> **Status: Phase 4A ✅ APPLIED & FULLY verified** — `supabase/migrations/20260803120000_phase4a_player_resolver_and_sync.sql`. Added `current_player_id()` + `map_id_auto_to_player()` (STABLE SECURITY DEFINER), 5 sync trigger functions + triggers, catch-up backfill. QV1–QV4 passed (helpers DEFINER/STABLE/uuid; 5 triggers BEFORE INSERT+UPDATE; 0 unsynced; policy_count=10 unchanged, tp_legacy=16). Conflict-case test passed all 5 checks (fill / re-sync / clear-on-null / reject-conflict), rolled back. Approved "changed-this-statement" semantics. **No RLS/RPC/app change.** 4B/4C NOT started — awaiting explicit approval.

**Core strategy (de-risks the whole phase):** rather than a hard, simultaneous SQL+app flip, use (a) **BEFORE-INSERT/UPDATE triggers** that auto-populate each new `*_player_id` from its legacy `id_auto` column — so "dual-write" is automatic and server-side, no app write changes required; and (b) **transitional "accept-either" authz** that passes if EITHER the legacy `id_auto` OR the new `player_uuid` basis matches. Result: the SQL authz cutover and the app migration **do not have to deploy together**, and rollback is trivial (legacy columns stay populated the whole time). The hard tightening (drop the id_auto branch) happens in Phase 7.

### K.1 Resolver (part 5)
`auth.uid() → profiles.id → players.profile_id → players.id`, centralized in a new SECURITY DEFINER helper:
```
current_player_id() := (select id from public.players where profile_id = auth.uid())
```
A logged-in user always has an ACTIVE player with `profile_id = auth.uid()` (Phase 2 guarantee), so this resolves for every possible *caller*. Returns NULL for anyone without a profile — which is correct, since only authenticated users can be callers.

### K.2 Database authorization sites that change (part 1)
| Site | Type | Current (COMPETITOR branch) | After cutover |
|---|---|---|---|
| `"Player self-register or TD adds players"` | tournament_players INSERT policy | `player_id = caller_id_auto` | + `OR player_uuid = current_player_id()` (accept-either) |
| `"Player updates own or TD updates any"` | tournament_players UPDATE policy | `player_id = caller_id_auto` | + `OR player_uuid = current_player_id()` |
| `"Player deletes own or TD deletes any"` | tournament_players DELETE policy | `player_id = caller_id_auto` | + `OR player_uuid = current_player_id()` |
| `ttm_read` | tournament_team_members SELECT policy | `player_id = caller_id_auto` **and** `captain_id = caller_id_auto` | + `OR player_uuid = current_player_id()` / `OR captain_player_id = current_player_id()` |
| `submit_match_state` | RPC | participant: `tp.player_id = v_uid` | + `OR tp.player_uuid = current_player_id()` |
| Team RPCs (via `_team_caller()`): `create_team`, `respond_to_team_invite`, `cancel_team_partner`, `cancel_team`, `td_add_team_member`, `set_team_*`, `join_team_by_token`, `get_tournament_team_roster`, edit/approve/checkin actions | RPCs | compare `_team_caller()` (id_auto) to `captain_id`/`player_id` | compare `current_player_id()` to `captain_player_id`/`player_uuid` (accept-either) |

**Explicitly NOT changed (verified from live bodies):** `is_chip_manager` (director/role only — ACTOR; chip writes stay manager-gated), the **director/admin branches** of every policy/RPC (they compare `director_id`/`role`, which stay on `id_auto` and are never dropped), `"Anyone can read tournament players"` / `tt_read` / `chip_*_read` (public `USING(true)`). **No views** exist. The only triggers are the two `updated_at` triggers + `profiles_guard_phone` (none competitor-authz). `delete_user_account()` touches only ACTOR/account-scoped rows.

### K.3 Application & edge read/write sites for the 7 columns (part 2)
| Column | Reads | Writes | Files |
|---|---|---|---|
| `tournament_players.player_id` | `registration.service.ts:43,71,85,99,121,137` (joins + `.eq`) | `use.self.registration.ts:67` (insert); `registration.service.addPlayer` (insert); TD `manage-tournament/[id].tsx` handleAddPlayer→`hub.addPlayer` | registration.service, use.self.registration, use.registrations, use.profile.tournaments, manage-tournament |
| `tournament_team_members.player_id` | `team.service.ts:19,45,68,93` | `team.service.ts:270` `p_player_id` → RPC `td_add_team_member` (server-side) | team.service, use.team.invite |
| `tournament_teams.captain_id` | `team.service.ts:91` (join) | `team.service.ts:259` `p_captain_player_id` → RPC `create_team`/`td_create_team` (server-side) | team.service |
| `chip_entries.p1/p2_profile_id` (`p1/p2ProfileId`) | `chip.service.ts:42-43,538-539`; mappers `106,156-157`; `use.chip.tournament.ts:471-472`; `use.player.chip.tournament.ts:127`; `chip-manage.screen.tsx:1362,1454` | `chip.service.ts:67-68` (entryToRow→syncTable upsert), `chip-manage.screen.tsx:1344,1348` (addEntry/updateEntry) | chip.service, chip.engine, use.chip.tournament, use.player.chip.tournament, chip-manage.screen |
| `chip_results.p1/p2_profile_id` | `chip.service.ts:538-539` (loadResults) | `chip.service.ts:518-519` (saveResults) | chip.service |
| **Edge fn** `sms-send-match-ready` | `index.ts:83` (`.or p1/p2_profile_id`), `index.ts:104` (`.eq player_id`) — resolves recipient by `id_auto` | — | supabase/functions/sms-send-match-ready |

**Current-user id_auto resolver (source):** `profile.id_auto` / `storeProfile?.id_auto` from the Zustand auth store (hydrated by `AuthProvider` via `get_auth_session`). This single value feeds every COMPETITOR comparison and every `playerId` hook arg.

### K.4 Guest & pending player readability (part 6)
- **Guests** (`tournament_players` rows with `player_id`/`player_uuid` = NULL): remain fully readable via `"Anyone can read tournament players" USING(true)` (public), and remain **manageable by TDs** via the unchanged **director branch** of the INSERT/UPDATE/DELETE policies — the accept-either change only *adds* a player branch; it never removes the director branch. A NULL `player_uuid` simply doesn't match `current_player_id()`, which is correct (a guest can't act on their own row).
- **Pending players** (Phase 5): a pending player's registration carries `player_uuid = <pending player>` with legacy `player_id = NULL`. It's readable via the same public policy. It **cannot be a caller** (no auth), so it never needs to satisfy caller-based authz. Reading the pending player's *name* from `players` is gated by the `players` read policies **deferred from Phase 1** — those get added in Phase 5 (staff/self read), not Phase 4.

### K.5 Dual-write points during compat (part 7)
Every legacy `id_auto` competitor column must stay populated (rollback safety) AND its new `*_player_id` must be kept in sync. Handled by **BEFORE INSERT/UPDATE sync triggers** (one per table), so no app write path changes:
- `tournament_players` (player_id → player_uuid), `tournament_team_members` (player_id → player_uuid), `tournament_teams` (captain_id → captain_player_id), `chip_entries` (p1/p2_profile_id → p1/p2_player_id), `chip_results` (p1/p2_profile_id → p1/p2_player_id).
- Trigger logic: `if NEW.<legacy> is not null and NEW.<new> is null then NEW.<new> := (map id_auto→players.id) end if` — fills from legacy, **never overwrites an explicitly-set `player_uuid`** (so Phase 5 pending-player inserts that set `player_uuid` directly are preserved), never nulls.
- App keeps writing the legacy columns exactly as today → triggers keep the new columns correct. Team/captain columns are written by SECURITY DEFINER RPCs; the triggers cover those inserts too.

### K.6 Sub-phases (parts 3 & 4)

**Phase 4A — DB resolver + sync + catch-up (additive, zero behavior change)**
- Objects: `current_player_id()` helper; 5 BEFORE-INSERT/UPDATE sync triggers + their functions; idempotent catch-up re-run of the Phase 3 backfill (fills any `*_player_id` left NULL by rows created since Phase 3).
- Behavior change: none — existing authz still evaluates `id_auto`. New columns just stay perfectly in sync.
- Risks: low. Trigger cost on writes (negligible at this scale). A wrong map would mis-sync — mitigated by the round-trip verification (QV3-style).
- Preflight: confirm 0 rows where legacy is non-null but `*_player_id` is null (post catch-up); confirm `current_player_id()` returns the caller's player for a sample.
- Post-verify: insert/update a test registration → confirm trigger populated `player_uuid` correctly; re-run round-trip integrity = 0 mismatches.
- Rollback: `drop trigger` + `drop function current_player_id`; columns remain (harmless).
- Deployment order: first; independent; safe to sit indefinitely before 4C.

**Phase 4B — Application compatibility (dual-read; optional dual-write)**
- Files: the K.3 read sites. Change reads to *prefer* `player_uuid` (join `players`) with `id_auto` fallback, and thread `players.id` where the app benefits — **incremental and low-risk because legacy reads keep working**. No write changes are strictly required (triggers handle write-sync), but self-register/chip inserts MAY additionally set `player_uuid` directly.
- Behavior change: app can resolve competitors by `players.id`; still authorized by unchanged (or accept-either) policies.
- Risks: medium if the app refactor is rushed — but decoupled from authz by accept-either, so it can ship gradually. Hermes 1–2-char-identifier rule, `webMs/webSc` usage still apply.
- Preflight: typecheck baseline (35), ESLint clean.
- Post-verify: on-device (Expo Go) smoke of registration, chip entry, team create, profile history.
- Deployment order: **after 4A**, and — critically — this app build (which keeps writing legacy id_auto) can deploy **before OR after** 4C thanks to accept-either. Recommended: deploy 4B app **before** 4C.

**Phase 4C — RLS/RPC authorization cutover (accept-either)**
- Objects: the K.2 policies + RPCs, changed to `<legacy id_auto branch> OR <player_uuid branch>`. `_team_caller()` kept; add `current_player_id()` comparisons alongside.
- Behavior change: authz now accepts the player basis too; legacy basis still honored → **no user loses access**.
- Risks: the main phase. Mitigated by accept-either (no gap even if app hasn't migrated) + the 4A sync trigger + catch-up backfill guaranteeing `player_uuid` is populated for all rows.
- Preflight: re-run catch-up backfill immediately before; confirm 0 competitor rows with NULL `player_uuid` where legacy non-null; confirm 4A trigger live.
- Post-verify: as a non-TD player, self-register / update / delete own registration; read own team membership; submit a match as a participant; run a chip + team flow — all succeed. As a TD, manage a guest row — succeeds (director branch).
- Rollback: revert policies/RPCs to the id_auto-only definitions (a prepared "down" migration). Instant and safe because legacy columns are still authoritative.
- Deployment order: after 4A (required) and preferably after 4B; a "down" migration staged before applying.

**Phase 4D — Verification & rollback window**
- Objects: none (observation). 
- Behavior: monitor auth errors / failed registrations / RLS denials for a defined window (e.g. one active-tournament cycle).
- Risks: none added.
- Preflight: define the window + a rollback trigger criterion.
- Post-verify: zero authz regressions across bracket, chip, teams, match-ready SMS, profile history; then declare Phase 4 complete and schedule Phase 7 (tighten authz to player-only + drop legacy columns + migrate the edge fn + finish the app refactor).
- Rollback: within the window, apply the 4C down-migration; app is unaffected (accept-either / legacy still works).

### K.7 Race conditions / gaps / temporary states (part 8)
- **If 4C shipped before 4A:** RLS would check `player_uuid` that isn't guaranteed populated for new rows → auth gap. **Prevented** by ordering (4A first) + accept-either (legacy branch still passes) + catch-up backfill.
- **Rows created between Phase 3 and 4A:** could have NULL `player_uuid`. **Closed** by the 4A catch-up backfill and, going forward, the sync trigger.
- **Non-simultaneous SQL/app deploy:** the classic risk. **Eliminated** by accept-either authz — whichever basis the app writes, one branch always matches. No window where legitimate users are locked out.
- **BEFORE-trigger vs RLS WITH CHECK ordering:** avoided entirely — the accept-either INSERT policy passes on the `player_id = caller_id_auto` branch (the value the app actually writes), so we never depend on the trigger's output being visible to WITH CHECK.
- **Pending players (Phase 5) mid-window:** not yet created in Phase 4; their direct `player_uuid` writes are preserved by the "don't overwrite" trigger guard.

### K.8 Safest production deployment order (part 9)
1. **4A** (helper + triggers + catch-up backfill) — additive, deploy first, verify sync.
2. **4B app build** (dual-read, still writes legacy) — deploy **before** the authz cutover so clients are already player-aware; safe because legacy authz is unchanged.
3. **4C** (accept-either authz) with the down-migration staged — apply after 4A (and after 4B app is live).
4. **4D** monitor the rollback window; then plan Phase 7.

**Yes — app compatibility should be deployed before the authorization cutover.** But the accept-either design means even an out-of-order or partial deploy does not lock users out; it only ever *adds* an accepted basis.

---

## L. Phase 4B — Application dual-read compatibility layer (PROPOSAL — no code written)

### L.0 Strategy & two decisive findings
- **ALL write paths stay unchanged** — the Phase 4A BEFORE-triggers auto-sync every `*_player_id` from its legacy `id_auto` column. No app/RPC write change is needed in 4B (or until Phase 7 drops the legacy columns).
- **Finding 1 — the caller's `players.id` is not exposed client-side.** `AuthProvider` hydrates via `get_auth_session` (profile only); the auth store has `profile.id_auto`, no player uuid. So any *current-user* comparison (viewer-matching, dedup) cannot "prefer uuid" until we surface the caller's `players.id`.
- **Finding 2 — `src/lib/supabase/database.types.ts` predates Phase 3** and lacks the new columns; typed reads of `player_uuid` etc. need a type regen (excluded from 4B) or hand-typed domain fields.
- **Mixed-identifier risk (the core hazard):** a `uuid === id_auto` comparison silently never matches. Rule: **compare like-with-like** — only switch a comparison to uuid when BOTH sides are uuid; never mix.
- **Recommendation:** scope 4B to *additive availability* — surface `*_player_id` in SELECT projections + hand-typed domain fields + a resolver util — while keeping **comparisons, cache keys, DB filters, and writes on `id_auto`** through the compat window. The identity-authoritative switch (and caller-`players.id` plumbing) is a later, dedicated app-migration phase before Phase 7. This keeps 4B low-risk and truly a compatibility layer; server-side authz compatibility is handled by 4C accept-either, not by 4B.

### L.1 Call-site matrix (kind · legacy · 4B action · fallback · migrate-now? · risk)
**Legend:** A = do in 4B (safe additive) · C = keep legacy in 4B (defer) · W = write (unchanged, trigger-synced).

| Site | Kind | Legacy behavior | 4B action | Migrate now? |
|---|---|---|---|---|
| `registration.service.ts:43,121` | join/read (`profiles:player_id`) | embed competitor profile via id_auto | **A**: add `player_uuid` to projection (+ optional `players:player_uuid` embed); keep profile embed for name | ✅ additive |
| `registration.service.ts:71,85,99,137` | DB filter (`.eq("player_id", playerId)`) | query a player's rows by id_auto | **C**: keep id_auto filter (both cols populated → correct); switching needs caller uuid | ⛔ defer |
| `use.self.registration.ts:67`; `registration.service.addPlayer` | **W** insert `player_id` | — | unchanged (trigger syncs `player_uuid`) | ⛔ n/a |
| `use.registrations.ts:83`, `use.player.performance.ts:20`, `use.profile.tournaments.ts:35,48`, `use.player.chip.tournament.ts:327` | cache key (`queryKey:[…, playerId]`) | react-query key = id_auto | **C**: keep id_auto key (changing churns caches, no benefit) | ⛔ defer |
| `team.service.ts:19,91` | join/read (`profiles:player_id/captain_id`) | embed via id_auto | **A**: add `player_uuid`/`captain_player_id` to projection | ✅ additive |
| `team.service.ts:45,68,93` | DB filter (`.eq("player_id", …)`) | by id_auto | **C**: keep | ⛔ defer |
| `team.service.ts:259,270` (RPC args) | **W** via `create_team`/`td_add_team_member` | server-side insert captain_id/player_id | unchanged (trigger syncs) | ⛔ n/a |
| `chip.service.ts:42-43` `rowToEntry` | mapper read | `p1/p2ProfileId ← p1/p2_profile_id` | **A**: also map `p1/p2PlayerId ← p1/p2_player_id` | ✅ additive |
| `chip.service.ts:67-68` `entryToRow` | **W** upsert `p1/p2_profile_id` | — | unchanged (trigger syncs) | ⛔ n/a |
| `chip.service.ts:106` `regToEntry` | mapper read | `p1ProfileId ← reg.player_id` | **A**: also `p1PlayerId ← reg.player_uuid` (needs reg projection from row above) | ✅ additive |
| `chip.service.ts:156-157` `rosterTeamToEntry` | mapper read | `p1/p2ProfileId ← roster.player_id` | **C**: blocked — `get_tournament_team_roster` RPC returns id_auto only; needs a read-only projection add to that RPC (not authz). Defer or do as a separate minor RPC-projection change | ⛔ defer |
| `chip.service.ts:336-337` dedup `linkedProfileIds` | comparison (`Set<number>` id_auto) | dedup already-entered players vs searched `id_auto` | **C**: keep id_auto set (compared against search result id_auto) | ⛔ defer |
| `chip.service.ts:518-519` `saveResults` | **W** upsert `chip_results` | — | unchanged (trigger syncs) | ⛔ n/a |
| `chip.service.ts:538-539` `loadResults` | mapper read | `p1/p2ProfileId ← chip_results.p1/p2_profile_id` | **A**: also `p1/p2PlayerId` | ✅ additive |
| `use.chip.tournament.ts:471-472` | build placements | carry `p1/p2ProfileId` | **A**: carry `p1/p2PlayerId` | ✅ additive |
| `use.player.chip.tournament.ts:127` | **comparison** (`e.p1/p2ProfileId === playerId`, current user) | viewer match by id_auto | **C**: keep — blocked by Finding 1 (no caller uuid). Later: like-with-like `(e.p1PlayerId && myUuid ? … : legacy)` | ⛔ defer |
| `chip-manage.screen.tsx:708,1362,1454` | display/presence/search | id_auto presence + search string | **A/optional**: `p2PlayerId ?? p2ProfileId` for presence; low value | ◻ optional |
| `chip-manage.screen.tsx:1344,1348` | **W** addEntry/updateEntry `p1/p2ProfileId=id_auto` | — | unchanged (trigger syncs) | ⛔ n/a |
| `supabase/functions/sms-send-match-ready:83,104` | edge read (recipient by id_auto) | `.or p1/p2_profile_id` + `.eq player_id` | **C**: keep (legacy cols intact); migrate before Phase 7 | ⛔ defer |

### L.2 Write paths that stay unchanged (4A triggers already sync)
`use.self.registration.ts:67`, `registration.service.addPlayer`, `chip.service` `entryToRow`→`syncTable` upserts (entries) + `saveResults` (results), `chip-manage` addEntry/updateEntry, and the team RPCs (`create_team`/`td_create_team`/`td_add_team_member`) writing `captain_id`/`player_id` server-side. Every one is covered by a Phase-4A BEFORE-trigger → no 4B change.

### L.3 Migration matrix (identifier by column)
| Table.legacy col | New uuid col | App alias (legacy → new) | 4B: available? | 4B: authoritative? |
|---|---|---|---|---|
| `tournament_players.player_id` | `player_uuid` | `player_id` → `player_uuid` | ✅ projection+type | ⛔ (filters/keys stay id_auto) |
| `tournament_team_members.player_id` | `player_uuid` | `player_id` → `player_uuid` | ✅ | ⛔ |
| `tournament_teams.captain_id` | `captain_player_id` | `captain_id` → `captain_player_id` | ✅ | ⛔ |
| `chip_entries.p1/p2_profile_id` | `p1/p2_player_id` | `p1/p2ProfileId` → `p1/p2PlayerId` | ✅ (except roster mapper) | ⛔ (dedup/viewer stay id_auto) |
| `chip_results.p1/p2_profile_id` | `p1/p2_player_id` | `p1/p2ProfileId` → `p1/p2PlayerId` | ✅ | ⛔ |

### L.4 Sub-steps
- **4B-1 — Types.** Hand-add optional fields to the *domain* types (not the generated file): `Registration.player_uuid`, `ChipEntry.p1/p2PlayerId`, `ChipResultRow.p1/p2PlayerId`, `TeamMember.player_uuid`, `TournamentTeam.captain_player_id`, and history/placement carriers. All `string | null`, optional. Cast at the supabase boundary where the stale generated `Row` type lacks the column. *(Open decision: regenerate `database.types.ts` instead of casting — see L.8.)*
- **4B-2 — Projections.** Add the new columns to the SELECT strings in `registration.service`, `team.service`, `chip.service` (`rowToEntry`/`regToEntry`/`loadResults`), and carry them through `use.chip.tournament` placements. Pure additive; nothing consumes them for identity yet.
- **4B-3 — Resolver util (no behavior change yet).** Add `playerRef(entity)` = `entity.<new> ?? null` and document the like-with-like comparison pattern for the later authoritative switch. Not wired into comparisons in 4B.
- **4B-DEFERRED (later app-migration phase, not 4B):** surface caller `players.id` (extend `get_auth_session`/auth store), then switch comparisons (`use.player.chip.tournament:127`, chip dedup), DB filters, and cache keys to uuid — like-with-like — and extend `get_tournament_team_roster` projection; finally migrate the edge function. This precedes Phase 7.

### L.5 Deployment order
4B is a normal app release (Expo/EAS), independent of the DB. It can ship any time after 4A and before/after 4C (accept-either makes ordering non-critical). Recommended: ship 4B **before** 4C so clients already carry the uuid data.

### L.6 Testing plan
- Typecheck at the 35-error baseline (0 new), ESLint clean, Hermes 1–2-char rule + `webMs/webSc` respected.
- On-device (Expo Go): registration list, chip entry/partner add-remove, team create/roster, profile history/performance, chip spectator view — all behave identically (id_auto still authoritative). Confirm the new fields are *present* in fetched data (dev log) without altering any displayed result.

### L.7 Rollback plan
Pure app rollback — redeploy the previous JS bundle (OTA/EAS). No DB change in 4B, so nothing to revert server-side. Because 4B changes nothing authoritative, rollback has zero data/authz impact.

### L.8 Risks & open decisions
- **Mixed-identifier comparisons** — the main hazard; mitigated by keeping ALL comparisons on id_auto in 4B (like-with-like enforced only when the authoritative switch happens later).
- **Open decision A — types:** regenerate `database.types.ts` now (you excluded type-gen from 4B) vs. hand-type the domain fields + cast at the boundary. Recommend hand-typing in 4B; schedule a full regen with the later authoritative switch.
- **Open decision B — caller `players.id`:** needed before any current-user uuid comparison. Recommend deferring (out of 4B) — extend `get_auth_session` when we do the authoritative switch.
- **Open decision C — `get_tournament_team_roster` projection:** returning `player_uuid` is a read-only RPC change (not authz). Include as a tiny separate step, or defer `rosterTeamToEntry` uuid.
- **Scope honesty:** with 4A triggers + 4C accept-either doing the real compatibility work, **4B is optional for correctness.** Its value is making `players.id` flow into the app ahead of the authoritative switch. If you'd rather skip straight to 4C and keep the app fully id_auto until the dedicated app-migration phase, that's viable and lower-effort.

---

## M. Phase 4C — Accept-either authorization cutover (PROPOSAL)

> **Status: Phase 4C ✅ APPLIED & VERIFIED.** MP1 passed; MP2 baseline captured; pushed & recorded remote. MV2 (7 fns SECURITY DEFINER/VOLATILE/search_path preserved; policy_count=10), untouched-objects (no current_player_id in _team_caller/is_chip_manager/actor RPCs), and the executable JWT authz test (owner authorized via UUID branch, stranger denied) all passed. MV1 `keeps_legacy=false` on 5 team RPCs was a false negative — they preserve legacy via `_team_caller()` (id_auto), not a literal `id_auto` string; confirmed by source. Accept-either live. Legacy branch retained until Phase 7. **Next: Phase 4D** real-client verification (on-device, user-run). Forward: `supabase/migrations/20260804120000_phase4c_accept_either_authz.sql` (3 `ALTER POLICY` + `ttm_read ALTER POLICY` + 7 `CREATE OR REPLACE FUNCTION`, full bodies). In policy quals the new resolver is wrapped `(select public.current_player_id())` so it's InitPlan-folded once per statement (matches the legacy `(select id_auto …)` idiom / Supabase RLS perf guidance); in functions it's assigned once to a variable. Standalone rollback (complete original defs, NOT a migration): `supabase/rollback/20260804120000_phase4c_rollback.sql`. NOT applied.

> Phase 4B is **SKIPPED** (approved). App stays on legacy `id_auto` through the compat window; the 4A triggers + this 4C accept-either layer do all the compatibility work.

### M.0 Uniform transformation, NULL behavior, RLS behavior
- **Transformation (every competitor site):** `COMPETITOR_COL = <caller_id_auto>` → `( COMPETITOR_COL = <caller_id_auto> OR COMPETITOR_UUID_COL = public.current_player_id() )`. The legacy branch is kept verbatim; a new UUID branch is added with `OR`. **`_team_caller()` is NOT modified** (it returns the caller's `id_auto` and also feeds director branches); the UUID branch calls `current_player_id()` alongside.
- **Actor/admin branches unchanged:** every `director_id = …` / `role in ('compete_admin','super_admin')` branch stays exactly as-is (actors legitimately remain `profiles.id_auto`).
- **NULL behavior (`current_player_id()` = NULL):** `COMPETITOR_UUID_COL = NULL` evaluates to NULL → never TRUE → the UUID branch simply contributes nothing; authorization falls back to the legacy + actor branches. No error, no false grant. (Also `COMPETITOR_UUID_COL` itself is NULL for guests → NULL → no match, correct.) This is why `current_player_id()` returns NULL rather than raising.
- **RLS by caller type:**
  - **authenticated** — `auth.uid()` set; both `id_auto` subquery and `current_player_id()` resolve (post-Phase-2 every profile has an ACTIVE player) → accept-either matches on either basis, same person.
  - **anon** — `auth.uid()` NULL → both competitor branches NULL, actor branches NULL → denied (public-read policies are separate and unchanged).
  - **service_role** — bypasses RLS entirely; RPCs run as definer. `current_player_id()` returns NULL but is unused because RLS is bypassed. Edge functions unaffected.

### M.1 `tournament_players` — 3 policies (INSERT / UPDATE / DELETE)
**Current** (all three share this shape; INSERT uses `WITH CHECK`, UPDATE/DELETE use `USING`):
```
((player_id = ( SELECT profiles.id_auto FROM public.profiles WHERE profiles.id = auth.uid()))          -- COMPETITOR
 OR (EXISTS ( SELECT 1 FROM public.tournaments t
       WHERE t.id = tournament_players.tournament_id
         AND t.director_id = ( SELECT profiles.id_auto FROM public.profiles WHERE profiles.id = auth.uid())))) -- ACTOR (director)
 OR (EXISTS ( SELECT 1 FROM public.profiles
       WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['super_admin','compete_admin']))))       -- ACTOR (admin)
```
**Proposed** — competitor branch only gains the UUID alternative; actor branches verbatim:
```
(( player_id = ( SELECT profiles.id_auto FROM public.profiles WHERE profiles.id = auth.uid())
   OR player_uuid = public.current_player_id() )                                                     -- COMPETITOR (accept-either)
 OR (EXISTS ( … director_id = … ))     -- ACTOR unchanged
 OR (EXISTS ( … role in admin … )))    -- ACTOR unchanged
```
- Competitor branch → gains UUID. Actor branches (director, admin) → unchanged.

### M.2 `submit_match_state` (participant branch)
Add `v_player uuid := public.current_player_id();` near the top. **Current** participant check:
```
or exists (select 1 from public.tournament_players tp
  where tp.tournament_id = p_tournament_id and tp.player_id = v_uid
    and tp.status not in ('cancelled','no_show'))
```
**Proposed:**
```
or exists (select 1 from public.tournament_players tp
  where tp.tournament_id = p_tournament_id
    and (tp.player_id = v_uid or tp.player_uuid = v_player)          -- accept-either
    and tp.status not in ('cancelled','no_show'))
```
Director branch (`t.director_id = v_uid`) and the "final match locked for non-TD" logic → unchanged.

### M.3 `ttm_read` (SELECT policy on `tournament_team_members`)
Two competitor branches gain UUID; the director/admin branch is unchanged.
- `player_id = (SELECT id_auto …)` → `( player_id = (SELECT id_auto …) OR player_uuid = public.current_player_id() )`
- `t.captain_id = (SELECT id_auto …)` → `( t.captain_id = (SELECT id_auto …) OR t.captain_player_id = public.current_player_id() )`
- `tt.director_id = … / role in admin` → unchanged.

### M.4 Team RPCs — competitor comparison sites (SECURITY DEFINER; bodies otherwise unchanged)
Add `v_caller_player uuid := public.current_player_id();` and extend only the competitor comparison(s). `INSERT`s that write `captain_id`/`player_id` = `v_caller` stay legacy (4A trigger syncs the UUID).

| RPC | Current competitor check | Proposed accept-either |
|---|---|---|
| `cancel_team` | `if v_captain <> v_caller then raise …` | permit if `v_captain = v_caller OR v_captain_uuid = v_caller_player` (select `captain_player_id` into `v_captain_uuid`) |
| `cancel_team_partner` | `if v_captain <> v_caller then raise …` | same captain accept-either |
| `invite_team_partner` | `if v_captain <> v_caller then raise …` | same captain accept-either (self-invite guard `v_target = v_caller` left as id_auto — it's a guard, not a grant) |
| `respond_to_team_invite` | `v_captain = v_caller` and member self `m.player_id = v_caller` | `(v_captain = v_caller OR captain_player_id = v_caller_player)`; member self `(m.player_id = v_caller OR m.player_uuid = v_caller_player)` |
| `join_team_by_token` | `v_captain = v_caller`, `m.player_id = v_caller` | same as respond_to_team_invite |
| `create_team` | membership check `m.player_id = v_caller` | `(m.player_id = v_caller OR m.player_uuid = v_caller_player)`; insert of caller as captain stays legacy |

### M.5 Explicitly NOT changed
`is_chip_manager`; every director/admin branch above; the actor RPCs `set_team_approved` / `set_team_checked_in` / `set_team_chips` / `set_team_paid` / `set_team_side_pots` / `td_create_team` / `td_add_team_member` / `td_remove_team_member` / `unlock_team` / `confirm_team_member_fargo`; the read RPCs `get_tournament_team_roster` / `get_team_invite_by_token`; `_team_caller()`; all public `USING(true)` reads; the chip write policies (`is_chip_manager`-gated); application code; edge functions; generated TS types; Phase 1–4A columns/triggers/helpers.

### M.6 Preflight queries
**MP1 — helper live + every competitor row has its UUID populated** (accept-either's UUID branch is only useful if populated; 4A guarantees it):
```sql
select
  (select count(*) from pg_proc where proname='current_player_id' and pronamespace='public'::regnamespace) as resolver_exists,
  (select count(*) from public.tournament_players      where player_id     is not null and player_uuid       is null) as tp_gap,
  (select count(*) from public.tournament_team_members where player_id     is not null and player_uuid       is null) as ttm_gap,
  (select count(*) from public.tournament_teams        where captain_id    is not null and captain_player_id is null) as teams_gap;
```
Expected: `1, 0, 0, 0`.

**MP2 — capture current definitions for the rollback baseline** (save output):
```sql
select policyname, cmd, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policies pp join pg_policy pol on pol.polname = pp.policyname
where pp.schemaname='public' and pp.tablename='tournament_players';
-- and: select pg_get_functiondef(oid) from pg_proc where proname in
--   ('submit_match_state','cancel_team','cancel_team_partner','invite_team_partner',
--    'respond_to_team_invite','join_team_by_token','create_team');
-- and the ttm_read policy expression.
```

### M.7 Post-apply verification
**MV1 — each changed object now references `current_player_id`** (proves the UUID branch landed) and the legacy text is still present (proves accept-either, not replace):
```sql
select 'ttm_read' as obj,
  (pg_get_expr(polqual, polrelid) ilike '%current_player_id%') as has_uuid_branch,
  (pg_get_expr(polqual, polrelid) ilike '%id_auto%')           as keeps_legacy
from pg_policy where polname='ttm_read'
union all
select p.polname,
  (pg_get_expr(coalesce(p.polqual,p.polwithcheck), p.polrelid) ilike '%current_player_id%'),
  (pg_get_expr(coalesce(p.polqual,p.polwithcheck), p.polrelid) ilike '%id_auto%')
from pg_policy p join pg_class c on c.oid=p.polrelid
where c.relname='tournament_players'
union all
select p.proname,
  (pg_get_functiondef(p.oid) ilike '%current_player_id%'),
  (pg_get_functiondef(p.oid) ilike '%id_auto%' or pg_get_functiondef(p.oid) ilike '%_team_caller%')
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in
  ('submit_match_state','cancel_team','cancel_team_partner','invite_team_partner','respond_to_team_invite','join_team_by_token','create_team');
```
Expected: every row `has_uuid_branch = true AND keeps_legacy = true`.

**MV2 — untouched objects unchanged:** `is_chip_manager` / `_team_caller` / the actor RPCs do NOT contain `current_player_id` (they were not modified); `policy_count = 10` still.

### M.8 Positive / negative authorization tests (SELECT-returning, transaction-rolled-back)
Run as a rolled-back block that impersonates via the accept-either predicates directly (the DB session can't set `auth.uid()`, so tests assert the *predicate* using a chosen player's `players.id`/`id_auto`). Returns a pass/fail table:
```sql
begin;
create temp table _p4c_test(step text, passed boolean, detail text) on commit drop;
do $$
declare v_pl uuid; v_ida bigint; v_tid bigint; v_rid bigint; v_seen int;
begin
  select id, profile_id into v_pl, v_ida from public.players where profile_id is not null limit 1;
  select id_auto into v_ida from public.profiles where id = (select profile_id from public.players where id=v_pl);
  select id into v_tid from public.tournaments limit 1;
  -- seed a registration linked to that player (rolled back)
  insert into public.tournament_players(tournament_id, player_id, status) values (v_tid, v_ida, 'preregistered') returning id into v_rid;
  -- (1) POSITIVE via UUID branch: does the row match current-player-style predicate on player_uuid?
  select count(*) into v_seen from public.tournament_players
    where id=v_rid and (player_id = -1 /*force legacy miss*/ or player_uuid = v_pl);
  insert into _p4c_test values ('1_uuid_branch_matches_owner', v_seen=1, format('seen=%s', v_seen));
  -- (2) NEGATIVE: a different/absent player must NOT match either branch
  select count(*) into v_seen from public.tournament_players
    where id=v_rid and (player_id = -1 or player_uuid = '00000000-0000-0000-0000-000000000000');
  insert into _p4c_test values ('2_stranger_denied', v_seen=0, format('seen=%s', v_seen));
  -- (3) NULL resolver: NULL uuid branch must contribute nothing
  select count(*) into v_seen from public.tournament_players
    where id=v_rid and (player_id = -1 or player_uuid = NULL);
  insert into _p4c_test values ('3_null_resolver_no_match', v_seen=0, format('seen=%s', v_seen));
  -- (4) LEGACY branch still works
  select count(*) into v_seen from public.tournament_players
    where id=v_rid and (player_id = v_ida or player_uuid = '00000000-0000-0000-0000-000000000000');
  insert into _p4c_test values ('4_legacy_branch_matches', v_seen=1, format('seen=%s', v_seen));
end $$;
select * from _p4c_test order by step;
rollback;
```
Expected: all four `passed = true`. *(A fuller end-to-end test — actually calling `submit_match_state`/team RPCs under a real JWT — belongs to the on-device 4D verification, since psql can't set `auth.uid()`.)*

### M.9 Rollback
The 4C migration ships a paired **down** section that re-creates the EXACT prior definitions captured in MP2 (the verbatim policies from §M.1 and the original function bodies from the dump). Because accept-either only *adds* an `OR` branch and the legacy branch is untouched, reverting to legacy-only is safe at any moment — no data depends on the UUID branch (columns already populated, app still on id_auto).

### M.10 Risks & ordering
- **Risk: a competitor row with NULL `player_uuid`** would silently fall back to legacy — acceptable (still authorized via id_auto), and MP1 asserts 0 gaps. The 4A trigger keeps it 0 going forward.
- **Risk: policy/RPC text drift** — capture MP2 first so the rollback restores byte-exact prior defs.
- **Ordering:** requires 4A live (it is). No app deploy needed (app stays id_auto; accept-either honors it). Deploy via `supabase db push`; stage the down-migration. 4D = observation window.
- **No simultaneous deploy:** accept-either means the cutover is safe regardless of app state.

### M.11 Legacy branch retained until Phase 7
Every predicate keeps its original `id_auto` branch verbatim. The legacy branch is removed **only in Phase 7**, together with dropping the legacy competitor columns and after the dedicated app-identity migration. Until then, both bases authorize.

---

## N. Phase 4D — real-client UI test plan (delivered to user; not yet executed)
Screen-by-screen plan mapping each accept-either site to the existing UI (native/iOS Expo Go — `TournamentDetailModal` is null on web). **Key finding:** individual-registration has **no cancel button** in the UI, and captain/TD/participant negative controls are **hidden client-side**, so those negative-access tests are NOT UI-exercisable and must run at the RPC/SQL layer (reuse the 4C JWT-sim harness). UI-exercisable side-effects for a non-owner: own registration, team join-by-link, own live-match score steppers. Positive UI flows: self-register (`Register for Tournament`), TD add player/guest (`+ Add Player` / `Add Guest`), team create (`Register Team`), share link + partner join (`join_team_by_token`), accept/decline invite, cancel team (`Cancel Team Registration`), participant scoring (Profile → Tournament View ± steppers → `submit_match_state`), TD scoring (manage-tournament Live → Matches → `MatchActionsModal`, direct update). `invite_team_partner` + `cancel_team_partner` have no wired button (share-link/join is the real path) → RPC-level only. R1–R3 SQL regression checks provided.

## O. Scotch-Doubles partner-invite redesign — audit + plan (PROPOSAL, not implemented)
Audit: deep link `app/join/[id].tsx` (`https://www.thecompeteapp.com/join/<tid>?invite=<token>`, native→`TeamJoinModal`); token `tournament_teams.invite_token` (default `gen_random_uuid()::text`, unique, auto-set at create → "reuse" = read it); RPCs `create_team`/`invite_team_partner`/`respond_to_team_invite`/`join_team_by_token`/`cancel_team`/`cancel_team_partner`/`get_team_invite_by_token`; SMS = `sms:` link + native `Share.share` (NOT Telnyx); app-store fallback exists (mobile-web bounce + desktop store buttons); **invite does NOT survive install/login** (`pendingTeamInvite` written to web localStorage at `app/join/[id]:89` but never read; no native resume; no deferred-deep-link service); `join_team_by_token` already fills the existing partial team, never creates a 2nd team, never replaces P1, and rejects full/locked/invalid/already-on-team (reqs #6–#9 done; "expired" N/A — no token expiry). **DB/authz changes required for core join/invite: NONE** (RPCs exist + Phase-4C accept-either done).
**Phase I — ✅ IMPLEMENTED (no backend/migration/type change; typecheck 35 baseline, ESLint clean).** Files: `src/utils/team.invite.ts` (new — link + message helpers); `team.service.ts` `getTeamInviteToken(teamId)` (RLS-permitted read); `use.chip.tournament.ts` `getInviteToken` passthrough; `TeamRegisterModal.tsx` (Add-Partner-Now/Invite-Partner fork, Player 1/Player 2 · Waiting/Invite-Pending display, Text/Share/Copy/Cancel-Invite[cancel_team_partner]/Add-Different-Player, existing-player search via `usePlayerSearch`; Create-New-Player structured for Phase 5); `chip-manage.screen.tsx` ("Add Team"/"Add Player 1"/"Add Player 2" wording de-captained, "Invite Partner" → lazy token fetch + Text/Share/Copy native action sheet). Copy Link is dependency-free (web clipboard; native falls back to share sheet — true native clipboard would need expo-clipboard, intentionally not added). Security follow-up (invite_token public exposure) filed as a separate task.

Original plan: **Phase I (UI only)** — Add-Partner-Now|Invite-Partner fork; Invite-Partner → native share sheet w/ message `"<inviter> invited you to join their team for <tournament> on Compete. Tap here to accept: <link>"`; pending card "Player 1 / Player 2: Invite Pending" + Resend/Text/Copy/Cancel(→`cancel_team_partner`)/Add-Different; rename TD-facing "Add Captain" (`chip-manage.screen.tsx:2890,3074`) — keep `captain` internal (authz). **Phase II** — Add-Partner-Now(existing) reuses `invite_team_partner`; **"Create New Player" depends on Phase 5 (pending accounts)**. **Phase III (optional)** — native AsyncStorage stash + post-auth resume; true deferred-through-install needs Branch/FDL (out of scope). NOT implemented.

## Confirmed decisions (Phase 1 locked)
1. `players.id` = **uuid**; legacy id_auto columns kept during the compatibility window. ✔
2. Backfill **one player per real profile**, excluding system/service accounts; `profile_id` unique link. ✔
3. **No** `email_verified_at`/`phone_verified_at` on `players`; store unverified `email`/`email_normalized`/`phone_e164`; verification stays auth-side. ✔
4. `chip_events.actor_id` + `profiles.fargo_verified_by` remain ACTOR; `notifications.user_id` handled separately. ✔
5. `tournament_teams.captain_id` **split** → `captain_player_id` (players) + `managed_by_profile_id` (profiles). ✔
6. Guest and Pending Account kept distinct; **no silent conversion**. ✔

## Still needed from you before Phase 1 DDL
- The **live schema dump** (§F.1/F.2) + the **§F.3 catalog-query results**. *(Not yet received.)*
- ~~System/service-account exclusion rule~~ — **RESOLVED: backfill all profiles, no exclusions** (§E.0 / Phase 2).

## Next step (blocked on the dump) — the ONLY work until you approve the comparison
1. Review the live schema dump.
2. Review the catalog-query results.
3. Compare live schema ↔ this repository audit (§F.5 checklist).
4. Report discrepancies: hidden policies/functions/triggers/constraints, `tournament_players` RLS (§G.2), email conflicts.
5. Produce the **final pre-migration risk report + updated staged plan**.

**No DDL, RPC/RLS changes, generated types, backfills, or application code** are written until you explicitly approve the schema comparison.
