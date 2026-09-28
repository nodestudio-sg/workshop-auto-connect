import { createFileRoute } from "@tanstack/react-router";
import { fetchWorkshopBranding, pngSize } from "@/lib/workshop-public.server";

/**
 * Per-workshop web app manifest: installing /sgcarservices gives an icon named
 * "SG Car Services" that opens /sgcarservices/. scope and start_url are both
 * /:slug/ — don't change them, installed home-screen apps depend on them.
 */
export const Route = createFileRoute("/$slug/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const data = await fetchWorkshopBranding(params.slug);
        if (!data) return new Response("Not found", { status: 404 });

        // The workshop's own logo at its real size; the generated initials
        // icon (scalable) as a fallback, and the only icon when there's no logo.
        const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];
        const appIcon = data.icon_url ?? data.logo_url;
        if (appIcon) {
          const size = await pngSize(new URL(appIcon, request.url).toString());
          if (size && size.width === size.height && size.width >= 144) {
            icons.push({
              src: appIcon,
              sizes: `${size.width}x${size.height}`,
              type: "image/png",
              purpose: "any",
            });
          }
        }
        icons.push({
          src: `/${data.slug}/icon.svg`,
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        });

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
          background_color: "#f4f1ea",
          icons,
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
