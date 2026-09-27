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

export async function fetchSlots(workshopId: string): Promise<Slot[]> {
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
