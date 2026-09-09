-- 20260818180000_conversations_participant_select.sql
-- Fix: a conversation was only SELECT-able by its creator (or an admin), so a manager-initiated
-- thread (e.g. a review reply, where the manager is created_by and the player is the recipient)
-- was invisible in the recipient's Profile → Inbox. conversation_messages already allow any
-- participant to read; conversations did not. Add a participant clause so any participant can
-- read the conversation they're part of.
--
-- No recursion: the conversation_participants policies reference only profiles (never
-- conversations), so conversations_select selecting conversation_participants is safe.

drop policy if exists conversations_select on public.conversations;

create policy conversations_select on public.conversations
  for select to authenticated
  using (
    (created_by = auth.uid())
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = any (array['super_admin'::text, 'compete_admin'::text])
    )
    or exists (
      select 1 from public.conversation_participants cp
       where cp.conversation_id = conversations.id
         and cp.user_id = auth.uid()
    )
  );
