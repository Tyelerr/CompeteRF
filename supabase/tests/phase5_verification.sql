-- phase5_verification.sql
-- Rolled-back verification for 20260805120000_phase5_pending_accounts_registration.sql.
-- RUN IN STAGING AFTER the migration is applied. The whole script runs in ONE
-- transaction that ROLLS BACK at the end — it mutates nothing permanently.
--
-- It impersonates users by setting request.jwt.claims (which auth.uid() reads), so
-- SECURITY DEFINER RPCs authorize exactly as they would for a real caller. It reuses
-- an existing venue-backed tournament + existing profiles, and creates only the
-- auth.users/profiles rows required for the signup/claim scenarios (13–17).
--
-- Output: a pass/fail table (one row per scenario). Every `passed` should be true;
-- any scenario that cannot find suitable fixtures reports passed=false with a reason.

begin;

create temp table _p5 (n int, name text, passed boolean, detail text);

do $$
declare
  v_tid        bigint;
  v_venue      int;
  v_dir_ida    bigint;  v_dir_uid    uuid;
  v_admin_uid  uuid;
  v_owner_uid  uuid;    v_owner_ida  bigint;
  v_stranger   uuid;
  v_active_pid uuid;
  v_pending    uuid;    v_outcome text;
  v_reuse      uuid;
  v_active_out text;
  v_reg        bigint;
  v_reg_row    public.tournament_players%rowtype;
  v_team       bigint;
  v_team_row   public.tournament_teams%rowtype;
  v_claim_email text := 'phase5.claim.' || replace(gen_random_uuid()::text,'-','') || '@example.com';
  v_new_email   text := 'phase5.new.'   || replace(gen_random_uuid()::text,'-','') || '@example.com';
  v_claim_uid  uuid := gen_random_uuid();
  v_new_uid    uuid := gen_random_uuid();
  v_linked     uuid;
  v_cnt        int;
  v_ok         boolean;
