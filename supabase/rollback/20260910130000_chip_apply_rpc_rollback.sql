-- 20260910130000_chip_apply_rpc_rollback.sql
-- Standalone DOWN for 20260910130000_chip_apply_rpc.sql.
-- Drops the transactional apply RPC. Safe: the client only calls chip_apply when its
-- CHIP_APPLY_ENABLED feature flag is ON; with the flag OFF (default) the legacy whole-blob
-- save is used and this RPC is unused. Roll back the flag (keep it OFF) before/with this.

drop function if exists public.chip_apply(bigint, bigint, jsonb, jsonb, jsonb, jsonb, jsonb);
