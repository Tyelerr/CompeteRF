# supabase/pending/

Migrations that are written, tested and committed but **must not be applied yet**.
`supabase db push` applies every file in `supabase/migrations/`, so a migration that is
waiting on an explicit approval / client rollout is parked here instead.

| File | Waiting on |
|---|---|
| `20260930130000_authz_write_lockdown.sql` (M2) | Phase 1 authz: M1 applied + new client live for staff + owner approval. To apply: `git mv` it back into `supabase/migrations/`, re-run `supabase/tests/authz_prod_verification.sql` (rollback-only), then `supabase db push --linked`. |
