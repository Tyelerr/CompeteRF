-- 20261012120000_ugc_report_block.sql
-- Google Play UGC compliance: Report User / Report Message / Report Review + Block User.
--
-- Reuses the existing `reports` table and Admin → Content Reports workflow:
--   * three new content types: user, message, review (+ a 'harassment' reason);
--   * `reported_user_id` + `content_snapshot` give admins moderation context for PRIVATE
--     content (DMs, TD-only reviews) without widening any read policy — the snapshot is
--     captured server-side by submit_content_report(), which verifies the reporter could
--     actually see the content (participant / review manager) so it can't be spoofed;
--   * the direct-insert policy is narrowed to the three legacy types (old app builds keep
--     working unchanged) so new-type reports can only be created through the RPC.
--
-- Blocking is deliberately minimal (not a social graph): `user_blocks` rows are private to
-- the blocker, and a BEFORE INSERT trigger on conversation_messages rejects a message in a
-- non-support conversation when the sender and any other participant have blocked each
-- other (either direction). Covers new conversations (create_conversation_with_participants
-- inserts participants first, then the first message) and replies. Support conversations
-- are exempt so users can always reach Compete staff. Tournament participation, rosters,
-- brackets, notifications and broadcasts are untouched.

begin;

-- ── 1. reports: new content types / reason / moderation context ──────────────────────
alter table public.reports drop constraint if exists reports_content_type_check;
alter table public.reports add constraint reports_content_type_check
  check (content_type = any (array['tournament','profile','giveaway','user','message','review']));

alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason = any (array['inappropriate','spam','misleading','harassment','other']));

alter table public.reports
  add column if not exists reported_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists content_snapshot jsonb;

create index if not exists idx_reports_reported_user on public.reports (reported_user_id);

-- Direct inserts: legacy types only, and never with server-owned moderation fields.
drop policy if exists "Users can create their own reports" on public.reports;
create policy "Users can create their own reports" on public.reports
  for insert to authenticated
  with check (
    auth.uid() = reporter_id
    and content_type = any (array['tournament','profile','giveaway'])
    and reported_user_id is null
    and content_snapshot is null
  );

-- ── 2. submit_content_report: user / message / review ─────────────────────────────────
create or replace function public.submit_content_report(
  p_content_type text,
  p_content_id   text,
  p_reason       text,
  p_details      text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_id       uuid;
  v_target   uuid;
  v_reported uuid;
  v_snap     jsonb;
  v_prof     record;
  v_msg      record;
  v_rev      record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_content_type is null or p_content_type <> all (array['user','message','review']) then
    raise exception 'unsupported_content_type' using errcode = '22023';
  end if;
  if p_reason is null or p_reason <> all (array['inappropriate','spam','misleading','harassment','other']) then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if p_content_id is null or p_content_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_target := p_content_id::uuid;

  -- One report per reporter per item (idempotent: return the existing report).
  select id into v_id from public.reports
   where reporter_id = v_uid and content_type = p_content_type and content_id = p_content_id
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if p_content_type = 'user' then
    select id, user_name, name, role into v_prof from public.profiles where id = v_target;
    if v_prof.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_prof.id = v_uid then raise exception 'cannot_report_self' using errcode = '22023'; end if;
    v_reported := v_prof.id;
    v_snap := jsonb_build_object('user_name', v_prof.user_name, 'name', v_prof.name, 'role', v_prof.role);

  elsif p_content_type = 'message' then
    select m.id, m.body, m.sender_id, m.conversation_id, m.created_at,
           c.is_support, c.category, p.user_name as sender_user_name, p.name as sender_name
      into v_msg
      from public.conversation_messages m
      join public.conversations c on c.id = m.conversation_id
      left join public.profiles p on p.id = m.sender_id
     where m.id = v_target;
    -- Only a participant of the conversation can report one of its messages.
    if v_msg.id is null or not exists (
         select 1 from public.conversation_participants cp
          where cp.conversation_id = v_msg.conversation_id and cp.user_id = v_uid) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_msg.sender_id = v_uid then raise exception 'cannot_report_self' using errcode = '22023'; end if;
    v_reported := v_msg.sender_id;
    v_snap := jsonb_build_object(
      'body', left(v_msg.body, 2000), 'sent_at', v_msg.created_at,
      'conversation_id', v_msg.conversation_id, 'category', v_msg.category, 'is_support', v_msg.is_support,
      'sender_user_name', v_msg.sender_user_name, 'sender_name', v_msg.sender_name);

  else -- review
    select r.id, r.reviewer_id, r.tournament_id, r.tournament_name, r.rating, r.comment,
           r.selected_reasons, r.submitted_at
      into v_rev
      from public.tournament_reviews r
     where r.id = v_target;
    -- Only someone who can see the review (its TD / venue owner / admin) can report it.
    if v_rev.id is null or not public.can_view_tournament_reviews(v_rev.tournament_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if v_rev.reviewer_id = v_uid then raise exception 'cannot_report_self' using errcode = '22023'; end if;
    v_reported := v_rev.reviewer_id;
    v_snap := jsonb_build_object(
      'rating', v_rev.rating, 'comment', left(v_rev.comment, 2000), 'reasons', to_jsonb(v_rev.selected_reasons),
      'tournament_id', v_rev.tournament_id, 'tournament_name', v_rev.tournament_name, 'submitted_at', v_rev.submitted_at);
  end if;

  insert into public.reports (reporter_id, content_type, content_id, reason, details, reported_user_id, content_snapshot)
  values (v_uid, p_content_type, p_content_id, p_reason, nullif(left(btrim(coalesce(p_details, '')), 1000), ''),
          -- reported_user_id must reference a live profile (FK); snapshot keeps the context either way
          (select id from public.profiles where id = v_reported), v_snap)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_content_report(text, text, text, text) from public, anon;
grant execute on function public.submit_content_report(text, text, text, text) to authenticated;

-- ── 3. user_blocks ─────────────────────────────────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists idx_user_blocks_blocked on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- Private to the blocker: the blocked user can't list who blocked them.
drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());
drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

revoke all on public.user_blocks from anon;
grant select, insert, delete on public.user_blocks to authenticated;

-- ── 4. enforce blocks on direct messaging ─────────────────────────────────────────────
create or replace function public.block_message_if_users_blocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Support conversations are exempt: users can always reach Compete staff.
  if exists (select 1 from public.conversations c where c.id = new.conversation_id and c.is_support) then
    return new;
  end if;
  if exists (
    select 1
      from public.conversation_participants cp
      join public.user_blocks b
        on (b.blocker_id = new.sender_id and b.blocked_id = cp.user_id)
        or (b.blocker_id = cp.user_id and b.blocked_id = new.sender_id)
     where cp.conversation_id = new.conversation_id
       and cp.user_id <> new.sender_id
  ) then
    raise exception 'blocked' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_blocked_message on public.conversation_messages;
create trigger trg_block_blocked_message
  before insert on public.conversation_messages
  for each row execute function public.block_message_if_users_blocked();

commit;
