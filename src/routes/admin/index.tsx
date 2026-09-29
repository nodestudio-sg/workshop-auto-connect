import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { Pill } from "@/components/app/workshop-ui";
import { Panel, Stat, WorkshopMark } from "@/components/admin/admin-ui";
import { useOverview } from "@/components/admin/use-overview";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function AdminHome() {
  const { data } = useOverview();
  const navigate = useNavigate();
  const owner = data?.role.kind === "owner";

  // Owners of a single workshop go straight to it.
  useEffect(() => {
    if (owner && data?.workshops.length === 1) {
      void navigate({
        to: "/admin/w/$workshopId",
        params: { workshopId: data.workshops[0]!.id },
        replace: true,
      });
    }
  }, [owner, data, navigate]);
  if (!data) return null;

  const live = data.workshops.filter((w) => !w.archived);
  const total = (k: "customers" | "pending" | "upcoming") => live.reduce((n, w) => n + w[k], 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {owner ? "Your workshops" : "All workshops"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {owner
              ? "Choose a workshop to manage."
              : "Every workshop on the booking app, at a glance."}
          </p>
        </div>
        {!owner ? (
          <Link
            to="/admin/new"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-sm hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            New workshop
          </Link>
        ) : null}
      </div>

      {!owner ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Live workshops" value={live.length} />
          <Stat label="Customers" value={total("customers")} />
          <Stat label="Waiting for a reply" value={total("pending")} tone="attention" />
          <Stat label="Upcoming bookings" value={total("upcoming")} />
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {data.workshops.map((w) => (
          <Link
            key={w.id}
            to="/admin/w/$workshopId"
            params={{ workshopId: w.id }}
            className="group"
          >
            <Panel className="transition group-hover:border-brand/40 group-hover:shadow-md">
              <div className="flex items-center gap-3">
                <WorkshopMark name={w.name} color={w.brand_color} logo={w.logo_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-base font-bold">{w.name}</span>
                    {w.archived ? <Pill tone="muted">Archived</Pill> : null}
                    {w.demo_mode && !w.archived ? <Pill tone="brand">Demo</Pill> : null}
                    {w.pending ? <Pill>{w.pending} to reply</Pill> : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: w.brand_color }}
                    />
                    /{w.slug}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-2xl bg-muted/60 py-2">
                  <b className="block text-lg">{w.customers}</b>
                  <span className="text-xs text-muted-foreground">customers</span>
                </div>
                <div className="rounded-2xl bg-muted/60 py-2">
                  <b className="block text-lg">{w.upcoming}</b>
                  <span className="text-xs text-muted-foreground">upcoming</span>
                </div>
                <div className="rounded-2xl bg-muted/60 py-2">
                  <b className="block text-lg">{w.owners}</b>
                  <span className="text-xs text-muted-foreground">owner logins</span>
                </div>
              </div>
            </Panel>
          </Link>
        ))}
        {!data.workshops.length ? (
          <Panel className="text-center text-sm text-muted-foreground md:col-span-2">
            No workshops yet. Add the first one.
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
