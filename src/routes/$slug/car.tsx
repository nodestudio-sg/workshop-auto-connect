import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarClock, CalendarPlus, ChevronDown, FileText, Wrench } from "lucide-react";
import { useCustomer } from "@/hooks/use-customer";
import { fetchJobs, type Job } from "@/lib/customer";
import { km, money, shortDate } from "@/lib/format";
import { statusLabel } from "@/lib/job-status";
import {
  BrandButton,
  Card,
  Loading,
  Page,
  Pill,
  TaxNote,
  useWorkshop,
} from "@/components/app/workshop-ui";
import {
  NumberPlate,
  ScreenHeader,
  SectionTitle,
  TabBar,
  VehicleSwitcher,
} from "@/components/app/app-shell";
import { cn } from "@/lib/utils";
import { vehicleName } from "@/lib/vehicle-name";

export const Route = createFileRoute("/$slug/car")({
  head: () => ({
    meta: [
      { title: "My car" },
      {
        name: "description",
        content: "Your vehicle details, service history and when the next service is due.",
      },
      { property: "og:title", content: "My car" },
      { property: "og:description", content: "Your vehicle details and service history." },
    ],
  }),
  component: MyCar,
});

function MyCar() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const { data, isLoading, selectVehicle } = useCustomer(slug);
  const vehicle = data?.vehicle ?? null;

  const jobsQuery = useQuery({
    queryKey: ["jobs", vehicle?.id],
    queryFn: () => fetchJobs(vehicle!.id),
    enabled: Boolean(vehicle?.id),
  });

  if (isLoading || !data) return <Loading />;

  const jobs = jobsQuery.data ?? [];
  const activeJob = jobs.find((job) => job.is_active);
  const history = jobs.filter((job) => !job.is_active);
  const unpaidCount = history.filter((job) => !job.paid).length;

  return (
    <>
      <ScreenHeader title={data.vehicles.length > 1 ? "My cars" : "My car"} />
      <Page>
        <VehicleSwitcher
          slug={slug}
          vehicles={data.vehicles}
          selectedId={vehicle?.id ?? null}
          onSelect={(id) => void selectVehicle(id)}
        />
        {vehicle ? (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <NumberPlate plate={vehicle.plate} />
                <p className="mt-2 text-base font-semibold">
                  {vehicleName(vehicle.make, vehicle.model)}
                </p>
                <p className="text-sm text-muted-foreground">{vehicle.year}</p>
              </div>
              <Pill tone="brand">{km(vehicle.mileage_km)}</Pill>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Engine oil</dt>
                <dd className="font-medium">
                  {vehicle.oil_grade} · {vehicle.oil_litres} L
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Oil filter</dt>
                <dd className="font-medium">{vehicle.oil_filter}</dd>
              </div>
            </dl>
          </Card>
        ) : null}

        {!vehicle ? (
          <Card>
            <p className="text-sm font-semibold">No car added yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap “Add car” above to add your plate, or {workshop.name} will add it on your first
              visit.
            </p>
          </Card>
        ) : null}

        <Link to="/$slug/book" params={{ slug }}>
          <BrandButton>
            <CalendarPlus className="mr-2 h-5 w-5" />
            Book a service
          </BrandButton>
        </Link>

        {activeJob ? (
          <Link
            to="/$slug/today"
            params={{ slug }}
            className="app-card flex items-center gap-3 bg-attention-soft p-4"
          >
            <Wrench className="h-5 w-5 shrink-0 text-attention" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Your car is in the workshop today</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {statusLabel(activeJob.status)} — tap to follow progress
              </p>
            </div>
          </Link>
        ) : null}

        {vehicle?.next_service_due_date ? (
          <Card className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-semibold">Next service due</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {shortDate(vehicle.next_service_due_date)}
                {vehicle.next_service_due_km ? ` or at ${km(vehicle.next_service_due_km)}` : ""}
              </p>
            </div>
          </Card>
        ) : null}

        <SectionTitle action={unpaidCount > 0 ? <Pill>{unpaidCount} unpaid</Pill> : null}>
          Service history
        </SectionTitle>

        <div className="space-y-3">
          {history.map((job) => (
            <HistoryItem key={job.id} job={job} slug={slug} taxRate={Number(workshop.tax_rate)} />
          ))}
          {history.length === 0 ? (
            <Card>
              <p className="text-sm text-muted-foreground">No past jobs yet.</p>
            </Card>
          ) : null}
        </div>
      </Page>

      <TabBar slug={slug} active="car" />
    </>
  );
}

function HistoryItem({
  job,
  slug: workshopSlug,
  taxRate,
}: {
  job: Job;
  slug: string;
  taxRate: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="app-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{job.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {shortDate(job.service_date)} · {km(job.mileage_km)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold">{money(job.total)}</span>
          {job.paid ? <Pill tone="muted">Paid</Pill> : <Pill>Unpaid</Pill>}
        </div>
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-border p-4">
          <ul className="space-y-1.5 text-sm">
            {job.line_items.map((item, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="shrink-0 font-medium">{money(item.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold">Total</span>
            <div className="text-right">
              <span className="text-sm font-semibold">{money(job.total)}</span>
              <TaxNote taxRate={taxRate} />
            </div>
          </div>

          {job.photos.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold">Inspection photos</p>
              <div className="grid grid-cols-3 gap-2">
                {job.photos.map((photo) => (
                  <img
                    key={photo}
                    src={photo}
                    alt="Workshop inspection"
                    loading="lazy"
                    className="aspect-square w-full rounded-md border border-border object-cover"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {job.invoice_no ? (
            <Link
              to="/$slug/invoice/$jobId"
              params={{ slug: workshopSlug, jobId: job.id }}
              className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-brand"
            >
              <FileText className="h-4 w-4" />
              View invoice {job.invoice_no}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
