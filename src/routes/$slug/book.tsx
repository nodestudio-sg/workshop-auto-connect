import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { useCustomer } from "@/hooks/use-customer";
import {
  fetchBookings,
  isUpcoming,
  PricesChangedError,
  SlotUnavailableError,
  submitBookingRequest,
} from "@/lib/booking";
import { fetchServices, fetchSlots, type Service } from "@/lib/customer";
import { dayLabel, money } from "@/lib/format";
import {
  BrandButton,
  Loading,
  Pill,
  TaxNote,
  TopBar,
  useWorkshop,
} from "@/components/app/workshop-ui";
import { NumberPlate, VehicleSwitcher } from "@/components/app/app-shell";
import { cn } from "@/lib/utils";
import { vehicleName } from "@/lib/vehicle-name";

export const Route = createFileRoute("/$slug/book")({
  head: () => ({
    meta: [
      { title: "Book a service" },
      {
        name: "description",
        content: "Choose the servicing your car needs and request a date and time.",
      },
      { property: "og:title", content: "Book a service" },
      {
        property: "og:description",
        content: "Choose the servicing your car needs and request a date and time.",
      },
    ],
  }),
  component: BookService,
});

const NOTES_MAX = 500;

function BookService() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, selectVehicle } = useCustomer(slug);

  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const servicesQuery = useQuery({
    queryKey: ["services", workshop.id],
    queryFn: () => fetchServices(workshop.id),
  });
  const slotsQuery = useQuery({
    queryKey: ["slots", workshop.id],
    queryFn: () => fetchSlots(workshop.id),
  });
  const bookingsQuery = useQuery({
    queryKey: ["bookings", workshop.id],
    queryFn: () => fetchBookings(workshop.id),
    enabled: Boolean(data),
  });

  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data]);
  const chosen = services.filter((service) => selected.includes(service.id));
  const total = chosen.reduce((sum, service) => sum + service.price, 0);
  const hasQuoteItem = chosen.some((service) => service.quote_after_inspection);
  const vehicle = data?.vehicle ?? null;

  // One key per distinct submission: a retry of the same choices reuses it, so
  // a lost response can't create a duplicate request. Changing the choices
  // makes it a new submission.
  const idempotencyKey = useRef(crypto.randomUUID());
  const selectionKey = `${vehicle?.id}|${[...selected].sort().join(",")}|${date}|${time}|${notes}`;
  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, [selectionKey]);

  const dates = useMemo(() => {
    const byDate = new Map<string, { time: string; available: boolean }[]>();
    for (const slot of slotsQuery.data ?? []) {
      const list = byDate.get(slot.slot_date) ?? [];
      list.push({ time: slot.slot_time, available: slot.available });
      byDate.set(slot.slot_date, list);
    }
    return Array.from(byDate.entries()).slice(0, 14);
  }, [slotsQuery.data]);

  const times = dates.find(([value]) => value === date)?.[1] ?? [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
  const existing = (bookingsQuery.data ?? []).find(
    (booking) => booking.vehicleId === vehicle?.id && isUpcoming(booking, today),
  );

  if (isLoading || !data) return <Loading />;

  async function submit() {
    if (!date || !time || !vehicle || chosen.length === 0) return;
    setBusy(true);
    try {
      const id = await submitBookingRequest({
        workshopId: workshop.id,
        customerId: data!.customer.id,
        vehicleId: vehicle.id,
        services: chosen,
        shownTotal: total,
        preferredDate: date,
        preferredTime: time,
        idempotencyKey: idempotencyKey.current,
        notes: notes.trim(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bookings", workshop.id] }),
        queryClient.invalidateQueries({ queryKey: ["slots", workshop.id] }),
      ]);
      navigate({ to: "/$slug/requested", params: { slug }, search: { id } });
    } catch (error) {
      setBusy(false);
      if (error instanceof SlotUnavailableError) {
        setTime(null);
        await slotsQuery.refetch();
        toast.error("That time was just taken. Please pick another time.");
      } else if (error instanceof PricesChangedError) {
        await servicesQuery.refetch();
        toast.error(
          "Prices have changed since you opened this page. Please check them and send again.",
        );
      } else {
        toast.error("We couldn't send your request. Please try again.");
      }
    }
  }

  const missing = !vehicle
    ? "Add your car first"
    : chosen.length === 0
      ? "Choose a service"
      : !date
        ? "Pick a date"
        : !time
          ? "Pick a time"
          : null;
  const canSubmit = !missing && !busy;

  return (
    <>
      <TopBar backTo={{ to: "/$slug/home", params: { slug } }} />
      <main className="mx-auto w-full max-w-[420px] space-y-6 px-4 pb-48 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Book a service</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick what you need and a time that suits you. {workshop.name} confirms it with you.
          </p>
        </div>

        {existing ? (
          <Link
            to="/$slug/requested"
            params={{ slug }}
            search={{ id: existing.id }}
            className="app-card block border-attention bg-attention-soft p-4 text-sm"
          >
            <span className="font-semibold">
              This car already has a{" "}
              {existing.status === "confirmed" ? "confirmed booking" : "request"} for{" "}
              {dayLabel(existing.confirmedDate ?? existing.preferredDate).weekday}{" "}
              {dayLabel(existing.confirmedDate ?? existing.preferredDate).day}{" "}
              {dayLabel(existing.confirmedDate ?? existing.preferredDate).month}.
            </span>{" "}
            <span className="text-muted-foreground">
              Tap to view it, or carry on to book something else.
            </span>
          </Link>
        ) : null}

        <Step number={1} title="Your car" done={Boolean(vehicle)}>
          {vehicle ? (
            <>
              <div className="app-card flex items-center gap-3 p-4">
                <NumberPlate plate={vehicle.plate} className="text-base" />
                <p className="min-w-0 truncate text-sm font-medium">
                  {vehicleName(vehicle.make, vehicle.model)}
                </p>
              </div>
              {data.vehicles.length > 1 ? (
                <div className="mt-3">
                  <VehicleSwitcher
                    slug={slug}
                    vehicles={data.vehicles}
                    selectedId={vehicle.id}
                    onSelect={(id) => void selectVehicle(id)}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <Link
              to="/$slug/add-car"
              params={{ slug }}
              className="app-card flex min-h-[56px] items-center justify-center border-dashed text-sm font-semibold text-brand"
            >
              + Add your car to book
            </Link>
          )}
        </Step>

        <Step number={2} title="Choose services" done={chosen.length > 0}>
          <div className="space-y-3">
            {servicesQuery.isLoading ? <Loading /> : null}
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                checked={selected.includes(service.id)}
                onToggle={() =>
                  setSelected((current) =>
                    current.includes(service.id)
                      ? current.filter((id) => id !== service.id)
                      : [...current, service.id],
                  )
                }
              />
            ))}
          </div>
        </Step>

        <Step number={3} title="Pick a date" done={Boolean(date)}>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {dates.map(([value, slots]) => {
              const label = dayLabel(value);
              const anyFree = slots.some((slot) => slot.available);
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!anyFree}
                  aria-pressed={date === value}
                  onClick={() => {
                    setDate(value);
                    setTime(null);
                  }}
                  className={cn(
                    "flex min-h-[76px] w-16 shrink-0 flex-col items-center justify-center rounded-2xl border text-sm transition-colors",
                    date === value
                      ? "border-brand bg-brand text-brand-foreground shadow-[0_8px_16px_-6px_color-mix(in_oklab,var(--brand)_55%,transparent)]"
                      : "border-border bg-card shadow-sm",
                    !anyFree && "opacity-40",
                  )}
                >
                  <span className="text-xs">{label.weekday}</span>
                  <span className="text-lg font-bold leading-tight">{label.day}</span>
                  <span className="text-xs">{label.month}</span>
                </button>
              );
            })}
          </div>
          {!slotsQuery.isLoading && dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No online times right now. Please call {workshop.name}.
            </p>
          ) : null}
        </Step>

        <Step number={4} title="Pick a time" done={Boolean(time)}>
          {date ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {times.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    disabled={!slot.available}
                    aria-pressed={time === slot.time}
                    onClick={() => setTime(slot.time)}
                    className={cn(
                      "min-h-[52px] rounded-2xl border text-sm font-semibold transition-colors",
                      time === slot.time
                        ? "border-brand bg-brand text-brand-foreground shadow-sm"
                        : "border-border bg-card",
                      !slot.available &&
                        "cursor-not-allowed bg-muted text-muted-foreground/60 line-through",
                    )}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Crossed-out times are taken.</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pick a date first.</p>
          )}
        </Step>

        <Step number={5} title="Anything we should know?" optional>
          <div className="app-card p-3">
            <div className="flex gap-2">
              <MessageSquareText className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <textarea
                aria-label="Notes for the workshop"
                placeholder="e.g. Squeaking when braking, aircon not cold, need the car back by 5pm"
                value={notes}
                maxLength={NOTES_MAX}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-[72px] w-full resize-none bg-transparent py-2 text-base outline-none"
              />
            </div>
            {notes.length > NOTES_MAX - 100 ? (
              <p className="text-right text-xs text-muted-foreground">
                {notes.length}/{NOTES_MAX}
              </p>
            ) : null}
          </div>
        </Step>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-[420px] pb-3">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">
                {chosen.length === 0
                  ? "Nothing selected yet"
                  : chosen.map((service) => service.name).join(", ")}
              </p>
              {date && time ? (
                <p className="text-xs font-medium">
                  {dayLabel(date).weekday} {dayLabel(date).day} {dayLabel(date).month}, {time}{" "}
                  <span className="font-normal text-muted-foreground">· to be confirmed</span>
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold">{money(total)}</p>
              <TaxNote taxRate={Number(workshop.tax_rate)} />
            </div>
          </div>
          {hasQuoteItem ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Some work is quoted after inspection.
            </p>
          ) : null}
          <BrandButton disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "Sending…" : (missing ?? "Request this time")}
          </BrandButton>
        </div>
      </div>
    </>
  );
}

