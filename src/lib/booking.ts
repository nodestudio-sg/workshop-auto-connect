import { supabase } from "@/integrations/supabase/client";
import type { Service } from "@/lib/customer";

export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled";

/** A booking request's status. Anything unrecognised reads as not confirmed. */
export function bookingStatus(value: unknown): BookingStatus {
  return value === "confirmed" || value === "declined" || value === "cancelled"
    ? value
    : "requested";
}

export class PricesChangedError extends Error {
  constructor() {
    super("PRICES_CHANGED");
  }
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
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

  const { data, error } = await rpc("submit_booking_request", {
    _workshop_id: input.workshopId,
    _customer_id: input.customerId,
    _vehicle_id: input.vehicleId,
    _service_ids: input.services.map((service) => service.id),
    _shown_total_cents: shownTotalCents,
    _preferred_date: input.preferredDate,
    _preferred_time: input.preferredTime,
    _idempotency_key: input.idempotencyKey,
  });

  if (!error && typeof data === "string") return data;
  if (error?.message.includes("PRICES_CHANGED")) throw new PricesChangedError();
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
  if (insertError || !inserted) throw insertError ?? new Error("No booking id returned");
  return inserted.id;
}
