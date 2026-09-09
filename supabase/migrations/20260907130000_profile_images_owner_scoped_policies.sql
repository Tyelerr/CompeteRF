-- Owner-scoped Storage policies for the profile-images bucket (avatars).
--
-- Path convention (set by useEditProfile → imageUploadService.uploadImage with folder
-- "avatars/<authUid>"): "avatars/<auth-uid>/<filename>". So folder[1] = 'avatars' and
-- folder[2] = the owner's auth uid.
--
-- Apply with: supabase db push (review first). Does NOT create the bucket — the
-- profile-images bucket already exists.
--
-- Remove the existing dashboard-created policies (exact names from pg_policies). The
-- broad ones are the reason this is needed: "Users can upload profile images
-- vejz8c_0" (INSERT, role PUBLIC) and "Users can update their profile images
-- vejz8c_0" (UPDATE, role PUBLIC) let effectively anyone write/overwrite; the vejz8c_1
-- entries are stray SELECTs. All are replaced by the owner-scoped set below.
DROP POLICY IF EXISTS "Anyone can view profile images vejz8c_0" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload profile images vejz8c_0" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their profile images vejz8c_0" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their profile images vejz8c_1" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their profile images vejz8c_0" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their profile images vejz8c_1" ON storage.objects;

-- Idempotent for the names this migration creates.
DROP POLICY IF EXISTS "profile-images public read" ON storage.objects;
DROP POLICY IF EXISTS "profile-images owner insert" ON storage.objects;
DROP POLICY IF EXISTS "profile-images owner update" ON storage.objects;
DROP POLICY IF EXISTS "profile-images owner delete" ON storage.objects;

-- Avatars are shown publicly across the app → public read.
CREATE POLICY "profile-images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-images');

-- Insert only into avatars/<your-uid>/...
CREATE POLICY "profile-images owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-images'
  AND (storage.foldername(name))[1] = 'avatars'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Update only your own avatar objects (super admins may update any).
CREATE POLICY "profile-images owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profile-images'
  AND (
    ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = auth.uid()::text)
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  )
);

-- Delete only your own avatar objects (super admins may delete any). Lets a user
-- replace their avatar and lets the moderated flow remove a rejected upload.
CREATE POLICY "profile-images owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-images'
  AND (
    ((storage.foldername(name))[1] = 'avatars' AND (storage.foldername(name))[2] = auth.uid()::text)
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
  )
);
