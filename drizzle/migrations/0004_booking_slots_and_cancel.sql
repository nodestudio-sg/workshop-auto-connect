-- ============================================================================
-- 0004 — Bookable times that never run out, slot capacity, customer cancel
--
-- Run 0002 and 0003 first. Safe to run more than once. One transaction.
-- The app works with or without this migration (it falls back to the
-- workshop_slots rows as before).
--
-- 1. Each workshop has opening days, slot times, a capacity per slot, how far
--    ahead customers can book, and a minimum notice. Defaults match the demo:
--    Mon–Sat, 09:00 10:30 13:00 14:30 16:00, 2 cars per slot, 30 days, 12 h.
--    workshop_slots rows with available = false still block a time.
-- 2. available_slots(): the bookable times for the next booking window.
-- 3. Every new booking request must be for an open time with space left.
--    A lock per slot stops two customers taking the last place at once.
-- 4. cancel_booking_request(): a customer cancels their own upcoming request
--    or confirmed booking.
-- ============================================================================

BEGIN;

-- ---------- 1. Opening hours ----------
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS open_days integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}';
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS slot_times text[] NOT NULL DEFAULT '{09:00,10:30,13:00,14:30,16:00}';
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS slot_capacity integer NOT NULL DEFAULT 2;
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS booking_window_days integer NOT NULL DEFAULT 30;
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS min_notice_hours integer NOT NULL DEFAULT 12;

ALTER TABLE public.workshops DROP CONSTRAINT IF EXISTS workshops_booking_rules_check;
ALTER TABLE public.workshops ADD CONSTRAINT workshops_booking_rules_check CHECK (
  open_days <@ '{1,2,3,4,5,6,7}'::integer[]
  AND slot_capacity BETWEEN 1 AND 50
  AND booking_window_days BETWEEN 1 AND 180
  AND min_notice_hours BETWEEN 0 AND 168
);

-- ---------- 2. Slot state and available slots ----------
-- 'open', or why not: 'closed' (not an opening slot), 'too_soon', 'too_far',
-- 'blocked' (the workshop blocked it), 'full'.
CREATE OR REPLACE FUNCTION public.booking_slot_state(_workshop_id uuid, _date date, _time text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w record;
  _now timestamp := now() AT TIME ZONE 'Asia/Singapore';
  _taken integer;
BEGIN
  SELECT open_days, slot_times, slot_capacity, booking_window_days, min_notice_hours
    INTO w FROM public.workshops WHERE id = _workshop_id;
  IF NOT FOUND OR _date IS NULL OR _time IS NULL THEN RETURN 'closed'; END IF;
  IF NOT (extract(isodow FROM _date)::int = ANY (w.open_days)) OR NOT (_time = ANY (w.slot_times)) THEN
    RETURN 'closed';
  END IF;
  IF _date + _time::time < _now + make_interval(hours => w.min_notice_hours) THEN RETURN 'too_soon'; END IF;
  IF _date > _now::date + w.booking_window_days THEN RETURN 'too_far'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.workshop_slots s
    WHERE s.workshop_id = _workshop_id AND s.slot_date = _date AND s.slot_time = _time AND NOT s.available
  ) THEN
    RETURN 'blocked';
  END IF;

  -- A confirmed booking holds its confirmed time; a request holds its preferred time.
  SELECT count(*) INTO _taken FROM public.booking_requests b
  WHERE b.workshop_id = _workshop_id
    AND b.status IN ('requested', 'confirmed')
    AND CASE WHEN b.status = 'confirmed' AND b.confirmed_date IS NOT NULL
             THEN (b.confirmed_date, b.confirmed_time) ELSE (b.preferred_date, b.preferred_time) END
        = (_date, _time);
  IF _taken >= w.slot_capacity THEN RETURN 'full'; END IF;

  RETURN 'open';
END;
$$;
REVOKE ALL ON FUNCTION public.booking_slot_state(uuid, date, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.available_slots(_workshop_id uuid)
RETURNS TABLE (slot_date date, slot_time text, available boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w record;
  _today date := (now() AT TIME ZONE 'Asia/Singapore')::date;
  _day date;
  _t text;
  _state text;
BEGIN
  SELECT open_days, slot_times, booking_window_days INTO w FROM public.workshops WHERE id = _workshop_id;
  IF NOT FOUND THEN RETURN; END IF;
  FOR _day IN SELECT generate_series(_today, _today + w.booking_window_days, interval '1 day')::date LOOP
    CONTINUE WHEN NOT (extract(isodow FROM _day)::int = ANY (w.open_days));
    FOREACH _t IN ARRAY (SELECT array_agg(x ORDER BY x) FROM unnest(w.slot_times) x) LOOP
      _state := public.booking_slot_state(_workshop_id, _day, _t);
      CONTINUE WHEN _state IN ('too_soon', 'too_far', 'closed');
      slot_date := _day;
      slot_time := _t;
      available := _state = 'open';
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.available_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.available_slots(uuid) TO anon, authenticated;

-- ---------- 3. Snapshot trigger, now also checking the slot ----------
-- Same as 0002, plus the slot check under a per-slot lock.
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

  -- Serialise bookings for the same slot so capacity can't be overshot.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.workshop_id::text || '|' || NEW.preferred_date::text || '|' || NEW.preferred_time, 0)
  );
  IF public.booking_slot_state(NEW.workshop_id, NEW.preferred_date, NEW.preferred_time) <> 'open' THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  SELECT coalesce(array_agg(DISTINCT value::uuid), '{}')
    INTO _ids
  FROM jsonb_array_elements_text(coalesce(NEW.service_ids, '[]'::jsonb));

  IF cardinality(_ids) = 0 THEN
    RAISE EXCEPTION 'A booking request needs at least one service';
  END IF;

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

  IF NEW.estimate_total IS NULL OR round(NEW.estimate_total * 100)::int <> _total THEN
    RAISE EXCEPTION 'PRICES_CHANGED';
  END IF;

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
REVOKE ALL ON FUNCTION public.booking_requests_snapshot() FROM PUBLIC, anon, authenticated;

-- ---------- 4. Customer cancels ----------
CREATE OR REPLACE FUNCTION public.cancel_booking_request(_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT r.* INTO b FROM public.booking_requests r
  JOIN public.customers c ON c.id = r.customer_id
  WHERE r.id = _booking_id AND c.user_id = auth.uid()
  FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;

  IF b.status = 'cancelled' THEN RETURN; END IF;
  IF b.status NOT IN ('requested', 'confirmed')
     OR coalesce(b.confirmed_date, b.preferred_date) < (now() AT TIME ZONE 'Asia/Singapore')::date THEN
    RAISE EXCEPTION 'CANNOT_CANCEL';
  END IF;

  UPDATE public.booking_requests SET status = 'cancelled' WHERE id = _booking_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_booking_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_request(uuid) TO authenticated;

COMMIT;
