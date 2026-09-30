-- Captured from prod 2026-09-29 (read-only) before 20261013120000_admin_global_authz_phase1.
-- RLS flags + every policy on the tables that migration touches. Replayed by
-- supabase/tests/admin_authz_phase1.test.ts so the tests run against the real prod definitions.
alter table public.billing_plans disable row level security;
alter table public.invoices disable row level security;
alter table public.payment_methods disable row level security;
alter table public.tournament_templates enable row level security;
alter table public.venue_subscriptions disable row level security;
alter table public.venues enable row level security;
create policy "Authenticated users can read active billing plans" on public.billing_plans as permissive for SELECT to authenticated using ((is_active = true));
create policy "Bar owner can read own venue invoices" on public.invoices as permissive for SELECT to authenticated using ((venue_id IN ( SELECT vo.venue_id
   FROM (venue_owners vo
     JOIN profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));
create policy "Bar owner can read own venue payment methods" on public.payment_methods as permissive for SELECT to authenticated using ((venue_id IN ( SELECT vo.venue_id
   FROM (venue_owners vo
     JOIN profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));
create policy "Anyone can read active templates" on public.tournament_templates as permissive for SELECT to public using ((status = 'active'::text));
create policy "Directors can update own templates" on public.tournament_templates as permissive for UPDATE to public using ((director_id = ( SELECT profiles.id_auto
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
create policy "Tournament directors can view their own templates" on public.tournament_templates as permissive for SELECT to public using ((auth.uid() IS NOT NULL));
create policy "Venue managers and admins can insert templates" on public.tournament_templates as permissive for INSERT to authenticated with check ((_authz_is_admin() OR ((director_id = _authz_my_id_auto()) AND _authz_manages_venue(venue_id))));
create policy "Bar owner can read own venue subscriptions" on public.venue_subscriptions as permissive for SELECT to authenticated using ((venue_id IN ( SELECT vo.venue_id
   FROM (venue_owners vo
     JOIN profiles p ON ((p.id_auto = vo.owner_id)))
  WHERE ((p.id = auth.uid()) AND (vo.archived_at IS NULL)))));
create policy "Anyone can read active venues" on public.venues as permissive for SELECT to public using ((status = 'active'::text));
create policy "Anyone can view venues" on public.venues as permissive for SELECT to authenticated using (true);
create policy "Bar owners can insert venues" on public.venues as permissive for INSERT to authenticated with check (true);
create policy "Bar owners can update their venues" on public.venues as permissive for UPDATE to authenticated using ((id IN ( SELECT venue_owners.venue_id
   FROM venue_owners
  WHERE (venue_owners.owner_id = ( SELECT profiles.id_auto
           FROM profiles
          WHERE (profiles.id = auth.uid()))))));
alter table public.venue_tables disable row level security;
create policy "Bar owners can delete venue_tables" on public.venue_tables as permissive for DELETE to authenticated using (true);
create policy "Bar owners can insert venue_tables" on public.venue_tables as permissive for INSERT to authenticated with check (true);
create policy "Bar owners can update venue_tables" on public.venue_tables as permissive for UPDATE to authenticated using (true);
create policy "Bar owners can view venue_tables" on public.venue_tables as permissive for SELECT to authenticated using (true);
