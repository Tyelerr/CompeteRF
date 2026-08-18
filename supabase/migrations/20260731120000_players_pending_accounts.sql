-- 20260731120000_players_pending_accounts.sql
-- Phase 1 of the Players / Pending Accounts migration.
-- See PENDING_ACCOUNTS_MIGRATION.md (§E.0, §I) for the full design + risk report.
--
-- ADDITIVE ONLY. Creates two NEW tables and touches NO existing table, column,
-- policy, or row. Backfill (Phase 2) and re-pointing competitor columns to
-- players (Phase 3+) are separate, later migrations.
--
-- Phase-1 scope is deliberately minimal: create the tables + enable RLS, and
-- STOP. No RLS policies and no authenticated/anon grants yet — nothing reads or
-- writes these tables, no RPCs or app code reference them. Policies and grants
-- are introduced during the application cutover, when they are actually needed.
-- For now only service_role (edge functions) and the table owner have access.
--
-- Architecture:
--   profiles = authenticated ACCOUNT identity (profiles.id = auth.users.id).
--   players  = COMPETITIVE identity + tournament history.
-- A player may exist with NO auth account (account_status = 'PENDING',
-- profile_id = NULL). Activation links the EXISTING player to a profile
-- (profile_id set, status -> ACTIVE) so history is preserved, never recreated.
-- Contact email captured by a TD/Admin is UNVERIFIED; verification stays
-- auth-side (Supabase email verification + profiles.phone_verified_at), which is
-- why there are deliberately no *_verified_at columns here.

-- ── players ──────────────────────────────────────────────────────────────────
create table public.players (
  id                    uuid primary key default gen_random_uuid(),
  display_name          text not null,
  first_name            text,
  last_name             text,
  email                 text,
  -- Normalization lives IN the database so app code and RPCs can never drift out
  -- of sync: email_normalized is the case/whitespace-folded dedup key, derived
  -- from email as a STORED generated column.
  email_normalized      text generated always as (lower(btrim(email))) stored,
  phone_e164            text,
  account_status        text not null default 'PENDING',
  -- Nullable link to the authenticated account; set on activation. UNIQUE when
  -- present (one profile <-> at most one player). ON DELETE SET NULL preserves the
  -- competitive record + history if the auth account is later deleted.
  profile_id            uuid references public.profiles(id) on delete set null,
  -- Authenticated actor who created a PENDING account (TD / Bar Owner / Admin).
  -- NULL for the system backfill of existing profiles (Phase 2). The creator's
  -- ROLE is intentionally NOT snapshotted here — it is derivable from the linked
  -- profile, and any point-in-time audit belongs in audit_log, not a denormalized
  -- column that would silently drift.
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  invited_at            timestamptz,
  activated_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint players_account_status_chk
    check (account_status in ('PENDING', 'ACTIVE', 'DISABLED')),
  -- A PENDING account is only useful with a real contact email to invite + dedup on.
  constraint players_pending_requires_email_chk
    check (account_status <> 'PENDING' or (email is not null and btrim(email) <> ''))
);

-- Dedup: at most one player per normalized email (partial — NULL email allowed for
-- legacy/active players; guests never live in players).
create unique index players_email_normalized_uidx
  on public.players (email_normalized)
  where email_normalized is not null;

-- One profile <-> one player (partial — many PENDING players have NULL profile_id).
create unique index players_profile_id_uidx
  on public.players (profile_id)
  where profile_id is not null;

create index players_account_status_idx on public.players (account_status);

comment on table public.players is
  'Competitive identity + tournament history, decoupled from auth. A player may exist with no profile (PENDING) until activation links profile_id. profiles remains the auth/account identity.';
comment on column public.players.email_normalized is
  'STORED generated lower(btrim(email)); the dedup key. Normalization is enforced in the DB so app/RPCs cannot drift. Partial-unique when non-null.';
comment on column public.players.profile_id is
  'Nullable, unique-when-present link to profiles(id) = auth.users(id). Set on activation. ON DELETE SET NULL keeps the competitive record + history if the account is deleted.';
comment on column public.players.account_status is
  'PENDING (no auth account yet) | ACTIVE (linked to a profile) | DISABLED. Email here is UNVERIFIED contact info; verification is auth-side.';
comment on column public.players.created_by_profile_id is
  'Authenticated actor (TD/Bar Owner/Admin) who created a pending account. NULL for the system backfill. Creator role is derived from the profile / audited in audit_log, not stored here.';

-- ── player_invitations (APPEND-ONLY history) ─────────────────────────────────
-- Each send/resend inserts a NEW row (full audit trail; mirrors the append-only
-- sms_verification_attempts model the resend rate-limiter is built around). A
-- resend supersedes the current live row (sets superseded_at) then inserts a new
-- one; the partial unique index below guarantees at most ONE live invite per
-- player, so only a single token is ever valid at a time.
create table public.player_invitations (
  id                    uuid primary key default gen_random_uuid(),
  player_id             uuid not null references public.players(id) on delete cascade,
  email_normalized      text not null,
  -- Only a HASH of the secure random token is stored; the raw token exists only in
  -- the emailed link. Single-use (accepted_at) and expiring (expires_at).
  token_hash            text not null,
  sent_at               timestamptz not null default now(),
  expires_at            timestamptz not null,
  accepted_at           timestamptz,   -- set once, on successful activation (terminal)
  superseded_at         timestamptz,   -- set when a newer invite replaces this one (terminal)
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_at            timestamptz not null default now(),

  constraint player_invitations_expiry_chk check (expires_at > sent_at)
);

create unique index player_invitations_token_hash_uidx on public.player_invitations (token_hash);

-- At most ONE live (neither accepted nor superseded) invitation per player.
create unique index player_invitations_one_live_uidx
  on public.player_invitations (player_id)
  where accepted_at is null and superseded_at is null;

-- History / "latest invite for this player" lookups.
create index player_invitations_player_sent_idx on public.player_invitations (player_id, sent_at desc);
create index player_invitations_email_norm_idx  on public.player_invitations (email_normalized);

comment on table public.player_invitations is
  'Append-only activation invitations for PENDING players. Each send/resend is a new row; a resend supersedes the prior live row. Stores only a HASH of a secure, single-use, expiring token. Resend is rate-limited via RPC (Phase 5); adding a player to another tournament does NOT re-send.';
comment on column public.player_invitations.superseded_at is
  'Set when a newer invite replaces this one. Combined with accepted_at, the partial unique index guarantees a single live token per player.';

-- ── updated_at triggers (reuse the existing shared function) ──────────────────
create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.update_updated_at_column();

create trigger player_invitations_set_updated_at
  before update on public.player_invitations
  for each row execute function public.update_updated_at_column();

-- ── RLS: enabled, NO policies yet (empty-table phase) ─────────────────────────
-- RLS is enabled so the tables are deny-by-default. Policies are intentionally
-- deferred to the application cutover. With no policies and no grants below to
-- anon/authenticated, only service_role (which bypasses RLS) and the owner reach
-- these tables for now.
alter table public.players            enable row level security;
alter table public.player_invitations enable row level security;

-- ── Grants: service_role only (owner has implicit access) ─────────────────────
revoke all on public.players            from anon, authenticated;
revoke all on public.player_invitations from anon, authenticated;
grant all on public.players            to service_role;
grant all on public.player_invitations to service_role;
