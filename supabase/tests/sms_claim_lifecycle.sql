-- supabase/tests/sms_claim_lifecycle.sql
-- Lifecycle test for claim_sms_send + the stale/terminal semantics.
-- SAFE: wrapped in a transaction and ROLLED BACK — makes no lasting change.
-- Run in the Supabase SQL editor / psql AFTER the 20260730120000 migration is
-- applied. Uses the first auth.users row as a throwaway recipient.
--
-- Asserts:
--   1. reserve key            → 'ok:<id>'  (row = 'queued')
--   2. stale recovery         → 'delivery_failed' + 'stale_unconfirmed', key preserved
--   3. duplicate claim (same key) → 'terminal'  (NOT retry, no resend, no new row)
--   4. new readiness revision (new key) → 'ok:<id2>'  (permitted)

begin;
do $$
declare
  v_uid uuid;
  v_key text := 'test:lifecycle:' || gen_random_uuid()::text;
  v_r1 text; v_r2 text; v_r3 text; v_id bigint;
begin
  select id into v_uid from auth.users limit 1;
  if v_uid is null then raise exception 'no auth.users row available to test with'; end if;

  -- 1. reserve
  v_r1 := public.claim_sms_send(v_key, v_uid, 'match_ready', '+15551230000', null, 'W1M1');
  assert v_r1 like 'ok:%', format('step1 expected ok:, got %s', v_r1);
  v_id := split_part(v_r1, ':', 2)::bigint;
  assert (select status from public.sms_messages where id = v_id) = 'queued', 'step1 row not queued';

  -- 2. simulate stale recovery (recover_stale_sms_send does this to aged rows;
  --    done inline here so we don't touch unrelated queued rows). Key preserved.
  update public.sms_messages
     set status = 'delivery_failed', error_code = 'stale_unconfirmed'
   where id = v_id;
  assert (select idempotency_key from public.sms_messages where id = v_id) = v_key, 'step2 key changed';

  -- 3. duplicate claim for the SAME key → terminal (no reclaim, no new row)
  v_r2 := public.claim_sms_send(v_key, v_uid, 'match_ready', '+15551230000', null, 'W1M1');
  assert v_r2 = 'terminal', format('step3 expected terminal, got %s', v_r2);
  assert (select count(*) from public.sms_messages where idempotency_key = v_key) = 1, 'step3 created a duplicate row';

  -- 4. genuinely new readiness revision (new server-derived key) → permitted
  v_r3 := public.claim_sms_send(v_key || ':rev2', v_uid, 'match_ready', '+15551230000', null, 'W1M1');
  assert v_r3 like 'ok:%', format('step4 expected ok:, got %s', v_r3);

  raise notice 'claim_sms_send lifecycle: ALL STEPS PASSED';
end $$;
rollback;
