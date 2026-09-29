import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, Printer, Smartphone, Wrench } from "lucide-react";
import { adminGetWorkshop } from "@/lib/admin.functions";
import { qrSvg } from "@/lib/qr";
import { WorkshopMark } from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/poster/$workshopId")({ component: Poster });

/** An A4 counter poster: the workshop's QR code and why to scan it. */
function Poster() {
  const { workshopId } = Route.useParams();
  const q = useQuery({
    queryKey: ["admin", "workshop", workshopId],
    queryFn: async () => {
      const r = await adminGetWorkshop({ data: { id: workshopId } });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const w = q.data?.workshop;
  const url = w ? `${window.location.origin}/${w.slug}` : "";
  const svg = useMemo(() => (url ? qrSvg(url, { margin: 1 }) : ""), [url]);
  if (!w) return null;
  const c = w.brand_color;

  return (
    <div className="poster-wrap">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print { .no-print { display:none !important } body { background:#fff !important } header { display:none !important } main { padding:0 !important; max-width:none !important } }
        .poster { width:210mm; min-height:297mm; margin:0 auto; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      `}</style>
      <div className="no-print mb-4 flex justify-center">
        <button
          onClick={() => window.print()}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" />
          Print poster
        </button>
      </div>
      <div className="poster flex flex-col overflow-hidden rounded-[6mm] shadow-xl print:rounded-none print:shadow-none">
        <div
          className="px-[16mm] pb-[22mm] pt-[16mm] text-white"
          style={{
            background: `linear-gradient(160deg, ${c}, color-mix(in oklab, ${c} 55%, black))`,
          }}
        >
          <div className="flex items-center gap-4">
            <WorkshopMark name={w.name} color="rgba(255,255,255,.2)" logo={w.logo_url} size={64} />
            <div className="text-[22pt] font-bold tracking-tight">{w.name}</div>
          </div>
          <div className="mt-[12mm] text-[36pt] font-black leading-[1.02] tracking-tight">
            Book your next
            <br />
            service in seconds.
          </div>
          <div className="mt-[5mm] text-[14pt] opacity-90">
            Scan to open our app. No download needed.
          </div>
        </div>
        <div className="-mt-[12mm] flex flex-1 flex-col items-center px-[16mm]">
          <div className="rounded-[6mm] bg-white p-[5mm] shadow-[0_10px_40px_-10px_rgba(0,0,0,.35)]">
            <div className="h-[90mm] w-[90mm]" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
          <div className="mt-[5mm] font-mono text-[13pt] font-semibold" style={{ color: c }}>
            {url.replace(/^https?:\/\//, "")}
          </div>
          <div className="mt-[10mm] grid w-full grid-cols-3 gap-[5mm] text-center">
            {[
              [CalendarCheck, "Book 24/7", "Real prices and open times"],
              [Wrench, "Track your car", "Live updates while it's with us"],
              [Smartphone, "Reminders", "Know when your next service is due"],
            ].map(([Icon, t, s]) => {
              const I = Icon as typeof CalendarCheck;
              return (
                <div key={t as string} className="rounded-[4mm] bg-slate-50 p-[4mm]">
                  <I className="mx-auto h-8 w-8" style={{ color: c }} />
                  <div className="mt-2 text-[13pt] font-bold">{t as string}</div>
                  <div className="text-[10pt] text-slate-500">{s as string}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-auto py-[8mm] text-center text-[10pt] text-slate-500">
            Sign in with your mobile number: we'll WhatsApp you a code.
            <br />
            {w.address} · {w.phone}
          </div>
        </div>
      </div>
    </div>
  );
}
