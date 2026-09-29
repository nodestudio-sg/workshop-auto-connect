import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarCheck2,
  CalendarPlus,
  ChevronRight,
  Clock,
  Gauge,
  History,
  MapPin,
  MessageCircle,
  Phone,
  Receipt,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCustomer } from "@/hooks/use-customer";
import { fetchBookings, isUpcoming, type BookingSummary } from "@/lib/booking";
import { fetchJobs, type Job, type Vehicle } from "@/lib/customer";
import { dayLabel, km, money, shortDate } from "@/lib/format";
import { STAGES, stageIndex, statusLabel } from "@/lib/job-status";
import { Loading, Pill, useWorkshop } from "@/components/app/workshop-ui";
import {
  directionsUrl,
  NumberPlate,
  phoneLinks,
  SectionTitle,
  TabBar,
  VehicleSwitcher,
  WorkshopLogo,
} from "@/components/app/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$slug/home")({
  head: () => ({
    meta: [
      { title: "Home" },
      {
        name: "description",
        content: "Your car, its next service, live repair updates and bookings in one place.",
      },
    ],
  }),
  component: Home,
});

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-SG", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Singapore",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function todayInSingapore(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
}

function Home() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const { data, isLoading, selectVehicle } = useCustomer(slug);
  const vehicle = data?.vehicle ?? null;

  const jobsQuery = useQuery({
    queryKey: ["jobs", vehicle?.id],
    queryFn: () => fetchJobs(vehicle!.id),
    enabled: Boolean(vehicle?.id),
  });
  const bookingsQuery = useQuery({
    queryKey: ["bookings", workshop.id],
    queryFn: () => fetchBookings(workshop.id),
    enabled: Boolean(data),
  });

  if (isLoading || !data) return <Loading />;

  const jobs = jobsQuery.data ?? [];
  const activeJob = jobs.find((job) => job.is_active) ?? null;
  const history = jobs.filter((job) => !job.is_active);
  const unpaid = history.filter((job) => !job.paid);
  const today = todayInSingapore();
  const upcoming = (bookingsQuery.data ?? [])
    .filter((booking) => isUpcoming(booking, today))
    .sort((a, b) => a.preferredDate.localeCompare(b.preferredDate))[0];
  const firstName = data.customer.name.split(" ")[0];
  const links = phoneLinks(workshop.phone);

  return (
    <>
      <div className="brand-hero">
        <header className="mx-auto flex min-h-[104px] w-full max-w-[420px] items-center gap-3 px-5 py-5">
          <WorkshopLogo workshop={workshop} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-brand-foreground/75">{workshop.name}</p>
            <h1 className="mt-1 truncate text-xl">
              {greeting()}, {firstName}
            </h1>
          </div>
          <Link
            to="/$slug/account"
            params={{ slug }}
            aria-label="Account"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-sm font-semibold shadow-sm"
          >
            {firstName?.[0]?.toUpperCase() ?? "?"}
          </Link>
        </header>
        {data.vehicles.length > 0 ? (
          <div className="mx-auto w-full max-w-[420px] px-5 pb-5">
            <VehicleSwitcher
              slug={slug}
              vehicles={data.vehicles}
              selectedId={vehicle?.id ?? null}
              onSelect={(id) => void selectVehicle(id)}
              tone="onBrand"
            />
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-[420px] space-y-5 px-5 pb-28 pt-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {vehicle ? (
          <Link
            to="/$slug/car"
            params={{ slug }}
            className="app-card block overflow-hidden p-4"
            aria-label={`My car, ${vehicle.plate}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <NumberPlate plate={vehicle.plate} />
                <p className="mt-2 truncate text-base font-semibold">
                  {vehicle.make} {vehicle.model}
                </p>
                <p className="text-xs text-muted-foreground">{vehicle.year}</p>
              </div>
              <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border pt-4">
              <Stat icon={Gauge} label="Mileage" value={km(vehicle.mileage_km)} />
              <Stat
                icon={Wrench}
                label="Engine oil"
                value={vehicle.oil_grade ? `${vehicle.oil_grade} · ${vehicle.oil_litres} L` : "—"}
              />
            </div>
          </Link>
        ) : (
          <Link
            to="/$slug/add-car"
            params={{ slug }}
            className="app-card flex flex-col items-center p-6 text-center"
          >
            <p className="text-base font-semibold">Add your car</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your plate to book services and keep its history in one place.
            </p>
            <span className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-brand-strong px-5 text-sm font-semibold text-brand-foreground">
              Add a car
            </span>
          </Link>
        )}

        {activeJob ? <LiveJobBanner slug={slug} job={activeJob} /> : null}

        {vehicle ? <NextService vehicle={vehicle} history={history} today={today} /> : null}

        <section aria-label="Quick actions" className="py-1">
          <div className="grid grid-cols-4 gap-y-3">
            <Action to="book" slug={slug} icon={CalendarPlus} label="Book service" primary />
            <Action to="today" slug={slug} icon={Wrench} label="Track repair" />
            <Action to="car" slug={slug} icon={History} label="History" />
            <Action to="bookings" slug={slug} icon={CalendarCheck2} label="Bookings" />
            <Action href={links.tel} icon={Phone} label="Call" />
            <Action href={links.whatsapp} icon={MessageCircle} label="WhatsApp" external />
            <Action
              href={directionsUrl(workshop.address)}
              icon={MapPin}
              label="Directions"
              external
            />
            <Action to="car" slug={slug} icon={Receipt} label="Invoices" />
          </div>
        </section>

        {upcoming ? <UpcomingBooking slug={slug} booking={upcoming} /> : null}

        {unpaid.length > 0 ? (
          <Link
            to="/$slug/invoice/$jobId"
            params={{ slug, jobId: unpaid[0]!.id }}
            className="app-card flex items-center gap-3 p-4"
          >
            <IconBubble icon={Receipt} tone="attention" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {unpaid.length === 1 ? "1 unpaid invoice" : `${unpaid.length} unpaid invoices`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {unpaid[0]!.title} · {money(unpaid[0]!.total)}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </Link>
        ) : null}

        {history[0] ? (
          <>
            <SectionTitle
              action={
                <Link to="/$slug/car" params={{ slug }} className="text-sm font-medium text-brand">
                  See all
                </Link>
              }
            >
              Last visit
            </SectionTitle>
            <LastVisit slug={slug} job={history[0]} />
          </>
        ) : null}

        <SectionTitle>Your workshop</SectionTitle>
        <div className="app-card p-4">
          <div className="flex items-start gap-3">
            <WorkshopLogo workshop={workshop} size={40} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{workshop.name}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {workshop.address}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={links.tel}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
            <a
              href={directionsUrl(workshop.address)}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium"
            >
              <MapPin className="h-4 w-4" /> Directions
            </a>
          </div>
        </div>
      </main>

      <TabBar slug={slug} active="home" />
    </>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-muted/60 px-3.5 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-brand-strong" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function IconBubble({
  icon: Icon,
  tone = "brand",
}: {
  icon: LucideIcon;
  tone?: "brand" | "attention" | "success";
}) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    attention: "bg-attention-soft text-attention",
    success: "bg-success-soft text-success",
  } as const;
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
        tones[tone],
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

function LiveJobBanner({ slug, job }: { slug: string; job: Job }) {
  const needsApproval = Boolean(job.extra_work && !job.extra_work.approved);
  const current = stageIndex(job.status);

  if (needsApproval) {
    return (
      <Link
        to="/$slug/today"
        params={{ slug }}
        className="app-card flex items-center gap-3 border-attention bg-attention-soft p-4"
      >
        <IconBubble icon={AlertCircle} tone="attention" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Your approval is needed</p>
          <p className="truncate text-xs">
            {job.extra_work!.title} · +{money(Number(job.extra_work!.price))}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-attention px-3 py-1.5 text-xs font-semibold text-attention-foreground">
          Review
        </span>
      </Link>
    );
  }

  return (
    <Link to="/$slug/today" params={{ slug }} className="app-card block p-4">
      <div className="flex items-center gap-3">
        <IconBubble icon={Wrench} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Your car is in the workshop</p>
          <p className="truncate text-xs text-muted-foreground">{statusLabel(job.status)}</p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-3 flex gap-1" aria-label={`Step ${current + 1} of ${STAGES.length}`}>
        {STAGES.map((stage, index) => (
          <span
            key={stage.key}
            className={cn("h-1.5 flex-1 rounded-full", index <= current ? "bg-brand" : "bg-muted")}
          />
        ))}
      </div>
    </Link>
  );
}

function NextService({
  vehicle,
  history,
  today,
}: {
  vehicle: Vehicle;
  history: Job[];
  today: string;
}) {
  const dueDate = vehicle.next_service_due_date;
  const dueKm = vehicle.next_service_due_km;
  if (!dueDate && !dueKm) return null;

  const daysLeft = dueDate
    ? Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5)
    : null;
  const lastKm = history.find((job) => job.mileage_km != null)?.mileage_km ?? null;
  const progress =
    dueKm && lastKm != null && dueKm > lastKm
      ? Math.min(1, Math.max(0, (vehicle.mileage_km - lastKm) / (dueKm - lastKm)))
      : null;
  const overdue =
    (daysLeft != null && daysLeft < 0) || (dueKm != null && vehicle.mileage_km >= dueKm);
  const soon = !overdue && ((daysLeft != null && daysLeft <= 30) || (progress ?? 0) >= 0.85);

  return (
    <div className="app-card p-4">
      <div className="flex items-start gap-3">
        <IconBubble icon={Clock} tone={overdue || soon ? "attention" : "brand"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Next service</p>
            {overdue ? <Pill>Overdue</Pill> : soon ? <Pill>Due soon</Pill> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dueDate ? shortDate(dueDate) : null}
            {dueDate && dueKm ? " or " : null}
            {dueKm ? `at ${km(dueKm)}` : null}
          </p>
          {daysLeft != null && daysLeft >= 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {daysLeft === 0 ? "Due today" : `In ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
            </p>
          ) : null}
        </div>
      </div>
      {progress != null ? (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", overdue || soon ? "bg-attention" : "bg-brand")}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {km(Math.max(0, vehicle.mileage_km - (lastKm ?? 0)))} since your last service
          </p>
        </div>
      ) : null}
    </div>
  );
}

function UpcomingBooking({ slug, booking }: { slug: string; booking: BookingSummary }) {
  const confirmed = booking.status === "confirmed";
  const date = confirmed && booking.confirmedDate ? booking.confirmedDate : booking.preferredDate;
  const time = confirmed && booking.confirmedTime ? booking.confirmedTime : booking.preferredTime;
  const label = dayLabel(date);

  return (
    <>
      <SectionTitle>Upcoming</SectionTitle>
      <Link
        to="/$slug/requested"
        params={{ slug }}
        search={{ id: booking.id }}
        className="app-card flex items-center gap-4 p-4"
      >
        <div
          className={cn(
            "flex w-14 shrink-0 flex-col items-center rounded-2xl py-2",
            confirmed ? "bg-success-soft text-success" : "bg-attention-soft text-attention",
          )}
        >
          <span className="text-[11px] font-semibold uppercase">{label.month}</span>
          <span className="text-xl font-bold leading-tight">{label.day}</span>
          <span className="text-[11px]">{label.weekday}</span>
        </div>
        <div className="min-w-0 flex-1">
          {confirmed ? (
            <Pill tone="success">Confirmed</Pill>
          ) : (
            <Pill>Requested · not confirmed</Pill>
          )}
          <p className="mt-1.5 truncate text-sm font-semibold">
            {booking.serviceNames.join(", ") || "Service"}
          </p>
          <p className="text-xs text-muted-foreground">
            {confirmed ? time : `Preferred time ${time}`}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </Link>
    </>
  );
}

function LastVisit({ slug, job }: { slug: string; job: Job }) {
  return (
    <Link to="/$slug/car" params={{ slug }} className="app-card flex items-center gap-3 p-4">
      <IconBubble icon={History} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{job.title}</p>
        <p className="text-xs text-muted-foreground">
          {shortDate(job.service_date)} · {km(job.mileage_km)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold">{money(job.total)}</span>
        {job.paid ? <Pill tone="muted">Paid</Pill> : <Pill>Unpaid</Pill>}
      </div>
    </Link>
  );
}

type ActionProps = { icon: LucideIcon; label: string; primary?: boolean } & (
  | { to: "book" | "today" | "car" | "bookings"; slug: string; href?: never; external?: never }
  | { href: string; external?: boolean; to?: never; slug?: never }
);

function Action(props: ActionProps) {
  const { icon: Icon, label, primary } = props;
  const body: ReactNode = (
    <>
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl transition-transform active:scale-95",
          primary
            ? "bg-brand-strong text-brand-foreground shadow-[0_8px_16px_-6px_color-mix(in_oklab,var(--brand)_55%,transparent)]"
            : "border border-border bg-card text-brand-strong shadow-sm",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-center text-[11px] font-medium leading-tight">{label}</span>
    </>
  );
  const className =
    "flex min-h-[80px] flex-col items-center justify-start gap-2 rounded-2xl px-1 py-2 active:bg-muted";

  if (props.href) {
    return (
      <a
        href={props.href}
        className={className}
        {...(props.external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {body}
      </a>
    );
  }
  const to = {
    book: "/$slug/book",
    today: "/$slug/today",
    car: "/$slug/car",
    bookings: "/$slug/bookings",
  } as const;
  return (
    <Link to={to[props.to!]} params={{ slug: props.slug! }} className={className}>
      {body}
    </Link>
  );
}
