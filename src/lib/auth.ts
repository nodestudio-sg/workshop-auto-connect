import { supabase } from "@/integrations/supabase/client";
import { demoSignIn } from "@/lib/demo-mode";

/** The 8-digit Singapore mobile, digits only. */
export function cleanMobile(mobile: string): string {
  return mobile.replace(/\D/g, "");
}

/** E.164 form, as the SMS provider expects it. */
function e164(mobile: string): string {
  return `+65${cleanMobile(mobile)}`;
}

/**
 * Step 1 of sign-in: text a one-time code to the number.
 * In demo mode nothing is sent.
 */
export async function requestCode(mobile: string, demo: boolean): Promise<void> {
  if (demo) return;
  const { error } = await supabase.auth.signInWithOtp({ phone: e164(mobile) });
  if (error) throw error;
}

/**
 * Step 2 of sign-in: check the code, then link the signed-in account to this
 * workshop's customer record. The database only links the number the account
 * has proven (see link_customer).
 */
export async function verifyCode(
  slug: string,
  mobile: string,
  code: string,
  demo: boolean,
): Promise<void> {
  if (demo) {
    await demoSignIn(slug, cleanMobile(mobile));
  } else {
    const { error } = await supabase.auth.verifyOtp({
      phone: e164(mobile),
      token: code,
      type: "sms",
    });
    if (error) throw error;
  }

  const { error } = await supabase.rpc("link_customer", {
    _slug: slug,
    _mobile: cleanMobile(mobile),
  });
  if (error) {
    // Don't leave a session with no customer behind: it would bounce between
    // the sign-in screen and the car screen.
    await supabase.auth.signOut();
    throw error;
  }
}

/** Signed in, but this account has no customer record at this workshop. */
export class NotACustomerError extends Error {
  constructor() {
    super("NOT_A_CUSTOMER");
  }
}

/**
 * Email + password sign-in, for customers who added a password in Account
 * after first signing in with their mobile. The account is linked to this
 * workshop's customer record only through its SMS-verified phone number, so a
 * new email address can never claim a customer.
 */
export async function signInWithEmail(slug: string, email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;

  const linked = await supabase
    .from("customers")
    .select("id, workshops!inner(slug)")
    .eq("workshops.slug", slug)
    .maybeSingle();
  if (linked.data) return;

  const phone = (data.user?.phone ?? "").replace(/\D/g, "");
  if (/^65\d{8}$/.test(phone)) {
    const { error: linkError } = await supabase.rpc("link_customer", {
      _slug: slug,
      _mobile: phone.slice(2),
    });
    if (!linkError) return;
  }

  await supabase.auth.signOut();
  throw new NotACustomerError();
}

/** Demo accounts use made-up emails; changing them would break the demo sign-in. */
export function isDemoAccountEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith("@customer.workshopapp.sg"));
}

/**
 * Adds (or changes) the email and password on the signed-in account.
 * Returns true when the new email still needs confirming from the inbox.
 */
export async function setEmailAndPassword(email: string, password: string): Promise<boolean> {
  const { data: current } = await supabase.auth.getUser();
  const newEmail = email.trim();
  const { data, error } = await supabase.auth.updateUser(
    current.user?.email === newEmail ? { password } : { email: newEmail, password },
  );
  if (error) throw error;
  return Boolean(data.user?.new_email);
}

export async function requestPasswordReset(slug: string, email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/${slug}/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
