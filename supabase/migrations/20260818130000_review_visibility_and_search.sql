-- 20260818130000_review_visibility_and_search.sql
-- Review-specific visibility + indexed text search.
--
-- WHY a review-specific helper: can_manage_tournament() authorizes FOUR groups —
--   (a) compete_admin / super_admin, (b) the tournament's director_id, (c) venue OWNERS,
--   (d) venue DIRECTORS assigned to the venue. Branch (d) is too broad for reviews: it would
-- let a venue-assigned director see reviews for tournaments they did NOT personally direct,
-- which violates the rule "a TD sees ONLY tournaments they directed." So reviews use a
-- narrower gate: admin OR the assigned director_id OR a venue owner. (Bar Owner = venue owner
-- → all their venues' reviews; TD = director_id → only tournaments they directed; admins →
-- global.) No venue_directors branch.

create or replace function public.can_view_tournament_reviews(p_tournament_id integer)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  with me as (select id_auto, role from public.profiles where id = auth.uid())
  select exists (
    select 1
    from public.tournaments t
    cross join me
    where t.id = p_tournament_id
      and (
        me.role in ('compete_admin', 'super_admin')                                    -- admin: global
        or t.director_id = me.id_auto                                                  -- TD: only tournaments they directed
        or exists (                                                                    -- Bar Owner: venues they own
          select 1 from public.venue_owners vo
          where vo.venue_id = t.venue_id and vo.owner_id = me.id_auto and vo.archived_at is null
        )
      )
  );
$$;

revoke all on function public.can_view_tournament_reviews(integer) from public, anon;
grant execute on function public.can_view_tournament_reviews(integer) to authenticated;

comment on function public.can_view_tournament_reviews(integer) is
  'Review visibility gate: admin (global) OR the tournament director_id OR an ACTIVE venue owner. Deliberately excludes venue_directors so a TD only sees reviews for tournaments they personally directed.';

-- Repoint the review SELECT policy at the narrower gate.
drop policy if exists treviews_select_mgmt on public.tournament_reviews;
create policy treviews_select_mgmt on public.tournament_reviews
  for select to authenticated
  using (public.can_view_tournament_reviews(tournament_id));

-- Repoint the management RPC guards (mark-read, reply-link) at the same gate.
create or replace function public.mark_review_read(p_review_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from public.tournament_reviews r
     where r.id = p_review_id and public.can_view_tournament_reviews(r.tournament_id)
  ) then
    raise exception 'not authorized for this review';
  end if;
  insert into public.tournament_review_reads (review_id, viewer_id, read_at)
  values (p_review_id, auth.uid(), now())
  on conflict (review_id, viewer_id) do update set read_at = now();
end;
$$;

create or replace function public.link_review_conversation(p_review_id uuid, p_conversation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from public.tournament_reviews r
     where r.id = p_review_id and public.can_view_tournament_reviews(r.tournament_id)
  ) then
    raise exception 'not authorized for this review';
  end if;
  update public.tournament_reviews
     set conversation_id = coalesce(conversation_id, p_conversation_id),
         reply_count = reply_count + 1,
         updated_at = now()
   where id = p_review_id;
end;
$$;

-- Indexed global text search: pg_trgm lets ILIKE '%term%' (typeahead) use an index instead of
-- a sequential scan, across the review's denormalized identity/comment columns.
create extension if not exists pg_trgm;
create index if not exists idx_treviews_name_trgm on public.tournament_reviews using gin (tournament_name gin_trgm_ops);
create index if not exists idx_treviews_venue_trgm on public.tournament_reviews using gin (venue_name gin_trgm_ops);
create index if not exists idx_treviews_director_trgm on public.tournament_reviews using gin (director_name gin_trgm_ops);
create index if not exists idx_treviews_comment_trgm on public.tournament_reviews using gin (comment gin_trgm_ops);
