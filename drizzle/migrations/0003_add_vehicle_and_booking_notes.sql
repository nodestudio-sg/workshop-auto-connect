-- ============================================================================
-- 0003 — Customers add their own cars; booking notes
--
-- Run 0002 first. Safe to run more than once. Runs in one transaction.
-- The app works with or without this migration (it explains the feature
-- isn't switched on yet instead of failing).
--
-- 1. A plate is unique within a workshop.
-- 2. add_vehicle(): the signed-in customer adds a car to their own record at
--    this workshop. They can't claim a plate another customer already has,
--    and can hold at most 5 cars.
-- 3. booking_requests.customer_notes: a note to the workshop with the
--    request (max 500 characters), locked like the rest of the request.
--    submit_booking_request() gains a _notes argument; the 0002 version stays
--    for older app code.
-- ============================================================================

BEGIN;

-- ---------- 1. Unique plate per workshop ----------
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_workshop_plate_key;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_workshop_plate_key UNIQUE (workshop_id, plate);

-- ---------- 2. add_vehicle ----------
CREATE OR REPLACE FUNCTION public.add_vehicle(
  _workshop_id uuid,
  _plate text,
  _make text,
  _model text,
  _year integer,
  _mileage_km integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cid uuid;
  _clean text := upper(regexp_replace(coalesce(_plate, ''), '\s', '', 'g'));
  _existing_id uuid;
  _existing_owner uuid;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO _cid FROM public.customers
  WHERE workshop_id = _workshop_id AND user_id = _uid;
  IF _cid IS NULL THEN RAISE EXCEPTION 'Not a customer of this workshop'; END IF;

  IF _clean !~ '^[A-Z]{1,3}[0-9]{1,4}[A-Z]$' THEN RAISE EXCEPTION 'INVALID_PLATE'; END IF;
  IF length(trim(coalesce(_make, ''))) NOT BETWEEN 1 AND 40
     OR length(trim(coalesce(_model, ''))) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'INVALID_VEHICLE';
  END IF;
  IF _year IS NULL OR _year < 1970 OR _year > extract(year FROM now())::int + 1 THEN
    RAISE EXCEPTION 'INVALID_VEHICLE';
  END IF;
  IF _mileage_km IS NOT NULL AND (_mileage_km < 0 OR _mileage_km > 2000000) THEN
    RAISE EXCEPTION 'INVALID_VEHICLE';
  END IF;

  SELECT id, customer_id INTO _existing_id, _existing_owner
  FROM public.vehicles WHERE workshop_id = _workshop_id AND plate = _clean;
  IF _existing_id IS NOT NULL THEN
    IF _existing_owner = _cid THEN RETURN _existing_id; END IF;
    -- Never reveal whose car it is.
    RAISE EXCEPTION 'PLATE_TAKEN';
  END IF;

  IF (SELECT count(*) FROM public.vehicles WHERE customer_id = _cid) >= 5 THEN
    RAISE EXCEPTION 'TOO_MANY_VEHICLES';
  END IF;

  INSERT INTO public.vehicles (workshop_id, customer_id, plate, make, model, year, mileage_km)
  VALUES (_workshop_id, _cid, _clean, trim(_make), trim(_model), _year, coalesce(_mileage_km, 0))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_vehicle(uuid, text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_vehicle(uuid, text, text, text, integer, integer) TO authenticated;

-- ---------- 3. Booking notes ----------
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS customer_notes text;
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_notes_length;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_notes_length
  CHECK (customer_notes IS NULL OR length(customer_notes) <= 500);

-- Same as 0002, with customer_notes added to the locked fields.
CREATE OR REPLACE FUNCTION public.booking_requests_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.workshop_id, NEW.customer_id, NEW.vehicle_id, NEW.service_ids, NEW.price_snapshot,
      NEW.estimate_total, NEW.subtotal_cents, NEW.tax_cents, NEW.total_cents, NEW.tax_rate,
      NEW.preferred_date, NEW.preferred_time, NEW.idempotency_key, NEW.created_at,
      NEW.customer_notes)
     IS DISTINCT FROM
     (OLD.workshop_id, OLD.customer_id, OLD.vehicle_id, OLD.service_ids, OLD.price_snapshot,
      OLD.estimate_total, OLD.subtotal_cents, OLD.tax_cents, OLD.total_cents, OLD.tax_rate,
      OLD.preferred_date, OLD.preferred_time, OLD.idempotency_key, OLD.created_at,
      OLD.customer_notes) THEN
    RAISE EXCEPTION 'A submitted booking request cannot be changed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'requested' AND NEW.status IN ('confirmed', 'declined', 'cancelled'))
    OR (OLD.status = 'confirmed' AND NEW.status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'A booking request cannot go from % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'confirmed' AND OLD.status = 'requested' THEN
    NEW.confirmed_at := now();
  ELSIF NEW.status = 'confirmed' THEN
    NEW.confirmed_at := OLD.confirmed_at;
  ELSIF OLD.status <> 'confirmed' THEN
    NEW.confirmed_date := NULL;
    NEW.confirmed_time := NULL;
    NEW.confirmed_at := NULL;
  ELSE
    NEW.confirmed_date := OLD.confirmed_date;
    NEW.confirmed_time := OLD.confirmed_time;
    NEW.confirmed_at := OLD.confirmed_at;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.booking_requests_guard_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_booking_request(
  _workshop_id uuid,
  _customer_id uuid,
  _vehicle_id uuid,
  _service_ids uuid[],
  _shown_total_cents integer,
  _preferred_date date,
  _preferred_time text,
  _idempotency_key uuid,
  _notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _idempotency_key IS NULL THEN RAISE EXCEPTION 'An idempotency key is required'; END IF;

  SELECT id INTO _id FROM public.booking_requests
  WHERE customer_id = _customer_id AND idempotency_key = _idempotency_key;
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  BEGIN
    INSERT INTO public.booking_requests
      (workshop_id, customer_id, vehicle_id, service_ids, estimate_total,
       preferred_date, preferred_time, status, idempotency_key, customer_notes)
    VALUES
      (_workshop_id, _customer_id, _vehicle_id, to_jsonb(_service_ids), _shown_total_cents / 100.0,
       _preferred_date, _preferred_time, 'requested', _idempotency_key,
       nullif(left(trim(coalesce(_notes, '')), 500), ''))
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO _id FROM public.booking_requests
    WHERE customer_id = _customer_id AND idempotency_key = _idempotency_key;
  END;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_booking_request(uuid, uuid, uuid, uuid[], integer, date, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_booking_request(uuid, uuid, uuid, uuid[], integer, date, text, uuid, text)
  TO authenticated;

COMMIT;
