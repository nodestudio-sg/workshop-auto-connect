import { supabase } from "@/integrations/supabase/client";
import { notifyNewBooking } from "@/lib/admin.functions";
import type { Service } from "@/lib/customer";

export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled";

/** A booking request's status. Anything unrecognised reads as not confirmed. */
export function bookingStatus(value: unknown): BookingStatus {
  return value === "confirmed" || value === "declined" || value === "cancelled"
    ? value
    : "requested";
}

export type BookingSummary = {
  id: string;
  vehicleId: string;
  status: BookingStatus;
  preferredDate: string;
  preferredTime: string;
  confirmedDate: string | null;
  confirmedTime: string | null;
  serviceNames: string[];
  total: number;
  createdAt: string;
};

/** The customer's booking requests at this workshop, newest first. */
export async function fetchBookings(workshopId: string): Promise<BookingSummary[]> {
  const { data } = await supabase
    .from("booking_requests")
    .select("*")
    .eq("workshop_id", workshopId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const snapshot = Array.isArray(row["price_snapshot"])
      ? (row["price_snapshot"] as { name?: unknown }[])
      : [];
    return {
      id: String(row["id"]),
      vehicleId: String(row["vehicle_id"]),
      status: bookingStatus(row["status"]),
      preferredDate: String(row["preferred_date"]),
      preferredTime: String(row["preferred_time"]),
      confirmedDate: typeof row["confirmed_date"] === "string" ? row["confirmed_date"] : null,
      confirmedTime: typeof row["confirmed_time"] === "string" ? row["confirmed_time"] : null,
      serviceNames: snapshot.map((item) => String(item.name ?? "Service")),
      total: Number(row["estimate_total"] ?? 0),
      createdAt: String(row["created_at"]),
    };
  });
}

/** Still ahead: requested or confirmed, and not in the past. */
export function isUpcoming(booking: BookingSummary, today: string): boolean {
  if (booking.status !== "requested" && booking.status !== "confirmed") return false;
  const date = booking.status === "confirmed" ? booking.confirmedDate : booking.preferredDate;
  return Boolean(date && date >= today);
}

export class PricesChangedError extends Error {
  constructor() {
    super("PRICES_CHANGED");
  }
}

export class SlotUnavailableError extends Error {
  constructor() {
    super("SLOT_UNAVAILABLE");
  }
}

/** Cancels the customer's own upcoming request or confirmed booking. */
export async function cancelBookingRequest(bookingId: string): Promise<void> {
  const { error } = await (supabase.rpc(
    "cancel_booking_request" as never,
    { _booking_id: bookingId } as never,
  ) as unknown as Promise<{ error: { code?: string; message: string } | null }>);
  if (error) throw error;
}

type SubmitInput = {
  workshopId: string;
  customerId: string;
  vehicleId: string;
  services: Service[];
  shownTotal: number;
  preferredDate: string;
  preferredTime: string;
  idempotencyKey: string;
  notes: string;
};

/**
 * Submits a booking request and returns its id.
 *
 * The database rebuilds the line items from the real service prices and
 * refuses the request (PricesChangedError) if they no longer match the total
 * the customer was shown. Retrying with the same idempotency key returns the
 * original request rather than creating a second one.
 */
export async function submitBookingRequest(input: SubmitInput): Promise<string> {
  const shownTotalCents = Math.round(input.shownTotal * 100);

  // Not in the generated types until Lovable regenerates them after 0002.
  // Called through the client (not detached) so it keeps its `this`.
  const rpc = (fn: string, args: Record<string, unknown>) =>
    supabase.rpc(fn as never, args as never) as unknown as Promise<{
      data: unknown;
      error: { code?: string; message: string } | null;
    }>;

  const args = {
    _workshop_id: input.workshopId,
    _customer_id: input.customerId,
    _vehicle_id: input.vehicleId,
    _service_ids: input.services.map((service) => service.id),
    _shown_total_cents: shownTotalCents,
    _preferred_date: input.preferredDate,
    _preferred_time: input.preferredTime,
    _idempotency_key: input.idempotencyKey,
  };
  // With notes needs migration 0003; without, 0002. PGRST202 means that
  // version of the function doesn't exist yet, so step down a version.
  let { data, error } = await rpc("submit_booking_request", { ...args, _notes: input.notes });
  if (error?.code === "PGRST202") {
    ({ data, error } = await rpc("submit_booking_request", args));
  }

  if (!error && typeof data === "string") return alertWorkshop(data);
  if (error?.message.includes("PRICES_CHANGED")) throw new PricesChangedError();
  if (error?.message.includes("SLOT_UNAVAILABLE")) throw new SlotUnavailableError();
  // PGRST202: the function doesn't exist yet because migration 0002 hasn't
  // run. Fall back to the original direct insert.
  if (error?.code !== "PGRST202") throw error ?? new Error("No booking id returned");

  const { data: inserted, error: insertError } = await supabase
    .from("booking_requests")
    .insert({
      workshop_id: input.workshopId,
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      service_ids: input.services.map((service) => service.id),
      price_snapshot: input.services.map((service) => ({
        name: service.name,
        price: service.price,
        quote_after_inspection: service.quote_after_inspection,
        components: service.components,
      })),
      estimate_total: input.shownTotal,
      preferred_date: input.preferredDate,
      preferred_time: input.preferredTime,
      status: "requested",
    })
    .select("id")
    .single();
  if (insertError?.message.includes("PRICES_CHANGED")) throw new PricesChangedError();
  if (insertError?.message.includes("SLOT_UNAVAILABLE")) throw new SlotUnavailableError();
  if (insertError || !inserted) throw insertError ?? new Error("No booking id returned");
  return alertWorkshop(inserted.id);
}

/** WhatsApp the workshop about the new booking (best-effort, never blocks). */
function alertWorkshop(bookingId: string): string {
  void notifyNewBooking({ data: { bookingId } }).catch(() => {});
  return bookingId;
}
