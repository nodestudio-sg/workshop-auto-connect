import { createFileRoute, Outlet, notFound, Link } from "@tanstack/react-router";
import { getWorkshopBySlug } from "@/lib/workshop.functions";

export const Route = createFileRoute("/$slug")({
  loader: async ({ params }) => {
    const workshop = await getWorkshopBySlug({ data: { slug: params.slug } });
    if (!workshop) throw notFound();
    return { workshop };
  },
  head: ({ loaderData, params }) => {
    const workshop = loaderData?.workshop;
    if (!workshop) {
      return { meta: [{ title: "Workshop not found" }, { name: "robots", content: "noindex" }] };
    }
    return {
      meta: [
        { title: workshop.name },
        {
          name: "description",
          content: `Book servicing and follow your car's progress at ${workshop.name}.`,
        },
        { name: "theme-color", content: workshop.brand_color },
        { name: "apple-mobile-web-app-title", content: workshop.name },
        { name: "application-name", content: workshop.name },
        { property: "og:title", content: workshop.name },
        {
          property: "og:description",
          content: `Book servicing and follow your car's progress at ${workshop.name}.`,
        },
        { name: "robots", content: "noindex" },
      ],
      links: [
        { rel: "manifest", href: `/${params.slug}/manifest.webmanifest` },
        // iOS needs a PNG for the home-screen icon; without a logo it uses a
        // snapshot of the page, which is better than another workshop's logo.
        ...(workshop.logo_url
          ? [
              { rel: "apple-touch-icon", href: workshop.logo_url },
              { rel: "icon", type: "image/png", href: workshop.logo_url },
            ]
          : [{ rel: "icon", type: "image/svg+xml", href: `/${params.slug}/icon.svg` }]),
      ],
    };
  },
  notFoundComponent: WorkshopNotFound,
  errorComponent: WorkshopError,
  component: WorkshopLayout,
});

function WorkshopLayout() {
  const { workshop } = Route.useLoaderData();

  return (
    <div
      className="min-h-[100dvh] bg-background"
      style={
        {
          "--brand": workshop.brand_color,
          "--brand-strong": `color-mix(in oklab, ${workshop.brand_color} 48%, black)`,
          // Re-derived here: variables built from --brand on :root resolve
          // with the default colour, not this workshop's.
          "--brand-soft": `color-mix(in oklab, ${workshop.brand_color} 7%, var(--card))`,
        } as React.CSSProperties
      }
    >
      <Outlet />
    </div>
  );
}

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
      <div className="app-card w-full max-w-[420px] p-6 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
        <Link
          to="/"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-md border border-border px-5 text-sm font-medium"
        >
          Go back
        </Link>
      </div>
    </main>
  );
}

function WorkshopNotFound() {
  return (
    <Shell
      title="We can't find that workshop"
      body="Please check the link your workshop sent you and open it again."
    />
  );
}

function WorkshopError() {
  return (
    <Shell
      title="This page didn't load"
      body="Something went wrong on our end. Please check your connection and try again."
    />
  );
}
