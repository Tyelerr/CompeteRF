-- supabase/migrations/20260925120000_push_token_single_owner.sql
--
-- One active owner per physical device token.
--
-- Problem: push_tokens is unique on (user_id, token), so the same Expo device token can be
-- ACTIVE under several accounts. The client tries to delete other accounts' rows for its token
-- before registering, but RLS ("Users manage own push tokens": user_id = auth.uid()) makes that
-- delete a silent no-op — so every account ever signed in on a phone keeps receiving pushes on
-- it. Prod on 2026-09-22: 90 active rows / 60 distinct tokens; 7 tokens shared; one iPhone
-- token active under 9 accounts.
--
-- Fix (no client change required, so older installed builds are fixed too):
--   1. BEFORE INSERT/UPDATE trigger: when a row becomes active for (user, token), deactivate every
--      OTHER account's active row for that same token. SECURITY DEFINER so it works under RLS.
--      Same account on several devices = different tokens = untouched.
--   2. One-time cleanup: for each token active under several accounts keep only the most
--      recently registered row active (the app re-registers on every launch of the signed-in
--      account, so the newest updated_at is the account currently using that device).
--      Rows are DEACTIVATED, not deleted (reversible; the account re-activates on its next sign-in).
--   3. Partial unique index: at most one active row per token — the invariant, enforced.
-- No other table, policy or function changes.

create or replace function public._push_tokens_single_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.is_active then
    update public.push_tokens
    set is_active = false, updated_at = now()
    where token = NEW.token
      and user_id <> NEW.user_id
      and is_active;
  end if;
  return NEW;
end;
$$;

revoke all on function public._push_tokens_single_owner() from public, anon, authenticated;

-- 2. cleanup (before the index can exist)
with ranked as (
  select id, row_number() over (partition by token order by updated_at desc, created_at desc, id) rn
  from public.push_tokens
  where is_active
)
update public.push_tokens pt
set is_active = false, updated_at = now()
from ranked r
where pt.id = r.id and r.rn > 1;

drop trigger if exists push_tokens_single_owner on public.push_tokens;
create trigger push_tokens_single_owner
  before insert or update of is_active, token, user_id on public.push_tokens
  for each row
  when (NEW.is_active)
  execute function public._push_tokens_single_owner();

-- 3. the invariant
create unique index if not exists push_tokens_one_active_owner
  on public.push_tokens (token) where is_active;
