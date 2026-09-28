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

export async function signOut() {
  await supabase.auth.signOut();
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
