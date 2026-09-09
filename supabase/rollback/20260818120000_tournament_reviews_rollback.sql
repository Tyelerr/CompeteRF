-- Rollback for 20260818120000_tournament_reviews.sql

drop function if exists public.link_review_conversation(uuid, uuid);
drop function if exists public.mark_review_read(uuid);
drop function if exists public.dismiss_tournament_review(integer);
drop function if exists public.submit_tournament_review(integer, smallint, text, text);

drop table if exists public.tournament_review_reads;
drop table if exists public.tournament_reviews;

-- Restore the original conversations category CHECK (without 'review').
alter table public.conversations drop constraint if exists conversations_category_check;
alter table public.conversations add constraint conversations_category_check
  check (category = any (array[
    'tournament_issues','report_problem','feedback_suggestions','account_issues',
    'fargo_rating','become_td','tournament_submission','general','other'
  ]));
