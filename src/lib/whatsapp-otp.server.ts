/**
 * WhatsApp sign-in codes, sent through the workshop's own n8n + Meta setup.
 *
 * The app makes the code, stores only a hash of it (migration 0008), and
 * POSTs the code to OTP_WEBHOOK_URL; n8n delivers it with the WhatsApp
 * template. Once the code checks out, the customer is signed in as an account
 * whose phone number is marked verified, which is what link_customer trusts.
 *
 * Needs two secrets in Lovable Cloud: OTP_WEBHOOK_URL and OTP_WEBHOOK_SECRET.
 * Server-only: never import this from route files or *.functions.ts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CODE_TTL_MINUTES = 5;
const MAX_SENDS_PER_10_MIN = 3;
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_ATTEMPTS = 5;

/** Error codes the sign-in screen turns into friendly messages. */
export type OtpErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_MOBILE"
  | "UNKNOWN_WORKSHOP"
  | "TOO_MANY_REQUESTS"
  | "SEND_FAILED"
  | "CODE_EXPIRED"
  | "WRONG_CODE"
  | "TOO_MANY_ATTEMPTS"
  | "SIGN_IN_FAILED";

export class OtpError extends Error {
  constructor(public code: OtpErrorCode) {
    super(code);
  }
}

function config() {
  const url = process.env["OTP_WEBHOOK_URL"];
  const secret = process.env["OTP_WEBHOOK_SECRET"];
  if (!url || !secret) throw new OtpError("NOT_CONFIGURED");
  return { url, secret };
}

/** "9123 4567" → "6591234567" (the form WhatsApp and auth.users use). */
function toPhone(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (!/^[89]\d{7}$/.test(digits)) throw new OtpError("INVALID_MOBILE");
  return `65${digits}`;
}

async function hashCode(phone: string, code: string, secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${phone}:${code}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String((n[0] ?? 0) % 1_000_000).padStart(6, "0");
}

// otp_codes isn't in the generated types until the migration has run.
const otpTable = () => (supabaseAdmin as unknown as SupabaseClient).from("otp_codes");

export async function sendCode(slug: string, mobile: string): Promise<void> {
  const { url, secret } = config();
  const phone = toPhone(mobile);

  const { data: workshop } = await supabaseAdmin
    .from("workshops")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  if (!workshop) throw new OtpError("UNKNOWN_WORKSHOP");

  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const recent = await otpTable()
    .select("created_at")
    .eq("phone", phone)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (recent.error) throw new OtpError("NOT_CONFIGURED"); // migration 0008 not run yet
  const rows = (recent.data ?? []) as { created_at: string }[];
  if (rows.length >= MAX_SENDS_PER_10_MIN) throw new OtpError("TOO_MANY_REQUESTS");
  if (rows[0] && Date.now() - Date.parse(rows[0].created_at) < RESEND_COOLDOWN_SECONDS * 1000) {
    throw new OtpError("TOO_MANY_REQUESTS");
  }

  const code = randomCode();
  const inserted = await otpTable()
    .insert({
      phone,
      code_hash: await hashCode(phone, code, secret),
      expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (inserted.error) throw new OtpError("NOT_CONFIGURED");

  let ok = false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nodestudio-secret": secret },
      body: JSON.stringify({
        phone,
        code,
        workshop: workshop.name,
        expires_in_minutes: CODE_TTL_MINUTES,
      }),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  if (!ok) {
    await otpTable().update({ consumed_at: new Date().toISOString() }).eq("id", inserted.data.id);
    throw new OtpError("SEND_FAILED");
  }
}

/** Checks the code and returns a session for the phone-verified account. */
export async function verifyCode(
  mobile: string,
  code: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const { secret } = config();
  const phone = toPhone(mobile);

  const found = await otpTable()
    .select("id, code_hash, attempts, expires_at")
    .eq("phone", phone)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (found.error) throw new OtpError("NOT_CONFIGURED");
  const row = found.data as {
    id: string;
    code_hash: string;
    attempts: number;
    expires_at: string;
  } | null;
  if (!row || Date.parse(row.expires_at) < Date.now()) throw new OtpError("CODE_EXPIRED");
  if (row.attempts >= MAX_ATTEMPTS) throw new OtpError("TOO_MANY_ATTEMPTS");

  const matches = (await hashCode(phone, code.replace(/\D/g, ""), secret)) === row.code_hash;
  if (!matches) {
    await otpTable()
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    throw new OtpError(row.attempts + 1 >= MAX_ATTEMPTS ? "TOO_MANY_ATTEMPTS" : "WRONG_CODE");
  }
  await otpTable().update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

  const email = await accountEmailForPhone(phone);
  const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) throw new OtpError("SIGN_IN_FAILED");

  // Exchange the one-time link for a session, as the customer would by clicking it.
  const anon = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const verified = await anon.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  const session = verified.data?.session;
  if (verified.error || !session) throw new OtpError("SIGN_IN_FAILED");
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}

/** Placeholder address for accounts that only have a phone number. */
export function phoneAccountEmail(phone: string): string {
  return `wa.${phone}@phone.workshopapp.sg`;
}

/**
 * Finds the account for this phone number, or creates it, with the phone
 * marked verified. Returns an email address a sign-in link can be made for.
 */
async function accountEmailForPhone(phone: string): Promise<string> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new OtpError("SIGN_IN_FAILED");
    const user = data.users.find((u) => (u.phone ?? "").replace(/\D/g, "") === phone);
    if (user) {
      const email = user.email || phoneAccountEmail(phone);
      if (!user.email || !user.phone_confirmed_at) {
        const upd = await supabaseAdmin.auth.admin.updateUserById(user.id, {
          ...(user.email ? {} : { email, email_confirm: true }),
          phone_confirm: true,
        });
        if (upd.error) throw new OtpError("SIGN_IN_FAILED");
      }
      return email;
    }
    if (data.users.length < 1000) break;
  }
  const email = phoneAccountEmail(phone);
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    phone,
    email_confirm: true,
    phone_confirm: true,
  });
  if (created.error) throw new OtpError("SIGN_IN_FAILED");
  return email;
}
