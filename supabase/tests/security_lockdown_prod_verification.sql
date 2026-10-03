-- supabase/tests/security_lockdown_prod_verification.sql
-- ROLLBACK-ONLY production verifier for 20261021130000_security_lockdown (2026-10-03).
-- Run: npx supabase db query --linked -f supabase/tests/security_lockdown_prod_verification.sql
-- Every test runs in its own sub-transaction that is ALWAYS rolled back (sentinel 'rb'), and the
-- block ends in RAISE EXCEPTION, so nothing persists. Output: one line of NAME=RESULT pairs.
--   OK:n        statement succeeded, n rows affected / returned
--   DENIED:code statement refused (42501 permission / P0001 guard / 23503 FK …)
-- Actors (picked read-only): anon; basic 45; TD 256 (director of hidden review events 2847–2851);
-- super_admin 44; participant d2f7b995… of conversation d27e56c9…. Targets: hidden review
-- tournaments 2847 (registration_closed) / 2849 (registration_open) / 2848, completed chip 2766
-- (rolled back), stranger conversation 7b6fcce1….

do $verify$
declare
  r text := '';
  n bigint;
  basic   constant text := 'd9339dc1-ae97-40a4-8a81-9650416cd5d5'; -- id_auto 45
  td      constant text := '6be7d526-0380-4ba1-9e4a-a7c273477393'; -- id_auto 256
  sadmin  constant text := '76112114-118b-47ab-9cef-a3cffd82bd65'; -- id_auto 44
  partic  constant text := 'd2f7b995-74df-465f-88ba-1b453062d8b8';
  conv_own constant uuid := 'd27e56c9-dade-421d-966c-acc03a30261d';
  conv_str constant uuid := '7b6fcce1-15ba-4853-8053-0026063dfa38';
  ts_before timestamptz;
  new_reg bigint;
