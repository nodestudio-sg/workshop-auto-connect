import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  CircleDollarSign,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/app/workshop-ui";
import { Switch } from "@/components/ui/switch";
import {
  adminApproveExtraWork,
  adminCancelExtraWork,
  adminCheckIn,
  adminCompleteJob,
  adminDeleteJob,
  adminListJobs,
  adminReopenJob,
  adminRequestExtraWork,
  adminSaveBill,
  adminSetPaid,
  adminSetStage,
  adminUploadJobPhoto,
} from "@/lib/admin.functions";
import type { AdminJob, BoardVehicle } from "@/lib/admin-jobs.server";
import {
  errorText,
  Field,
  GhostButton,
  inputCls,
  niceDate,
  Panel,
  PrimaryButton,
} from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

/** The stages the customer sees in "My car today", with the workshop's wording. */
const STAGES = [
  { key: "arrived", label: "Arrived" },
  { key: "inspecting", label: "Inspecting" },
  { key: "awaiting_approval", label: "Waiting for OK" },
  { key: "repairing", label: "Repairing" },
  { key: "ready", label: "Ready" },
] as const;
const stageIdx = (s: string) =>
  Math.max(
    0,
    STAGES.findIndex((x) => x.key === s),
  );
const money = (n: number) => `S$${n.toFixed(2)}`;

