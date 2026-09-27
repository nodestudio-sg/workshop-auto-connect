import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/$slug/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
              const headers = new Headers(init?.headers);
              if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
                headers.delete("Authorization");
              }
              headers.set("apikey", key);
              return fetch(input, { ...init, headers });
            },
          },
        });

        const { data } = await supabase
          .from("workshops")
          .select("slug, name, brand_color, logo_url")
          .eq("slug", params.slug)
          .maybeSingle();

        if (!data) return new Response("Not found", { status: 404 });

        const icon = data.logo_url ?? "/brand/sgcarservices.png";
        const manifest = {
          id: `/${data.slug}/`,
          name: data.name,
          short_name: data.name,
          description: `Book servicing and follow your car's progress at ${data.name}.`,
          start_url: `/${data.slug}/`,
          scope: `/${data.slug}/`,
          display: "standalone",
          orientation: "portrait",
          theme_color: data.brand_color,
          background_color: "#f5f7fa",
          icons: [
            { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
            { src: icon, sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        };

        return new Response(JSON.stringify(manifest, null, 2), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
