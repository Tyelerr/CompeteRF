-- 20260909140000_is_chip_manager_venue_owners_rollback.sql
-- Standalone DOWN for 20260909140000_is_chip_manager_venue_owners.sql.
-- Restores the ORIGINAL is_chip_manager definition from 20260624120000 (director_id +
-- compete_admin/super_admin only). Always safe (a function redefinition).
--
-- NOTE: reverting this NARROWS chip_* write access back to director/admin only, so venue
-- owners / venue directors would again be blocked from managing chip tournaments even
-- though the UI allows them. Revert only if you intend that.

create or replace function public.is_chip_manager(p_tid bigint)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = p_tid
      and (
        t.director_id = (select id_auto from public.profiles where id = auth.uid())
        or (select role from public.profiles where id = auth.uid())
             in ('compete_admin', 'super_admin')
      )
  );
$$;

revoke all on function public.is_chip_manager(bigint) from public, anon;
grant execute on function public.is_chip_manager(bigint) to authenticated;
