/**
 * Workshop board, server side: check cars in, move them through the stages
 * the customer app's "My car today" screen shows, ask for approval of extra
 * work, keep the bill, and close the job with an invoice.
 * Until the Node Studio workshop system is connected, this is what feeds the
 * customer app's tracking, history and invoices.
 * Server-only: loaded inside handlers in admin.functions.ts.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  AdminError,
  bookingInWorkshop,
  db,
  postAlert,
  requireWorkshop,
  type ServiceItem,
} from "@/lib/admin.server";

/** Stages the customer app shows, in order; "collected" closes the job. */
export const JOB_STAGES = ["arrived", "inspecting", "awaiting_approval", "repairing", "ready"];
export type JobStatus = (typeof JOB_STAGES)[number] | "collected";

export type AdminJob = {
  id: string;
  title: string;
  status: string;
  is_active: boolean;
  service_date: string;
  mileage_km: number | null;
  line_items: ServiceItem[];
  stage_times: Record<string, string>;
  extra_work: {
    title: string;
    reason: string;
    price: number;
    approved: boolean;
    photos: string[];
  } | null;
  total: number;
  paid: boolean;
  invoice_no: string | null;
  booking_id: string | null;
  created_at: string;
  customer: { id: string; name: string; mobile: string } | null;
  vehicle: {
    id: string;
    plate: string;
    make: string;
    model: string;
    mileage_km: number | null;
    next_service_due_date: string | null;
    next_service_due_km: number | null;
  } | null;
};

export type BoardVehicle = {
  id: string;
  plate: string;
  name: string;
  customer: string;
  mobile: string;
  in_workshop: boolean;
};

const sgTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
const sgDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

function cleanItems(items: ServiceItem[]): ServiceItem[] {
  if (!Array.isArray(items) || items.length > 40) throw new AdminError("INVALID_PRICE");
  return items
    .map((i) => ({
      label: String(i.label ?? "")
        .trim()
        .slice(0, 120),
      amount: Number(i.amount),
    }))
    .filter((i) => i.label)
    .map((i) => {
      if (!Number.isFinite(i.amount) || i.amount < 0 || i.amount > 100000)
        throw new AdminError("INVALID_PRICE");
      return { label: i.label, amount: Math.round(i.amount * 100) / 100 };
    });
}
const sum = (items: ServiceItem[]) =>
  Math.round(items.reduce((n, i) => n + i.amount, 0) * 100) / 100;

async function jobRow(jobId: string) {
  const { data } = await db().from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (!data) throw new AdminError("NOT_FOUND");
  return data as Record<string, unknown>;
}
/** Loads a job and checks the caller runs its workshop. */
async function ownedJob(userId: string, jobId: string) {
  const job = await jobRow(jobId);
  await requireWorkshop(userId, String(job["workshop_id"]));
  return job;
}

