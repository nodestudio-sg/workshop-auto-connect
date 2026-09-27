-- ============================================================================
-- 0001 — Harden the data boundary
--
-- Safe to run more than once. Runs in one transaction: it either all applies
-- or none of it does. The app works with or without this migration applied.
--
-- 1. Table privileges: revoke everything Supabase granted by default, then
--    grant back only what the customer app uses. RLS stays the row boundary.
-- 2. Functions: signed-out users can no longer execute them.
-- 3. Workshop consistency: composite foreign keys so a child row can never
--    carry a different workshop_id from its parent (vehicle → customer,
--    job → vehicle, booking → customer and vehicle), and a booking's vehicle
--    must belong to the booking's customer.
-- 4. Booking insert policy: the customer can only insert into their own
--    workshop, for their own vehicle, with status 'requested'.
-- 5. link_customer: the mobile number must be proven by the signed-in
--    identity (a verified phone, or a demo account on a workshop explicitly
--    flagged demo_mode). It can no longer be used to take over any customer.
-- ============================================================================

BEGIN;

-- ---------- 1. Table privileges ----------
REVOKE ALL ON public.workshops, public.customers, public.vehicles, public.services,
  public.jobs, public.booking_requests, public.workshop_slots
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.workshops, public.services, public.workshop_slots TO anon, authenticated;
GRANT SELECT ON public.customers, public.vehicles, public.jobs TO authenticated;
GRANT SELECT, INSERT ON public.booking_requests TO authenticated;

-- ---------- 2. Function privileges ----------
REVOKE ALL ON FUNCTION public.link_customer(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_extra_work(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_customer(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_extra_work(uuid) TO authenticated;

-- ---------- 3. Workshop consistency ----------
-- Drop this section's own constraints first (children before parents) so the
-- section can be re-run.
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_vehicle_of_customer_fkey;
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_vehicle_same_workshop_fkey;
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_customer_same_workshop_fkey;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_vehicle_same_workshop_fkey;
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_customer_same_workshop_fkey;
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_id_customer_key;
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_id_workshop_key;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_id_workshop_key;

-- Parent keys that include workshop_id, so children can reference them.
ALTER TABLE public.customers ADD CONSTRAINT customers_id_workshop_key UNIQUE (id, workshop_id);
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_id_workshop_key UNIQUE (id, workshop_id);
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_id_customer_key UNIQUE (id, customer_id);

-- Children must carry the same workshop_id as their parent.
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_customer_same_workshop_fkey
  FOREIGN KEY (customer_id, workshop_id) REFERENCES public.customers (id, workshop_id) ON DELETE CASCADE;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_vehicle_same_workshop_fkey
  FOREIGN KEY (vehicle_id, workshop_id) REFERENCES public.vehicles (id, workshop_id) ON DELETE CASCADE;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_customer_same_workshop_fkey
  FOREIGN KEY (customer_id, workshop_id) REFERENCES public.customers (id, workshop_id) ON DELETE CASCADE;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_vehicle_same_workshop_fkey
  FOREIGN KEY (vehicle_id, workshop_id) REFERENCES public.vehicles (id, workshop_id) ON DELETE CASCADE;
-- A booking's vehicle must belong to the booking's customer.
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_vehicle_of_customer_fkey
  FOREIGN KEY (vehicle_id, customer_id) REFERENCES public.vehicles (id, customer_id) ON DELETE CASCADE;

-- ---------- 4. Booking insert policy ----------
DROP POLICY IF EXISTS "Bookings insert own" ON public.booking_requests;
CREATE POLICY "Bookings insert own" ON public.booking_requests FOR INSERT TO authenticated
WITH CHECK (
  status = 'requested'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    JOIN public.vehicles v ON v.customer_id = c.id
    WHERE c.id = booking_requests.customer_id
      AND c.user_id = auth.uid()
      AND c.workshop_id = booking_requests.workshop_id
      AND v.id = booking_requests.vehicle_id
      AND v.workshop_id = booking_requests.workshop_id
  )
);

-- ---------- 5. link_customer ----------
-- Per-workshop demo switch, off by default. A new workshop can never accept
-- demo sign-ins unless someone deliberately turns this on for it.
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS demo_mode boolean NOT NULL DEFAULT false;

-- Only the two seeded demo workshops.
UPDATE public.workshops SET demo_mode = true
WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

CREATE OR REPLACE FUNCTION public.link_customer(_slug text, _mobile text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _wid uuid;
  _demo boolean;
  _mobile_clean text := regexp_replace(coalesce(_mobile, ''), '\D', '', 'g');
  _phone text;
  _phone_confirmed timestamptz;
  _email text;
  _verified_mobile text;
  _via_phone boolean := false;
  _cid uuid;
  _owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id, demo_mode INTO _wid, _demo FROM public.workshops WHERE slug = _slug;
  IF _wid IS NULL THEN RAISE EXCEPTION 'Unknown workshop'; END IF;

  SELECT regexp_replace(coalesce(phone, ''), '\D', '', 'g'), phone_confirmed_at, lower(email)
    INTO _phone, _phone_confirmed, _email
  FROM auth.users WHERE id = _uid;

  IF _phone_confirmed IS NOT NULL AND _phone ~ '^65[0-9]{8}$' THEN
    -- Real path: the number was proven by an SMS OTP.
    _verified_mobile := substr(_phone, 3);
    _via_phone := true;
  ELSIF _demo AND _email = lower(_slug) || '.' || _mobile_clean || '@customer.workshopapp.sg' THEN
    -- Demo path: only on workshops explicitly flagged demo_mode.
    _verified_mobile := _mobile_clean;
  ELSE
    RAISE EXCEPTION 'Mobile number not verified';
  END IF;

  IF _mobile_clean <> _verified_mobile THEN
    RAISE EXCEPTION 'Mobile number does not match the signed-in account';
  END IF;

  SELECT id, user_id INTO _cid, _owner
  FROM public.customers WHERE workshop_id = _wid AND mobile = _verified_mobile;

  IF _cid IS NULL THEN
    INSERT INTO public.customers (workshop_id, user_id, name, mobile)
    VALUES (_wid, _uid, 'Customer ' || _verified_mobile, _verified_mobile)
    RETURNING id INTO _cid;
  ELSIF _owner IS NULL OR _owner = _uid THEN
    UPDATE public.customers SET user_id = _uid WHERE id = _cid;
  ELSIF _via_phone THEN
    -- A verified SMS OTP on this number outranks an earlier link.
    UPDATE public.customers SET user_id = _uid WHERE id = _cid;
  ELSE
    RAISE EXCEPTION 'This customer is linked to another account';
  END IF;

  RETURN _cid;
END;
$$;

REVOKE ALL ON FUNCTION public.link_customer(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_customer(text, text) TO authenticated;

COMMIT;
