import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { useCustomer } from "@/hooks/use-customer";
import { fetchBookings, isUpcoming, type BookingSummary } from "@/lib/booking";
import { dayLabel, money } from "@/lib/format";
import { BrandButton, Loading, Pill, useWorkshop } from "@/components/app/workshop-ui";
import { ScreenHeader, SectionTitle, TabBar } from "@/components/app/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$slug/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings" },
      { name: "description", content: "Your booking requests and confirmed appointments." },
    ],
  }),
  component: Bookings,
});

function Bookings() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const { data, isLoading } = useCustomer(slug);

  const bookingsQuery = useQuery({
    queryKey: ["bookings", workshop.id],
    queryFn: () => fetchBookings(workshop.id),
    enabled: Boolean(data),
  });

  if (isLoading || !data) return <Loading />;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  const bookings = bookingsQuery.data ?? [];
  const upcoming = bookings.filter((booking) => isUpcoming(booking, today));
  const past = bookings.filter((booking) => !isUpcoming(booking, today));

  return (
    <>
      <ScreenHeader title="Bookings" subtitle={workshop.name} />
      <main className="mx-auto w-full max-w-[420px] space-y-3 px-4 pb-28 pt-3">
        <Link to="/$slug/book" params={{ slug }}>
          <BrandButton>
            <CalendarPlus className="mr-2 h-5 w-5" />
            Book a service
          </BrandButton>
        </Link>

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          A requested time is not an appointment until {workshop.name} confirms it.
        </p>

        {bookingsQuery.isLoading ? <Loading /> : null}

        {!bookingsQuery.isLoading && bookings.length === 0 ? (
          <div className="app-card p-6 text-center">
            <p className="text-sm font-semibold">No bookings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Book a service and it will show here while the workshop confirms it.
            </p>
          </div>
        ) : null}

        {upcoming.length > 0 ? <SectionTitle>Upcoming</SectionTitle> : null}
        {upcoming.map((booking) => (
          <BookingRow key={booking.id} slug={slug} booking={booking} />
        ))}

        {past.length > 0 ? <SectionTitle>Earlier</SectionTitle> : null}
        {past.map((booking) => (
          <BookingRow key={booking.id} slug={slug} booking={booking} muted />
        ))}
      </main>
      <TabBar slug={slug} active="bookings" />
    </>
  );
}

const STATUS = {
  requested: {
    pill: <Pill>Requested · not confirmed</Pill>,
    date: "bg-attention-soft text-attention",
  },
  confirmed: { pill: <Pill tone="success">Confirmed</Pill>, date: "bg-success-soft text-success" },
  declined: { pill: <Pill tone="muted">Declined</Pill>, date: "bg-muted text-muted-foreground" },
  cancelled: { pill: <Pill tone="muted">Cancelled</Pill>, date: "bg-muted text-muted-foreground" },
} as const;

function BookingRow({
  slug,
  booking,
  muted = false,
}: {
  slug: string;
  booking: BookingSummary;
  muted?: boolean;
}) {
  const confirmed = booking.status === "confirmed";
  const date = confirmed && booking.confirmedDate ? booking.confirmedDate : booking.preferredDate;
  const time = confirmed && booking.confirmedTime ? booking.confirmedTime : booking.preferredTime;
  const label = dayLabel(date);
  const style = STATUS[booking.status];

  return (
    <Link
      to="/$slug/requested"
      params={{ slug }}
      search={{ id: booking.id }}
      className={cn("app-card flex items-center gap-4 p-4", muted && "opacity-80")}
    >
      <div className={cn("flex w-14 shrink-0 flex-col items-center rounded-lg py-2", style.date)}>
        <span className="text-[11px] font-semibold uppercase">{label.month}</span>
        <span className="text-xl font-bold leading-tight">{label.day}</span>
        <span className="text-[11px]">{label.weekday}</span>
      </div>
      <div className="min-w-0 flex-1">
        {style.pill}
        <p className="mt-1.5 truncate text-sm font-semibold">
          {booking.serviceNames.join(", ") || "Service"}
        </p>
        <p className="text-xs text-muted-foreground">
          {confirmed ? time : `Preferred time ${time}`} · {money(booking.total)}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
