-- supabase/rollback/20261019120000_elim_undo_restore_rollback.sql
-- Rolls back 20261019120000_elim_undo_restore.sql: removes its functions + trigger and restores
-- the previous _elim_state_slice (the one existing function it redefined) verbatim. Audit rows / checkpoints written meanwhile are kept (inert history).
-- If you roll this back, also redeploy the previous web build (the Recovery & History screen
-- calls elim_undo / elim_restore).

begin;

drop trigger if exists tournament_audit_names on public.tournament_audit;
drop function if exists public.tg_tournament_audit_names();
drop function if exists public.elim_undo(bigint, bigint, boolean);
drop function if exists public.elim_restore(bigint, bigint, bigint, boolean);
drop function if exists public._elim_recovery_write(bigint, jsonb, jsonb, boolean, text, text, text, text, jsonb, jsonb, jsonb);
drop function if exists public._elim_recovery_lock(bigint, bigint, boolean);
drop function if exists public._elim_impact(jsonb, jsonb);
drop function if exists public._elim_seed_name(jsonb, text);

-- Restore the 20261018120000 definition of _elim_state_slice (this migration redefined it).
create or replace function public._elim_state_slice(p_ls jsonb, p_with_bracket boolean)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'matchState', coalesce(p_ls -> 'matchState', '{}'::jsonb),
    'queueOrder', p_ls -> 'queueOrder',
    'queuePins', p_ls -> 'queuePins',
    'autoAssignMode', p_ls -> 'autoAssignMode',
    'autoAssignEnabled', p_ls -> 'autoAssignEnabled',
    'drawNumber', p_ls #> '{bracket,drawNumber}',
    'bracket', case when p_with_bracket then p_ls -> 'bracket' end));
$$;
revoke all on function public._elim_state_slice(jsonb, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
