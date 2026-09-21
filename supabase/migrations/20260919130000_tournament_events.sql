-- supabase/migrations/20260919130000_tournament_events.sql
--
-- Durable activity/audit log for ELIMINATION tournaments (Single/Double), mirroring the proven
-- chip_events conventions (client-generated text id, tournament_id FK w/ cascade, type/text/
-- actor_id/payload/created_at, public SELECT, manager-only write, tid + (tid, created_at) index).
-- Additive: does NOT touch chip_events or any Chip object.
--
-- Authorization: is_tournament_manager(p_tid) is a format-agnostic copy of is_chip_manager —
-- the tournament's director OR a compete_admin/super_admin. SECURITY DEFINER + fixed search_path,
-- same as the chip predicate.

CREATE OR REPLACE FUNCTION public.is_tournament_manager(p_tid bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
REVOKE ALL ON FUNCTION public.is_tournament_manager(bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_tournament_manager(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.is_tournament_manager(bigint) TO service_role;

CREATE TABLE IF NOT EXISTS public.tournament_events (
    id text NOT NULL,
    tournament_id bigint NOT NULL,
    type text NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    actor_id bigint,
    payload jsonb,
    tx_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tournament_events_pkey PRIMARY KEY (id)
);

ALTER TABLE ONLY public.tournament_events
    ADD CONSTRAINT tournament_events_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS tournament_events_tid
    ON public.tournament_events USING btree (tournament_id);
CREATE INDEX IF NOT EXISTS tournament_events_tid_created
    ON public.tournament_events USING btree (tournament_id, created_at DESC);

ALTER TABLE public.tournament_events ENABLE ROW LEVEL SECURITY;

-- Public read (anyone can see a tournament's activity, like chip_events); manager-only write.
CREATE POLICY tournament_events_read ON public.tournament_events FOR SELECT USING (true);
CREATE POLICY tournament_events_write ON public.tournament_events
    USING (public.is_tournament_manager(tournament_id))
    WITH CHECK (public.is_tournament_manager(tournament_id));

GRANT ALL ON TABLE public.tournament_events TO anon;
GRANT ALL ON TABLE public.tournament_events TO authenticated;
GRANT ALL ON TABLE public.tournament_events TO service_role;
