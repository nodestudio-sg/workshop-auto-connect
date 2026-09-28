import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { km, money, shortDate } from "@/lib/format";
import type { Job } from "@/lib/customer";
import {
  Card,
  Loading,
  Page,
  Pill,
  TaxNote,
  TopBar,
  useWorkshop,
} from "@/components/app/workshop-ui";

export const Route = createFileRoute("/$slug/invoice/$jobId")({
  head: () => ({
    meta: [
      { title: "Invoice" },
      { name: "description", content: "Your invoice for this job, itemised." },
      { property: "og:title", content: "Invoice" },
      { property: "og:description", content: "Your invoice for this job, itemised." },
    ],
  }),
  component: Invoice,
});

function Invoice() {
  const { slug, jobId } = Route.useParams();
  const workshop = useWorkshop();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", workshop.id, jobId],
    queryFn: async () => {
      const { data: job, error } = await supabase
        .from("jobs")
        .select("*, vehicles!jobs_vehicle_id_fkey(plate, make, model)")
        .eq("id", jobId)
        .eq("workshop_id", workshop.id)
        .maybeSingle();
      if (error) throw error;
      return job as unknown as
        (Job & { vehicles: { plate: string; make: string; model: string } | null }) | null;
    },
  });

  if (isLoading) return <Loading />;

  if (!data) {
    return (
      <>
        <TopBar backTo={{ to: "/$slug/home", params: { slug } }} />
        <Page>
          <Card>
            <p className="text-sm text-muted-foreground">We can't find that invoice.</p>
          </Card>
        </Page>
      </>
    );
  }

  const lineItems = (data.line_items ?? []) as { label: string; amount: number }[];

  return (
    <>
      <TopBar backTo={{ to: "/$slug/home", params: { slug } }} />
      <Page>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-base font-bold">Invoice {data.invoice_no}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{shortDate(data.service_date)}</p>
            </div>
            {data.paid ? <Pill tone="success">Paid</Pill> : <Pill>Unpaid</Pill>}
          </div>

          <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Vehicle</dt>
              <dd className="font-medium">{data.vehicles?.plate}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Mileage</dt>
              <dd className="font-medium">{km(data.mileage_km)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Work done</dt>
              <dd className="font-medium">{data.title}</dd>
            </div>
          </dl>

          <ul className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
            {lineItems.map((item, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="shrink-0 font-medium">{money(item.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-start justify-between border-t border-border pt-4">
            <span className="text-base font-bold">Total</span>
            <div className="text-right">
              <span className="text-base font-bold">{money(Number(data.total))}</span>
              <TaxNote taxRate={Number(workshop.tax_rate)} />
            </div>
          </div>
        </Card>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {workshop.name}
          <br />
          {workshop.address}
        </p>
      </Page>
    </>
  );
}
