-- supabase/migrations/20261021150000_chip_client_protocol_guard.sql
--
-- Old-native-client Chip overwrite protection (server-side, backward compatible).
--
-- Root cause. The public iOS build (App Store "1.25" = EAS build 66, commit 7753bf5) saves a Chip
-- tournament as ~8 INDEPENDENT PostgREST requests: upsert chip_config (queue / start / finish /
-- winner / shuffle / restore points), upsert-then-prune chip_entries / chip_matches / chip_tables
-- (delete every row not in its list), append chip_events, then read version and set it to live+1
-- (a soft check that only logs). None of those requests carries the version the device loaded, so
-- the server cannot tell a stale request from a fresh one: a phone that loaded version N and saves
-- after a web TD reached N+2 silently replaces the queue / chips / tables / matches and prunes the
-- newer rows. (The public Android build, Play 1.0.20 = 8bc5547, has no Chip code.) Current clients
-- avoid this cooperatively (version claim → rows → finalize), but nothing on the server stops a
-- client that doesn't claim.
--
-- What the server CAN reliably tell apart is the app generation: every current client sends
-- X-Client-Info: compete-chip/2 … (src/lib/supabase.ts, set on the shared client; X-Client-Info is
-- the header supabase-js always sends and every Edge Function already allows in CORS). Old builds
-- send supabase-js's default. PostgREST exposes it as request.headers.
--
-- Rule (per tournament, server-enforced):
--   • A current-client (protocol ≥ 2) write to chip_config stamps chip_config.min_client_protocol.
--   • Once stamped, any write from an OLDER client (no header) to that tournament's chip_config /
--     chip_entries / chip_matches / chip_tables / chip_events / chip_results, or a status /
--     live_state change of the chip tournament row, is refused (P0001 'chip_client_outdated') —
--     row-level, so each request is refused whole: zero rows written, version untouched.
--   • A tournament only ever written by old clients is never stamped → old clients keep running it
--     exactly as today (single-device use unchanged).
--   • Server writers (SECURITY DEFINER RPCs, service role) are not affected.
-- Fail-open by construction: if the header were ever absent, nothing is stamped and behavior equals
-- today's. No data is rewritten; one nullable column is added.
-- Rollback: supabase/rollback/20261021150000_chip_client_protocol_guard_rollback.sql.

begin;

alter table public.chip_config add column if not exists min_client_protocol smallint;
comment on column public.chip_config.min_client_protocol is
  'Lowest app protocol allowed to write this Chip tournament. NULL = only legacy clients have written it. Set by tg_chip_protocol_guard on the first protocol>=2 write (20261021150000).';

-- The caller's app protocol, from the X-Client-Info request header (2 = current clients; 1 = any
-- other / no header / non-PostgREST caller).
create or replace function public._chip_client_protocol()
returns integer
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_info text;
begin
  begin
    v_info := nullif(current_setting('request.headers', true), '')::json ->> 'x-client-info';
  exception when others then
    v_info := null;
  end;
  -- Plain string parsing (no regex: this runs once per written chip row).
  if left(v_info, 13) = 'compete-chip/' then
    v_info := split_part(substr(v_info, 14), ' ', 1);
    if v_info <> '' and length(v_info) <= 4 and translate(v_info, '0123456789', '') = '' then
      return v_info::integer;
    end if;
  end if;
  return 1;