function Step({
  number,
  title,
  done = false,
  optional = false,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
            done
              ? "border-brand-strong bg-brand-strong text-brand-foreground"
              : "border-border bg-card text-muted-foreground",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : number}
        </span>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {optional ? <span className="text-xs text-muted-foreground">Optional</span> : null}
      </div>
      {children}
    </section>
  );
}

function ServiceCard({
  service,
  checked,
  onToggle,
}: {
  service: Service;
  checked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "app-card overflow-hidden transition-colors",
        checked && "border-brand ring-1 ring-brand",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
            checked ? "border-brand bg-brand text-brand-foreground" : "border-border",
          )}
        >
          {checked ? <Check className="h-4 w-4" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">{service.name}</p>
            {service.quote_after_inspection ? (
              <Pill tone="muted">No charge</Pill>
            ) : (
              <span className="shrink-0 text-sm font-bold">{money(service.price)}</span>
            )}
          </div>
          {service.description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {service.description}
            </p>
          ) : null}
        </div>
      </button>
      {service.components.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-xs font-medium text-muted-foreground"
          >
            What's included ({service.components.length})
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
          {open ? (
            <ul className="space-y-1 px-4 pb-4 text-xs">
              {service.components.map((item, index) => (
                <li key={index} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="shrink-0">
                    {service.quote_after_inspection ? "Quoted after check" : money(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
