-- ============ WORKSHOPS ============
CREATE TABLE public.workshops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  brand_color text NOT NULL DEFAULT '#1b8ed4',
  address text NOT NULL,
  phone text NOT NULL,
  tax_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workshops TO anon, authenticated;
GRANT ALL ON public.workshops TO service_role;
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workshops are publicly readable" ON public.workshops FOR SELECT TO anon, authenticated USING (true);

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  mobile text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workshop_id, mobile)
);
GRANT SELECT ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read own record" ON public.customers FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ VEHICLES ============
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  plate text NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  year int NOT NULL,
  mileage_km int NOT NULL DEFAULT 0,
  oil_grade text,
  oil_litres numeric,
  oil_filter text,
  next_service_due_date date,
  next_service_due_km int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vehicles read own" ON public.vehicles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = vehicles.customer_id AND c.user_id = auth.uid()));

-- ============ SERVICES ============
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  price numeric NOT NULL DEFAULT 0,
  quote_after_inspection boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.services TO anon, authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Services are publicly readable" ON public.services FOR SELECT TO anon, authenticated USING (true);

-- ============ JOBS ============
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'arrived',
  is_active boolean NOT NULL DEFAULT false,
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  mileage_km int,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  stage_times jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra_work jsonb,
  total numeric NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  invoice_no text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Jobs read own" ON public.jobs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.vehicles v JOIN public.customers c ON c.id = v.customer_id
               WHERE v.id = jobs.vehicle_id AND c.user_id = auth.uid()));

-- ============ BOOKING REQUESTS ============
CREATE TABLE public.booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimate_total numeric NOT NULL DEFAULT 0,
  preferred_date date NOT NULL,
  preferred_time text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.booking_requests TO authenticated;
GRANT ALL ON public.booking_requests TO service_role;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bookings read own" ON public.booking_requests FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = booking_requests.customer_id AND c.user_id = auth.uid()));
CREATE POLICY "Bookings insert own" ON public.booking_requests FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.customers c WHERE c.id = booking_requests.customer_id AND c.user_id = auth.uid()));

-- ============ BOOKED SLOTS (unavailability) ============
CREATE TABLE public.workshop_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  slot_time text NOT NULL,
  available boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.workshop_slots TO anon, authenticated;
GRANT ALL ON public.workshop_slots TO service_role;
ALTER TABLE public.workshop_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Slots publicly readable" ON public.workshop_slots FOR SELECT TO anon, authenticated USING (true);

