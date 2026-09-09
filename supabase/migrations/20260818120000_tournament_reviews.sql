-- 20260818120000_tournament_reviews.sql
-- New feature: Tournament Reviews. A player leaves ONE review per tournament participation
-- after their play ends; the review is private operational feedback visible to the
-- tournament's Bar Owner (venue owner) and Tournament Director (and admins). Replies reuse
-- the existing conversations system so they land in the player's normal Profile → Inbox.
--
-- Design notes:
--   * One row = one review OPPORTUNITY outcome per (tournament, player): unique
--     (tournament_id, reviewer_id) guarantees a single opportunity. A row is created when
--     the player either SUBMITS (rating set, submitted_at) or DISMISSES (dismissed_at) —
--     so the prompt can never re-appear for that participation.
--   * Identity fields are SNAPSHOTTED (tournament name/date, game type, format, venue name,
--     director name) so review cards stay stable if the tournament is later edited/renamed
--     and so global search is a single-table tsvector lookup. FK ids are kept for scoping.
--   * Visibility is enforced in RLS via the existing can_manage_tournament() helper, which
--     already grants admin + assigned director (narrow) + venue owner (all their venues).
--   * Writes go ONLY through SECURITY DEFINER RPCs (submit/dismiss/mark-read/link-reply),
--     which enforce participation + idempotency; direct table writes are revoked.

-- ── review reads (per-viewer read-state; unread ≠ unreplied, supports BO + TD both) ──
create table if not exists public.tournament_review_reads (
  review_id uuid        not null,
  viewer_id uuid        not null references auth.users(id) on delete cascade,
  read_at   timestamptz not null default now(),
  primary key (review_id, viewer_id)
);

-- ── reviews ──────────────────────────────────────────────────────────────────────────
create table if not exists public.tournament_reviews (
  id                     uuid primary key default gen_random_uuid(),
  tournament_id          integer not null references public.tournaments(id) on delete cascade,
  reviewer_id            uuid    not null references auth.users(id) on delete cascade,  -- player (auth.uid)
  reviewer_id_auto       bigint,                                                         -- profiles.id_auto (display/search)
  -- scoping (live FKs)
  venue_id               integer,
  tournament_director_id bigint,
  -- snapshots (edit-prone / same-name reuse → stable cards + fast single-table search)
  tournament_name        text,
  tournament_date        date,
  game_type              text,
  tournament_format      text,
  venue_name             text,
  director_name          text,
  -- content (null until submitted)
  rating                 smallint check (rating between 1 and 5),
  selected_reason        text,
  comment                text,
  -- lifecycle outcome: exactly one of these is set
  submitted_at           timestamptz,
  dismissed_at           timestamptz,
  -- reply linkage (reuses the conversations system) + management convenience
  conversation_id        uuid references public.conversations(id) on delete set null,
  reply_count            integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (tournament_id, reviewer_id)
);

alter table public.tournament_review_reads
  add constraint tournament_review_reads_review_fk
  foreign key (review_id) references public.tournament_reviews(id) on delete cascade;

-- ── indexes: management filter / sort ──────────────────────────────────────────────
create index if not exists idx_treviews_tournament on public.tournament_reviews (tournament_id);
create index if not exists idx_treviews_venue on public.tournament_reviews (venue_id);
create index if not exists idx_treviews_director on public.tournament_reviews (tournament_director_id);
create index if not exists idx_treviews_reviewer on public.tournament_reviews (reviewer_id);
create index if not exists idx_treviews_submitted on public.tournament_reviews (submitted_at desc);
create index if not exists idx_treviews_rating on public.tournament_reviews (rating);
create index if not exists idx_treviews_tdate on public.tournament_reviews (tournament_date);

-- ── global search: generated tsvector over the snapshot + comment ───────────────────
alter table public.tournament_reviews
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector('simple',
      coalesce(tournament_name, '') || ' ' ||
      coalesce(venue_name, '') || ' ' ||
      coalesce(director_name, '') || ' ' ||
      coalesce(game_type, '') || ' ' ||
      coalesce(tournament_format, '') || ' ' ||
      coalesce(selected_reason, '') || ' ' ||
      coalesce(comment, '') || ' ' ||
      coalesce(tournament_id::text, '')
    )
  ) stored;
create index if not exists idx_treviews_search on public.tournament_reviews using gin (search_tsv);

-- ── RLS ────────────────────────────────────────────────────────────────────────────
alter table public.tournament_reviews enable row level security;
alter table public.tournament_review_reads enable row level security;

-- Management (admin / assigned director / venue owner) can read reviews for their scope.
drop policy if exists treviews_select_mgmt on public.tournament_reviews;
create policy treviews_select_mgmt on public.tournament_reviews
  for select to authenticated
  using (public.can_manage_tournament(tournament_id));

-- The player can read their own review/opportunity row.
drop policy if exists treviews_select_own on public.tournament_reviews;
create policy treviews_select_own on public.tournament_reviews
  for select to authenticated
  using (reviewer_id = auth.uid());

