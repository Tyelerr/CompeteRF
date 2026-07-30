-- 20260805120000_phase5_rollback.sql
-- Standalone DOWN for 20260805120000_phase5_pending_accounts_registration.sql.
-- NOT a migration — run manually only if Phase 5 must be reverted. Wrap in a
-- transaction (begin; ... commit;) so it applies atomically.
--
-- Reversibility: everything is reversible BEFORE any pending-only competitor row is
-- created. The two constraint restorations (marked ⚠) will fail by design if a
-- pending registration or pending-captain team already exists — resolve/observe
-- those rows first; never force. Dropping functions/triggers/columns is always safe.

-- ── Triggers + functions (always safe) ──────────────────────────────────────────
drop trigger if exists on_auth_email_confirmed_claim_player on auth.users;
drop trigger if exists on_profile_created_provision_player   on public.profiles;

drop function if exists public.tg_claim_player_on_email_confirm();
drop function if exists public.tg_provision_player_for_profile();
drop function if exists public.claim_pending_player();
drop function if exists public._ensure_player_for_user(uuid);

drop function if exists public.get_player_invitation_status(uuid);
drop function if exists public.revoke_player_invitation(uuid, bigint);
drop function if exists public.issue_player_invitation(uuid, bigint, int);

drop function if exists public.td_add_team_member_by_uuid(bigint, uuid, int);
drop function if exists public.td_create_team_by_uuid(bigint, uuid, int);
drop function if exists public.register_player_for_tournament(bigint, uuid, int, text);
drop function if exists public.create_pending_player(bigint, text, text, text, text);
drop function if exists public.get_recent_players_for_registration(bigint, int);
drop function if exists public.search_players_for_registration(bigint, text, int);

drop function if exists public.mask_email(text);
drop function if exists public.is_staff();
drop function if exists public.can_manage_tournament(bigint);

-- ── player_invitations.revoked_at + one-live index (restore Phase 1 definition) ──
drop index if exists public.player_invitations_one_live_uidx;
create unique index player_invitations_one_live_uidx
  on public.player_invitations (player_id)
  where accepted_at is null and superseded_at is null;
alter table public.player_invitations drop column if exists revoked_at;

-- ── tournament_teams (⚠ set not null fails if any team has captain_id NULL) ──────
alter table public.tournament_teams
  drop constraint if exists tournament_teams_captain_identity_chk;
-- managed_by_profile_id is additive/nullable; leaving it is harmless. Full revert:
--   alter table public.tournament_teams drop column if exists managed_by_profile_id;
alter table public.tournament_teams
  alter column captain_id set not null;                       -- ⚠

-- ── tournament_players (⚠ restore fails if any row is player_uuid-only) ──────────
alter table public.tournament_players
  drop constraint if exists tournament_players_identity_chk;
alter table public.tournament_players
  add constraint tournament_players_identity_chk
  check (player_id is not null or guest_name is not null);    -- ⚠
