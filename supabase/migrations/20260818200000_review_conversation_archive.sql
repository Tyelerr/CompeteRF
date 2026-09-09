-- 20260818200000_review_conversation_archive.sql
-- Participant-specific archiving for REVIEW conversations + per-management-user review archive.
-- The submitted review row is NEVER deleted by any archive path.
--
-- Archive model:
--   • conversation_participants.archived_at — per-participant archive of a conversation (source of
--     truth for the player Inbox Active/Archived split AND the reply-block).
--   • tournament_review_archives(review_id, viewer_id) — per-MANAGEMENT-USER archive of a review
--     (Reviews Active/Archived). This is independent of the conversation: a manager can archive a
--     review even with no conversation, and multiple authorized managers archive independently.
--     Archiving here does NOT delete the review and does NOT affect other managers' views.
--   • set_review_archived is COUPLED: when a manager archives the review AND is a participant of
--     its conversation, it also archives their conversation-participant row so the player's replies
--     are blocked until that manager unarchives. A manager who archives but is NOT a participant
--     (no conversation, or a different manager) still gets an Archived management view, but there is
--     no participant row to update, so nothing blocks player replies through them.

alter table public.conversation_participants add column if not exists archived_at timestamptz;

create table if not exists public.tournament_review_archives (
  review_id   uuid not null references public.tournament_reviews(id) on delete cascade,
  viewer_id   uuid not null references auth.users(id) on delete cascade,
  archived_at timestamptz not null default now(),
  primary key (review_id, viewer_id)
);
alter table public.tournament_review_archives enable row level security;
drop policy if exists trev_arch_own on public.tournament_review_archives;
create policy trev_arch_own on public.tournament_review_archives
  for all to authenticated using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());
grant select, insert, update, delete on public.tournament_review_archives to authenticated;

-- ── RPC 1: a participant archives/unarchives THEIR view of a conversation ──
create or replace function public.set_conversation_archived(p_conversation_id uuid, p_archived boolean)
  returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if not exists (select 1 from public.conversation_participants cp
                 where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid()) then
    raise exception 'not a participant of this conversation';
  end if;
  update public.conversation_participants
     set archived_at = case when p_archived then now() else null end
   where conversation_id = p_conversation_id and user_id = auth.uid();
end; $$;

-- ── RPC 2: management archives/unarchives a REVIEW for themselves (per-manager). COUPLED: also
--          mirror onto their conversation-participant row (if any) so the player is blocked from
--          replying to an archived manager until they unarchive. Never touches the review row. ──
create or replace function public.set_review_archived(p_review_id uuid, p_archived boolean)
  returns void language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare v_conv uuid; v_tid integer;
begin
  select conversation_id, tournament_id into v_conv, v_tid
    from public.tournament_reviews where id = p_review_id;
  if v_tid is null then raise exception 'review not found'; end if;
  if not public.can_view_tournament_reviews(v_tid) then raise exception 'not authorized for this review'; end if;

  if p_archived then
    insert into public.tournament_review_archives (review_id, viewer_id, archived_at)
    values (p_review_id, auth.uid(), now())
    on conflict (review_id, viewer_id) do update set archived_at = now();
  else
    delete from public.tournament_review_archives where review_id = p_review_id and viewer_id = auth.uid();
  end if;

  if v_conv is not null then
    update public.conversation_participants
       set archived_at = case when p_archived then now() else null end
     where conversation_id = v_conv and user_id = auth.uid();
  end if;
end; $$;

-- ── Trigger: block replies to a recipient who archived — REVIEW conversations only. ──
-- Uses auth.uid() (the authenticated caller), NOT NEW.sender_id, so it cannot be spoofed via the
-- SECURITY DEFINER create RPC's client-supplied sender. Guarded on auth.uid() is not null so
-- system/no-auth inserts are never blocked.
-- ASSUMPTION (verified 2026-08-25): review conversations are strictly two-party — one
-- reviewer/player + one replying manager (create_conversation_with_participants adds only creator
-- + recipient; reviews always pass is_support=false; no addParticipant path; non-participants
-- cannot post). So "another participant archived" == "the recipient archived". If review
-- conversations ever become multi-management-party, target the specific recipient instead.
create or replace function public.block_reply_if_recipient_archived()
  returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $$
begin
  if auth.uid() is not null
     and exists (select 1 from public.conversations c
                 where c.id = new.conversation_id and c.category = 'review')
     and exists (select 1 from public.conversation_participants cp
                 where cp.conversation_id = new.conversation_id
                   and cp.user_id <> auth.uid()
                   and cp.archived_at is not null) then
    raise exception 'recipient_archived' using errcode = 'P0001';
  end if;
  return new;
end; $$;

drop trigger if exists trg_block_archived_reply on public.conversation_messages;
create trigger trg_block_archived_reply
  before insert on public.conversation_messages
  for each row execute function public.block_reply_if_recipient_archived();

revoke all on function public.set_conversation_archived(uuid, boolean) from public, anon;
revoke all on function public.set_review_archived(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;
grant execute on function public.set_review_archived(uuid, boolean) to authenticated;
