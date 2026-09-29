-- 0009: Admin console (/admin).
--
-- 1. platform_admins: emails allowed to run every workshop (the master
--    account). The first sign-in claims the account; the password is never
--    stored here.
-- 2. workshop_staff: owner accounts, each tied to one or more workshops.
-- 3. workshops.archived_at: archived workshops disappear from the customer
--    app but keep their history.
-- 4. booking_requests.workshop_message / workshop_notified_at /
--    customer_notified_at: the workshop's note to the customer, and when each
--    side was sent a WhatsApp alert.
-- 5. A public storage bucket for workshop logos.
--
-- Only the app's server (service role) reads or writes the new tables: RLS is
-- on with no policies, and customers' roles get no grants.
-- Safe to run more than once.

BEGIN;

-- 1. Master accounts
CREATE TABLE IF NOT EXISTS public.platform_admins (
  email      text PRIMARY KEY CHECK (email = lower(email)),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM PUBLIC, anon, authenticated;
INSERT INTO public.platform_admins (email) VALUES ('nodebooking@gmail.com') ON CONFLICT DO NOTHING;

-- 2. Workshop owners
CREATE TABLE IF NOT EXISTS public.workshop_staff (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workshop_id)
);
CREATE INDEX IF NOT EXISTS workshop_staff_workshop_idx ON public.workshop_staff (workshop_id);
ALTER TABLE public.workshop_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workshop_staff FROM PUBLIC, anon, authenticated;

-- 3. Archiving
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 4. Workshop replies and WhatsApp alerts on bookings
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS workshop_message text;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS workshop_notified_at timestamptz;
ALTER TABLE public.booking_requests ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz;
ALTER TABLE public.booking_requests DROP CONSTRAINT IF EXISTS booking_requests_workshop_message_check;
ALTER TABLE public.booking_requests ADD CONSTRAINT booking_requests_workshop_message_check
  CHECK (workshop_message IS NULL OR length(workshop_message) <= 500);

-- 5. Logo storage (public read; uploads go through the app's server)
INSERT INTO storage.buckets (id, name, public)
VALUES ('workshop-logos', 'workshop-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

COMMIT;
