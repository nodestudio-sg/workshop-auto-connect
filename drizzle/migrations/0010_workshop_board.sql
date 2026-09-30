-- 0010: Workshop board (/admin jobs tab).
--
-- Owners now run car tracking from the admin console until the Node Studio
-- workshop system is connected:
-- 1. jobs.booking_id links a job to the booking it was checked in from, so
--    the same booking isn't checked in twice.
-- 2. jobs.customer_notified_at records the last WhatsApp update sent.
-- 3. A public storage bucket for inspection photos (random file names; the
--    customer app shows them from the job's extra_work.photos).
--
-- Only the app's server writes these. Safe to run more than once.

BEGIN;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS booking_id uuid
  REFERENCES public.booking_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS jobs_booking_idx ON public.jobs (booking_id);
CREATE INDEX IF NOT EXISTS jobs_workshop_active_idx ON public.jobs (workshop_id, is_active);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS customer_notified_at timestamptz;

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

COMMIT;
