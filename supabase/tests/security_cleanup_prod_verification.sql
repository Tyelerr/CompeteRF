-- supabase/tests/security_cleanup_prod_verification.sql
-- ROLLBACK-ONLY production verifier for 20261021140000_security_cleanup (admin push tokens /
-- notification forgery / phone-verified insert). Every probe runs in a sub-transaction that is
-- ALWAYS rolled back, and the block ends in RAISE EXCEPTION. pg_net requests queued inside are
-- rolled back with it, so NO push is sent. Output: NAME=OK:n | DENIED:sqlstate.
-- Actors (read-only picks): anon; basic 45; TD 256 (review director); super_admin 44; auth user
-- f210c314… (exists in auth.users, has NO profile — used for the signup-insert probes).

do $verify$
declare
  r text := '';
  n bigint;
  basic   constant text := 'd9339dc1-ae97-40a4-8a81-9650416cd5d5'; -- id_auto 45
  other   constant text := '70b8c2a0-df07-40ef-afaa-ecda279290ef'; -- id_auto 46
  td      constant text := '6be7d526-0380-4ba1-9e4a-a7c273477393'; -- id_auto 256
  sadmin  constant text := '76112114-118b-47ab-9cef-a3cffd82bd65'; -- id_auto 44
  noprof  constant text := 'f210c314-e820-4c8e-97e6-40face3cb768'; -- auth user without a profile
  nid bigint;
  q0 bigint;
  a0 bigint;
