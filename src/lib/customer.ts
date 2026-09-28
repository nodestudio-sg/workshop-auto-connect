import { supabase } from "@/integrations/supabase/client";

export type LineItem = { label: string; amount: number };

export type ExtraWork = {
  title: string;
  reason: string;
  price: number;
  approved: boolean;
  photos: string[];
};

export type Customer = { id: string; name: string; mobile: string; workshop_id: string };

export type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  mileage_km: number;
  oil_grade: string | null;
  oil_litres: number | null;
  oil_filter: string | null;
  next_service_due_date: string | null;
  next_service_due_km: number | null;
};

export type Job = {
  id: string;
  title: string;
  status: string;
  is_active: boolean;
  service_date: string;
  mileage_km: number | null;
  line_items: LineItem[];
  photos: string[];
  stage_times: Record<string, string>;
  extra_work: ExtraWork | null;
  total: number;
  paid: boolean;
  invoice_no: string | null;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  components: LineItem[];
  price: number;
  quote_after_inspection: boolean;
};

export type Slot = { slot_date: string; slot_time: string; available: boolean };

export async function fetchCustomer(slug: string): Promise<Customer | null> {
  const { data } = await supabase
    .from("customers")
    .select("id, name, mobile, workshop_id, workshops!inner(slug)")
    .eq("workshops.slug", slug)
    .maybeSingle();
  if (!data) return null;
  const { id, name, mobile, workshop_id } = data as unknown as Customer;
  return { id, name, mobile, workshop_id };
}

export async function fetchVehicle(customerId: string): Promise<Vehicle | null> {
  const { data } = await supabase
    .from("vehicles")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as unknown as Vehicle) ?? null;
}

/** All of the customer's cars at this workshop, oldest first. */
export async function fetchVehicles(customerId: string): Promise<Vehicle[]> {
  const { data } = await supabase
    .from("vehicles")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as Vehicle[];
}

export class VehicleError extends Error {
  constructor(
    readonly reason:
      "plate-taken" | "invalid-plate" | "invalid" | "too-many" | "unavailable" | "failed",
  ) {
    super(reason);
  }
}

/** Adds a car to the signed-in customer's record at this workshop. */
export async function addVehicle(input: {
  workshopId: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  mileageKm: number | null;
}): Promise<string> {
  // Not in the generated types until Lovable regenerates them after 0003.
  // Called through the client (not detached) so it keeps its `this`.
  const rpc = (fn: string, args: Record<string, unknown>) =>
    supabase.rpc(fn as never, args as never) as unknown as Promise<{
      data: unknown;
      error: { code?: string; message: string } | null;
    }>;
  const { data, error } = await rpc("add_vehicle", {
    _workshop_id: input.workshopId,
    _plate: input.plate,
    _make: input.make,
    _model: input.model,
    _year: input.year,
    _mileage_km: input.mileageKm,
  });
  if (!error && typeof data === "string") return data;
  const message = error?.message ?? "";
  if (error?.code === "PGRST202") throw new VehicleError("unavailable");
  if (message.includes("PLATE_TAKEN")) throw new VehicleError("plate-taken");
  if (message.includes("INVALID_PLATE")) throw new VehicleError("invalid-plate");
  if (message.includes("TOO_MANY_VEHICLES")) throw new VehicleError("too-many");
  if (message.includes("INVALID_VEHICLE")) throw new VehicleError("invalid");
  throw new VehicleError("failed");
}

export async function fetchJobs(vehicleId: string): Promise<Job[]> {
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });
  return ((data ?? []) as unknown as Job[]).map(normaliseJob);
}

export async function fetchActiveJob(vehicleId: string): Promise<Job | null> {
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .eq("is_active", true)
    .maybeSingle();
  return data ? normaliseJob(data as unknown as Job) : null;
}

function normaliseJob(job: Job): Job {
  return {
    ...job,
    line_items: (job.line_items ?? []) as LineItem[],
    photos: (job.photos ?? []) as string[],
    stage_times: (job.stage_times ?? {}) as Record<string, string>,
    extra_work: (job.extra_work ?? null) as ExtraWork | null,
    total: Number(job.total),
  };
}

export async function fetchServices(workshopId: string): Promise<Service[]> {
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("workshop_id", workshopId)
    .order("sort_order", { ascending: true });
  return ((data ?? []) as unknown as Service[]).map((service) => ({
    ...service,
    price: Number(service.price),
    components: (service.components ?? []) as LineItem[],
  }));
}

/**
 * Bookable times. From migration 0004 these come from the workshop's opening
 * days, slot times and capacity, so they never run out; before it, from the
 * workshop_slots rows.
 */
export async function fetchSlots(workshopId: string): Promise<Slot[]> {
  const generated = await (supabase.rpc(
    "available_slots" as never,
    { _workshop_id: workshopId } as never,
  ) as unknown as Promise<{ data: Slot[] | null; error: { code?: string } | null }>);
  if (!generated.error) return generated.data ?? [];

  const { data } = await supabase
    .from("workshop_slots")
    .select("slot_date, slot_time, available")
    .eq("workshop_id", workshopId)
    .gte("slot_date", new Date().toISOString().slice(0, 10))
    .order("slot_date", { ascending: true })
    .order("slot_time", { ascending: true });
  return (data ?? []) as Slot[];
}

export async function approveExtraWork(jobId: string): Promise<void> {
  const { error } = await supabase.rpc("approve_extra_work", { _job_id: jobId });
  if (error) throw error;
}
