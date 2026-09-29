-- 0008: WhatsApp sign-in codes.
--
-- The app's server makes a 6-digit code, stores only its hash here, and has
-- n8n deliver it on WhatsApp. Codes expire after 5 minutes, allow 5 tries,
-- and a number can ask for at most 3 codes per 10 minutes.
--
-- Only the server (service role) touches this table: RLS is on with no
-- policies, and customers' roles have no grants on it.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text NOT NULL CHECK (phone ~ '^65[89][0-9]{7}$'),
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_phone_created_idx ON public.otp_codes (phone, created_at DESC);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otp_codes FROM PUBLIC, anon, authenticated;

COMMIT;