/** Shrinks a photo to at most 1280 px and returns it as a JPEG data URL. */
async function photoDataUrl(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

type Res<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export function useJobs(workshopId: string) {
  return useQuery({
    queryKey: ["admin", "jobs", workshopId],
    queryFn: async () => {
      const r = await adminListJobs({ data: { id: workshopId } });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    refetchInterval: 30_000,
  });
}

export function BoardTab({ workshopId }: { workshopId: string }) {
  const query = useJobs(workshopId);
  const [checkingIn, setCheckingIn] = useState(false);

  if (query.isLoading)
    return (
      <div className="grid place-items-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (query.error) return <Panel>{errorText(query.error.message)}</Panel>;
  const jobs = query.data?.jobs ?? [];
  const active = jobs.filter((j) => j.is_active);
  const done = jobs.filter((j) => !j.is_active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">In the workshop</h2>
          <p className="text-sm text-muted-foreground">
            Every step you tap here shows up live in the customer's app under "My car today".
          </p>
        </div>
        <PrimaryButton onClick={() => setCheckingIn(true)}>
          <Plus className="h-4 w-4" />
          Check in a car
        </PrimaryButton>
      </div>

      {checkingIn ? (
        <CheckInPanel
          workshopId={workshopId}
          vehicles={query.data?.vehicles ?? []}
          onClose={() => setCheckingIn(false)}
        />
      ) : null}

      {active.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {active.map((j) => (
            <JobCard key={j.id} job={j} workshopId={workshopId} />
          ))}
        </div>
      ) : (
        <Panel className="text-center text-sm text-muted-foreground">
          No cars in the workshop right now. Check one in from a confirmed booking, or with the
          button above.
        </Panel>
      )}

      {done.length ? (
        <div className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight">Recently finished</h2>
          <Panel className="p-0 sm:p-0">
            <ul className="divide-y divide-border/70">
              {done.map((j) => (
                <DoneRow key={j.id} job={j} workshopId={workshopId} />
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function useAct(workshopId: string) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function act<T>(key: string, fn: () => Promise<Res<T>>, ok?: string) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) {
        toast.error(errorText(r.error));
        return null;
      }
      if (ok) toast.success(ok);
      await qc.invalidateQueries({ queryKey: ["admin", "jobs", workshopId] });
      await qc.invalidateQueries({ queryKey: ["admin", "bookings", workshopId] });
      return r.data;
    } catch {
      toast.error(errorText("FAILED"));
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { busy, act };
}

// ---------------------------------------------------------------- check in
function CheckInPanel({
  workshopId,
  vehicles,
  onClose,
}: {
  workshopId: string;
  vehicles: BoardVehicle[];
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<BoardVehicle | null>(null);
  const [title, setTitle] = useState("");
  const [mileage, setMileage] = useState("");
  const { busy, act } = useAct(workshopId);
  const needle = q.trim().toLowerCase().replace(/\s/g, "");
  const list = vehicles
    .filter(
      (v) =>
        !needle ||
        `${v.plate}${v.customer}${v.mobile}${v.name}`
          .toLowerCase()
          .replace(/\s/g, "")
          .includes(needle),
    )
    .slice(0, 8);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    const done = await act(
      "checkin",
      () =>
        adminCheckIn({
          data: {
            id: workshopId,
            input: {
              vehicleId: picked.id,
              title: title.trim() || "Service",
              mileage_km: mileage ? Number(mileage) : null,
              line_items: [],
            },
          },
        }),
      `${picked.plate} checked in.`,
    );
    if (done) onClose();
  }

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Check in a car</h3>
        <button onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      {!picked ? (
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              className={`${inputCls} pl-10`}
              placeholder="Plate, customer name or mobile"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {list.length ? (
            <ul className="divide-y divide-border/70 rounded-2xl border border-border">
              {list.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={v.in_workshop}
                    onClick={() => setPicked(v)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/60 disabled:opacity-50"
                  >
                    <span className="rounded bg-black px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
                      {v.plate}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {v.name} · <span className="text-muted-foreground">{v.customer}</span>
                    </span>
                    {v.in_workshop ? <Pill tone="muted">In workshop</Pill> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No cars found. Customers add their car when they sign up in the app.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
            <span className="rounded bg-black px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
              {picked.plate}
            </span>
            <span className="flex-1 text-sm">
              {picked.name} · {picked.customer}
            </span>
            <button
              type="button"
              className="text-sm font-semibold text-brand"
              onClick={() => setPicked(null)}
            >
              Change
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job">
              <input
                className={inputCls}
                placeholder="e.g. Standard servicing"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Mileage (km)">
              <input
                className={inputCls}
                inputMode="numeric"
                value={mileage}
                onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </div>
          <PrimaryButton type="submit" disabled={busy === "checkin"}>
            {busy === "checkin" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            Check in
          </PrimaryButton>
        </form>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- active job
function JobCard({ job, workshopId }: { job: AdminJob; workshopId: string }) {
  const [mode, setMode] = useState<"idle" | "extra" | "bill" | "finish">("idle");
  const { busy, act } = useAct(workshopId);
  const current = stageIdx(job.status);
  const extra = job.extra_work;
  const waiting = extra && !extra.approved;
  const next = STAGES[current + 1];
  const mobile = job.customer?.mobile ?? "";

  const setStage = (status: string, label: string) =>
    act(
      `stage-${status}`,
      () => adminSetStage({ data: { jobId: job.id, status } }),
      `Now: ${label}`,
    );

  return (
    <Panel className={cn("p-4 sm:p-5", waiting && "border-attention/50")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {job.vehicle ? (
              <span className="rounded bg-black px-1.5 py-0.5 text-xs font-bold tracking-wide text-white">
                {job.vehicle.plate}
              </span>
            ) : null}
            <span className="text-sm font-medium">
              {job.vehicle ? `${job.vehicle.make} ${job.vehicle.model}` : ""}
            </span>
          </div>
          <div className="mt-1.5 text-lg font-bold tracking-tight">{job.title}</div>
          <div className="text-sm text-muted-foreground">
            {job.customer?.name ?? "Customer"} · +65 {mobile}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <a
            href={`https://wa.me/65${mobile}`}
            target="_blank"
            rel="noreferrer"
            className="grid h-9 w-9 place-items-center rounded-full bg-[#25d366] text-white"
            aria-label="WhatsApp customer"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
          <a
            href={`tel:+65${mobile}`}
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card"
            aria-label="Call customer"
          >
            <Phone className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Stage stepper: tap any stage to jump there. */}
      <ol className="mt-4 grid grid-cols-5 gap-1.5">
        {STAGES.map((s, i) => {
          const isDone = i < current;
          const isNow = i === current;
          return (
            <li key={s.key}>
              <button
                type="button"
                disabled={busy !== null || isNow}
                onClick={() => void setStage(s.key, s.label)}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center transition",
                  isNow && "bg-brand-soft",
                  !isNow && "hover:bg-muted/70",
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border text-[11px] font-bold",
                    isDone && "border-brand bg-brand text-white",
                    isNow && "border-attention bg-attention text-white",
                    !isDone && !isNow && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {busy === `stage-${s.key}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-tight",
                    isNow ? "font-bold" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                <span className="h-3 text-[10px] text-muted-foreground">
                  {job.stage_times[s.key] ?? ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {extra ? (
        <div
          className={cn(
            "mt-3 rounded-2xl p-3 text-sm",
            waiting ? "bg-attention/10" : "bg-muted/60",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <b>Extra work: {extra.title}</b>
              {extra.reason ? <p className="mt-0.5 text-muted-foreground">{extra.reason}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              <div className="font-bold">+{money(extra.price)}</div>
              {waiting ? <Pill>Waiting for OK</Pill> : <Pill tone="success">Approved</Pill>}
            </div>
          </div>
          {extra.photos.length ? (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {extra.photos.map((p) => (
                <img
                  key={p}
                  src={p}
                  alt=""
                  className="h-16 w-20 shrink-0 rounded-xl object-cover"
                />
              ))}
            </div>
          ) : null}
          {waiting ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <GhostButton
                disabled={busy !== null}
                onClick={() =>
                  void act(
                    "approve",
                    () => adminApproveExtraWork({ data: { jobId: job.id } }),
                    "Approved. Added to the bill and moved to Repairing.",
                  )
                }
              >
                <Check className="h-4 w-4" />
                They said yes (by phone)
              </GhostButton>
              <GhostButton
                disabled={busy !== null}
                onClick={() =>
                  void act(
                    "cancel-extra",
                    () => adminCancelExtraWork({ data: { jobId: job.id } }),
                    "Extra work withdrawn.",
                  )
                }
              >
                <X className="h-4 w-4" />
                Withdraw
              </GhostButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Bill summary */}
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-border px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">
          {job.line_items.length
            ? `${job.line_items.length} item${job.line_items.length > 1 ? "s" : ""} on the bill`
            : "No items on the bill yet"}
        </span>
        <b>{money(job.total)}</b>
      </div>

      {mode === "extra" ? (
        <ExtraWorkForm job={job} workshopId={workshopId} onDone={() => setMode("idle")} />
      ) : mode === "bill" ? (
        <BillForm job={job} workshopId={workshopId} onDone={() => setMode("idle")} />
      ) : mode === "finish" ? (
        <FinishForm job={job} workshopId={workshopId} onDone={() => setMode("idle")} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {job.status === "ready" ? (
            <PrimaryButton onClick={() => setMode("finish")}>
              <CircleDollarSign className="h-4 w-4" />
              Collected
            </PrimaryButton>
          ) : next && !waiting ? (
            <PrimaryButton
              disabled={busy !== null}
              onClick={() =>
                void setStage(
                  next.key === "awaiting_approval" ? "repairing" : next.key,
                  next.key === "awaiting_approval" ? "Repairing" : next.label,
                )
              }
            >
              {busy?.startsWith("stage") ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Next: {next.key === "awaiting_approval" ? "Repairing" : next.label}
            </PrimaryButton>
          ) : null}
          {!extra || extra.approved ? (
            <GhostButton onClick={() => setMode("extra")}>
              <Camera className="h-4 w-4" />
              Found extra work
            </GhostButton>
          ) : null}
          <GhostButton onClick={() => setMode("bill")}>
            <Pencil className="h-4 w-4" />
            Edit bill
          </GhostButton>
          <GhostButton
            className="text-muted-foreground"
            disabled={busy !== null}
            aria-label="Delete job"
            onClick={() => {
              if (window.confirm(`Delete this job for ${job.vehicle?.plate ?? "this car"}?`))
                void act(
                  "delete",
                  () => adminDeleteJob({ data: { jobId: job.id } }),
                  "Job deleted.",
                );
            }}
          >
            <Trash2 className="h-4 w-4" />
          </GhostButton>
        </div>
      )}
    </Panel>
  );
}

function ExtraWorkForm({
  job,
  workshopId,
  onDone,
}: {
  job: AdminJob;
  workshopId: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { busy, act } = useAct(workshopId);

  async function addPhotos(files: FileList) {
    setUploading(true);
    try {
      for (const f of Array.from(files).slice(0, 6 - photos.length)) {
        const r = await adminUploadJobPhoto({
          data: { jobId: job.id, dataUrl: await photoDataUrl(f) },
        });
        if (!r.ok) {
          toast.error(errorText(r.error));
          break;
        }
        setPhotos((p) => [...p, r.data]);
      }
    } catch {
      toast.error(errorText("INVALID_IMAGE"));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const done = await act(
      "extra",
      () =>
        adminRequestExtraWork({
          data: { jobId: job.id, input: { title, reason, price: Number(price), photos } },
        }),
      "Sent. The customer can approve it in their app.",
    );
    if (done !== null) onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3 rounded-2xl bg-muted/60 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <Field label="What needs doing">
          <input
            className={inputCls}
            required
            placeholder="e.g. Replace front brake pads"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Price (S$)">
          <input
            className={inputCls}
            required
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </Field>
      </div>
      <Field label="Why (the customer reads this)">
        <textarea
          className={`${inputCls} min-h-[70px] py-2.5`}
          maxLength={600}
          placeholder="e.g. Pads are down to 2 mm. We recommend replacing them today."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p) => (
          <div key={p} className="relative">
            <img src={p} alt="" className="h-16 w-20 rounded-xl object-cover" />
            <button
              type="button"
              onClick={() => setPhotos(photos.filter((x) => x !== p))}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void addPhotos(e.target.files);
            e.target.value = "";
          }}
        />
        {photos.length < 6 ? (
          <GhostButton type="button" disabled={uploading} onClick={() => file.current?.click()}>
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Add photos
          </GhostButton>
        ) : null}
      </div>
      <div className="flex gap-2">
        <PrimaryButton type="submit" disabled={busy !== null || uploading}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Ask customer to approve
        </PrimaryButton>
        <GhostButton type="button" onClick={onDone}>
          Cancel
        </GhostButton>
      </div>
    </form>
  );
}

function BillForm({
  job,
  workshopId,
  onDone,
}: {
  job: AdminJob;
  workshopId: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(job.title);
  const [mileage, setMileage] = useState(job.mileage_km != null ? String(job.mileage_km) : "");
  const [items, setItems] = useState(
    job.line_items.length
      ? job.line_items.map((i) => ({ label: i.label, amount: String(i.amount) }))
      : [{ label: "", amount: "" }],
  );
  const { busy, act } = useAct(workshopId);
  const total = items.reduce((n, i) => n + (Number(i.amount) || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const done = await act(
      "bill",
      () =>
        adminSaveBill({
          data: {
            jobId: job.id,
            input: {
              title,
              mileage_km: mileage ? Number(mileage) : null,
              line_items: items
                .filter((i) => i.label.trim())
                .map((i) => ({ label: i.label, amount: Number(i.amount) || 0 })),
            },
          },
        }),
      "Bill saved. The customer sees the new total.",
    );
    if (done !== null) onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3 rounded-2xl bg-muted/60 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Job">
          <input
            className={inputCls}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Mileage (km)">
          <input
            className={inputCls}
            inputMode="numeric"
            value={mileage}
            onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
      <div className="space-y-2">
        {items.map((it, k) => (
          <div key={k} className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Item, e.g. Engine oil 5W-30 (4 L)"
              value={it.label}
              onChange={(e) =>
                setItems(items.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))
              }
            />
            <input
              className={`${inputCls} w-28`}
              placeholder="S$"
              inputMode="decimal"
              value={it.amount}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    j === k ? { ...x, amount: e.target.value.replace(/[^\d.]/g, "") } : x,
                  ),
                )
              }
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== k))}
              className="grid w-10 shrink-0 place-items-center text-muted-foreground hover:text-destructive"
              aria-label="Remove item"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <GhostButton type="button" onClick={() => setItems([...items, { label: "", amount: "" }])}>
          <Plus className="h-4 w-4" />
          Add item
        </GhostButton>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold">Total</span>
        <b>{money(total)}</b>
      </div>
      <div className="flex gap-2">
        <PrimaryButton type="submit" disabled={busy !== null}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save bill
        </PrimaryButton>
        <GhostButton type="button" onClick={onDone}>
          Cancel
        </GhostButton>
      </div>
    </form>
  );
}

function FinishForm({
  job,
  workshopId,
  onDone,
}: {
  job: AdminJob;
  workshopId: string;
  onDone: () => void;
}) {
  const inSixMonths = new Date(Date.now() + 182 * 864e5).toISOString().slice(0, 10);
  const km = job.mileage_km ?? job.vehicle?.mileage_km ?? null;
  const [paid, setPaid] = useState(true);
  const [dueDate, setDueDate] = useState(inSixMonths);
  const [dueKm, setDueKm] = useState(
    km != null ? String(Math.round((km + 10000) / 100) * 100) : "",
  );
  const { busy, act } = useAct(workshopId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const done = await act(
      "finish",
      () =>
        adminCompleteJob({
          data: {
            jobId: job.id,
            input: {
              paid,
              next_service_due_date: dueDate || null,
              next_service_due_km: dueKm ? Number(dueKm) : null,
            },
          },
        }),
      "Done. The invoice is in the customer's service history.",
    );
    if (done !== null) onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3 rounded-2xl bg-muted/60 p-3">
      <label className="flex items-center justify-between gap-4 rounded-2xl bg-card px-4 py-3">
        <span>
          <b className="block text-sm">Paid {money(job.total)}</b>
          <span className="text-xs text-muted-foreground">
            Turn off if they'll pay later. The app shows it as unpaid.
          </span>
        </span>
        <Switch checked={paid} onCheckedChange={setPaid} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Next service due">
          <input
            type="date"
            className={inputCls}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
        <Field label="or at (km)">
          <input
            className={inputCls}
            inputMode="numeric"
            value={dueKm}
            onChange={(e) => setDueKm(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <PrimaryButton type="submit" disabled={busy !== null}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Close job & send invoice
        </PrimaryButton>
        <GhostButton type="button" onClick={onDone}>
          Cancel
        </GhostButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- finished
function DoneRow({ job, workshopId }: { job: AdminJob; workshopId: string }) {
  const { busy, act } = useAct(workshopId);
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div className="w-24 shrink-0 text-sm text-muted-foreground">
        {niceDate(job.service_date)}
      </div>
      {job.vehicle ? (
        <span className="rounded bg-black px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
          {job.vehicle.plate}
        </span>
      ) : null}
      <div className="min-w-[140px] flex-1 text-sm">
        <b>{job.title}</b>
        <span className="text-muted-foreground">
          {" "}
          · {job.customer?.name ?? ""}
          {job.invoice_no ? ` · ${job.invoice_no}` : ""}
        </span>
      </div>
      <b className="text-sm">{money(job.total)}</b>
      <button
        disabled={busy !== null}
        onClick={() =>
          void act(
            "paid",
            () => adminSetPaid({ data: { jobId: job.id, paid: !job.paid } }),
            job.paid ? "Marked unpaid." : "Marked paid.",
          )
        }
        title="Tap to change"
      >
        {job.paid ? <Pill tone="success">Paid</Pill> : <Pill>Unpaid</Pill>}
      </button>
      <GhostButton
        className="min-h-[34px] px-3"
        disabled={busy !== null}
        aria-label="Reopen job"
        title="Reopen"
        onClick={() =>
          void act("reopen", () => adminReopenJob({ data: { jobId: job.id } }), "Job reopened.")
        }
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </GhostButton>
    </li>
  );
}
