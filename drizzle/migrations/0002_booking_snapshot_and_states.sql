-- ============================================================================
-- 0002 — Booking price snapshot and booking states
--
-- Safe to run more than once. Runs in one transaction. The app works with or
-- without this migration applied, in either order with the code change.
--
-- 1. New columns: the snapshot in integer cents (subtotal, tax, total), the
--    workshop's tax rate at submission, an idempotency key, and the workshop's
--    confirmed date/time.
-- 2. Status is one of requested / confirmed / declined / cancelled, and a
--    confirmed booking must carry the confirmed date and time.
-- 3. On insert, the database rebuilds the line items and totals from the real
--    service prices, whatever the caller sent. If they differ from the total
--    the customer was shown, the insert is refused with PRICES_CHANGED, so what
--    is stored is always exactly what was shown. New bookings start 'requested'.
-- 4. On update, the snapshot can never change, and status can only move
--    requested → confirmed / declined / cancelled, or confirmed → cancelled.
-- 5. submit_booking_request(): the app's way in. A retry with the same
--    idempotency key returns the original request instead of a duplicate.
--
-- Money: service prices are GST-inclusive. tax_cents is the GST contained in
-- the total, rounded to the cent, and subtotal_cents = total_cents - tax_cents,
-- so subtotal + tax = total always holds.
-- ============================================================================

BEGIN;

-- ---------- 1. Columns ----------
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS subtotal_cents integer;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS tax_cents integer;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS total_cents integer;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS tax_rate numeric;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS idempotency_key uuid;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS confirmed_date date;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS confirmed_time text;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- ---------- 2. States ----------
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_status_check;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_status_check
  CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled'));

ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_confirmed_has_time;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_confirmed_has_time
  CHECK (status <> 'confirmed' OR (confirmed_date IS NOT NULL AND confirmed_time IS NOT NULL));

ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_money_adds_up;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_money_adds_up
  CHECK (total_cents IS NULL OR subtotal_cents + tax_cents = total_cents);

ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_idempotency_key;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_idempotency_key
  UNIQUE (customer_id, idempotency_key);

-- ---------- 3. Snapshot on insert ----------
CREATE OR REPLACE FUNCTION public.booking_requests_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ids uuid[];
  _found int;
  _rate numeric;
  _snapshot jsonb;
  _total int;
  _tax int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'requested' THEN
    RAISE EXCEPTION 'A new booking request must start as requested';
  END IF;

  SELECT coalesce(array_agg(DISTINCT value::uuid), '{}')
    INTO _ids
  FROM jsonb_array_elements_text(coalesce(NEW.service_ids, '[]'::jsonb));

  IF cardinality(_ids) = 0 THEN
    RAISE EXCEPTION 'A booking request needs at least one service';
  END IF;

  -- Line items exactly as the services are priced right now, in cents.
  -- "price" (dollars) is kept alongside for older app code that reads it.
  SELECT count(*),
         jsonb_agg(jsonb_build_object(
           'service_id', s.id,
           'name', s.name,
           'price', s.price,
           'price_cents', round(s.price * 100)::int,
           'quote_after_inspection', s.quote_after_inspection,
           'components', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
               'label', c->>'label',
               'amount', (c->>'amount')::numeric,
               'amount_cents', round((c->>'amount')::numeric * 100)::int
             ) ORDER BY ord), '[]'::jsonb)
             FROM jsonb_array_elements(s.components) WITH ORDINALITY AS t(c, ord)
           )
         ) ORDER BY s.sort_order, s.name),
         coalesce(sum(round(s.price * 100)), 0)::int
    INTO _found, _snapshot, _total
  FROM public.services s
  WHERE s.workshop_id = NEW.workshop_id AND s.id = ANY (_ids);

  IF _found <> cardinality(_ids) THEN
    RAISE EXCEPTION 'A requested service does not belong to this workshop';
  END IF;

  -- The customer's shown total arrives in estimate_total (dollars).
  IF NEW.estimate_total IS NULL OR round(NEW.estimate_total * 100)::int <> _total THEN
    RAISE EXCEPTION 'PRICES_CHANGED';
  END IF;

  -- Tax rate straight from the workshop record. No fallback.
  SELECT tax_rate INTO _rate FROM public.workshops WHERE id = NEW.workshop_id;
  IF _rate IS NULL THEN RAISE EXCEPTION 'Workshop has no tax rate'; END IF;
  _tax := round(_total * _rate / (1 + _rate))::int;

  NEW.service_ids    := to_jsonb(_ids);
  NEW.price_snapshot := _snapshot;
  NEW.total_cents    := _total;
  NEW.tax_cents      := _tax;
  NEW.subtotal_cents := _total - _tax;
  NEW.tax_rate       := _rate;
  NEW.estimate_total := _total / 100.0;
  NEW.confirmed_date := NULL;
  NEW.confirmed_time := NULL;
  NEW.confirmed_at   := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_requests_snapshot ON public.booking_requests;
