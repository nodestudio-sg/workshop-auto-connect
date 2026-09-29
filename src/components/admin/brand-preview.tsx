import { Calendar, Check, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { WorkshopMark } from "@/components/admin/admin-ui";

export const SWATCHES = [
  "#1297ea",
  "#1b8ed4",
  "#2563eb",
  "#0f766e",
  "#16a34a",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#c0392b",
  "#db2777",
  "#7c3aed",
  "#0f172a",
];

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => onChange(c)}
            style={{ background: c }}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full ring-offset-2 transition hover:scale-105",
              value.toLowerCase() === c && "ring-2 ring-foreground",
            )}
          >
            {value.toLowerCase() === c ? <Check className="h-4 w-4 text-white" /> : null}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#1297ea"}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 cursor-pointer rounded-xl border border-input bg-card p-1"
          aria-label="Custom colour"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          className="min-h-[44px] w-32 rounded-2xl border border-input bg-card px-3 font-mono text-sm uppercase outline-none focus:border-brand"
          aria-label="Hex colour"
        />
        <span className="text-xs text-muted-foreground">
          Any colour: tap a swatch or pick your own.
        </span>
      </div>
    </div>
  );
}

/** A small live mock of the customer app in the workshop's colours. */
export function AppPreview({
  name,
  color,
  logo,
}: {
  name: string;
  color: string;
  logo: string | null;
}) {
  const c = /^#[0-9a-f]{6}$/i.test(color) ? color : "#1297ea";
  return (
    <div className="mx-auto w-[240px] rounded-[34px] bg-[#0a0f1a] p-2 shadow-xl">
      <div className="overflow-hidden rounded-[27px] bg-[#f4f6fa]">
        <div
          className="px-4 pb-10 pt-6 text-white"
          style={{
            background: `linear-gradient(160deg, ${c}, color-mix(in oklab, ${c} 55%, black))`,
          }}
        >
          <div className="flex items-center gap-2.5">
            <WorkshopMark
              name={name || "Workshop"}
              color="rgba(255,255,255,.2)"
              logo={logo}
              size={34}
            />
            <div className="min-w-0">
              <div className="truncate text-[9px] font-semibold uppercase tracking-[.16em] opacity-80">
                {name || "Your workshop"}
              </div>
              <div className="text-sm font-bold">Good afternoon, Tan</div>
            </div>
          </div>
        </div>
        <div className="-mt-6 space-y-2 px-3 pb-4">
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <span className="rounded bg-black px-1.5 py-0.5 text-[10px] font-bold text-white">
              SJT8888T
            </span>
            <div className="mt-1.5 text-[13px] font-bold">Toyota Alphard 2.5</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-3/4 rounded-full" style={{ background: c }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div
              className="flex flex-col items-center gap-1 rounded-2xl p-2.5 text-[10px] font-semibold text-white"
              style={{ background: c }}
            >
              <Calendar className="h-4 w-4" />
              Book service
            </div>
            <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-2.5 text-[10px] font-semibold">
              <Wrench className="h-4 w-4" style={{ color: c }} />
              Track repair
            </div>
          </div>
          <div
            className="rounded-full py-2 text-center text-[11px] font-bold text-white"
            style={{ background: c }}
          >
            Request this time
          </div>
        </div>
      </div>
    </div>
  );
}
