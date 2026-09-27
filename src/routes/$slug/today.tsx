import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Phone } from "lucide-react";
import { toast } from "sonner";
import { useCustomer } from "@/hooks/use-customer";
import { approveExtraWork, fetchActiveJob } from "@/lib/customer";
import { money } from "@/lib/format";
import { STAGES, stageIndex } from "@/lib/job-status";
import {
  BrandButton,
  Card,
  Loading,
  Page,
  Pill,
  TaxNote,
  TopBar,
  useWorkshop,
} from "@/components/app/workshop-ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$slug/today")({
  head: () => ({
    meta: [
      { title: "My car today" },
      {
        name: "description",
        content: "Follow your car's progress in the workshop and approve any extra work.",
      },
      { property: "og:title", content: "My car today" },
      {
        property: "og:description",
        content: "Follow your car's progress in the workshop and approve any extra work.",
      },
    ],
  }),
  component: Today,
});

function Today() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const queryClient = useQueryClient();
  const { data, isLoading } = useCustomer(slug);
  const vehicle = data?.vehicle ?? null;
  const [busy, setBusy] = useState(false);

  const jobQuery = useQuery({
    queryKey: ["active-job", vehicle?.id],
    queryFn: () => fetchActiveJob(vehicle!.id),
    enabled: Boolean(vehicle?.id),
  });

  if (isLoading || !data) return <Loading />;

  const job = jobQuery.data ?? null;

  if (!jobQuery.isLoading && !job) {
    return (
      <>
        <TopBar backTo={{ to: "/$slug/car", params: { slug } }} />
        <Page>
          <Card>
            <h1 className="text-base font-semibold">Your car isn't in the workshop today</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              When your car is with us, you'll be able to follow every step here.
            </p>
          </Card>
          <Link
            to="/$slug/book"
            params={{ slug }}
            className="flex min-h-[52px] items-center justify-center rounded-md border border-border bg-card text-[15px] font-semibold"
          >
            Book a service
          </Link>
        </Page>
      </>
    );
  }

  if (!job) return <Loading />;

  const current = stageIndex(job.status);
  const extra = job.extra_work;
  const pendingExtra = extra && !extra.approved;

  async function approve() {
    setBusy(true);
    try {
      await approveExtraWork(job!.id);
      await queryClient.invalidateQueries({ queryKey: ["active-job", vehicle?.id] });
      toast.success("Approved — the workshop is carrying on with the work.");
    } catch {
      toast.error("We couldn't send your approval. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar backTo={{ to: "/$slug/car", params: { slug } }} />
      <Page>
        <div>
          <h1 className="text-lg font-bold">My car today</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {vehicle?.plate} · {job.title}
          </p>
        </div>

        <Card>
          <ol className="space-y-0">
            {STAGES.map((stage, index) => {
              const done = index < current;
              const active = index === current;
              const time = job.stage_times[stage.key];
              return (
                <li key={stage.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                        done && "border-brand bg-brand text-brand-foreground",
                        active && "border-attention bg-attention text-attention-foreground",
                        !done && !active && "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : index + 1}
                    </span>
                    {index < STAGES.length - 1 ? (
                      <span
                        className={cn("w-px flex-1", done ? "bg-brand" : "bg-border")}
                        style={{ minHeight: 28 }}
                      />
                    ) : null}
                  </div>
                  <div className="pb-6">
                    <p
                      className={cn(
                        "text-sm",
                        active ? "font-bold" : done ? "font-medium" : "text-muted-foreground",
                      )}
                    >
                      {stage.label}
                    </p>
                    {time ? <p className="text-xs text-muted-foreground">{time}</p> : null}
                    {active ? (
                      <span className="mt-1 inline-block">
                        <Pill>Now</Pill>
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        {extra ? (
          <Card className={pendingExtra ? "border-attention" : undefined}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-bold">Extra work found: {extra.title}</h2>
              {pendingExtra ? <Pill>Needs your OK</Pill> : <Pill tone="success">Approved</Pill>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{extra.reason}</p>

            {extra.photos?.length ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {extra.photos.map((photo) => (
                  <img
                    key={photo}
                    src={photo}
                    alt="Inspection finding"
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-md border border-border object-cover"
                  />
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold">Added cost</span>
              <span className="text-base font-bold text-attention">
                +{money(Number(extra.price))}
              </span>
            </div>

            {pendingExtra ? (
              <div className="mt-4 space-y-2">
                <BrandButton disabled={busy} onClick={() => void approve()}>
                  {busy ? "Sending…" : `Approve ${money(Number(extra.price))}`}
                </BrandButton>
                <a
                  href={`tel:${workshop.phone.replace(/\s/g, "")}`}
                  className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-md border border-border bg-card text-[15px] font-semibold"
                >
                  <Phone className="h-4 w-4" />
                  Ask a question
                </a>
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <h2 className="text-sm font-semibold">Today's total so far</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {job.line_items.map((item, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="shrink-0 font-medium">{money(item.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold">Total</span>
            <div className="text-right">
              <span className="text-sm font-bold">{money(job.total)}</span>
              <TaxNote taxRate={Number(workshop.tax_rate)} />
            </div>
          </div>
          {pendingExtra ? (
            <p className="mt-2 text-xs text-muted-foreground">
              The extra work above is not included until you approve it.
            </p>
          ) : null}
        </Card>
      </Page>
    </>
  );
}
