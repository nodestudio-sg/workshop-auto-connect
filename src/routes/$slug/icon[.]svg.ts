import { createFileRoute } from "@tanstack/react-router";
import { fetchWorkshopBranding, initials } from "@/lib/workshop-public.server";

/**
 * A home-screen icon for workshops without a logo: their initials on their
 * brand colour. Never another workshop's logo.
 */
export const Route = createFileRoute("/$slug/icon.svg")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const workshop = await fetchWorkshopBranding(params.slug);
        if (!workshop) return new Response("Not found", { status: 404 });

        const colour = /^#[0-9a-f]{3,8}$/i.test(workshop.brand_color)
          ? workshop.brand_color
          : "#1b8ed4";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${colour}"/>
  <text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="Georgia, serif" font-size="200" font-weight="700" fill="#ffffff">${initials(workshop.name)}</text>
</svg>`;

        return new Response(svg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