end;
$function$;
-- Called by the guard triggers, which run as the CALLER (authenticated / anon): those roles must keep
-- EXECUTE (it only reads the caller's own request headers).
revoke all on function public._chip_client_protocol() from public;
grant execute on function public._chip_client_protocol() to anon, authenticated;

-- The tournament's stamp, read as the owner so chip_config RLS can never hide it from the guard.
create or replace function public._chip_min_client_protocol(p_tournament_id bigint)
returns smallint
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$ select c.min_client_protocol from public.chip_config c where c.tournament_id = p_tournament_id; $function$;
revoke all on function public._chip_min_client_protocol(bigint) from public;
grant execute on function public._chip_min_client_protocol(bigint) to anon, authenticated;

-- Read-only diagnostic: which protocol the server sees for this request (no data involved).
create or replace function public.chip_client_protocol()
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$ select public._chip_client_protocol(); $function$;
revoke all on function public.chip_client_protocol() from public;
grant execute on function public.chip_client_protocol() to anon, authenticated;

create or replace function public.tg_chip_protocol_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_proto integer;
  v_min   smallint;
  v_tid   bigint;
begin
  -- Server writers (definer RPCs run as postgres; Edge Functions as service_role).
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  v_proto := public._chip_client_protocol();

  if tg_table_name = 'chip_config' then
    if tg_op = 'INSERT' then
      -- (an upsert onto an existing row continues as the UPDATE branch below)
      new.min_client_protocol := case when v_proto >= 2 then v_proto end;
      return new;
    elsif tg_op = 'UPDATE' then
      if v_proto >= 2 then
        new.min_client_protocol := greatest(coalesce(old.min_client_protocol, 0), v_proto);
        return new;
      end if;
      if coalesce(old.min_client_protocol, 1) >= 2 then
        raise exception 'chip_client_outdated' using errcode = 'P0001',
          detail = 'This tournament is managed from a newer version of Compete. Update the app to make changes.';
      end if;
      new.min_client_protocol := old.min_client_protocol;  -- an old client can never clear the stamp
      return new;
    else
      if v_proto < 2 and coalesce(old.min_client_protocol, 1) >= 2 then
        raise exception 'chip_client_outdated' using errcode = 'P0001';
      end if;
      return old;
    end if;
  end if;

  if v_proto >= 2 then
    return coalesce(new, old);
  end if;
  -- Legacy writer on a chip row: refused once the tournament is stamped.
  v_tid := case when tg_op = 'DELETE' then old.tournament_id else new.tournament_id end;
  v_min := public._chip_min_client_protocol(v_tid);
  if coalesce(v_min, 1) < 2 and tg_op = 'UPDATE' and old.tournament_id is distinct from new.tournament_id then
    v_min := public._chip_min_client_protocol(old.tournament_id);
  end if;
  if coalesce(v_min, 1) >= 2 then
    raise exception 'chip_client_outdated' using errcode = 'P0001',
      detail = 'This tournament is managed from a newer version of Compete. Update the app to make changes.';
  end if;
  return coalesce(new, old);
end;
$function$;

-- Names sort BEFORE the existing *_sync_players triggers (p < s), so a refused row never reaches them.
drop trigger if exists chip_config_protocol_guard on public.chip_config;
create trigger chip_config_protocol_guard before insert or update or delete on public.chip_config
  for each row execute function public.tg_chip_protocol_guard();
drop trigger if exists chip_entries_protocol_guard on public.chip_entries;
create trigger chip_entries_protocol_guard before insert or update or delete on public.chip_entries
  for each row execute function public.tg_chip_protocol_guard();
drop trigger if exists chip_matches_protocol_guard on public.chip_matches;
create trigger chip_matches_protocol_guard before insert or update or delete on public.chip_matches
  for each row execute function public.tg_chip_protocol_guard();
drop trigger if exists chip_tables_protocol_guard on public.chip_tables;
create trigger chip_tables_protocol_guard before insert or update or delete on public.chip_tables
  for each row execute function public.tg_chip_protocol_guard();
drop trigger if exists chip_events_protocol_guard on public.chip_events;
create trigger chip_events_protocol_guard before insert or update or delete on public.chip_events
  for each row execute function public.tg_chip_protocol_guard();
drop trigger if exists chip_results_protocol_guard on public.chip_results;
create trigger chip_results_protocol_guard before insert or update or delete on public.chip_results
  for each row execute function public.tg_chip_protocol_guard();

-- The chip tournament row itself: an old client must not start / finish / reopen a stamped event
-- (that would leave the tournament status disagreeing with the chip state it can no longer write).
create or replace function public.tg_tournaments_chip_protocol_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if current_user in ('authenticated', 'anon')
     and public._chip_client_protocol() < 2
     and coalesce(public._chip_min_client_protocol(new.id), 1) >= 2 then
    raise exception 'chip_client_outdated' using errcode = 'P0001',
      detail = 'This tournament is managed from a newer version of Compete. Update the app to make changes.';
  end if;
  return new;
end;
$function$;

drop trigger if exists tournaments_chip_protocol_guard on public.tournaments;
create trigger tournaments_chip_protocol_guard before update on public.tournaments
  for each row
  when (old.tournament_format = 'chip-tournament'
        and (new.status is distinct from old.status or new.live_state is distinct from old.live_state))
  execute function public.tg_tournaments_chip_protocol_guard();

commit;
