-- phase5_pending_edit_verification.sql
-- Rolled-back verification for 20260810120000_phase5_pending_player_edit.sql.
-- RUN IN STAGING AFTER apply. One transaction, ends in ROLLBACK — persists nothing.
-- Impersonates callers via request.jwt.claims (auth.uid() reads it).

begin;
create temp table _p5e (n int, name text, passed boolean, detail text);

do $$
declare
  v_tid       bigint; v_venue int;
  v_dir_ida   bigint; v_dir_uid uuid;
  v_stranger  uuid;
  v_active_email text;
  v_pending   uuid;   v_out text;
  v_pending2  uuid;
  v_pending3  uuid;
  v_unrel     uuid;   -- pending player NOT attached to the tournament
  v_row       public.players%rowtype;
  v_cnt       int;    v_first text; v_email text;
  v_claim_uid uuid := gen_random_uuid();
  v_claim_email text := 'p5e.' || replace(gen_random_uuid()::text,'-','') || '@example.com';
  v_new_email   text := 'p5e.new.' || replace(gen_random_uuid()::text,'-','') || '@example.com';
  v_linked uuid; v_linked2 uuid;
begin
  select t.id, t.venue_id, t.director_id into v_tid, v_venue, v_dir_ida
  from public.tournaments t where t.director_id is not null and t.venue_id is not null
  order by t.id limit 1;
  if v_tid is null then insert into _p5e values (0,'fixtures',false,'no venue-backed tournament'); return; end if;
  select id into v_dir_uid from public.profiles where id_auto = v_dir_ida;
  select id into v_stranger from public.profiles where coalesce(role,'basic_user')='basic_user' and id_auto <> v_dir_ida order by id_auto limit 1;
  select email into v_active_email from public.players where account_status='ACTIVE' and email is not null limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_dir_uid)::text, true);

  -- Seed pending players and ATTACH the editable ones to the tournament (edit requires
  -- the player be associated with the tournament).
  select player_id into v_pending  from public.create_pending_player(v_tid,'Edit','Target', v_claim_email);
  select player_id into v_pending2 from public.create_pending_player(v_tid,'Other','Pending','o.'||v_claim_email);
  select player_id into v_pending3 from public.create_pending_player(v_tid,'Third','Pending','t.'||v_claim_email);
  select player_id into v_unrel    from public.create_pending_player(v_tid,'Unrel','Ated','u.'||v_claim_email);
  perform public.register_player_for_tournament(v_tid, v_pending, 500);
  perform public.register_player_for_tournament(v_tid, v_pending2, 500);
  perform public.register_player_for_tournament(v_tid, v_pending3, 500);
  -- v_unrel is intentionally NOT attached; also cancel any auto-link by leaving it off.

  -- 1. Normal edit.
  select outcome into v_out from public.update_pending_player(v_tid, v_pending, 'Edited','Name', v_new_email, '+14805551234');
  select * into v_row from public.players where id = v_pending;
  insert into _p5e values (1,'normal pending edit',
    v_out='UPDATED' and v_row.first_name='Edited' and v_row.email=v_new_email and v_row.phone_e164='+14805551234',
    format('outcome=%s email=%s phone=%s', v_out, v_row.email, v_row.phone_e164));

  -- 2. Case/whitespace normalization.
  select outcome into v_out from public.update_pending_player(v_tid, v_pending, 'Edited','Name', '  '||upper(v_new_email)||'  ', '+14805551234');
  select * into v_row from public.players where id = v_pending;
  insert into _p5e values (2,'case/space normalized', v_out='UPDATED' and v_row.email_normalized = lower(v_new_email),
    format('norm=%s', v_row.email_normalized));

  -- 3. Collision with ACTIVE (no change, no raw email).
  if v_active_email is null then insert into _p5e values (3,'collide ACTIVE',false,'no active fixture');
  else
    select outcome into v_out from public.update_pending_player(v_tid, v_pending, 'Edited','Name', v_active_email, '+14805551234');
    select * into v_row from public.players where id = v_pending;
    -- Record must be UNCHANGED on collision (compare normalized, since email is stored as-entered).
    insert into _p5e values (3,'collide ACTIVE -> reject', v_out='EMAIL_BELONGS_TO_ACTIVE_PLAYER' and v_row.email_normalized=lower(v_new_email), format('outcome=%s norm=%s', v_out, v_row.email_normalized));
  end if;

  -- 4. Collision with PENDING (no change).
  select outcome into v_out from public.update_pending_player(v_tid, v_pending, 'Edited','Name', 'o.'||v_claim_email, '+14805551234');
  select * into v_row from public.players where id = v_pending;
  insert into _p5e values (4,'collide PENDING -> reject', v_out='EMAIL_BELONGS_TO_PENDING_PLAYER' and v_row.email_normalized=lower(v_new_email), format('outcome=%s norm=%s', v_out, v_row.email_normalized));

  -- 5. Edit an ACTIVE player -> rejected.
  begin
    perform public.update_pending_player(v_tid, (select id from public.players where account_status='ACTIVE' limit 1), 'No','Edit','nope.'||v_claim_email, null);
    insert into _p5e values (5,'edit ACTIVE rejected', false, 'expected exception');
  exception when others then insert into _p5e values (5,'edit ACTIVE rejected', true, sqlerrm); end;

  -- 6. Unauthorized caller -> rejected.
  if v_stranger is null then insert into _p5e values (6,'unauthorized rejected',false,'no basic_user fixture');
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger)::text, true);
    begin
      perform public.update_pending_player(v_tid, v_pending, 'Hack','Attempt','h.'||v_claim_email, null);
      insert into _p5e values (6,'unauthorized rejected', false, 'expected exception');
    exception when others then insert into _p5e values (6,'unauthorized rejected', true, sqlerrm); end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_dir_uid)::text, true);
  end if;

  -- 7. Unique index guards concurrency (true 2-session race not simulatable here).
  select count(*) into v_cnt from pg_indexes where schemaname='public' and indexname='players_email_normalized_uidx';
  insert into _p5e values (7,'unique index present', v_cnt=1, format('present=%s', v_cnt));

  -- 10. Edit a pending player NOT attached to this tournament -> generic not found.
  begin
    perform public.update_pending_player(v_tid, v_unrel, 'X','Y','x.'||v_claim_email, null);
    insert into _p5e values (10,'edit unrelated -> not found', false, 'expected exception');
  exception when others then insert into _p5e values (10,'edit unrelated -> not found', sqlerrm ilike '%not found%', sqlerrm); end;

  -- 11. Fetch raw details for an unrelated player -> empty.
  select count(*) into v_cnt from public.get_pending_player(v_tid, v_unrel);
  insert into _p5e values (11,'get unrelated raw -> empty', v_cnt=0, format('rows=%s', v_cnt));
  -- (control) attached player returns raw fields
  select first_name, email into v_first, v_email from public.get_pending_player(v_tid, v_pending2);
  insert into _p5e values (18,'get attached raw -> rows', v_first is not null, format('first=%s', v_first));

  -- 12. Anonymous caller -> both RPCs denied.
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.update_pending_player(v_tid, v_pending2, 'A','B','a.'||v_claim_email, null);
    insert into _p5e values (12,'anon denied (update)', false, 'expected exception');
  exception when others then insert into _p5e values (12,'anon denied (update)', true, sqlerrm); end;
  begin
    -- get_pending_player raises 'Not authorized' when can_manage_tournament is false (anon).
    select count(*) into v_cnt from public.get_pending_player(v_tid, v_pending2);
    insert into _p5e values (19,'anon denied (get)', false, format('rows=%s (expected raise)', v_cnt));
  exception when others then insert into _p5e values (19,'anon denied (get)', true, sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_dir_uid)::text, true);

  -- 16. Invitation supersede rolls back when the update is not performed (collision).
  perform public.issue_player_invitation(v_pending2, v_tid, 168);
  select outcome into v_out from public.update_pending_player(v_tid, v_pending2, 'Other','Pending', 't.'||v_claim_email, null); -- collides with v_pending3
  select count(*) into v_cnt from public.player_invitations
   where player_id = v_pending2 and accepted_at is null and superseded_at is null and revoked_at is null;
  insert into _p5e values (16,'invite not superseded on collision', v_out='EMAIL_BELONGS_TO_PENDING_PLAYER' and v_cnt=1, format('outcome=%s live_invites=%s', v_out, v_cnt));

  -- 17. Grants + SECURITY DEFINER correctness.
  select count(*) into v_cnt from pg_proc p
   where p.pronamespace='public'::regnamespace
     and p.proname in ('update_pending_player','get_pending_player','claim_pending_player')
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not has_function_privilege('anon', p.oid, 'EXECUTE');
  insert into _p5e values (17,'definer + grants (authenticated only)', v_cnt=3, format('ok_fns=%s/3', v_cnt));

  -- 8. Claim with the corrected email links the SAME row (ACTIVE).
  insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
    values (v_claim_uid, v_new_email, now(), now(), now());
  insert into public.profiles (id, email, name, user_name, home_state)
    values (v_claim_uid, v_new_email, 'Edited Name', 'ed_'||replace(v_claim_uid::text,'-',''), 'TX');
  perform set_config('request.jwt.claims', json_build_object('sub', v_claim_uid)::text, true);
  v_linked := public.claim_pending_player();
  insert into _p5e values (8,'claim corrected email links',
    v_linked = v_pending and (select account_status from public.players where id=v_pending)='ACTIVE',
    format('linked=%s expected=%s', v_linked, v_pending));

  -- 13. Claim is idempotent (repeat by same account -> same id, no error).
  v_linked2 := public.claim_pending_player();
  select count(*) into v_cnt from public.players where profile_id = v_claim_uid;
  insert into _p5e values (13,'claim idempotent', v_linked2 = v_pending and v_cnt=1, format('linked=%s rows=%s', v_linked2, v_cnt));
  perform set_config('request.jwt.claims', json_build_object('sub', v_dir_uid)::text, true);

  -- 14. Edit racing a claim: v_pending is now ACTIVE -> edit rejected.
  begin
    perform public.update_pending_player(v_tid, v_pending, 'Too','Late','late.'||v_claim_email, null);
    insert into _p5e values (14,'edit after claim rejected', false, 'expected exception');
  exception when others then insert into _p5e values (14,'edit after claim rejected', sqlerrm ilike '%claimed%', sqlerrm); end;

  -- 9. Old (typo) email does NOT capture the edited player.
  declare v_old_uid uuid := gen_random_uuid();
  begin
    insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
      values (v_old_uid, v_claim_email, now(), now(), now());
    insert into public.profiles (id, email, name, user_name, home_state)
      values (v_old_uid, v_claim_email, 'Typo', 'typo_'||replace(v_old_uid::text,'-',''), 'TX');
    select count(*) into v_cnt from public.players where profile_id = v_old_uid;
    insert into _p5e values (9,'old email does not capture edited player',
      v_cnt=1 and not exists (select 1 from public.players where profile_id=v_old_uid and id=v_pending),
      format('own_rows=%s', v_cnt));
  end;
end $$;

select n, name, passed, detail from _p5e order by n;
rollback;
