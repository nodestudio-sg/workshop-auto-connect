import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Workshop customer app" },
      {
        name: "description",
        content:
          "Open the link your car workshop sent you to book servicing and follow your car's progress.",
      },
      { property: "og:title", content: "Workshop customer app" },
      {
        property: "og:description",
        content: "Open the link your car workshop sent you to view your car and book servicing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-5 py-10">
      <div className="app-card w-full max-w-[420px] px-6 py-8 text-center">
        <h1 className="text-lg font-semibold">Please open your workshop's own link</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This app is used through the link your car workshop gave you, for example
          <span className="text-foreground"> /sgcarservices</span>. Open that link on your phone to
          see your car and book a service.
        </p>
      </div>
    </main>
  );
}
