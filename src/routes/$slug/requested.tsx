import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, MapPin, Phone, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bookingStatus, type BookingStatus } from "@/lib/booking";
import { money, shortDate } from "@/lib/format";
import {
  Card,
  Loading,
  Page,
  Pill,
  TaxNote,
  TopBar,
  useWorkshop,
} from "@/components/app/workshop-ui";

type Snapshot = { name: string; price: number; quote_after_inspection: boolean };

export const Route = createFileRoute("/$slug/requested")({
  validateSearch: (search: Record<string, unknown>) => ({ id: String(search["id"] ?? "") }),
  head: () => ({
    meta: [
      { title: "Request sent" },
      {
        name: "description",
        content: "Your preferred slot has been requested. The workshop will message to confirm.",
      },
      { property: "og:title", content: "Request sent" },
      {
        property: "og:description",
        content: "Your preferred slot has been requested and is not confirmed yet.",
      },
    ],
  }),
  component: RequestSent,
});

function RequestSent() {
  const { slug } = Route.useParams();
  const { id } = Route.useSearch();
  const workshop = useWorkshop();

  const { data, isLoading } = useQuery({
    queryKey: ["booking", workshop.id, id],
    queryFn: async () => {
      const { data: row } = await supabase
        .from("booking_requests")
        .select("*")
        .eq("id", id)
        .eq("workshop_id", workshop.id)
        .maybeSingle();
      return row;
    },
    enabled: Boolean(id),
  });

  if (isLoading) return <Loading />;

  const snapshot = (data?.price_snapshot ?? []) as unknown as Snapshot[];
  const total = Number(data?.estimate_total ?? 0);
  // Columns from migration 0002, read loosely so the screen works without it.
  const row = (data ?? {}) as Record<string, unknown>;
  const status = bookingStatus(row["status"]);
  // The tax rate saved with the request; older requests fall back to the
  // workshop's current rate.
  const taxRate = row["tax_rate"] != null ? Number(row["tax_rate"]) : Number(workshop.tax_rate);
  const confirmedDate = typeof row["confirmed_date"] === "string" ? row["confirmed_date"] : null;
  const confirmedTime = typeof row["confirmed_time"] === "string" ? row["confirmed_time"] : null;

  return (
    <>
      <TopBar />
      <Page>
        <StatusCard
          status={data ? status : "requested"}
          workshopName={workshop.name}
          confirmedDate={confirmedDate}
          confirmedTime={confirmedTime}
        />

        {data ? (
          <Card>
            <h2 className="text-sm font-semibold">Your request</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Requested time</dt>
                <dd className="text-right font-medium">
                  {shortDate(String(data.preferred_date))}, {String(data.preferred_time)}
                </dd>
              </div>
              {snapshot.map((item, index) => (
                <div key={index} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{item.name}</dt>
                  <dd className="text-right font-medium">
                    {item.quote_after_inspection ? "Quoted after check" : money(item.price)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex items-start justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold">Estimate</span>
              <div className="text-right">
                <span className="text-sm font-bold">{money(total)}</span>
                <TaxNote taxRate={taxRate} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              This is an estimate of the work you chose. Anything extra is always quoted to you
              first.
            </p>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-sm font-semibold">Where to come</h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            {workshop.address}
          </p>
          <a
            href={`tel:${workshop.phone.replace(/\s/g, "")}`}
            className="mt-3 flex min-h-[44px] items-center gap-2 text-sm font-medium text-brand"
          >
            <Phone className="h-4 w-4" />
            {workshop.phone}
          </a>
        </Card>

        <Link
          to="/$slug/car"
          params={{ slug }}
          className="flex min-h-[52px] w-full items-center justify-center rounded-md border border-border bg-card text-[15px] font-semibold"
        >
          Back to my car
        </Link>
      </Page>
    </>
  );
}

function StatusCard({
  status,
  workshopName,
  confirmedDate,
  confirmedTime,
}: {
  status: BookingStatus;
  workshopName: string;
  confirmedDate: string | null;
  confirmedTime: string | null;
}) {
  if (status === "confirmed") {
    return (
      <Card className="bg-success-soft">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold">Booking confirmed</h1>
              <Pill tone="success">Confirmed</Pill>
            </div>
            <p className="mt-2 text-sm leading-relaxed">
              {workshopName} has confirmed your booking
              {confirmedDate && confirmedTime ? (
                <>
                  {" "}
                  for{" "}
                  <span className="font-semibold">
                    {shortDate(confirmedDate)}, {confirmedTime}
                  </span>
                </>
              ) : null}
              .
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (status === "declined" || status === "cancelled") {
    return (
      <Card className="bg-muted">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold">
                {status === "declined" ? "Time not available" : "Booking cancelled"}
              </h1>
              <Pill tone="muted">{status === "declined" ? "Declined" : "Cancelled"}</Pill>
            </div>
            <p className="mt-2 text-sm leading-relaxed">
              {status === "declined"
                ? `${workshopName} couldn't take this time. Please choose another, or call the workshop.`
                : `This booking is cancelled. Call ${workshopName} if you need to rebook.`}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-attention-soft">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-attention" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold">Slot requested</h1>
            <Pill>Not confirmed</Pill>
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            This time is <span className="font-semibold">requested only</span>. {workshopName} will
            message you to confirm it, or to offer another time.
          </p>
        </div>
      </div>
    </Card>
  );
}
