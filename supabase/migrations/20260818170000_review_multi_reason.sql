-- 20260818170000_review_multi_reason.sql
-- Reviews: support MULTIPLE selected reasons per review (multi-select chips).
--   * selected_reasons text[] is the structured source of truth (rendered as chips).
--   * selected_reason text is kept as a derived, RPC-written search/back-compat projection
--     (the reasons joined by ' · '), so the existing ILIKE typeahead search and the search_tsv
--     column keep working unchanged. The ARRAY is the representation; the string is just an
--     index/display fallback.
-- Only the rating stays required; reasons remain optional (empty array allowed).

alter table public.tournament_reviews
  add column if not exists selected_reasons text[] not null default '{}';

-- Backfill any existing single-reason rows into the array.
update public.tournament_reviews
   set selected_reasons = array[selected_reason]
 where selected_reason is not null and selected_reason <> ''
   and (selected_reasons is null or cardinality(selected_reasons) = 0);

-- Recreate submit RPC to accept text[] (the old text signature is dropped). Body is otherwise
-- identical to 20260818150000 (participation gate incl. chip_entries; idempotent upsert), but it
-- stores selected_reasons and derives selected_reason from it.
drop function if exists public.submit_tournament_review(integer, smallint, text, text);

create or replace function public.submit_tournament_review(
  p_tournament_id integer,
  p_rating        smallint,
  p_selected_reasons text[] default '{}',
  p_comment       text default null
) returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_id_auto bigint;
  v_id uuid;
  v record;
  v_reasons text[];
  v_reason_str text;
begin
  select id_auto into v_id_auto from public.profiles where id = auth.uid();
  if v_id_auto is null then raise exception 'not authenticated'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating must be 1..5'; end if;

  if not (
    exists (select 1 from public.tournament_players tp
             where tp.tournament_id = p_tournament_id and tp.player_id = v_id_auto
               and coalesce(tp.status, '') not in ('cancelled', 'no_show'))
    or exists (select 1 from public.tournament_team_members tm
                where tm.tournament_id = p_tournament_id and tm.player_id = v_id_auto
                  and tm.invite_status = 'accepted')
    or exists (select 1 from public.chip_entries ce
                where ce.tournament_id = p_tournament_id
                  and (ce.p1_profile_id = v_id_auto or ce.p2_profile_id = v_id_auto))
  ) then
    raise exception 'not a participant of this tournament';
  end if;

  v_reasons := coalesce(p_selected_reasons, '{}');
  v_reason_str := nullif(array_to_string(v_reasons, ' · '), '');  -- derived search/display projection

  select t.name, t.tournament_date, t.game_type, t.tournament_format, t.venue_id, t.director_id,
         vn.venue as venue_name,
         (select coalesce(nullif(btrim(coalesce(dp.first_name,'') || ' ' || coalesce(dp.last_name,'')), ''),
                          dp.name, dp.user_name)
            from public.profiles dp where dp.id_auto = t.director_id) as director_name
    into v
    from public.tournaments t
    left join public.venues vn on vn.id = t.venue_id
   where t.id = p_tournament_id;

  insert into public.tournament_reviews (
    tournament_id, reviewer_id, reviewer_id_auto, venue_id, tournament_director_id,
    tournament_name, tournament_date, game_type, tournament_format, venue_name, director_name,
    rating, selected_reasons, selected_reason, comment, submitted_at, dismissed_at, updated_at
  ) values (
    p_tournament_id, auth.uid(), v_id_auto, v.venue_id, v.director_id,
    v.name, v.tournament_date, v.game_type, v.tournament_format, v.venue_name, v.director_name,
    p_rating, v_reasons, v_reason_str, p_comment, now(), null, now()
  )
  on conflict (tournament_id, reviewer_id) do update
    set rating = excluded.rating,
        selected_reasons = excluded.selected_reasons,
        selected_reason = excluded.selected_reason,
        comment = excluded.comment,
        submitted_at = now(),
        dismissed_at = null,
        updated_at = now()
    where public.tournament_reviews.submitted_at is null
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.tournament_reviews
      where tournament_id = p_tournament_id and reviewer_id = auth.uid();
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_tournament_review(integer, smallint, text[], text) from public, anon;
grant execute on function public.submit_tournament_review(integer, smallint, text[], text) to authenticated;
