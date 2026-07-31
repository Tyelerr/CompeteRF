-- 20260810120000_phase5_pending_player_edit_rollback.sql
-- Standalone DOWN: remove update_pending_player and restore the prior
-- claim_pending_player (generic messages). Wrap in a transaction.

drop function if exists public.update_pending_player(bigint, uuid, text, text, text, text);
drop function if exists public.get_pending_player(bigint, uuid);

create or replace function public.claim_pending_player()
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      uuid := auth.uid();
  v_player   uuid;
  v_verified timestamptz;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  v_player := public._ensure_player_for_user(v_uid);
  if v_player is not null then return v_player; end if;

  select email_confirmed_at into v_verified from auth.users where id = v_uid;
  if v_verified is null then
    raise exception 'Verify your email to finish setting up your player profile';
  end if;
  raise exception 'Unable to link a player profile for this account';
end;
$$;

revoke all on function public.claim_pending_player() from public, anon;
grant execute on function public.claim_pending_player() to authenticated;
