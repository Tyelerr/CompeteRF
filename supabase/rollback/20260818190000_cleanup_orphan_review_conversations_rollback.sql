-- Rollback for 20260818190000_cleanup_orphan_review_conversations.sql
-- This was a one-off DATA deletion of two orphan test conversations; deleted rows cannot be
-- restored. Nothing to roll back (no schema was changed).
select 1;