CREATE TRIGGER booking_requests_snapshot
  BEFORE INSERT ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.booking_requests_snapshot();

-- ---------- 4. Immutable snapshot, allowed transitions ----------
CREATE OR REPLACE FUNCTION public.booking_requests_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.workshop_id, NEW.customer_id, NEW.vehicle_id, NEW.service_ids, NEW.price_snapshot,
      NEW.estimate_total, NEW.subtotal_cents, NEW.tax_cents, NEW.total_cents, NEW.tax_rate,
      NEW.preferred_date, NEW.preferred_time, NEW.idempotency_key, NEW.created_at)
     IS DISTINCT FROM
     (OLD.workshop_id, OLD.customer_id, OLD.vehicle_id, OLD.service_ids, OLD.price_snapshot,
      OLD.estimate_total, OLD.subtotal_cents, OLD.tax_cents, OLD.total_cents, OLD.tax_rate,
      OLD.preferred_date, OLD.preferred_time, OLD.idempotency_key, OLD.created_at) THEN
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
    -- Still confirmed: the workshop may move the confirmed time.
    NEW.confirmed_at := OLD.confirmed_at;
  ELSIF OLD.status <> 'confirmed' THEN
    -- Never confirmed: no confirmed time can be set.
    NEW.confirmed_date := NULL;
    NEW.confirmed_time := NULL;
    NEW.confirmed_at := NULL;
  ELSE
    -- Confirmed then cancelled: keep the record of what was confirmed.
    NEW.confirmed_date := OLD.confirmed_date;
    NEW.confirmed_time := OLD.confirmed_time;
    NEW.confirmed_at := OLD.confirmed_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_requests_guard_update ON public.booking_requests;
CREATE TRIGGER booking_requests_guard_update
  BEFORE UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.booking_requests_guard_update();

-- ---------- 5. submit_booking_request ----------
-- Runs as the caller, so the insert policy from 0001 and the snapshot trigger
-- both apply.
CREATE OR REPLACE FUNCTION public.submit_booking_request(
  _workshop_id uuid,
  _customer_id uuid,
  _vehicle_id uuid,
  _service_ids uuid[],
  _shown_total_cents integer,
  _preferred_date date,
  _preferred_time text,
  _idempotency_key uuid
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
       preferred_date, preferred_time, status, idempotency_key)
    VALUES
      (_workshop_id, _customer_id, _vehicle_id, to_jsonb(_service_ids), _shown_total_cents / 100.0,
       _preferred_date, _preferred_time, 'requested', _idempotency_key)
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    -- The same submission raced in twice; return the one that won.
    SELECT id INTO _id FROM public.booking_requests
    WHERE customer_id = _customer_id AND idempotency_key = _idempotency_key;
  END;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_booking_request(uuid, uuid, uuid, uuid[], integer, date, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_booking_request(uuid, uuid, uuid, uuid[], integer, date, text, uuid)
  TO authenticated;

-- Trigger functions are never called directly.
REVOKE ALL ON FUNCTION public.booking_requests_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_requests_guard_update() FROM PUBLIC, anon, authenticated;

COMMIT;