begin
  -- ── ANON ───────────────────────────────────────────────────────────────────────────────────
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    update public.profiles_public set name = 'x' where id_auto = 45; get diagnostics n = row_count; r := r||' A_upd_profiles_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_upd_profiles_public=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    delete from public.profiles_public where id_auto = 45; get diagnostics n = row_count; r := r||' A_del_profiles_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_del_profiles_public=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    update public.chip_config_public set finished_at = now() where tournament_id = 2766; get diagnostics n = row_count; r := r||' A_upd_chip_config_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_upd_chip_config_public=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    delete from public.chip_config_public where tournament_id = 2766; get diagnostics n = row_count; r := r||' A_del_chip_config_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_del_chip_config_public=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    update public.chip_events_public set text = 'x' where tournament_id = 2766; get diagnostics n = row_count; r := r||' A_upd_chip_events_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_upd_chip_events_public=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    delete from public.chip_events_public where tournament_id = 2766; get diagnostics n = row_count; r := r||' A_del_chip_events_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_del_chip_events_public=DENIED:'||sqlstate; end if; end;
  begin
    select updated_at into ts_before from public.tournaments where id = 2848;
    perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    perform public.hide_tournament_and_resolve_report(2848, null, sadmin::uuid);
    perform set_config('role','postgres',true);
    select count(*) into n from public.tournaments where id = 2848 and updated_at is distinct from ts_before;
    r := r||' A_hide_rpc=OK:changed'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_hide_rpc=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    select count(email) into n from public.profiles; r := r||' A_read_emails=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_read_emails=DENIED:'||sqlstate; end if; end;
  -- legit anon reads (spectator / public profile surface)
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    select count(*) into n from public.profiles_public; r := r||' A_read_profiles_public=OK:'||n;
    select count(*) into n from public.chip_config_public where tournament_id = 2766; r := r||' A_read_chip_config_public=OK:'||n;
    select count(*) into n from public.chip_events_public where tournament_id = 2766; r := r||' A_read_chip_events_public=OK:'||n;
    select count(*) into n from public.chip_entries_public where tournament_id = 2766; r := r||' A_read_chip_entries_public=OK:'||n;
    select count(*) into n from public.tournament_players where tournament_id = 2766; r := r||' A_read_roster=OK:'||n;
    select count(*) into n from public.tournaments where is_hidden = false and status = 'active'; r := r||' A_browse=OK:'||n;
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_legit_reads=DENIED:'||sqlstate||':'||sqlerrm; end if; end;

  -- ── BASIC USER 45 ─────────────────────────────────────────────────────────────────────────
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.profiles_public set name = 'x' where id_auto = 46; get diagnostics n = row_count; r := r||' U_upd_profiles_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_upd_profiles_public=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.chip_config_public set finished_at = now() where tournament_id = 2766; get diagnostics n = row_count; r := r||' U_upd_chip_config_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_upd_chip_config_public=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    delete from public.chip_events_public where tournament_id = 2766; get diagnostics n = row_count; r := r||' U_del_chip_events_public=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_del_chip_events_public=DENIED:'||sqlstate; end if; end;
  begin
    select updated_at into ts_before from public.tournaments where id = 2848;
    perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    perform public.hide_tournament_and_resolve_report(2848, null, sadmin::uuid);
    perform set_config('role','postgres',true);
    select count(*) into n from public.tournaments where id = 2848 and updated_at is distinct from ts_before;
    r := r||' U_hide_rpc=OK:changed'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_hide_rpc=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.profiles set fargo = 799, fargo_status = 'verified' where id = basic::uuid; get diagnostics n = row_count; r := r||' U_self_verify_fargo=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_self_verify_fargo=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.profiles set total_winnings = 99999 where id = basic::uuid; get diagnostics n = row_count; r := r||' U_self_winnings=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_self_winnings=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.profiles set home_state = 'AZ', favorite_player = 'audit' where id = basic::uuid; get diagnostics n = row_count; r := r||' U_self_edit_allowed=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_self_edit_allowed=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    select count(email) into n from public.profiles where id_auto = 46; r := r||' U_read_other_email=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_read_other_email=DENIED:'||sqlstate; end if; end;
  -- registration escalation
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.tournament_players (tournament_id, player_id, status, paid_entry, checked_in_at, seed)
      values (2847, 45, 'checked_in', true, now(), 1); r := r||' U_reg_closed_privileged=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_reg_closed_privileged=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.tournament_players (tournament_id, player_id, status) values (2847, 45, 'preregistered'); r := r||' U_reg_closed_plain=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_reg_closed_plain=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.tournament_players (tournament_id, player_id, status, paid_entry) values (2849, 45, 'checked_in', true); r := r||' U_reg_open_privileged=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_reg_open_privileged=DENIED:'||sqlstate; end if; end;
  -- legit self-service: preregister (with a suggested Fargo) → edit suggestion → cancel → re-register
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.tournament_players (tournament_id, player_id, status, fargo_rating) values (2849, 45, 'preregistered', 520) returning id into new_reg;
    r := r||' U_prereg=OK';
    update public.tournament_players set fargo_rating = 530 where id = new_reg; get diagnostics n = row_count; r := r||' U_edit_suggested_fargo=OK:'||n;
    update public.tournament_players set status = 'cancelled' where id = new_reg; get diagnostics n = row_count; r := r||' U_cancel_own=OK:'||n;
    update public.tournament_players set status = 'preregistered' where id = new_reg; get diagnostics n = row_count; r := r||' U_reregister=OK:'||n;
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_selfservice=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  -- own row then self-promote (each attempt separately)
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.tournament_players (tournament_id, player_id, status) values (2849, 45, 'preregistered') returning id into new_reg;
    update public.tournament_players set paid_entry = true where id = new_reg; get diagnostics n = row_count; r := r||' U_self_paid=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_self_paid=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.tournament_players (tournament_id, player_id, status) values (2849, 45, 'preregistered') returning id into new_reg;
    update public.tournament_players set status = 'checked_in', checked_in_at = now() where id = new_reg; get diagnostics n = row_count; r := r||' U_self_checkin=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_self_checkin=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.tournament_players (tournament_id, player_id, status) values (2849, 45, 'preregistered') returning id into new_reg;
    update public.tournament_players set paid_side_pots = '["Mini"]'::jsonb where id = new_reg; get diagnostics n = row_count; r := r||' U_self_sidepot=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_self_sidepot=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.tournament_players set paid_entry = true where tournament_id in (2847, 2849) and player_id is distinct from 45; get diagnostics n = row_count; r := r||' U_alter_other_reg=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_alter_other_reg=DENIED:'||sqlstate; end if; end;
  -- conversations
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.conversation_participants (conversation_id, user_id) values (conv_str, basic::uuid); r := r||' U_join_stranger_conv=OK';
    select count(*) into n from public.conversation_messages where conversation_id = conv_str; r := r||' U_then_read_msgs='||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_join_stranger_conv=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    select count(*) into n from public.conversation_messages where conversation_id = conv_str; r := r||' U_read_stranger_msgs=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_read_stranger_msgs=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.conversation_participants set last_read_at = now() where conversation_id = conv_str; get diagnostics n = row_count; r := r||' U_modify_other_participant=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' U_modify_other_participant=DENIED:'||sqlstate; end if; end;
  -- legit participant: mark read, archive / unarchive; move own row → refused after
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',partic,'role','authenticated')::text, true);
    update public.conversation_participants set last_read_at = now() where conversation_id = conv_own and user_id = partic::uuid; get diagnostics n = row_count; r := r||' P_mark_read=OK:'||n;
    update public.conversation_participants set archived_at = now() where conversation_id = conv_own and user_id = partic::uuid; get diagnostics n = row_count; r := r||' P_archive=OK:'||n;
    update public.conversation_participants set archived_at = null where conversation_id = conv_own and user_id = partic::uuid; get diagnostics n = row_count; r := r||' P_unarchive=OK:'||n;
    select count(*) into n from public.conversation_messages where conversation_id = conv_own; r := r||' P_read_own_msgs=OK:'||n;
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' P_legit=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',partic,'role','authenticated')::text, true);
    update public.conversation_participants set conversation_id = conv_str where conversation_id = conv_own and user_id = partic::uuid; get diagnostics n = row_count; r := r||' P_move_own_row=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' P_move_own_row=DENIED:'||sqlstate; end if; end;

  -- ── TD 256 (director of the hidden review events) ─────────────────────────────────────────
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
    insert into public.tournament_players (tournament_id, player_id, status, paid_entry, checked_in_at) values (2847, 45, 'checked_in', true, now()) returning id into new_reg;
    r := r||' T_add_checked_in_closed=OK';
    update public.tournament_players set paid_side_pots = '["Mini"]'::jsonb, seed = 3, fargo_rating = 610 where id = new_reg; get diagnostics n = row_count; r := r||' T_edit_reg=OK:'||n;
    update public.tournament_players set status = 'no_show' where id = new_reg; get diagnostics n = row_count; r := r||' T_no_show=OK:'||n;
    update public.tournament_players set status = 'checked_in' where id = new_reg; get diagnostics n = row_count; r := r||' T_reactivate=OK:'||n;
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' T_reg_flow=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
    update public.tournament_players set paid_entry = not coalesce(paid_entry,false) where tournament_id = 2849; get diagnostics n = row_count; r := r||' T_mark_paid=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' T_mark_paid=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
    select id into new_reg from public.tournament_players where tournament_id = 2849 and status <> 'cancelled' limit 1;
    perform public.approve_registration_with_fargo(new_reg, 555); r := r||' T_approve_with_fargo=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' T_approve_with_fargo=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
    select count(email) into n from public.profiles where id = td::uuid; r := r||' T_read_own_email=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' T_read_own_email=DENIED:'||sqlstate; end if; end;

  -- ── SUPER ADMIN 44 ────────────────────────────────────────────────────────────────────────
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',sadmin,'role','authenticated')::text, true);
    update public.tournaments set is_hidden = true, updated_at = now() where id = 2848; get diagnostics n = row_count; r := r||' S_hide_via_app_path=OK:'||n;
    update public.profiles set total_winnings = coalesce(total_winnings,0) + 1 where id_auto = 45; get diagnostics n = row_count; r := r||' S_award_winnings=OK:'||n;
    select count(email) into n from public.profiles; r := r||' S_read_emails=OK:'||n;
    insert into public.tournament_players (tournament_id, player_id, status, paid_entry) values (2847, 45, 'checked_in', true); r := r||' S_add_player=OK';
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' S_admin=DENIED:'||sqlstate||':'||sqlerrm; end if; end;

  raise exception 'RESULT:%', r;
end
$verify$;
