-- 20260818190000_cleanup_orphan_review_conversations.sql
-- ONE-OFF DATA CLEANUP (not a schema change). Removes the two ORPHAN review conversations that
-- the pre-fix reply bug created during the "Tyelerr new submit" test. Only the first-created
-- conversation is linked to the review; the other two were created per-Send and left unlinked.
--
-- Safety guards (any one of which prevents touching the wrong row):
--   1. Only the two explicit orphan IDs from the test logs.
--   2. Must be category = 'review'.
--   3. Must NOT be linked to any tournament_reviews row — so the conversation actually linked to
--      the review can never be deleted, even if the inference about which one is linked is wrong.
-- conversation_participants and conversation_messages are removed automatically via their
-- ON DELETE CASCADE FKs to conversations(id). No review row is affected (the guard excludes
-- linked conversations; the tournament_reviews FK is ON DELETE SET NULL regardless).

do $$
declare
  v_deleted integer;
begin
  delete from public.conversations c
  where c.id in (
    'da8fa360-a113-4b03-a54e-497b23e6dd51',
    '0b1a2de6-b5e8-4e47-8a60-63cd8c4b5d7b'
  )
  and c.category = 'review'
  and not exists (
    select 1 from public.tournament_reviews r where r.conversation_id = c.id
  );
  get diagnostics v_deleted = row_count;
  raise notice 'orphan review conversations deleted: %', v_deleted;
end $$;
