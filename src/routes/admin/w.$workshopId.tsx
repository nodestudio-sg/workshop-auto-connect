import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarCheck,
  Loader2,
  Palette,
  QrCode,
  Settings2,
  Tag,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { Pill } from "@/components/app/workshop-ui";
import { adminGetWorkshop, adminListBookings } from "@/lib/admin.functions";
import { errorText, Panel, WorkshopMark } from "@/components/admin/admin-ui";
import { BoardTab, useJobs } from "@/components/admin/board-tab";
import { BookingsTab } from "@/components/admin/bookings-tab";
import { CustomersTab } from "@/components/admin/customers-tab";
import { ServicesTab } from "@/components/admin/services-tab";
import { SettingsTab } from "@/components/admin/settings-tab";
import { ShareTab } from "@/components/admin/share-tab";
import { OwnersTab } from "@/components/admin/owners-tab";
import { cn } from "@/lib/utils";

type Tab = "bookings" | "board" | "customers" | "services" | "branding" | "share" | "owners";
const TABS: { id: Tab; label: string; icon: typeof Users; master?: boolean }[] = [
  { id: "bookings", label: "Bookings", icon: CalendarCheck },
  { id: "board", label: "Workshop board", icon: Wrench },
  { id: "customers", label: "Customers", icon: Users },
  { id: "services", label: "Services", icon: Tag },
  { id: "branding", label: "Branding & hours", icon: Palette },
  { id: "share", label: "Share app", icon: QrCode },
  { id: "owners", label: "Owner logins", icon: UserCog, master: true },
];

export const Route = createFileRoute("/admin/w/$workshopId")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    TABS.some((t) => t.id === s["tab"]) ? { tab: s["tab"] as Tab } : {},
  component: WorkshopConsole,
});

export function useWorkshop(id: string) {
  return useQuery({
    queryKey: ["admin", "workshop", id],
    queryFn: async () => {
      const res = await adminGetWorkshop({ data: { id } });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    retry: false,
  });
}

function WorkshopConsole() {
  const { workshopId } = Route.useParams();
  const { tab = "bookings" } = Route.useSearch();
  const q = useWorkshop(workshopId);
  const bookings = useQuery({
    queryKey: ["admin", "bookings", workshopId],
    queryFn: async () => {
      const r = await adminListBookings({ data: { id: workshopId } });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    refetchInterval: 30_000,
  });
  const jobs = useJobs(workshopId);
  if (q.isLoading)
    return (
      <div className="grid place-items-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (q.error || !q.data) return <Panel>{errorText(q.error?.message ?? "NOT_FOUND")}</Panel>;
  const { workshop, role } = q.data;
  const pending = (bookings.data ?? []).filter((b) => b.status === "requested").length;
  const inWorkshop = (jobs.data?.jobs ?? []).filter((j) => j.is_active).length;
  const tabs = TABS.filter((t) => !t.master || role === "master");

  return (
    <div className="space-y-5">
      {role === "master" ? (
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All workshops
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <WorkshopMark
          name={workshop.name}
          color={workshop.brand_color}
          logo={workshop.logo_url}
          size={56}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {workshop.name}
            </h1>
            {workshop.archived ? <Pill tone="muted">Archived</Pill> : null}
            {workshop.demo_mode ? <Pill tone="brand">Demo mode</Pill> : null}
          </div>
          <a
            href={`/${workshop.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground hover:text-brand"
          >
            <span
              className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{ background: workshop.brand_color }}
            />
            Open the customer app: /{workshop.slug}
          </a>
        </div>
      </div>

      <nav className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1 rounded-full bg-muted/70 p-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              to="/admin/w/$workshopId"
              params={{ workshopId }}
              search={{ tab: t.id }}
              replace
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition",
                tab === t.id && "bg-card text-foreground shadow-sm",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.id === "bookings" && pending ? (
                <span className="rounded-full bg-attention px-1.5 text-[11px] font-bold text-white">
                  {pending}
                </span>
              ) : null}
              {t.id === "board" && inWorkshop ? (
                <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                  {inWorkshop}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </nav>

      {tab === "bookings" ? <BookingsTab workshopId={workshopId} query={bookings} /> : null}
      {tab === "board" ? <BoardTab workshopId={workshopId} /> : null}
      {tab === "customers" ? <CustomersTab workshopId={workshopId} /> : null}
      {tab === "services" ? (
        <ServicesTab workshopId={workshopId} services={q.data.services} />
      ) : null}
      {tab === "branding" ? <SettingsTab workshop={workshop} role={role} /> : null}
      {tab === "share" ? <ShareTab workshop={workshop} /> : null}
      {tab === "owners" && role === "master" ? (
        <OwnersTab workshopId={workshopId} owners={q.data.owners} />
      ) : null}
      <p className="pt-4 text-center text-xs text-muted-foreground">
        <Settings2 className="mr-1 inline h-3 w-3" />
        Changes apply to the customer app straight away.
      </p>
    </div>
  );
}
