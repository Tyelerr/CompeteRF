-- 20260801120000_backfill_players_from_profiles.sql
-- Phase 2 of the Players / Pending Accounts migration.
-- See PENDING_ACCOUNTS_MIGRATION.md (§E.0, §I.4).
--
-- Backfills ONE players row for every existing profile (a competitive identity
-- for each authenticated account). ADDITIVE + IDEMPOTENT: re-running inserts only
-- profiles that do NOT yet have a linked player — guarded by NOT EXISTS on the
-- UNIQUE-when-present profile_id link. No existing row is modified or deleted; no
-- RLS/policy/schema change. Touches only the players table.
--
-- Status mapping (locked, §E.0): a live profile -> ACTIVE; a disabled / inactive /
-- soft-deleted profile -> DISABLED. With current data (Q-validated: 0 soft-deleted,
-- 0 disabled, 0 non-active of 110) this maps ALL 110 profiles to ACTIVE. The
-- expression is used (rather than a hardcoded 'ACTIVE') so the backfill stays
-- correct even if a profile's status changes between now and apply time.
--
-- Field mapping (source columns verified against the live profiles schema):
--   players.display_name  <- profiles.name          (NOT NULL)
--   players.first_name    <- profiles.first_name
--   players.last_name     <- profiles.last_name
--   players.email         <- profiles.email         (NOT NULL; email_normalized is GENERATED)
--   players.phone_e164    <- profiles.phone_number   (stored E.164 per column comment)
--   players.account_status<- CASE (live -> ACTIVE else DISABLED)
--   players.profile_id    <- profiles.id            (auth uid; the unique link)
--   players.activated_at  <- coalesce(profiles.created_at, now())
--   created_by_profile_id, invited_at -> NULL (system backfill, not invited)
--   id / created_at / updated_at -> table defaults

insert into public.players (
  display_name,
  first_name,
  last_name,
  email,
  phone_e164,
  account_status,
  profile_id,
  activated_at
)
select
  p.name,
  p.first_name,
  p.last_name,
  p.email,
  p.phone_number,
  case
    when p.deleted_at is null
     and p.is_disabled = false
     and p.status = 'active'
    then 'ACTIVE'
    else 'DISABLED'
  end,
  p.id,
  coalesce(p.created_at, now())
from public.profiles p
where not exists (
  select 1 from public.players pl where pl.profile_id = p.id
);
