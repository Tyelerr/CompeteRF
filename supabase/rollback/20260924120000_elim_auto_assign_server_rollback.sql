-- supabase/rollback/20260924120000_elim_auto_assign_server_rollback.sql
--
-- Reverts 20260924120000_elim_auto_assign_server.sql. Stops server-side Auto Assign entirely:
-- no more triggers, kicks, sweeps or automatic writes. No data change is needed — every write
-- this path made is an ordinary assignment (tableId + assignedAt) that stays valid.
-- Order: run this, then (optionally) `supabase functions delete auto-assign-run` and remove the
-- Vault secrets below. The web client never calls the system RPC, so it needs no revert.
-- NOTE: with this rolled back, Auto Assign (enabled) no longer runs anywhere (the browser
-- runner was removed) — turn it off in any live events or re-apply.

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'elim-auto-assign-sweep';

drop trigger if exists elim_auto_assign_on_tournament on public.tournaments;
drop trigger if exists elim_auto_assign_on_table on public.tournament_tables;

drop function if exists public._elim_auto_assign_sweep();
drop function if exists public.elim_auto_assign_apply(bigint, jsonb, timestamptz);
drop function if exists public._elim_auto_assign_on_table();
drop function if exists public._elim_auto_assign_on_tournament();
drop function if exists public._elim_auto_assign_kick(bigint, text);
drop function if exists public._elim_auto_assign_signature(jsonb);

-- pg_net was installed only for this feature. Dropping it discards any queued requests.
drop extension if exists pg_net;

-- Optional secret cleanup:
-- delete from vault.secrets where name in ('elim_auto_assign_url', 'elim_auto_assign_secret');