begin
  -- ── A: admin helpers ───────────────────────────────────────────────────────────────────────
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    select count(*) into n from public.get_admin_push_tokens(); r := r||' A_anon_admin_tokens=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_anon_admin_tokens=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    select count(*) into n from public.get_admin_id_autos(); r := r||' A_anon_admin_ids=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_anon_admin_ids=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    select count(public.get_user_last_sign_in(sadmin::uuid)) into n; r := r||' A_anon_last_sign_in=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_anon_last_sign_in=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    select count(*) into n from public.get_admin_push_tokens(); r := r||' A_basic_admin_tokens=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_basic_admin_tokens=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    select count(public.get_user_last_sign_in(sadmin::uuid)) into n; r := r||' A_basic_last_sign_in=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_basic_last_sign_in=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',sadmin,'role','authenticated')::text, true);
    select count(public.get_user_last_sign_in(basic::uuid)) into n; r := r||' A_admin_last_sign_in=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_admin_last_sign_in=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','service_role',true); perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    select count(*) into n from public.get_admin_push_tokens(); r := r||' A_service_admin_tokens=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' A_service_admin_tokens=DENIED:'||sqlstate; end if; end;

  -- ── B: notifications ───────────────────────────────────────────────────────────────────────
  begin perform set_config('role','anon',true); perform set_config('request.jwt.claims','{"role":"anon"}',true);
    insert into public.notifications (user_id, title, body, category, data) values (45, 'x', 'x', 'tournament_update', '{}');
    r := r||' B_anon_insert=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_anon_insert=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.notifications (user_id, title, body, category, data)
      values (46, 'Security alert', 'Verify your account', 'admin_alert', '{"deep_link":"https://evil.example/login"}');
    r := r||' B_basic_forge_other=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_basic_forge_other=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.notifications (user_id, title, body, category, data) values (45, 'x', 'x', 'tournament_update', '{}');
    r := r||' B_basic_insert_self=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_basic_insert_self=DENIED:'||sqlstate; end if; end;
  -- own notification: read / mark read (legit) / tamper / reassign
  begin
    insert into public.notifications (user_id, title, body, category, data, status) values (45, 'Real', 'Real body', 'tournament_update', '{"deep_link":"/tournament-detail?id=2847"}', 'sent') returning id into nid;
    perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    select count(*) into n from public.notifications where id = nid; r := r||' B_read_own=OK:'||n;
    update public.notifications set read_at = now() where id = nid; get diagnostics n = row_count; r := r||' B_mark_read=OK:'||n;
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_own_legit=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin
    insert into public.notifications (user_id, title, body, category, data) values (45, 'Real', 'Real', 'tournament_update', '{}') returning id into nid;
    perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.notifications set user_id = 46 where id = nid; get diagnostics n = row_count; r := r||' B_reassign_recipient=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_reassign_recipient=DENIED:'||sqlstate; end if; end;
  begin
    insert into public.notifications (user_id, title, body, category, data) values (45, 'Real', 'Real', 'tournament_update', '{}') returning id into nid;
    perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.notifications set title = 'Fake', data = '{"deep_link":"https://evil.example"}' where id = nid; get diagnostics n = row_count; r := r||' B_edit_own_payload=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_edit_own_payload=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.notifications set read_at = now() where user_id = 46; get diagnostics n = row_count; r := r||' B_edit_other=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_edit_other=DENIED:'||sqlstate; end if; end;
  -- staff: the legitimate client flows (tournament update to favoriters, search-alert match, giveaway)
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
    insert into public.notifications (user_id, title, body, category, data, status, sent_at)
      values (45, 'Tournament Updated', 'Start time changed', 'tournament_update', '{"tournament_id":2847,"deep_link":"/tournament-detail?id=2847"}', 'sent', now()),
             (45, 'Tournament Cancelled', 'x', 'tournament_update', '{"tournament_id":2847,"deep_link":"competerf:///tournament-detail?id=2847"}', 'sent', now()),
             (45, 'New match', 'x', 'search_alert_match', '{"tournament_id":2847,"deep_link":"/tournament-detail?id=2847","type":"search_alert_match"}', 'sent', now());
    r := r||' B_td_legit=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_td_legit=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
    insert into public.notifications (user_id, title, body, category, data) values (45, 'x', 'x', 'tournament_update', '{"deep_link":"https://evil.example"}');
    r := r||' B_td_external_link=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_td_external_link=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',td,'role','authenticated')::text, true);
    insert into public.notifications (user_id, title, body, category, data) values (45, 'Compete security', 'x', 'admin_alert', '{}');
    r := r||' B_td_admin_alert=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_td_admin_alert=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',sadmin,'role','authenticated')::text, true);
    insert into public.notifications (user_id, title, body, category, data, status, sent_at)
      values (45, 'You won!', 'x', 'giveaway_update', '{"giveaway_id":1,"deep_link":"/(tabs)/shop","type":"giveaway_winner"}', 'sent', now());
    r := r||' B_admin_giveaway=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_admin_giveaway=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  -- server-side creator (service role / definer): unaffected
  begin perform set_config('role','service_role',true); perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    insert into public.notifications (user_id, title, body, category, data) values (45, 'Table assigned', 'x', 'tournament_update', '{"deep_link":"/(tabs)/profile"}');
    r := r||' B_server_insert=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_server_insert=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  -- report → admin alert (server-side after the fix): admin in-app rows + one queued push, no client involvement
  begin
    select count(*) into a0 from public.notifications where category = 'admin_alert';
    select count(*) into q0 from net.http_request_queue;
    perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    insert into public.reports (reporter_id, content_type, content_id, reason) values (basic::uuid, 'tournament', '2847', 'spam');
    perform set_config('role','postgres',true);
    select count(*) - a0 into n from public.notifications where category = 'admin_alert'; r := r||' B_report_admin_rows=+'||n;
    select count(*) - q0 into n from net.http_request_queue; r := r||' B_report_push_queued=+'||n;
    raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' B_report=DENIED:'||sqlstate||':'||sqlerrm; end if; end;

  -- ── C: phone verification on INSERT ────────────────────────────────────────────────────────
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',noprof,'role','authenticated')::text, true);
    insert into public.profiles (id, email, name, user_name, home_state, phone_number, phone_verified_at, phone_verification_provider, phone_verification_method)
      values (noprof::uuid, 'probe@x.test', 'Probe User', 'probe_audit_x', 'AZ', '+15555550123', now(), 'telnyx', 'sms');
    r := r||' C_insert_verified_phone=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' C_insert_verified_phone=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',noprof,'role','authenticated')::text, true);
    insert into public.profiles (id, email, name, user_name, home_state, phone_verified_at)
      values (noprof::uuid, 'probe@x.test', 'Probe User', 'probe_audit_x', 'AZ', now());
    r := r||' C_insert_verified_ts=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' C_insert_verified_ts=DENIED:'||sqlstate; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',noprof,'role','authenticated')::text, true);
    -- exactly the public-build register / complete-profile payload
    insert into public.profiles (id, email, name, first_name, last_name, user_name, home_state, preferred_game, favorite_player, status)
      values (noprof::uuid, 'probe@x.test', 'Probe User', 'Probe', 'User', 'probe_audit_x', 'AZ', '9-ball', 'Efren', 'active');
    r := r||' C_signup_normal=OK'; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' C_signup_normal=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin
    -- the real two-step path: the user sets a pending phone, the verify Edge Function (service role) confirms it
    perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    perform public.set_sms_phone('+15555550123');
    perform set_config('role','service_role',true); perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    perform public.mark_phone_verified(basic::uuid, '+15555550123');
    select count(*) into n from public.profiles where id = basic::uuid and phone_verified_at is not null; r := r||' C_trusted_verify=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' C_trusted_verify=DENIED:'||sqlstate||':'||sqlerrm; end if; end;
  begin perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub',basic,'role','authenticated')::text, true);
    update public.profiles set phone_verified_at = now() where id = basic::uuid; get diagnostics n = row_count; r := r||' C_update_verified=OK:'||n; raise exception 'rb';
  exception when others then if sqlerrm <> 'rb' then r := r||' C_update_verified=DENIED:'||sqlstate; end if; end;

  raise exception 'RESULT:%', r;
end
$verify$;
