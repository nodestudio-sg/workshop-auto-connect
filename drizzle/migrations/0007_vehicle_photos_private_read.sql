DROP POLICY IF EXISTS "Vehicle photos public read" ON storage.objects;
CREATE POLICY "Vehicle photos own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);