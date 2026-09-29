import { useState } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { CalendarClock, Check, Loader2, MessageCircle, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/app/workshop-ui";
import { adminConfirmBooking, adminDeclineBooking } from "@/lib/admin.functions";
import type { AdminBooking } from "@/lib/admin.server";
import {
  errorText,
  GhostButton,
  inputCls,
  niceDate,
  Panel,
  PrimaryButton,
} from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";

type Filter = "reply" | "upcoming" | "past" | "all";

export function BookingsTab({
  workshopId,
  query,
}: {
  workshopId: string;
  query: UseQueryResult<AdminBooking[]>;
}) {
  const [filter, setFilter] = useState<Filter>("reply");
  const all = query.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const when = (b: AdminBooking) => b.confirmed_date ?? b.preferred_date;
  const groups: Record<Filter, AdminBooking[]> = {
    reply: all
      .filter((b) => b.status === "requested")
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    upcoming: all
      .filter((b) => b.status === "confirmed" && when(b) >= today)
      .sort((a, b) =>
        `${when(a)}${a.confirmed_time}`.localeCompare(`${when(b)}${b.confirmed_time}`),
      ),
    past: all.filter(
      (b) => !(b.status === "requested") && !(b.status === "confirmed" && when(b) >= today),
    ),
    all,
  };
  const labels: Record<Filter, string> = {
    reply: "Needs a reply",
    upcoming: "Upcoming",
    past: "Past & closed",
    all: "All",
  };

  if (query.isLoading)
    return (
      <div className="grid place-items-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (query.error) return <Panel>{errorText(query.error.message)}</Panel>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(labels) as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold transition",
              filter === f
                ? "border-brand bg-brand text-white"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[f]} <span className="opacity-70">{groups[f].length}</span>
          </button>
        ))}
      </div>
      {groups[filter].length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups[filter].map((b) => (
            <BookingCard key={b.id} b={b} workshopId={workshopId} />
          ))}
        </div>
      ) : (
        <Panel className="text-center text-sm text-muted-foreground">
          {filter === "reply"
            ? "All caught up. New booking requests will appear here."
            : "Nothing here yet."}
        </Panel>
      )}
    </div>
  );
}

function BookingCard({ b, workshopId }: { b: AdminBooking; workshopId: string }) {
  const [mode, setMode] = useState<"idle" | "move" | "decline">("idle");
  const [date, setDate] = useState(b.confirmed_date ?? b.preferred_date);
  const [time, setTime] = useState(b.confirmed_time ?? b.preferred_time);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function act(kind: "confirm" | "move" | "decline") {
    setBusy(true);
    const res =
      kind === "decline"
        ? await adminDeclineBooking({ data: { bookingId: b.id, message } })
        : await adminConfirmBooking({
            data: { bookingId: b.id, ...(kind === "move" ? { date, time, message } : {}) },
          });
    setBusy(false);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    toast.success(
      kind === "decline"
        ? "Declined. The customer can see your note."
        : "Confirmed. The customer sees it in their app.",
    );
    setMode("idle");
    await qc.invalidateQueries({ queryKey: ["admin", "bookings", workshopId] });
    await qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  }

  const tone =
    b.status === "requested" ? "attention" : b.status === "confirmed" ? "success" : "muted";
  const statusLabel =
    {
      requested: "Needs a reply",
      confirmed: "Confirmed",
      declined: "Declined",
      cancelled: "Cancelled",
    }[b.status] ?? b.status;
  const shownDate = b.confirmed_date ?? b.preferred_date,
    shownTime = b.confirmed_time ?? b.preferred_time;
  const mobile = b.customer?.mobile ?? "";

  return (
    <Panel className={cn("p-4 sm:p-5", b.status === "requested" && "border-attention/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Pill tone={tone}>{statusLabel}</Pill>
            <span className="text-xs text-muted-foreground">
              sent{" "}
              {new Date(b.created_at).toLocaleString("en-SG", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="mt-2 text-lg font-bold tracking-tight">
            {niceDate(shownDate)} · {shownTime}
          </div>
          {b.status === "confirmed" &&
          (b.confirmed_date !== b.preferred_date || b.confirmed_time !== b.preferred_time) ? (
            <div className="text-xs text-muted-foreground">
              Asked for {niceDate(b.preferred_date)} · {b.preferred_time}
            </div>
          ) : null}
        </div>
        {b.total != null ? (
          <div className="text-right">
            <div className="text-lg font-bold">S${b.total.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">estimate</div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-2xl bg-muted/60 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <b>{b.customer?.name ?? "Customer"}</b>{" "}
            <span className="text-muted-foreground">+65 {mobile}</span>
          </div>
          <div className="flex gap-1.5">
            <a
              href={`https://wa.me/65${mobile}`}
              target="_blank"
              rel="noreferrer"
              className="grid h-8 w-8 place-items-center rounded-full bg-[#25d366] text-white"
              aria-label="WhatsApp customer"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <a
              href={`tel:+65${mobile}`}
              className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card"
              aria-label="Call customer"
            >
              <Phone className="h-4 w-4" />
            </a>
          </div>
        </div>
        {b.vehicle ? (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded bg-black px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
              {b.vehicle.plate}
            </span>
            {b.vehicle.make} {b.vehicle.model}
          </div>
        ) : null}
        <div className="mt-1.5 text-muted-foreground">
          {b.services.join(" · ") || "No services listed"}
        </div>
        {b.notes ? <div className="mt-1.5">“{b.notes}”</div> : null}
        {b.workshop_message ? (
          <div className="mt-1.5 text-muted-foreground">Your note: {b.workshop_message}</div>
        ) : null}
      </div>

      {mode === "move" || mode === "decline" ? (
        <div className="mt-3 space-y-2">
          {mode === "move" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <input
                type="time"
                className={inputCls}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          ) : null}
          <textarea
            className={cn(inputCls, "min-h-[70px] py-2.5")}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              mode === "decline"
                ? "Optional: e.g. We're fully booked that day. Could you do Saturday?"
                : "Optional note to the customer"
            }
          />
          <div className="flex gap-2">
            <PrimaryButton
              disabled={busy}
              onClick={() => void act(mode)}
              className={mode === "decline" ? "bg-destructive" : ""}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "decline" ? "Decline booking" : "Confirm this time"}
            </PrimaryButton>
            <GhostButton onClick={() => setMode("idle")}>Back</GhostButton>
          </div>
        </div>
      ) : b.status === "requested" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <PrimaryButton disabled={busy} onClick={() => void act("confirm")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirm
          </PrimaryButton>
          <GhostButton onClick={() => setMode("move")}>
            <CalendarClock className="h-4 w-4" />
            Other time
          </GhostButton>
          <GhostButton onClick={() => setMode("decline")}>
            <X className="h-4 w-4" />
            Decline
          </GhostButton>
        </div>
      ) : b.status === "confirmed" ? (
        <div className="mt-3">
          <GhostButton onClick={() => setMode("move")}>
            <CalendarClock className="h-4 w-4" />
            Change time
          </GhostButton>
        </div>
      ) : null}
    </Panel>
  );
}
