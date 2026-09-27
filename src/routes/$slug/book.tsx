import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCustomer } from "@/hooks/use-customer";
import { fetchServices, fetchSlots, type Service } from "@/lib/customer";
import { dayLabel, money } from "@/lib/format";
import {
  BrandButton,
  Card,
  Loading,
  Page,
  Pill,
  TaxNote,
  TopBar,
} from "@/components/app/workshop-ui";
import { useWorkshop } from "@/components/app/workshop-ui";
import { cn } from "@/lib/utils";

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

function BookService() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();
  const { data, isLoading } = useCustomer(slug);

  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const servicesQuery = useQuery({
    queryKey: ["services", workshop.id],
    queryFn: () => fetchServices(workshop.id),
  });
  const slotsQuery = useQuery({
    queryKey: ["slots", workshop.id],
    queryFn: () => fetchSlots(workshop.id),
  });

  const services = useMemo(() => servicesQuery.data ?? [], [servicesQuery.data]);
  const chosen = services.filter((service) => selected.includes(service.id));
  const total = chosen.reduce((sum, service) => sum + service.price, 0);
  const hasQuoteItem = chosen.some((service) => service.quote_after_inspection);

  const dates = useMemo(() => {
    const byDate = new Map<string, { time: string; available: boolean }[]>();
    for (const slot of slotsQuery.data ?? []) {
      const list = byDate.get(slot.slot_date) ?? [];
      list.push({ time: slot.slot_time, available: slot.available });
      byDate.set(slot.slot_date, list);
    }
    return Array.from(byDate.entries()).slice(0, 10);
  }, [slotsQuery.data]);

  const times = dates.find(([value]) => value === date)?.[1] ?? [];

  if (isLoading || !data) return <Loading />;
  const vehicle = data.vehicle;

  async function submit() {
    if (!date || !time || !vehicle || chosen.length === 0) return;
    setBusy(true);
    const { data: inserted, error } = await supabase
      .from("booking_requests")
      .insert({
        workshop_id: workshop.id,
        customer_id: data!.customer.id,
        vehicle_id: vehicle.id,
        service_ids: chosen.map((service) => service.id),
        price_snapshot: chosen.map((service) => ({
          name: service.name,
          price: service.price,
          quote_after_inspection: service.quote_after_inspection,
          components: service.components,
        })),
        estimate_total: total,
        preferred_date: date,
        preferred_time: time,
        status: "requested",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      setBusy(false);
      toast.error("We couldn't send your request. Please try again.");
      return;
    }
    navigate({ to: "/$slug/requested", params: { slug }, search: { id: inserted.id } });
  }

  const canSubmit = chosen.length > 0 && Boolean(date) && Boolean(time) && !busy;

  return (
    <>
      <TopBar backTo={{ to: "/$slug/car", params: { slug } }} />
      <Page>
        <div>
          <h1 className="text-lg font-bold">Book a service</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For {vehicle?.plate} · {vehicle?.make} {vehicle?.model}
          </p>
        </div>

        <div className="space-y-3">
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

        <div className="pt-2">
          <h2 className="text-sm font-semibold">Preferred date</h2>
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            {dates.map(([value, slots]) => {
              const label = dayLabel(value);
              const anyFree = slots.some((slot) => slot.available);
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!anyFree}
                  onClick={() => {
                    setDate(value);
                    setTime(null);
                  }}
                  className={cn(
                    "flex min-h-[72px] w-16 shrink-0 flex-col items-center justify-center rounded-md border text-sm",
                    date === value
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-card",
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
        </div>

        {date ? (
          <div>
            <h2 className="text-sm font-semibold">Preferred time</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {times.map((slot) => (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => setTime(slot.time)}
                  className={cn(
                    "min-h-[52px] rounded-md border text-sm font-medium",
                    time === slot.time
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-card",
                    !slot.available && "cursor-not-allowed bg-muted text-muted-foreground/60 line-through",
                  )}
                >
                  {slot.time}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Crossed-out times are already taken.
            </p>
          </div>
        ) : null}

        <Card>
          <h2 className="text-sm font-semibold">Your details</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Name" value={data.customer.name} />
            <Row label="Mobile" value={`+65 ${data.customer.mobile}`} />
            <Row label="Vehicle" value={vehicle ? `${vehicle.plate} · ${vehicle.model}` : "—"} />
          </dl>
        </Card>
      </Page>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 pb-[env(safe-area-inset-bottom)] pt-3">
        <div className="mx-auto w-full max-w-[420px] pb-3">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                {chosen.length === 0
                  ? "Nothing selected yet"
                  : `${chosen.length} item${chosen.length > 1 ? "s" : ""} selected`}
              </p>
              <p className="text-lg font-bold">{money(total)}</p>
              <TaxNote taxRate={Number(workshop.tax_rate)} />
              {hasQuoteItem ? (
                <p className="text-xs text-muted-foreground">Some work is quoted after inspection</p>
              ) : null}
            </div>
          </div>
          <BrandButton disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "Sending…" : "Request this slot"}
          </BrandButton>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
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
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        "app-card w-full p-4 text-left transition-colors",
        checked && "border-brand ring-1 ring-brand",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border",
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
          <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
            {service.components.map((item, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="shrink-0">
                  {service.quote_after_inspection ? "Quoted after check" : money(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  );
}
