-- 20260811120000_fix_update_pending_player_array.sql
-- Bugfix for 20260810120000: `v_changed text[] || 'first_name'` was parsed as an
-- array-literal concat and raised "malformed array literal". Use array_append().
-- CREATE OR REPLACE — body identical except the four appends.

create or replace function public.update_pending_player(
  p_tournament_id bigint,
  p_player_id     uuid,
  p_first_name    text,
  p_last_name     text,
  p_email         text,
  p_phone         text default null
)
  returns table (
    player_id      uuid,
    outcome        text,
    account_status text,
    display_name   text,
    email_masked   text
  )
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last  text := btrim(coalesce(p_last_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_norm  text := lower(btrim(coalesce(p_email, '')));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_cur   public.players%rowtype;
  v_other public.players%rowtype;
  v_actor_ida  bigint;
  v_actor_role text;
  v_changed    text[] := '{}';
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not authorized to edit players for this tournament';
  end if;
  if v_first = '' or v_last = '' then
    raise exception 'First and last name are required';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email is required';
  end if;

  select * into v_cur from public.players where id = p_player_id for update;
  if not found then
    raise exception 'Player not found for this tournament';
  end if;

  if not exists (
        select 1 from public.tournament_players tp
        where tp.tournament_id = p_tournament_id and tp.player_uuid = p_player_id and tp.status <> 'cancelled'
      )
     and not exists (
        select 1 from public.tournament_team_members m
        where m.tournament_id = p_tournament_id and m.player_uuid = p_player_id and m.invite_status <> 'declined'
      ) then
    raise exception 'Player not found for this tournament';
  end if;

  if v_cur.account_status <> 'PENDING' or v_cur.profile_id is not null then
    raise exception 'This player has been claimed and can no longer be edited'
      using errcode = 'check_violation';
  end if;

  select * into v_other from public.players
   where email_normalized = v_norm and id <> p_player_id;
  if found then
    if v_other.account_status = 'ACTIVE' then
      return query select v_other.id, 'EMAIL_BELONGS_TO_ACTIVE_PLAYER'::text,
        v_other.account_status, v_other.display_name, public.mask_email(v_other.email);
      return;
    elsif v_other.account_status = 'PENDING' then
      return query select v_other.id, 'EMAIL_BELONGS_TO_PENDING_PLAYER'::text,
        v_other.account_status, v_other.display_name, public.mask_email(v_other.email);
      return;
    else
      raise exception 'An account with this email is disabled; contact an admin'
        using errcode = 'check_violation';
    end if;
  end if;

  -- FIX: array_append (was `v_changed || 'literal'`, which parsed as an array literal).
  if btrim(coalesce(v_cur.first_name, '')) <> v_first then v_changed := array_append(v_changed, 'first_name'); end if;
  if btrim(coalesce(v_cur.last_name, ''))  <> v_last  then v_changed := array_append(v_changed, 'last_name');  end if;
  if lower(btrim(coalesce(v_cur.email, ''))) <> v_norm then v_changed := array_append(v_changed, 'email');      end if;
  if coalesce(v_cur.phone_e164, '') <> coalesce(v_phone, '') then v_changed := array_append(v_changed, 'phone'); end if;

  update public.players
     set first_name   = v_first,
         last_name    = v_last,
         display_name = v_first || ' ' || v_last,
         email        = v_email,
         phone_e164   = v_phone,
         updated_at   = now()
   where id = p_player_id;

  if 'email' = any (v_changed) then
    update public.player_invitations
       set superseded_at = now()
     where player_id = p_player_id
       and accepted_at is null and superseded_at is null and revoked_at is null;
  end if;

  select id_auto, role into v_actor_ida, v_actor_role from public.profiles where id = auth.uid();
  insert into public.audit_log (user_id, user_role, action, entity_type, entity_id, details)
  values (
    v_actor_ida, v_actor_role, 'update_pending_player', 'player', null,
    jsonb_build_object(
      'player_id',        p_player_id,
      'tournament_id',    p_tournament_id,
      'changed',          v_changed,
      'old_email_masked', public.mask_email(v_cur.email),
      'new_email_masked', public.mask_email(v_email)
    )
  );

  return query select p_player_id, 'UPDATED'::text, 'PENDING'::text,
                      v_first || ' ' || v_last, public.mask_email(v_email);

exception when unique_violation then
  select * into v_other from public.players where email_normalized = v_norm and id <> p_player_id;
  if found then
    return query select v_other.id,
      case when v_other.account_status = 'ACTIVE'
           then 'EMAIL_BELONGS_TO_ACTIVE_PLAYER' else 'EMAIL_BELONGS_TO_PENDING_PLAYER' end,
      v_other.account_status, v_other.display_name, public.mask_email(v_other.email);
    return;
  end if;
  raise;
end;
$$;
