-- supabase/migrations/20260607120000_submit_match_state.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Participant-scoped live match scoring.
--
-- Live match state lives in tournaments.live_settings -> 'matchState' (a JSONB map
-- keyed by match id, e.g. "W1M1", "GF"). The tournaments row is TD-owned, so a
-- player cannot UPDATE it under RLS. This SECURITY DEFINER function lets the TD or
-- any ACTIVE PARTICIPANT of the tournament merge a small, whitelisted patch into a
-- single match's state — so a player can score their own match from the app.
--
-- Trust-based model (typical for bar tournaments): any active participant may
-- write any match's score; the TD can always override. We do NOT verify the caller
-- is in THAT specific match, because that requires resolving the bracket graph
-- (which lives in app code, not SQL). The blast radius is limited to the scoring
-- fields of one match by the key whitelist below.
--
-- The app computes the patch (score caps, auto-complete + winner) and this function
-- only persists it — keeping the bracket logic in one place (the client resolver).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.submit_match_state(
  p_tournament_id bigint,
  p_match_id      text,
  p_patch         jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      bigint;
  v_allowed  boolean;
  v_ls       jsonb;
  v_existing jsonb;
  v_clean    jsonb;
begin
  -- 1. Resolve the caller's profile id_auto (the player_id space) from auth uid.
  select p.id_auto into v_uid
  from public.profiles p
  where p.id = auth.uid();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- 2. Authorize: the tournament director, or an active (non-cancelled / non
  --    no-show) participant of this tournament.
  select
    exists (
      select 1 from public.tournaments t
      where t.id = p_tournament_id and t.director_id = v_uid
    )
    or exists (
      select 1 from public.tournament_players tp
      where tp.tournament_id = p_tournament_id
        and tp.player_id = v_uid
        and tp.status not in ('cancelled', 'no_show')
    )
  into v_allowed;

  if not v_allowed then
    raise exception 'Not allowed to score this tournament' using errcode = '42501';
  end if;

  -- 3. Whitelist the patch to scoring fields only (no arbitrary keys, no table /
  --    timer reassignment — those stay TD-only via the Manage hub).
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into v_clean
  from jsonb_each(p_patch)
  where key in (
    'status', 'winner', 'p1Score', 'p2Score', 'startedAt', 'completedAt', 'result'
  );

  -- 4. Lock the row, then merge the patch into matchState -> <match_id>, preserving
  --    that match's other fields (table, timer, ...) and every other match.
  select coalesce(t.live_settings, '{}'::jsonb)
  into v_ls
  from public.tournaments t
  where t.id = p_tournament_id
  for update;

  if v_ls is null then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;

  v_ls := jsonb_set(v_ls, '{matchState}', coalesce(v_ls -> 'matchState', '{}'::jsonb), true);
  v_existing := coalesce(v_ls #> array['matchState', p_match_id], '{}'::jsonb);
  v_ls := jsonb_set(v_ls, array['matchState', p_match_id], v_existing || v_clean, true);

  update public.tournaments
  set live_settings = v_ls,
      updated_at = now()
  where id = p_tournament_id;

  return v_ls;
end;
$$;

-- Only signed-in users may call it; the body does the finer participant/TD check.
revoke all on function public.submit_match_state(bigint, text, jsonb) from public, anon;
grant execute on function public.submit_match_state(bigint, text, jsonb) to authenticated;