-- ============ FUNCTIONS ============
-- Links the signed-in auth user to the customer record for this workshop + mobile.
CREATE OR REPLACE FUNCTION public.link_customer(_slug text, _mobile text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
  _wid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO _wid FROM public.workshops WHERE slug = _slug;
  IF _wid IS NULL THEN RAISE EXCEPTION 'Unknown workshop'; END IF;

  SELECT id INTO _cid FROM public.customers WHERE workshop_id = _wid AND mobile = _mobile;

  IF _cid IS NULL THEN
    INSERT INTO public.customers (workshop_id, user_id, name, mobile)
    VALUES (_wid, auth.uid(), 'Customer ' || _mobile, _mobile)
    RETURNING id INTO _cid;
  ELSE
    UPDATE public.customers SET user_id = auth.uid() WHERE id = _cid;
  END IF;

  RETURN _cid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.link_customer(text, text) TO authenticated;

-- Customer approves the extra work found during inspection.
CREATE OR REPLACE FUNCTION public.approve_extra_work(_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _extra jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.jobs j
    JOIN public.vehicles v ON v.id = j.vehicle_id
    JOIN public.customers c ON c.id = v.customer_id
    WHERE j.id = _job_id AND c.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Not found'; END IF;

  SELECT extra_work INTO _extra FROM public.jobs WHERE id = _job_id;
  IF _extra IS NULL OR (_extra->>'approved')::boolean THEN RETURN; END IF;

  UPDATE public.jobs SET
    extra_work = jsonb_set(_extra, '{approved}', 'true'::jsonb),
    line_items = line_items || jsonb_build_array(jsonb_build_object('label', _extra->>'title', 'amount', (_extra->>'price')::numeric)),
    total = total + (_extra->>'price')::numeric,
    status = 'repairing',
    stage_times = stage_times || jsonb_build_object('approval', to_char(now() AT TIME ZONE 'Asia/Singapore', 'HH24:MI'), 'repairing', to_char(now() AT TIME ZONE 'Asia/Singapore', 'HH24:MI'))
  WHERE id = _job_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_extra_work(uuid) TO authenticated;

-- ============ SEED ============
INSERT INTO public.workshops (id, slug, name, logo_url, brand_color, address, phone, tax_rate) VALUES
('11111111-1111-1111-1111-111111111111', 'sgcarservices', 'SG Car Services', '/brand/sgcarservices.png', '#1b8ed4', '60 Jalan Lam Huat, Sungei Kadut, Singapore 737869', '+65 6368 1234', 0),
('22222222-2222-2222-2222-222222222222', '88autogarage', '88 AutoGarage', '/brand/88autogarage.png', '#c0392b', '18 Kaki Bukit Road 3, #01-12, Singapore 415978', '+65 6745 8888', 0.09);

INSERT INTO public.customers (id, workshop_id, name, mobile) VALUES
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Tan Wei Ming', '91234567'),
('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Lim Jia Hui', '98765432');

INSERT INTO public.vehicles (id, workshop_id, customer_id, plate, make, model, year, mileage_km, oil_grade, oil_litres, oil_filter, next_service_due_date, next_service_due_km) VALUES
('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'SJT8888T', 'Toyota', 'Alphard 2.5', 2019, 92400, '0W-20', 4.2, 'Genuine Toyota oil filter', (CURRENT_DATE + 24), 102000),
('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'SKB2211J', 'Honda', 'Civic 1.6', 2021, 41200, '0W-20', 3.7, 'Genuine Honda oil filter', (CURRENT_DATE + 60), 50000);

INSERT INTO public.services (workshop_id, name, description, components, price, quote_after_inspection, sort_order) VALUES
('11111111-1111-1111-1111-111111111111', 'Standard servicing', 'Engine oil and filter change with a 20-point safety check.',
 '[{"label":"Engine oil - Toyota Genuine Motor Oil 0W-20 (4.2 L)","amount":88},{"label":"Oil filter - Genuine Toyota","amount":18},{"label":"Labour","amount":32}]'::jsonb, 138, false, 1),
('11111111-1111-1111-1111-111111111111', 'Major servicing', 'Engine oil and filter, air filter, cabin filter, spark plugs and full inspection.',
 '[{"label":"Engine oil - Toyota Genuine Motor Oil 0W-20 (4.2 L)","amount":88},{"label":"Oil filter - Genuine Toyota","amount":18},{"label":"Air filter","amount":45},{"label":"Cabin filter","amount":38},{"label":"Spark plugs (4)","amount":52},{"label":"Labour","amount":27}]'::jsonb, 268, false, 2),
('11111111-1111-1111-1111-111111111111', 'Brake inspection', 'Full brake check. No charge - any work needed is quoted after inspection.',
 '[{"label":"Brake inspection","amount":0}]'::jsonb, 0, true, 3),
('22222222-2222-2222-2222-222222222222', 'Standard servicing', 'Engine oil and filter change with a safety check.',
 '[{"label":"Engine oil - 0W-20 fully synthetic (3.7 L)","amount":78},{"label":"Oil filter","amount":16},{"label":"Labour","amount":30}]'::jsonb, 124, false, 1),
('22222222-2222-2222-2222-222222222222', 'Aircon servicing', 'Cabin filter replacement and aircon system check.',
 '[{"label":"Cabin filter","amount":35},{"label":"Aircon check and clean","amount":65},{"label":"Labour","amount":30}]'::jsonb, 130, false, 2);

-- Past jobs for SJT8888T
INSERT INTO public.jobs (workshop_id, vehicle_id, title, status, is_active, service_date, mileage_km, line_items, photos, total, paid, invoice_no) VALUES
('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','Standard servicing','collected',false,(CURRENT_DATE - 540), 68200,
 '[{"label":"Engine oil - Toyota Genuine 0W-20 (4.2 L)","amount":88},{"label":"Oil filter - Genuine Toyota","amount":18},{"label":"Labour","amount":32}]'::jsonb,
 '[]'::jsonb, 138, true, 'INV-2025-0412'),
('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','Major servicing + brake pads','collected',false,(CURRENT_DATE - 390), 75600,
 '[{"label":"Engine oil - Toyota Genuine 0W-20 (4.2 L)","amount":88},{"label":"Oil filter - Genuine Toyota","amount":18},{"label":"Air filter","amount":45},{"label":"Cabin filter","amount":38},{"label":"Spark plugs (4)","amount":52},{"label":"Rear brake pads","amount":165},{"label":"Labour","amount":72}]'::jsonb,
 '["/photos/inspection-brakes.jpg","/photos/inspection-underbody.jpg","/photos/inspection-filter.jpg"]'::jsonb, 478, true, 'INV-2025-0918'),
('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','Battery replacement','collected',false,(CURRENT_DATE - 205), 82100,
 '[{"label":"Battery - Amaron 80D26L","amount":195},{"label":"Labour","amount":25}]'::jsonb,
 '[]'::jsonb, 220, true, 'INV-2026-0137'),
('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','Standard servicing','collected',false,(CURRENT_DATE - 96), 87300,
 '[{"label":"Engine oil - Toyota Genuine 0W-20 (4.2 L)","amount":88},{"label":"Oil filter - Genuine Toyota","amount":18},{"label":"Wiper blades (pair)","amount":36},{"label":"Labour","amount":32}]'::jsonb,
 '[]'::jsonb, 174, false, 'INV-2026-0521');

-- Active job today
INSERT INTO public.jobs (workshop_id, vehicle_id, title, status, is_active, service_date, mileage_km, line_items, photos, stage_times, extra_work, total, paid) VALUES
('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','Standard servicing','awaiting_approval',true, CURRENT_DATE, 92400,
 '[{"label":"Engine oil - Toyota Genuine 0W-20 (4.2 L)","amount":88},{"label":"Oil filter - Genuine Toyota","amount":18},{"label":"Labour","amount":32}]'::jsonb,
 '[]'::jsonb,
 '{"arrived":"08:42","inspecting":"09:05","awaiting_approval":"09:48"}'::jsonb,
 '{"title":"Front brake pads","reason":"Front brake pads are down to 2.5 mm (minimum is 3 mm). We recommend replacing them today while the car is on the lift.","price":180,"approved":false,"photos":["/photos/inspection-brakes.jpg","/photos/inspection-underbody.jpg"]}'::jsonb,
 138, false);

-- Slots: next 14 days, a few marked unavailable
INSERT INTO public.workshop_slots (workshop_id, slot_date, slot_time, available)
SELECT w.id, d::date, t, NOT ((extract(day from d)::int + length(t)) % 4 = 0)
FROM public.workshops w
CROSS JOIN generate_series(CURRENT_DATE + 1, CURRENT_DATE + 14, interval '1 day') d
CROSS JOIN unnest(ARRAY['09:00','10:30','13:00','14:30','16:00']) t
WHERE extract(dow from d) <> 0;