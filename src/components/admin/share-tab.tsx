import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, Download, ExternalLink, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { qrSvg } from "@/lib/qr";
import type { AdminWorkshop } from "@/lib/admin.server";
import { GhostButton, Panel } from "@/components/admin/admin-ui";

export function appUrl(slug: string) {
  return `${typeof window === "undefined" ? "" : window.location.origin}/${slug}`;
}

export function ShareTab({ workshop }: { workshop: AdminWorkshop }) {
  const url = appUrl(workshop.slug);
  const svg = useMemo(() => qrSvg(url), [url]);
  const message = `Hi! You can now book your servicing with ${workshop.name} online, 24/7 — see real prices and open times, track your car and get reminders.\n\nTap to open our app: ${url}\n\nSign in with your mobile number (we'll WhatsApp you a code), then add it to your home screen.`;
  const copy = (text: string, what: string) =>
    void navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`));
  function downloadQr() {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${workshop.slug}-qr.svg`;
    a.click();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <h2 className="text-lg font-bold">Your customers' app</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customers open this link, sign in with a WhatsApp code and can book straight away. No App
          Store needed.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-muted/60 p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-sm">{url}</span>
          <GhostButton onClick={() => copy(url, "Link")}>
            <Copy className="h-4 w-4" />
            Copy
          </GhostButton>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[40px] items-center rounded-full border border-border bg-card px-3"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div
            className="w-44 shrink-0 rounded-2xl border border-border bg-white p-2"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Scanning this opens the app. Put it on the counter, the waiting area and invoices.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/admin/poster/$workshopId"
                params={{ workshopId: workshop.id }}
                target="_blank"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white hover:brightness-110"
              >
                <Printer className="h-4 w-4" />
                Print the counter poster
              </Link>
              <GhostButton onClick={downloadQr}>
                <Download className="h-4 w-4" />
                Download QR
              </GhostButton>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-lg font-bold">Invite your customers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send this on WhatsApp, as a broadcast or when you confirm their next visit.
        </p>
        <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-muted/60 p-4 font-sans text-sm leading-relaxed">
          {message}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#25d366] px-5 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" />
            Share on WhatsApp
          </a>
          <GhostButton onClick={() => copy(message, "Message")}>
            <Copy className="h-4 w-4" />
            Copy message
          </GhostButton>
        </div>
        <div className="mt-5 rounded-2xl border border-dashed border-border p-4 text-sm">
          <b>Onboarding tips</b>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Ask customers to scan the poster while they wait: they're signed up before they
              collect the car.
            </li>
            <li>
              Add each customer's car when they first sign in, so reminders and history start from
              day one.
            </li>
            <li>Remind them to "Add to Home Screen" so your logo sits on their phone.</li>
          </ul>
        </div>
      </Panel>
    </div>
  );
}
