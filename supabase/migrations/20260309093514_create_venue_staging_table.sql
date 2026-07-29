
CREATE TABLE public.venue_staging (
  id              serial PRIMARY KEY,

  -- Tracking
  status          text NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending', 'In Progress', 'Verified', 'Completed', 'Problem')),
  notes           text,
  flyer_url       text,

  -- Required
  venue           text,
  address         text,
  city            text,
  state           text,
  zip_code        text,

  -- Optional
  phone           text,
  latitude        numeric(10, 8),
  longitude       numeric(11, 8),
  google_place_id text,
  num_tables      integer,
  table_sizes     text,   -- comma-separated e.g. "7ft, 9ft"
  table_brands    text,   -- comma-separated e.g. "Diamond, Gold Crown"
  website         text,

  -- Timestamps
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION update_venue_staging_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER venue_staging_updated_at
  BEFORE UPDATE ON public.venue_staging
  FOR EACH ROW EXECUTE FUNCTION update_venue_staging_updated_at();

-- RLS
ALTER TABLE public.venue_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on venue_staging"
  ON public.venue_staging
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );
