
-- Allow super admins to upload flyers
CREATE POLICY "Super admins can upload venue flyers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'venue-flyers'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Allow anyone to view flyers (public bucket)
CREATE POLICY "Anyone can view venue flyers"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'venue-flyers');

-- Allow super admins to delete flyers
CREATE POLICY "Super admins can delete venue flyers"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'venue-flyers'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);
