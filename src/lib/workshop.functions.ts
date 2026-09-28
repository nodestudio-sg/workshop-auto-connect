import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicWorkshop = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  /** Square home-screen icon (migration 0005); falls back to logo_url. */
  icon_url: string | null;
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
    // "*" rather than a column list, so a column a migration hasn't added yet
    // (icon_url) comes back missing instead of failing the whole page.
    const { data: workshop } = await supabase
      .from("workshops")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!workshop) return null;

    const row = workshop as Record<string, unknown>;
    return {
      id: String(row["id"]),
      slug: String(row["slug"]),
      name: String(row["name"]),
      logo_url: (row["logo_url"] as string | null) ?? null,
      icon_url: (row["icon_url"] as string | null | undefined) ?? null,
      brand_color: String(row["brand_color"]),
      address: String(row["address"]),
      phone: String(row["phone"]),
      tax_rate: Number(row["tax_rate"]),
    };
  });
