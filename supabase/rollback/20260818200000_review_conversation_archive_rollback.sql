-- Rollback for 20260818200000_review_conversation_archive.sql

drop trigger if exists trg_block_archived_reply on public.conversation_messages;
drop function if exists public.block_reply_if_recipient_archived();
drop function if exists public.set_review_archived(uuid, boolean);
drop function if exists public.set_conversation_archived(uuid, boolean);
drop table if exists public.tournament_review_archives;
alter table public.conversation_participants drop column if exists archived_at;
