ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS photo_url text;

CREATE OR REPLACE FUNCTION public.set_vehicle_photo(_vehicle_id uuid, _photo_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.vehicles v SET photo_url = _photo_url
  FROM public.customers c
  WHERE v.id = _vehicle_id AND c.id = v.customer_id AND c.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not allowed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_vehicle_photo(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_vehicle_photo(uuid, text) TO authenticated;

CREATE POLICY "Vehicle photos public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Vehicle photos own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Vehicle photos own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Vehicle photos own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-photos' AND (storage.foldername(name))[1] = auth.uid()::text);