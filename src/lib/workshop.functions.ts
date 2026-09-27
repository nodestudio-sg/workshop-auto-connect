import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicWorkshop = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  brand_color: string;
  address: string;
  phone: string;
  tax_rate: number;
};

function serverClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const getWorkshopBySlug = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => data)
  .handler(async ({ data }): Promise<PublicWorkshop | null> => {
    const supabase = serverClient();
    const { data: workshop } = await supabase
      .from("workshops")
      .select("id, slug, name, logo_url, brand_color, address, phone, tax_rate")
      .eq("slug", data.slug)
      .maybeSingle();

    return (workshop as PublicWorkshop | null) ?? null;
  });
