import { supabase } from "@/integrations/supabase/client";

/**
 * Demo sign-in: any 6-digit code is accepted. The mobile number plus workshop
 * slug map to a stable backend account so the session and the customer's data
 * persist between visits.
 */
function credentialsFor(slug: string, mobile: string) {
  const clean = mobile.replace(/\D/g, "");
  return {
    email: `${slug}.${clean}@customer.workshopapp.sg`,
    password: `demo-${slug}-${clean}-6f2a`,
  };
}

export async function signInWithCode(slug: string, mobile: string) {
  const { email, password } = credentialsFor(slug, mobile);

  let result = await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    const signUp = await supabase.auth.signUp({ email, password });
    if (signUp.error) throw signUp.error;
    result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
  }

  const { error } = await supabase.rpc("link_customer", {
    _slug: slug,
    _mobile: mobile.replace(/\D/g, ""),
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