-- Reads: each viewer manages only their own read markers.
drop policy if exists treview_reads_own on public.tournament_review_reads;
create policy treview_reads_own on public.tournament_review_reads
  for all to authenticated
  using (viewer_id = auth.uid())
  with check (viewer_id = auth.uid());

-- No direct writes to reviews — RPCs (SECURITY DEFINER) are the only path.
revoke insert, update, delete on public.tournament_reviews from authenticated, anon;
grant select on public.tournament_reviews to authenticated;
grant select, insert, update, delete on public.tournament_review_reads to authenticated;

-- ── RPCs ─────────────────────────────────────────────────────────────────────────────
-- Submit (or update-before-submit) a review. Idempotent: a review that is already submitted
-- is never overwritten and repeated calls return the same id (safe for double-taps/retries).
create or replace function public.submit_tournament_review(
  p_tournament_id integer,
  p_rating        smallint,
  p_selected_reason text default null,
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
begin
  select id_auto into v_id_auto from public.profiles where id = auth.uid();
  if v_id_auto is null then raise exception 'not authenticated'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating must be 1..5'; end if;

  -- Must have actually participated (singles/self-reg OR accepted team member).
  if not (
    exists (select 1 from public.tournament_players tp
             where tp.tournament_id = p_tournament_id and tp.player_id = v_id_auto
               and coalesce(tp.status, '') not in ('cancelled', 'no_show'))
    or exists (select 1 from public.tournament_team_members tm
                where tm.tournament_id = p_tournament_id and tm.player_id = v_id_auto
                  and tm.invite_status = 'accepted')
  ) then
    raise exception 'not a participant of this tournament';
  end if;

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
    rating, selected_reason, comment, submitted_at, dismissed_at, updated_at
  ) values (
    p_tournament_id, auth.uid(), v_id_auto, v.venue_id, v.director_id,
    v.name, v.tournament_date, v.game_type, v.tournament_format, v.venue_name, v.director_name,
    p_rating, p_selected_reason, p_comment, now(), null, now()
  )
  on conflict (tournament_id, reviewer_id) do update
    set rating = excluded.rating,
        selected_reason = excluded.selected_reason,
        comment = excluded.comment,
        submitted_at = now(),
        dismissed_at = null,
        updated_at = now()
    where public.tournament_reviews.submitted_at is null   -- never overwrite a submitted review
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.tournament_reviews
      where tournament_id = p_tournament_id and reviewer_id = auth.uid();
  end if;
  return v_id;
end;
$$;

-- Dismiss the review opportunity (player tapped X). Creates a marker only if no row exists;
-- never overrides an existing submitted review. One opportunity, permanently resolved.
create or replace function public.dismiss_tournament_review(p_tournament_id integer)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_id_auto bigint;
  v_id uuid;
begin
  select id_auto into v_id_auto from public.profiles where id = auth.uid();
  if v_id_auto is null then raise exception 'not authenticated'; end if;

  insert into public.tournament_reviews (tournament_id, reviewer_id, reviewer_id_auto, dismissed_at, updated_at)
  values (p_tournament_id, auth.uid(), v_id_auto, now(), now())
  on conflict (tournament_id, reviewer_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.tournament_reviews
      where tournament_id = p_tournament_id and reviewer_id = auth.uid();
  end if;
  return v_id;
end;
$$;

-- Mark a review read for the current manager (per-viewer; independent BO/TD read state).
create or replace function public.mark_review_read(p_review_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from public.tournament_reviews r
     where r.id = p_review_id and public.can_manage_tournament(r.tournament_id)
  ) then
    raise exception 'not authorized for this review';
  end if;
  insert into public.tournament_review_reads (review_id, viewer_id, read_at)
  values (p_review_id, auth.uid(), now())
  on conflict (review_id, viewer_id) do update set read_at = now();
end;
$$;

-- Link the conversation created for a management reply back onto the review (so the review
-- detail can show the thread and the list can flag "replied"). Manager-gated.
create or replace function public.link_review_conversation(p_review_id uuid, p_conversation_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
begin
  if not exists (
    select 1 from public.tournament_reviews r
     where r.id = p_review_id and public.can_manage_tournament(r.tournament_id)
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

revoke all on function public.submit_tournament_review(integer, smallint, text, text) from public, anon;
revoke all on function public.dismiss_tournament_review(integer) from public, anon;
revoke all on function public.mark_review_read(uuid) from public, anon;
revoke all on function public.link_review_conversation(uuid, uuid) from public, anon;
grant execute on function public.submit_tournament_review(integer, smallint, text, text) to authenticated;
grant execute on function public.dismiss_tournament_review(integer) to authenticated;
grant execute on function public.mark_review_read(uuid) to authenticated;
grant execute on function public.link_review_conversation(uuid, uuid) to authenticated;

-- ── allow a 'review' conversation category (for review-reply threads) ─────────────────
alter table public.conversations drop constraint if exists conversations_category_check;
alter table public.conversations add constraint conversations_category_check
  check (category = any (array[
    'tournament_issues','report_problem','feedback_suggestions','account_issues',
    'fargo_rating','become_td','tournament_submission','general','other','review'
  ]));
