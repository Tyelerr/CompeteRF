-- supabase/migrations/20260928120000_match_issue_resolve.sql
--
-- Two small additions to the check-in feature (20260927120000). Nothing else changes: no new
-- table, no policy change, no touch to Auto Assign, Match Order, queue pins, the Clear Table
-- hold, scoring, bracket advancement, notification recipients or push-token ownership.
--
--   1. Two more Contact TD reasons, so the player can raise a MID-MATCH problem as well as a
--      pre-match one: 'dispute' (Dispute / Need TD) and 'watch_shot' (Need shot watched).
--      The CHECK constraint and the RPC's whitelist both have to know them.
--   2. match_issue_resolve(tid, match_id, registration_id) — the manager's "Mark Resolved".
--      match_player_status is READ-ONLY for clients (both policies are SELECT), so there is no
--      way to stamp resolved_at without a narrow definer RPC. It writes exactly one column on one
--      row, and only for a tournament the caller manages (can_manage_tournament, the same rule
--      the read policy uses — director, active venue owners/directors, admins managing the event).
--      A player can never resolve their own issue, and the row's check-in state is untouched.

alter table public.match_player_status drop constraint if exists match_player_status_issue_reason_check;
alter table public.match_player_status add constraint match_player_status_issue_reason_check
  check (issue_reason in ('running_late', 'table_missing', 'equipment', 'dispute', 'watch_shot', 'other'));

create or replace function public.match_contact_td(
  p_tournament_id bigint,
  p_match_id text,
  p_reason text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ctx      jsonb;
  v_row      public.match_player_status;
  v_msg      text := nullif(btrim(coalesce(p_message, '')), '');
  v_name     text;
  v_tname    text;
  v_label    text;
  v_n        int := 0;
  r          record;
begin
  -- pre-match AND mid-match reasons
  if p_reason is null or p_reason not in ('running_late', 'table_missing', 'equipment', 'dispute', 'watch_shot', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  if v_msg is not null and char_length(v_msg) > 280 then
    raise exception 'message_too_long' using errcode = 'P0001';
  end if;
  v_ctx := public._match_player_context(p_tournament_id, p_match_id);

  insert into public.match_player_status (
    tournament_id, match_id, registration_id, assigned_at, draw_number,
    issue_reason, issue_message, issue_at, resolved_at)
  values (
    p_tournament_id, p_match_id, (v_ctx ->> 'registrationId')::bigint,
    (v_ctx ->> 'assignedAt')::timestamptz, (v_ctx ->> 'drawNumber')::int,
    p_reason, v_msg, now(), null)
  on conflict (tournament_id, match_id, registration_id, assigned_at, draw_number) do update
    -- NOTE: checked_in_at is deliberately NOT touched — raising an issue never un-checks a player.
    set issue_reason = excluded.issue_reason,
        issue_message = excluded.issue_message,
        issue_at = excluded.issue_at,
        issue_pushed_at = null,
        resolved_at = null,
        updated_at = now()
  returning * into v_row;

  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.user_name, tp.guest_name, 'A player')
  into v_name
  from public.tournament_players tp
  left join public.profiles p on p.id_auto = tp.player_id
  where tp.id = v_row.registration_id;
  select t.name into v_tname from public.tournaments t where t.id = p_tournament_id;

  v_label := case p_reason
    when 'running_late' then 'Running late'
    when 'table_missing' then 'Can''t find table'
    when 'equipment' then 'Equipment issue'
    when 'dispute' then 'Dispute / Need TD'
    when 'watch_shot' then 'Need shot watched'
    else 'Needs help' end;

  for r in select * from public._match_issue_recipients(p_tournament_id) loop
    insert into public.notifications (user_id, title, body, category, data, status, sent_at)
    values (
      r.id_auto,
      coalesce(v_tname, 'Compete'),
      v_name || ' — ' || v_label || coalesce(': ' || v_msg, ''),
      'tournament_update',
      jsonb_build_object(
        'type', 'match_issue', 'tournament_id', p_tournament_id, 'match_id', p_match_id,
        'registration_id', v_row.registration_id, 'assigned_at', v_row.assigned_at,
        'reason', p_reason,
        'deep_link', '/(tabs)/admin/manage-tournament/' || p_tournament_id::text),
      'sent', now());
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object(
    'status', 'sent', 'statusId', v_row.id, 'recipients', v_n,
    'registrationId', v_row.registration_id, 'assignedAt', v_row.assigned_at, 'reason', p_reason);
end;
$$;

revoke all on function public.match_contact_td(bigint, text, text, text) from public, anon;
grant execute on function public.match_contact_td(bigint, text, text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════
-- Mark Resolved (managers of THIS event only)
-- ════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.match_issue_resolve(
  p_tournament_id bigint,
  p_match_id text,
  p_registration_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.match_player_status;
begin
  if not public.can_manage_tournament(p_tournament_id) then
    raise exception 'Not allowed to manage this tournament' using errcode = '42501';
  end if;

  -- The newest OPEN issue for that player in that match; resolving is idempotent.
  update public.match_player_status s
  set resolved_at = now(), updated_at = now()
  where s.id = (
    select s2.id from public.match_player_status s2
    where s2.tournament_id = p_tournament_id
      and s2.match_id = p_match_id
      and s2.registration_id = p_registration_id
      and s2.issue_at is not null
      and s2.resolved_at is null
    order by s2.issue_at desc
    limit 1)
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('status', 'no_open_issue');
  end if;
  -- checked_in_at is untouched: the player does NOT have to check in again.
  return jsonb_build_object(
    'status', 'resolved', 'statusId', v_row.id, 'resolvedAt', v_row.resolved_at,
    'checkedIn', v_row.checked_in_at is not null);
end;
$$;

revoke all on function public.match_issue_resolve(bigint, text, bigint) from public, anon;
grant execute on function public.match_issue_resolve(bigint, text, bigint) to authenticated;
