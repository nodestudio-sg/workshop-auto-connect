-- ============================================================================
-- 0005 — Customer profiles (sign-up), fleet-sized garages, app icon in the DB
--
-- Run 0003 first. Safe to run more than once. One transaction. The app works
-- with or without this migration (without it, the profile step is skipped).
--
-- 1. workshops.icon_url: the square home-screen icon, next to logo_url (the
--    logo shown in the app). SG Car Services gets the icon Lovable uploaded,
--    replacing the special case in code.
-- 2. customers.email and customers.company_name, and update_my_profile() so a
--    customer can set their own name, email and company — and nothing else.
-- 3. Fleet customers: up to 50 cars per customer instead of 5.
-- ============================================================================

BEGIN;

-- ---------- 1. App icon ----------
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS icon_url text;
UPDATE public.workshops
SET icon_url = '/__l5e/assets-v1/92116ba2-1cdc-42af-b1ec-cf0b867eb6ad/sg-car-services-icon.png'
WHERE slug = 'sgcarservices' AND icon_url IS NULL;

-- ---------- 2. Profiles ----------
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company_name text;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_profile_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_profile_check CHECK (
  length(name) BETWEEN 1 AND 80
  AND (email IS NULL OR (length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  AND (company_name IS NULL OR length(company_name) BETWEEN 1 AND 80)
);

-- The seeded demo customers get example emails so the demo doesn't stop at
-- the profile step.
UPDATE public.customers SET email = 'tan.weiming@example.com'
WHERE id = '33333333-3333-3333-3333-333333333333' AND email IS NULL;
UPDATE public.customers SET email = 'lim.jiahui@example.com'
WHERE id = '44444444-4444-4444-4444-444444444444' AND email IS NULL;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  _workshop_id uuid,
  _name text,
  _email text,
  _company text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
  _clean_name text := regexp_replace(trim(coalesce(_name, '')), '\s+', ' ', 'g');
  _clean_email text := lower(trim(coalesce(_email, '')));
  _clean_company text := nullif(regexp_replace(trim(coalesce(_company, '')), '\s+', ' ', 'g'), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO _cid FROM public.customers
  WHERE workshop_id = _workshop_id AND user_id = auth.uid();
  IF _cid IS NULL THEN RAISE EXCEPTION 'Not a customer of this workshop'; END IF;

  IF length(_clean_name) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF length(_clean_email) > 254 OR _clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;
  IF _clean_company IS NOT NULL AND length(_clean_company) > 80 THEN
    RAISE EXCEPTION 'INVALID_COMPANY';
  END IF;

  UPDATE public.customers
  SET name = _clean_name, email = _clean_email, company_name = _clean_company
  WHERE id = _cid;
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_profile(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(uuid, text, text, text) TO authenticated;

-- ---------- 3. Fleets: up to 50 cars ----------
-- Same as 0003, with the limit raised from 5 to 50.
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
    RAISE EXCEPTION 'PLATE_TAKEN';
  END IF;

  IF (SELECT count(*) FROM public.vehicles WHERE customer_id = _cid) >= 50 THEN
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

COMMIT;