begin
  -- ── Fixtures (reuse existing venue-backed tournament + profiles) ──────────────
  select t.id, t.venue_id, t.director_id
    into v_tid, v_venue, v_dir_ida
  from public.tournaments t
  where t.director_id is not null and t.venue_id is not null
  order by t.id limit 1;
  if v_tid is null then
    insert into _p5 values (0,'fixtures',false,'no venue-backed tournament with a director found'); return;
  end if;
  select id into v_dir_uid   from public.profiles where id_auto = v_dir_ida;
  select id into v_admin_uid from public.profiles where role in ('super_admin','compete_admin') order by id_auto limit 1;
  select id, id_auto into v_owner_uid, v_owner_ida
    from public.profiles where id_auto <> v_dir_ida order by id_auto limit 1;
  select id into v_stranger
    from public.profiles p
    where p.id_auto not in (v_dir_ida, v_owner_ida)
      and coalesce(p.role,'basic_user') = 'basic_user'
    order by p.id_auto limit 1;
  -- Grant the "owner" venue authority for THIS venue (temp; rolled back).
  insert into public.venue_owners(venue_id, owner_id, assigned_at) values (v_venue, v_owner_ida, now());
  -- An existing ACTIVE competitive identity to register (register-active test).
  select id into v_active_pid from public.players where profile_id = v_owner_uid;

  -- helper: impersonate
  -- (perform set_config in each section; auth.uid() then returns that uuid)

  -- ── 6. Unauthorized user is rejected ─────────────────────────────────────────
  if v_stranger is null then
    insert into _p5 values (6,'unauthorized rejected',false,'no basic_user fixture found');
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger)::text, true);
    begin
      perform public.create_pending_player(v_tid,'No','Auth','noauth.'||v_claim_email);
      insert into _p5 values (6,'unauthorized rejected',false,'expected exception, none raised');
    exception when others then
      insert into _p5 values (6,'unauthorized rejected',true, sqlerrm);
    end;
  end if;

  -- Everything below runs as the tournament DIRECTOR unless noted.
  perform set_config('request.jwt.claims', json_build_object('sub', v_dir_uid)::text, true);

  -- ── 3. Create a brand-new PENDING player ─────────────────────────────────────
  select player_id, outcome into v_pending, v_outcome
  from public.create_pending_player(v_tid,'Casey','Newpend', v_claim_email);
  insert into _p5 values (3,'create pending', v_pending is not null and v_outcome='CREATED_PENDING',
                          format('id=%s outcome=%s', v_pending, v_outcome));

  -- ── 4. Reuse existing PENDING by normalized email (case/space-insensitive) ────
  select player_id, outcome into v_reuse, v_outcome
  from public.create_pending_player(v_tid,'Casey','Newpend', '  ' || upper(v_claim_email) || ' ');
  insert into _p5 values (4,'reuse pending (MATCHED_PENDING)',
                          v_reuse = v_pending and v_outcome='MATCHED_PENDING',
                          format('id=%s outcome=%s', v_reuse, v_outcome));

  -- ── 5. Existing ACTIVE email returns MATCHED_ACTIVE ──────────────────────────
  select outcome into v_active_out
  from public.create_pending_player(v_tid,'Any','Name',
        (select email from public.players where id = v_active_pid));
  insert into _p5 values (5,'existing active (MATCHED_ACTIVE)', v_active_out='MATCHED_ACTIVE',
                          format('outcome=%s', v_active_out));

  -- ── 1. Search returns PENDING and ACTIVE ─────────────────────────────────────
  select count(*) into v_cnt from public.search_players_for_registration(v_tid,'Newpend',20)
    where account_status='PENDING';
  v_ok := v_cnt >= 1;
  select count(*) into v_cnt from public.search_players_for_registration(
      v_tid, left((select display_name from public.players where id=v_active_pid),3), 20)
    where account_status='ACTIVE';
  insert into _p5 values (1,'search returns pending+active', v_ok and v_cnt >= 1,
                          format('active_hits=%s', v_cnt));

  -- ── 2. Search does not duplicate a linked ACTIVE player ──────────────────────
  select count(*) - count(distinct player_id) into v_cnt
  from public.search_players_for_registration(
      v_tid, left((select display_name from public.players where id=v_active_pid),3), 50);
  insert into _p5 values (2,'search no duplicate rows', v_cnt = 0, format('dupes=%s', v_cnt));

  -- ── 8. Register a PENDING player by players.id (uuid-only row) ────────────────
  v_reg := public.register_player_for_tournament(v_tid, v_pending, 500);
  select * into v_reg_row from public.tournament_players where id = v_reg;
  insert into _p5 values (8,'register pending by uuid',
                          v_reg_row.player_uuid = v_pending and v_reg_row.player_id is null,
                          format('uuid=%s legacy=%s', v_reg_row.player_uuid, v_reg_row.player_id));

  -- ── 9. Register an ACTIVE player (uuid + legacy id_auto dual-write) ───────────
  v_reg := public.register_player_for_tournament(v_tid, v_active_pid, 600);
  select * into v_reg_row from public.tournament_players where id = v_reg;
  insert into _p5 values (9,'register active dual-write',
                          v_reg_row.player_uuid = v_active_pid and v_reg_row.player_id is not null,
                          format('uuid=%s legacy=%s', v_reg_row.player_uuid, v_reg_row.player_id));

  -- ── 10. Waiting-for-teammate team with a PENDING captain ─────────────────────
  -- (fresh pending captain so it isn't already registered above)
  select player_id into v_reuse from public.create_pending_player(v_tid,'Cap','Tainpend',
      'cap.'||v_claim_email);
  v_team := public.td_create_team_by_uuid(v_tid, v_reuse, 450);
  select * into v_team_row from public.tournament_teams where id = v_team;
  insert into _p5 values (10,'waiting team, pending captain',
      v_team_row.status='pending_partner' and v_team_row.captain_player_id=v_reuse
      and v_team_row.captain_id is null and v_team_row.managed_by_profile_id = v_dir_uid,
      format('status=%s cap_uuid=%s legacy=%s mgr=%s',
             v_team_row.status, v_team_row.captain_player_id, v_team_row.captain_id, v_team_row.managed_by_profile_id));

  -- ── 11. Add a teammate later (ACTIVE partner) ────────────────────────────────
  begin
    perform public.td_add_team_member_by_uuid(v_team, v_active_pid, 610);
    select count(*) into v_cnt from public.tournament_team_members where team_id = v_team and invite_status <> 'declined';
    insert into _p5 values (11,'add teammate later', v_cnt = 2, format('members=%s', v_cnt));
  exception when others then
    insert into _p5 values (11,'add teammate later', false, sqlerrm);
  end;

  -- ── 12. Prevent the same player twice (captain cannot be their own partner) ───
  begin
    perform public.td_add_team_member_by_uuid(v_team, v_reuse, 450);
    insert into _p5 values (12,'prevent same player twice', false, 'expected exception, none raised');
  exception when others then
    insert into _p5 values (12,'prevent same player twice', true, sqlerrm);
  end;

  -- ── 18. Invitation is decoupled: create/register succeed independently ────────
  -- (player + registration already committed above WITHOUT any invite call)
  select count(*) into v_cnt from public.tournament_players where player_uuid = v_pending;
  insert into _p5 values (18,'invite decoupled from create/register', v_cnt >= 1,
                          format('registrations_for_pending=%s', v_cnt));

  -- ══ Signup / claim scenarios (need controlled auth.users rows) ═══════════════
  -- 16. Brand-new signup, NO pending match → exactly one ACTIVE player.
  insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
    values (v_new_uid, v_new_email, now(), now(), now());
  insert into public.profiles (id, email, name, user_name, home_state)
    values (v_new_uid, v_new_email, 'Brand New', 'brandnew_'||replace(v_new_uid::text,'-',''), 'TX');
  select count(*) into v_cnt from public.players where profile_id = v_new_uid and account_status='ACTIVE';
  insert into _p5 values (16,'new signup gets one ACTIVE player', v_cnt = 1, format('players=%s', v_cnt));

  -- 17 (pre-state). Signup whose email MATCHES a pending player, BEFORE verification:
  -- profile exists, NO linked player yet, and NO duplicate identity created.
  insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
    values (v_claim_uid, v_claim_email, null, now(), now());
  insert into public.profiles (id, email, name, user_name, home_state)
    values (v_claim_uid, v_claim_email, 'Casey Newpend', 'casey_'||replace(v_claim_uid::text,'-',''), 'TX');
  select id into v_linked from public.players where profile_id = v_claim_uid;
  select count(*) into v_cnt from public.players where email_normalized = lower(v_claim_email);
  insert into _p5 values (17,'pending-email signup: unlinked pre-verify, no dup',
                          v_linked is null and v_cnt = 1, format('linked=%s identities=%s', v_linked, v_cnt));

  -- 13. Claim after verified signup → the EXISTING pending player links (ACTIVE).
  update auth.users set email_confirmed_at = now() where id = v_claim_uid;  -- fires auto-claim trigger
  select id into v_linked from public.players where profile_id = v_claim_uid;
  insert into _p5 values (13,'claim after verified email',
                          v_linked = v_pending
                          and (select account_status from public.players where id=v_pending)='ACTIVE',
                          format('linked=%s expected=%s', v_linked, v_pending));

  -- 14. History preserved: the pending registration still points at the same players.id.
  select count(*) into v_cnt from public.tournament_players
    where player_uuid = v_pending and tournament_id = v_tid and status <> 'cancelled';
  insert into _p5 values (14,'history preserved after claim', v_cnt >= 1,
                          format('registrations_intact=%s', v_cnt));

  -- 15. Claim is idempotent (retry creates no duplicate).
  perform set_config('request.jwt.claims', json_build_object('sub', v_claim_uid)::text, true);
  v_linked := public.claim_pending_player();
  perform set_config('request.jwt.claims', json_build_object('sub', v_dir_uid)::text, true);
  select count(*) into v_cnt from public.players where profile_id = v_claim_uid;
  insert into _p5 values (15,'claim idempotent', v_linked = v_pending and v_cnt = 1,
                          format('linked=%s players_for_profile=%s', v_linked, v_cnt));

  -- ── 7. Bar owner with venue authority is allowed ─────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_uid)::text, true);
  begin
    select outcome into v_outcome from public.create_pending_player(v_tid,'Owner','Made','owner.'||v_claim_email);
    insert into _p5 values (7,'bar owner (venue authority) allowed', v_outcome = 'CREATED_PENDING',
                            format('outcome=%s', v_outcome));
  exception when others then
    insert into _p5 values (7,'bar owner (venue authority) allowed', false, sqlerrm);
  end;

end $$;

select n, name, passed, detail from _p5 order by n;

rollback;
