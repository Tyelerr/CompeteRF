-- Rollback for 20260818180000_conversations_participant_select.sql
-- Restores the original creator/admin-only SELECT policy on conversations.

drop policy if exists conversations_select on public.conversations;

create policy conversations_select on public.conversations
  for select to authenticated
  using (
    (created_by = auth.uid())
    or exists (
      select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.role = any (array['super_admin'::text, 'compete_admin'::text])
    )
  );
