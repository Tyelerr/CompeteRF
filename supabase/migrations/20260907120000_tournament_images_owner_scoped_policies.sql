-- Owner-scoped Storage policies for the tournament-images bucket.
--
-- Path convention (set by tournament-image.service.ts): "<auth-uid>/<filename>", so
-- the FIRST folder segment is the uploader's auth uid. This replaces the previous
-- bucket-wide INSERT/UPDATE policies (any authenticated user could write/overwrite
-- ANY object) and the super-admin-only DELETE (which blocked a TD from removing their
-- own rejected/temporary upload). Reads stay public (tournament images are shown
-- publicly). Super admins retain full control.
--
-- NOTE: this does NOT create the bucket — ensure the `tournament-images` bucket
-- exists in Storage before/after applying. Apply with: supabase db push (review first).

-- Remove the previous bucket-wide policies (migration-created set AND dashboard
-- duplicates, by EXACT name from pg_policies). Two are especially dangerous:
--   • "Allow authenticated users to upload tourney image 1xs0o9o_0" — INSERT with
--     WITH CHECK (auth.role() = 'authenticated'): NO bucket_id/ownership check at all,
--     so any authenticated user could write to ANY bucket. Must go.
--   • "Allow public read access to tournament images 1xs0o9o_0" — SELECT with
--     USING (true): grants public SELECT on EVERY row of storage.objects (all
--     buckets), not just tournament-images. Real read leak. Must go.
DROP POLICY IF EXISTS "Authenticated users can upload tournament images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view tournament images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update tournament images" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can delete tournament images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload tourney image 1xs0o9o_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to tournament images 1xs0o9o_0" ON storage.objects;

-- Idempotent for the names this migration creates.
DROP POLICY IF EXISTS "tournament-images public read" ON storage.objects;
DROP POLICY IF EXISTS "tournament-images owner insert" ON storage.objects;
DROP POLICY IF EXISTS "tournament-images owner update" ON storage.objects;
DROP POLICY IF EXISTS "tournament-images owner delete" ON storage.objects;
DROP POLICY IF EXISTS "game-type-images public read" ON storage.objects;

-- SAFETY NET for the USING(true) drop: game-type-images had NO SELECT policy of its
-- own and relied on that global policy for public read. Re-establish a scoped public
-- read so game-type default images keep loading. (Harmless/redundant if the bucket is
-- already flagged public; protective if it isn't.)
CREATE POLICY "game-type-images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'game-type-images');

-- Public read (unchanged — images are displayed publicly).
CREATE POLICY "tournament-images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'tournament-images');

-- Insert only into your OWN uid folder.
CREATE POLICY "tournament-images owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tournament-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Update only your own objects (super admins may update any).
CREATE POLICY "tournament-images owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'tournament-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  )
);

-- Delete only your own objects (super admins may delete any). This lets a TD remove
-- their own rejected/temporary upload so nothing is left orphaned in Storage.
CREATE POLICY "tournament-images owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tournament-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  )
);
