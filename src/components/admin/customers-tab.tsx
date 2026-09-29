import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle, Search } from "lucide-react";
import { Pill } from "@/components/app/workshop-ui";
import { adminListCustomers } from "@/lib/admin.functions";
import { errorText, inputCls, Panel } from "@/components/admin/admin-ui";

export function CustomersTab({ workshopId }: { workshopId: string }) {
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: ["admin", "customers", workshopId],
    queryFn: async () => {
      const r = await adminListCustomers({ data: { id: workshopId } });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  if (query.isLoading)
    return (
      <div className="grid place-items-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (query.error) return <Panel>{errorText(query.error.message)}</Panel>;
  const needle = q.trim().toLowerCase();
  const list = (query.data ?? []).filter(
    (c) =>
      !needle ||
      [c.name, c.mobile, c.email ?? "", c.company ?? "", ...c.vehicles.map((v) => v.plate)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-10`}
            placeholder="Search name, mobile, email or plate"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">{query.data?.length ?? 0} customers</span>
      </div>
      {list.length ? (
        <Panel className="p-0 sm:p-0">
          <ul className="divide-y divide-border/70">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">
                  {c.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {c.name}
                    {c.company ? <Pill tone="brand">{c.company}</Pill> : null}
                    {!c.signedUp ? <Pill tone="muted">Not signed up</Pill> : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    +65 {c.mobile}
                    {c.email ? ` · ${c.email}` : ""}
                  </div>
                </div>
                <div className="flex min-w-[160px] flex-1 flex-wrap gap-1.5">
                  {c.vehicles.map((v) => (
                    <span
                      key={v.plate}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                    >
                      <b className="rounded bg-black px-1 text-[10px] text-white">{v.plate}</b>
                      {v.name}
                    </span>
                  ))}
                  {!c.vehicles.length ? (
                    <span className="text-xs text-muted-foreground">No car added yet</span>
                  ) : null}
                </div>
                <div className="text-right text-sm">
                  <b>{c.bookings}</b> <span className="text-muted-foreground">bookings</span>
                  <div className="text-xs text-muted-foreground">
                    joined{" "}
                    {new Date(c.joined).toLocaleDateString("en-SG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
                <a
                  href={`https://wa.me/65${c.mobile}`}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-9 w-9 place-items-center rounded-full bg-[#25d366] text-white"
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel className="text-center text-sm text-muted-foreground">
          {needle
            ? "No customers match that search."
            : "No customers yet. Share the app link or QR poster to get the first sign-ups."}
        </Panel>
      )}
    </div>
  );
}