// ---------------------------------------------------------------- read
export async function listJobs(
  userId: string,
  workshopId: string,
): Promise<{ jobs: AdminJob[]; vehicles: BoardVehicle[] }> {
  await requireWorkshop(userId, workshopId);
  const [active, done, vs, cs] = await Promise.all([
    db()
      .from("jobs")
      .select("*")
      .eq("workshop_id", workshopId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    db()
      .from("jobs")
      .select("*")
      .eq("workshop_id", workshopId)
      .eq("is_active", false)
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
    db()
      .from("vehicles")
      .select(
        "id, customer_id, plate, make, model, mileage_km, next_service_due_date, next_service_due_km",
      )
      .eq("workshop_id", workshopId),
    db().from("customers").select("id, name, mobile").eq("workshop_id", workshopId),
  ]);
  if (active.error || done.error) throw new AdminError("FAILED");
  const vehicles = (vs.data ?? []) as Record<string, unknown>[];
  const customers = new Map(
    ((cs.data ?? []) as { id: string; name: string; mobile: string }[]).map((c) => [c.id, c]),
  );
  const vMap = new Map(vehicles.map((v) => [String(v["id"]), v]));
  const rows = [...(active.data ?? []), ...(done.data ?? [])] as Record<string, unknown>[];
  const busy = new Set(
    ((active.data ?? []) as Record<string, unknown>[]).map((j) => String(j["vehicle_id"])),
  );

  const jobs = rows.map((r): AdminJob => {
    const v = vMap.get(String(r["vehicle_id"]));
    const c = v ? customers.get(String(v["customer_id"])) : undefined;
    const extra = r["extra_work"] as AdminJob["extra_work"];
    return {
      id: String(r["id"]),
      title: String(r["title"]),
      status: String(r["status"]),
      is_active: Boolean(r["is_active"]),
      service_date: String(r["service_date"]),
      mileage_km: (r["mileage_km"] as number | null) ?? null,
      line_items: ((r["line_items"] as ServiceItem[] | null) ?? []).map((i) => ({
        label: String(i.label),
        amount: Number(i.amount),
      })),
      stage_times: (r["stage_times"] as Record<string, string> | null) ?? {},
      extra_work: extra
        ? {
            title: String(extra.title ?? ""),
            reason: String(extra.reason ?? ""),
            price: Number(extra.price ?? 0),
            approved: Boolean(extra.approved),
            photos: Array.isArray(extra.photos) ? extra.photos.map(String) : [],
          }
        : null,
      total: Number(r["total"] ?? 0),
      paid: Boolean(r["paid"]),
      invoice_no: (r["invoice_no"] as string | null) ?? null,
      booking_id: (r["booking_id"] as string | null) ?? null,
      created_at: String(r["created_at"]),
      customer: c ? { id: c.id, name: c.name, mobile: c.mobile } : null,
      vehicle: v
        ? {
            id: String(v["id"]),
            plate: String(v["plate"]),
            make: String(v["make"]),
            model: String(v["model"]),
            mileage_km: (v["mileage_km"] as number | null) ?? null,
            next_service_due_date: (v["next_service_due_date"] as string | null) ?? null,
            next_service_due_km: (v["next_service_due_km"] as number | null) ?? null,
          }
        : null,
    };
  });

  return {
    jobs,
    vehicles: vehicles
      .map((v) => {
        const c = customers.get(String(v["customer_id"]));
        return {
          id: String(v["id"]),
          plate: String(v["plate"]),
          name: `${String(v["make"])} ${String(v["model"])}`.trim(),
          customer: c?.name ?? "",
          mobile: c?.mobile ?? "",
          in_workshop: busy.has(String(v["id"])),
        };
      })
      .sort((a, b) => a.plate.localeCompare(b.plate)),
  };
}

// ---------------------------------------------------------------- check in
export type CheckInInput = {
  vehicleId?: string;
  bookingId?: string;
  title?: string;
  mileage_km?: number | null;
  line_items?: ServiceItem[];
};

/** Checks a car in, from a booking or picked by plate. Returns the job id. */
export async function checkIn(userId: string, workshopId: string, input: CheckInInput) {
  await requireWorkshop(userId, workshopId);
  let vehicleId = input.vehicleId ?? "";
  let title = (input.title ?? "").trim();
  let items = input.line_items ? cleanItems(input.line_items) : [];

  if (input.bookingId) {
    const b = await bookingInWorkshop(input.bookingId);
    if (String(b["workshop_id"]) !== workshopId) throw new AdminError("NOT_FOUND");
    if (!["requested", "confirmed"].includes(String(b["status"]))) throw new AdminError("NOT_OPEN");
    const already = await db().from("jobs").select("id").eq("booking_id", input.bookingId).limit(1);
    if ((already.data ?? []).length) throw new AdminError("ALREADY_CHECKED_IN");
    vehicleId = String(b["vehicle_id"]);
    const snap = (b["price_snapshot"] as { name?: string; price?: number }[] | null) ?? [];
    if (!title)
      title = snap
        .map((s) => s.name)
        .filter(Boolean)
        .join(" + ");
    if (!input.line_items)
      items = snap
        .filter((s) => s.name)
        .map((s) => ({ label: String(s.name), amount: Number(s.price ?? 0) }));
  }

  const v = await db()
    .from("vehicles")
    .select("id, workshop_id, mileage_km")
    .eq("id", vehicleId)
    .maybeSingle();
  const vehicle = v.data as { id: string; workshop_id: string; mileage_km: number | null } | null;
  if (!vehicle || vehicle.workshop_id !== workshopId) throw new AdminError("NOT_FOUND");
  const open = await db()
    .from("jobs")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .eq("is_active", true)
    .limit(1);
  if ((open.data ?? []).length) throw new AdminError("ALREADY_CHECKED_IN");

  const mileage =
    input.mileage_km != null && Number.isFinite(Number(input.mileage_km))
      ? Math.max(0, Math.round(Number(input.mileage_km)))
      : vehicle.mileage_km;
  const { data, error } = await db()
    .from("jobs")
    .insert({
      workshop_id: workshopId,
      vehicle_id: vehicleId,
      booking_id: input.bookingId ?? null,
      title: (title || "Service").slice(0, 120),
      status: "arrived",
      is_active: true,
      service_date: sgDate(),
      mileage_km: mileage,
      line_items: items,
      total: sum(items),
      stage_times: { arrived: sgTime() },
      photos: [],
    })
    .select("id")
    .single();
  if (error?.message.includes("booking_id")) throw new AdminError("NOT_SET_UP");
  if (error || !data) throw new AdminError("FAILED");
  if (mileage != null && mileage > (vehicle.mileage_km ?? 0))
    await db().from("vehicles").update({ mileage_km: mileage }).eq("id", vehicleId);
  return String((data as { id: string }).id);
}

// ---------------------------------------------------------------- progress
/** Moves a job to a stage. Later stages' times are cleared so the timeline stays in order. */
export async function setStage(userId: string, jobId: string, status: string) {
  const job = await ownedJob(userId, jobId);
  const idx = JOB_STAGES.indexOf(status);
  if (idx === -1) throw new AdminError("INVALID_STAGE");
  if (!job["is_active"]) throw new AdminError("NOT_OPEN");
  const times = { ...((job["stage_times"] as Record<string, string> | null) ?? {}) };
  for (const later of JOB_STAGES.slice(idx + 1)) delete times[later];
  if (String(job["status"]) !== status || !times[status]) times[status] = sgTime();
  const { error } = await db().from("jobs").update({ status, stage_times: times }).eq("id", jobId);
  if (error) throw new AdminError("FAILED");
  if (status === "ready" && String(job["status"]) !== "ready")
    await alertCustomer("car_ready", jobId);
}

export async function saveBill(
  userId: string,
  jobId: string,
  input: { title: string; mileage_km: number | null; line_items: ServiceItem[] },
) {
  await ownedJob(userId, jobId);
  const items = cleanItems(input.line_items);
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new AdminError("INVALID_NAME");
  const mileage =
    input.mileage_km != null && Number.isFinite(Number(input.mileage_km))
      ? Math.max(0, Math.round(Number(input.mileage_km)))
      : null;
  const { error } = await db()
    .from("jobs")
    .update({ title, mileage_km: mileage, line_items: items, total: sum(items) })
    .eq("id", jobId);
  if (error) throw new AdminError("FAILED");
}

/** Asks the customer to approve extra work; the job waits for their OK. */
export async function requestExtraWork(
  userId: string,
  jobId: string,
  input: { title: string; reason: string; price: number; photos: string[] },
) {
  const job = await ownedJob(userId, jobId);
  if (!job["is_active"]) throw new AdminError("NOT_OPEN");
  const title = input.title.trim().slice(0, 120);
  const reason = input.reason.trim().slice(0, 600);
  const price = Math.round(Number(input.price) * 100) / 100;
  if (!title) throw new AdminError("INVALID_NAME");
  if (!Number.isFinite(price) || price <= 0 || price > 100000)
    throw new AdminError("INVALID_PRICE");
  const prefix = `${String(job["workshop_id"])}/${jobId}/`;
  const photos = (input.photos ?? [])
    .map(String)
    .filter((u) => u.includes(`/job-photos/${prefix}`))
    .slice(0, 6);
  const times = { ...((job["stage_times"] as Record<string, string> | null) ?? {}) };
  delete times["repairing"];
  delete times["ready"];
  times["awaiting_approval"] = sgTime();
  const { error } = await db()
    .from("jobs")
    .update({
      extra_work: { title, reason, price, approved: false, photos },
      status: "awaiting_approval",
      stage_times: times,
    })
    .eq("id", jobId);
  if (error) throw new AdminError("FAILED");
  await alertCustomer("extra_work", jobId);
}

/**
 * Records the customer's OK given in person or by phone: same effect as them
 * tapping Approve in the app (the work joins the bill and repairs start).
 */
export async function approveExtraWorkForCustomer(userId: string, jobId: string) {
  const job = await ownedJob(userId, jobId);
  const extra = job["extra_work"] as AdminJob["extra_work"];
  if (!extra || extra.approved) throw new AdminError("NOT_OPEN");
  const items = [
    ...((job["line_items"] as ServiceItem[] | null) ?? []),
    { label: extra.title, amount: Number(extra.price) },
  ];
  const times = { ...((job["stage_times"] as Record<string, string> | null) ?? {}) };
  times["repairing"] = sgTime();
  const { error } = await db()
    .from("jobs")
    .update({
      extra_work: { ...extra, approved: true },
      line_items: items,
      total: sum(items),
      status: "repairing",
      stage_times: times,
    })
    .eq("id", jobId);
  if (error) throw new AdminError("FAILED");
}

/** Withdraws extra work that hasn't been approved yet. */
export async function cancelExtraWork(userId: string, jobId: string) {
  const job = await ownedJob(userId, jobId);
  const extra = job["extra_work"] as { approved?: boolean } | null;
  if (!extra || extra.approved) throw new AdminError("NOT_OPEN");
  const status =
    String(job["status"]) === "awaiting_approval" ? "inspecting" : String(job["status"]);
  const { error } = await db().from("jobs").update({ extra_work: null, status }).eq("id", jobId);
  if (error) throw new AdminError("FAILED");
}

/** Stores an inspection photo and returns its public URL. */
export async function uploadJobPhoto(userId: string, jobId: string, dataUrl: string) {
  const job = await ownedJob(userId, jobId);
  const m = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!m) throw new AdminError("INVALID_IMAGE");
  const bytes = Uint8Array.from(atob(m[2]!), (c) => c.charCodeAt(0));
  if (bytes.length > 3_000_000) throw new AdminError("IMAGE_TOO_BIG");
  const ext = m[1] === "jpeg" ? "jpg" : m[1]!;
  const path = `${String(job["workshop_id"])}/${jobId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabaseAdmin.storage
    .from("job-photos")
    .upload(path, bytes, { contentType: `image/${m[1]}`, upsert: false });
  if (up.error) throw new AdminError("UPLOAD_FAILED");
  return supabaseAdmin.storage.from("job-photos").getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------- close
export async function completeJob(
  userId: string,
  jobId: string,
  input: {
    paid: boolean;
    next_service_due_date: string | null;
    next_service_due_km: number | null;
  },
) {
  const job = await ownedJob(userId, jobId);
  if (!job["is_active"]) throw new AdminError("NOT_OPEN");
  if (input.next_service_due_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.next_service_due_date))
    throw new AdminError("INVALID_TIME");
  const invoice =
    (job["invoice_no"] as string | null) ||
    `INV-${sgDate().replace(/-/g, "").slice(2)}-${jobId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
  const times = { ...((job["stage_times"] as Record<string, string> | null) ?? {}) };
  times["ready"] ??= sgTime();
  times["collected"] = sgTime();
  const { error } = await db()
    .from("jobs")
    .update({
      status: "collected",
      is_active: false,
      paid: Boolean(input.paid),
      invoice_no: invoice,
      stage_times: times,
      // Inspection photos stay with the job in the customer's service history.
      photos: [
        ...new Set([
          ...((job["photos"] as string[] | null) ?? []),
          ...((job["extra_work"] as { photos?: string[] } | null)?.photos ?? []),
        ]),
      ],
    })
    .eq("id", jobId);
  if (error) throw new AdminError("FAILED");

  const vehicleUpdate: Record<string, unknown> = {};
  if (input.next_service_due_date)
    vehicleUpdate["next_service_due_date"] = input.next_service_due_date;
  if (input.next_service_due_km != null && Number.isFinite(Number(input.next_service_due_km)))
    vehicleUpdate["next_service_due_km"] = Math.max(
      0,
      Math.round(Number(input.next_service_due_km)),
    );
  const mileage = job["mileage_km"] as number | null;
  if (mileage != null) vehicleUpdate["mileage_km"] = mileage;
  if (Object.keys(vehicleUpdate).length)
    await db().from("vehicles").update(vehicleUpdate).eq("id", String(job["vehicle_id"]));
}

export async function setPaid(userId: string, jobId: string, paid: boolean) {
  await ownedJob(userId, jobId);
  const { error } = await db().from("jobs").update({ paid }).eq("id", jobId);
  if (error) throw new AdminError("FAILED");
}

/** Reopens a closed job (e.g. it was closed by mistake). */
export async function reopenJob(userId: string, jobId: string) {
  const job = await ownedJob(userId, jobId);
  if (job["is_active"]) return;
  const open = await db()
    .from("jobs")
    .select("id")
    .eq("vehicle_id", String(job["vehicle_id"]))
    .eq("is_active", true)
    .limit(1);
  if ((open.data ?? []).length) throw new AdminError("ALREADY_CHECKED_IN");
  const times = { ...((job["stage_times"] as Record<string, string> | null) ?? {}) };
  delete times["collected"];
  const { error } = await db()
    .from("jobs")
    .update({ status: "ready", is_active: true, stage_times: times })
    .eq("id", jobId);
  if (error) throw new AdminError("FAILED");
}

export async function deleteJob(userId: string, jobId: string) {
  await ownedJob(userId, jobId);
  const { error } = await db().from("jobs").delete().eq("id", jobId);
  if (error) throw new AdminError("FAILED");
}

// ---------------------------------------------------------------- WhatsApp alerts (optional)
/** Tells n8n to WhatsApp the customer that their car is ready, or that extra work needs an OK. */
async function alertCustomer(event: "car_ready" | "extra_work", jobId: string) {
  if (!process.env["BOOKING_WEBHOOK_URL"]) return;
  try {
    const job = await jobRow(jobId);
    const v = await db()
      .from("vehicles")
      .select("plate, make, model, customer_id")
      .eq("id", String(job["vehicle_id"]))
      .maybeSingle();
    const ve = v.data as { plate: string; make: string; model: string; customer_id: string } | null;
    const [w, c] = await Promise.all([
      db()
        .from("workshops")
        .select("name, slug")
        .eq("id", String(job["workshop_id"]))
        .maybeSingle(),
      db()
        .from("customers")
        .select("name, mobile")
        .eq("id", ve?.customer_id ?? "")
        .maybeSingle(),
    ]);
    const ws = w.data as { name: string; slug: string } | null;
    const cu = c.data as { name: string; mobile: string } | null;
    if (!cu) return;
    const extra = job["extra_work"] as { title?: string; price?: number } | null;
    const ok = await postAlert({
      event,
      to: `65${cu.mobile}`,
      workshop: ws?.name,
      workshop_slug: ws?.slug,
      customer: cu.name,
      customer_phone: `65${cu.mobile}`,
      vehicle: ve ? `${ve.plate} · ${ve.make} ${ve.model}` : null,
      services: String(job["title"]),
      total: Number(job["total"] ?? 0),
      message:
        event === "extra_work" && extra
          ? `${extra.title ?? "Extra work"} (+S$${Number(extra.price ?? 0).toFixed(2)})`
          : null,
    });
    if (ok)
      await db()
        .from("jobs")
        .update({ customer_notified_at: new Date().toISOString() })
        .eq("id", jobId);
  } catch {
    // Alerts are best-effort.
  }
}
