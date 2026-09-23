-- supabase/rollback/20260930120000_authz_rpcs_rollback.sql
--
-- Reverts 20260930120000_authz_rpcs.sql (M1). Only valid when M2 is NOT applied (or has been
-- rolled back first — M2's policies/triggers call the _authz_* helpers) AND no client build that
-- calls these RPCs is in use.
drop function if exists public.remove_venue_team_member(text, integer);
drop function if exists public.create_venue(jsonb, bigint[]);
drop function if exists public.admin_soft_delete_user(uuid);
drop function if exists public.admin_set_user_disabled(uuid, boolean);
drop function if exists public.admin_update_user(uuid, text, text, text, text, text);
drop function if exists public._admin_assert_not_last_super_admin(uuid);
drop function if exists public._admin_assert_can_manage(uuid, text);
drop function if exists public.recompute_user_role(bigint);
drop function if exists public._recompute_user_role(bigint);
drop function if exists public._authz_manages_venue(integer);
drop function if exists public._authz_is_admin();
drop function if exists public._authz_my_id_auto();
-- is_venue_owner had NO search_path before M1:
alter function public.is_venue_owner(integer) reset search_path;
