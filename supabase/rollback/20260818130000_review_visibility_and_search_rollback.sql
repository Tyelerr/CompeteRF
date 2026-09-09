-- Rollback for 20260818130000_review_visibility_and_search.sql
-- Reverts the review SELECT policy + RPC guards to can_manage_tournament and drops the
-- review-specific helper + trigram indexes.

drop index if exists public.idx_treviews_name_trgm;
drop index if exists public.idx_treviews_venue_trgm;
drop index if exists public.idx_treviews_director_trgm;
drop index if exists public.idx_treviews_comment_trgm;

drop policy if exists treviews_select_mgmt on public.tournament_reviews;
create policy treviews_select_mgmt on public.tournament_reviews
  for select to authenticated
  using (public.can_manage_tournament(tournament_id));

create or replace function public.mark_review_read(p_review_id uuid)
  returns void
  language plpgsql security definer set search_path to 'public', 'pg_temp'
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

create or replace function public.link_review_conversation(p_review_id uuid, p_conversation_id uuid)
  returns void
  language plpgsql security definer set search_path to 'public', 'pg_temp'
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

drop function if exists public.can_view_tournament_reviews(integer);
