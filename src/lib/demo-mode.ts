import { supabase } from "@/integrations/supabase/client";

/**
 * ============================================================================
 *  DEMO_MODE — FAKE SIGN-IN. KEEP THIS `false` FOR ANYTHING REAL CUSTOMERS USE.
 * ============================================================================
 *
 * When true, workshops flagged `demo_mode` in the database accept ANY 6-digit
 * code: whoever types a mobile number is signed in as that customer. No SMS is
 * sent and nothing is verified.
 *
 * The demo path needs BOTH locks open:
 *   1. this constant is `true`, and
 *   2. the workshop row has `demo_mode = true` (off by default for every new
 *      workshop; see drizzle/migrations/0001_harden_data_boundary.sql).
 *
 * Lock 2 is the one that actually protects customers: the database refuses to
 * link a demo account to a customer at a workshop that isn't flagged, whatever
 * this file says. Before a workshop goes live with real customers, set its
 * `demo_mode` to false in the database.
 */
export const DEMO_MODE = false;

/**
 * Whether the demo sign-in is active for this workshop. Anything unexpected —
 * the flag off, the column missing because a migration hasn't run, a network
 * error — answers false, so the real OTP path is the fallback.
 */
export async function isDemoSignInActive(workshopId: string): Promise<boolean> {
  if (!DEMO_MODE) return false;
  try {
    // `select("*")` rather than naming the column, so a database without the
    // `demo_mode` column still answers (false) instead of failing the query.
    const { data, error } = await supabase
      .from("workshops")
      .select("*")
      .eq("id", workshopId)
      .maybeSingle();
    if (error || !data) return false;
    return (data as Record<string, unknown>)["demo_mode"] === true;
  } catch {
    return false;
  }
}

/**
 * Demo accounts: the mobile number plus workshop slug map to a stable email and
 * password, so a demo customer's session and data persist between visits.
 * These credentials are guessable by design — which is why this only works on
 * workshops flagged `demo_mode` in the database.
 */
function demoCredentials(slug: string, mobile: string) {
  return {
    email: `${slug}.${mobile}@customer.workshopapp.sg`,
    password: `demo-${slug}-${mobile}-6f2a`,
  };
}

export async function demoSignIn(slug: string, mobile: string): Promise<void> {
  const { email, password } = demoCredentials(slug, mobile);

  let result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) {
    const signUp = await supabase.auth.signUp({ email, password });
    if (signUp.error) throw signUp.error;
    result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
  }
}
