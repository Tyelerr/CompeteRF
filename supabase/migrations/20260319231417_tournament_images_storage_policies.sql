
-- Allow authenticated users to upload tournament images
CREATE POLICY "Authenticated users can upload tournament images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'tournament-images');

-- Allow public read access to tournament images
CREATE POLICY "Public can view tournament images"
ON storage.objects FOR SELECT
USING (bucket_id = 'tournament-images');

-- Allow authenticated users to update tournament images
CREATE POLICY "Authenticated users can update tournament images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'tournament-images');

-- Allow super admins to delete tournament images
CREATE POLICY "Super admins can delete tournament images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tournament-images'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);
