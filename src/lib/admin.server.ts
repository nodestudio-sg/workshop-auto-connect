/**
 * Admin console, server side. Every function takes the signed-in user's id
 * (from requireSupabaseAuth) and checks what they may touch before using the
 * service-role client:
 * - master accounts (platform_admins, migration 0009) manage every workshop;
 * - owners (workshop_staff) manage only their own workshop(s).
 * Server-only: never import this from route files or *.functions.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The new tables aren't in the generated types until the migration has run.
const db = () => supabaseAdmin as unknown as SupabaseClient;

export class AdminError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export type Role =
  { kind: "master"; email: string } | { kind: "owner"; email: string; workshopIds: string[] };

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "login",
  "www",
  "assets",
  "static",
  "index",
  "_build",
]);
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------- roles
export async function roleFor(userId: string): Promise<Role | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = (data.user?.email ?? "").toLowerCase();
  if (!email) return null;
  const master = await db()
    .from("platform_admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (master.error) throw new AdminError("NOT_SET_UP");
  if (master.data) return { kind: "master", email };
  const staff = await db().from("workshop_staff").select("workshop_id").eq("user_id", userId);
  const ids = ((staff.data ?? []) as { workshop_id: string }[]).map((r) => r.workshop_id);
  return ids.length ? { kind: "owner", email, workshopIds: ids } : null;
}

async function requireRole(userId: string): Promise<Role> {
  const role = await roleFor(userId);
  if (!role) throw new AdminError("NO_ACCESS");
  return role;
}
async function requireMaster(userId: string) {
  const role = await requireRole(userId);
  if (role.kind !== "master") throw new AdminError("NO_ACCESS");
  return role;
}
async function requireWorkshop(userId: string, workshopId: string) {
  const role = await requireRole(userId);
  if (role.kind === "owner" && !role.workshopIds.includes(workshopId))
    throw new AdminError("NO_ACCESS");
  return role;
}

// ---------------------------------------------------------------- master account setup
/** Whether this email is a reserved master account that hasn't been set up yet. */
export async function masterClaimable(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const reserved = await db().from("platform_admins").select("email").eq("email", e).maybeSingle();
  if (reserved.error || !reserved.data) return false;
  return !(await findUserByEmail(e));
}

export async function claimMaster(email: string, password: string): Promise<void> {
  const e = email.trim().toLowerCase();
  if (password.length < 8) throw new AdminError("WEAK_PASSWORD");
  if (!(await masterClaimable(e))) throw new AdminError("NOT_CLAIMABLE");
  const { error } = await supabaseAdmin.auth.admin.createUser({
    email: e,
    password,
    email_confirm: true,
  });
  if (error) throw new AdminError("CREATE_FAILED");
}

async function findUserByEmail(email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new AdminError("FAILED");
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 1000) return null;
  }
  return null;
}

// ---------------------------------------------------------------- overview
export type WorkshopSummary = {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  logo_url: string | null;
  archived: boolean;
  demo_mode: boolean;
  customers: number;
  pending: number;
  upcoming: number;
  owners: number;
};

export async function overview(
  userId: string,
): Promise<{ role: Role; workshops: WorkshopSummary[] }> {
  const role = await requireRole(userId);
  let q = db().from("workshops").select("*").order("name");
  if (role.kind === "owner") q = q.in("id", role.workshopIds);
  const { data: ws, error } = await q;
  if (error) throw new AdminError("FAILED");
  const ids = ((ws ?? []) as { id: string }[]).map((w) => w.id);
  const [cust, books, staff] = await Promise.all([
    db().from("customers").select("workshop_id").in("workshop_id", ids),
    db()
      .from("booking_requests")
      .select("workshop_id, status, preferred_date, confirmed_date")
      .in("workshop_id", ids),
    db().from("workshop_staff").select("workshop_id").in("workshop_id", ids),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const count = <T>(rows: T[] | null, f: (r: T) => boolean) => (rows ?? []).filter(f).length;
  const workshops = ((ws ?? []) as Record<string, unknown>[]).map((w) => {
    const id = String(w["id"]);
    type B = {
      workshop_id: string;
      status: string;
      preferred_date: string;
      confirmed_date: string | null;
    };
    return {
      id,
      slug: String(w["slug"]),
      name: String(w["name"]),
      brand_color: String(w["brand_color"]),
      logo_url: (w["logo_url"] as string | null) ?? null,
      archived: Boolean(w["archived_at"]),
      demo_mode: Boolean(w["demo_mode"]),
      customers: count(cust.data as { workshop_id: string }[] | null, (r) => r.workshop_id === id),
      pending: count(
        books.data as B[] | null,
        (r) => r.workshop_id === id && r.status === "requested",
      ),
      upcoming: count(
        books.data as B[] | null,
        (r) =>
          r.workshop_id === id && r.status === "confirmed" && (r.confirmed_date ?? "") >= today,
      ),
      owners: count(staff.data as { workshop_id: string }[] | null, (r) => r.workshop_id === id),
    };
  });
  return { role, workshops };
}

// ---------------------------------------------------------------- workshop details
export type WorkshopInput = {
  name: string;
  slug?: string;
  brand_color: string;
  address: string;
  phone: string;
  tax_rate?: number;
  demo_mode?: boolean;
  open_days?: number[];
  slot_times?: string[];
  slot_capacity?: number;
  booking_window_days?: number;
  min_notice_hours?: number;
};

export type AdminWorkshop = {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  logo_url: string | null;
  address: string;
  phone: string;
  tax_rate: number;
  demo_mode: boolean;
  archived: boolean;
  open_days: number[];
  slot_times: string[];
  slot_capacity: number;
  booking_window_days: number;
  min_notice_hours: number;
};
export type AdminService = {
  id: string;
  name: string;
  description: string;
  price: number;
  quote_after_inspection: boolean;
  components: ServiceItem[];
  sort_order: number;
};

export async function getWorkshop(userId: string, workshopId: string) {
  const role = await requireWorkshop(userId, workshopId);
  const [w, services, owners] = await Promise.all([
    db().from("workshops").select("*").eq("id", workshopId).maybeSingle(),
    db().from("services").select("*").eq("workshop_id", workshopId).order("sort_order"),
    role.kind === "master" ? listOwners(workshopId) : Promise.resolve([]),
  ]);
  if (!w.data) throw new AdminError("NOT_FOUND");
  const r = w.data as Record<string, unknown>;
  const workshop: AdminWorkshop = {
    id: String(r["id"]),
    slug: String(r["slug"]),
    name: String(r["name"]),
    brand_color: String(r["brand_color"]),
    logo_url: (r["logo_url"] as string | null) ?? null,
    address: String(r["address"] ?? ""),
    phone: String(r["phone"] ?? ""),
    tax_rate: Number(r["tax_rate"] ?? 0),
    demo_mode: Boolean(r["demo_mode"]),
    archived: Boolean(r["archived_at"]),
    open_days: (r["open_days"] as number[] | undefined) ?? [1, 2, 3, 4, 5, 6],
    slot_times: (r["slot_times"] as string[] | undefined) ?? [
      "09:00",
      "10:30",
      "13:00",
      "14:30",
      "16:00",
    ],
    slot_capacity: Number(r["slot_capacity"] ?? 2),
    booking_window_days: Number(r["booking_window_days"] ?? 30),
    min_notice_hours: Number(r["min_notice_hours"] ?? 12),
  };
  const list: AdminService[] = ((services.data ?? []) as Record<string, unknown>[]).map((x) => ({
    id: String(x["id"]),
    name: String(x["name"]),
    description: String(x["description"] ?? ""),
    price: Number(x["price"] ?? 0),
    quote_after_inspection: Boolean(x["quote_after_inspection"]),
    sort_order: Number(x["sort_order"] ?? 0),
    components: ((x["components"] as { label?: unknown; amount?: unknown }[] | null) ?? [])
      .map((c) => ({ label: String(c?.label ?? ""), amount: Number(c?.amount ?? 0) }))
      .filter((c) => c.label),
  }));
  return { role: role.kind, workshop, services: list, owners };
}

function cleanWorkshop(input: WorkshopInput, master: boolean) {
  const name = input.name?.trim() ?? "";
  if (name.length < 2 || name.length > 80) throw new AdminError("INVALID_NAME");
  if (!COLOR_RE.test(input.brand_color ?? "")) throw new AdminError("INVALID_COLOR");
  const address = input.address?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  if (!address) throw new AdminError("INVALID_ADDRESS");
  if (!/^\+?[\d\s-]{8,16}$/.test(phone)) throw new AdminError("INVALID_PHONE");
  const out: Record<string, unknown> = {
    name,
    brand_color: input.brand_color.toLowerCase(),
    address,
    phone,
  };
  if (input.open_days) {
    const days = [...new Set(input.open_days)].filter((d) => d >= 1 && d <= 7).sort();
    if (!days.length) throw new AdminError("INVALID_HOURS");
    out["open_days"] = days;
  }
  if (input.slot_times) {
    const times = [...new Set(input.slot_times.map((t) => t.trim()))].sort();
    if (!times.length || !times.every((t) => TIME_RE.test(t)))
      throw new AdminError("INVALID_HOURS");
    out["slot_times"] = times;
  }
  if (input.slot_capacity !== undefined) {
    if (!(input.slot_capacity >= 1 && input.slot_capacity <= 50))
      throw new AdminError("INVALID_HOURS");
    out["slot_capacity"] = Math.round(input.slot_capacity);
  }
  if (input.booking_window_days !== undefined) {
    if (!(input.booking_window_days >= 1 && input.booking_window_days <= 180))
      throw new AdminError("INVALID_HOURS");
    out["booking_window_days"] = Math.round(input.booking_window_days);
  }
  if (input.min_notice_hours !== undefined) {
    if (!(input.min_notice_hours >= 0 && input.min_notice_hours <= 168))
      throw new AdminError("INVALID_HOURS");
    out["min_notice_hours"] = Math.round(input.min_notice_hours);
  }
  if (input.tax_rate !== undefined) {
    if (!(input.tax_rate >= 0 && input.tax_rate <= 0.2)) throw new AdminError("INVALID_TAX");
    out["tax_rate"] = input.tax_rate;
  }
  if (master && input.demo_mode !== undefined) out["demo_mode"] = input.demo_mode;
  return out;
}

export async function createWorkshop(userId: string, input: WorkshopInput): Promise<string> {
  await requireMaster(userId);
  const slug = (input.slug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) throw new AdminError("INVALID_SLUG");
  const taken = await db().from("workshops").select("id").eq("slug", slug).maybeSingle();
  if (taken.data) throw new AdminError("SLUG_TAKEN");
  const row = { ...cleanWorkshop(input, true), slug, demo_mode: input.demo_mode ?? false };
  const { data, error } = await db().from("workshops").insert(row).select("id").single();
  if (error || !data) throw new AdminError("FAILED");
  const id = String((data as { id: string }).id);
  // A starter menu the owner can edit straight away.
  await db()
    .from("services")
    .insert([
      {
        workshop_id: id,
        name: "Standard servicing",
        description: "Engine oil and filter change with a 20-point safety check.",
        price: 138,
        sort_order: 1,
        components: [],
      },
      {
        workshop_id: id,
        name: "Major servicing",
        description: "Oil, filters, spark plugs and a full inspection.",
        price: 268,
        sort_order: 2,
        components: [],
      },
      {
        workshop_id: id,
        name: "Inspection",
        description: "We check it over and quote before any work.",
        price: 0,
        quote_after_inspection: true,
        sort_order: 3,
        components: [],
      },
    ]);
  return id;
}

export async function updateWorkshop(userId: string, workshopId: string, input: WorkshopInput) {
  const role = await requireWorkshop(userId, workshopId);
  const { error } = await db()
    .from("workshops")
    .update(cleanWorkshop(input, role.kind === "master"))
    .eq("id", workshopId);
  if (error) throw new AdminError("FAILED");
}

export async function setArchived(userId: string, workshopId: string, archived: boolean) {
  await requireMaster(userId);
  const { error } = await db()
    .from("workshops")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", workshopId);
  if (error) throw new AdminError("FAILED");
}

/** Hard delete, only for workshops nobody has signed up to yet. */
export async function deleteWorkshop(userId: string, workshopId: string) {
  await requireMaster(userId);
  const cust = await db().from("customers").select("id").eq("workshop_id", workshopId).limit(1);
  if ((cust.data ?? []).length) throw new AdminError("HAS_CUSTOMERS");
  const { error } = await db().from("workshops").delete().eq("id", workshopId);
  if (error) throw new AdminError("FAILED");
}

export async function uploadLogo(
  userId: string,
  workshopId: string,
  dataUrl: string,
): Promise<string> {
  await requireWorkshop(userId, workshopId);
  const m = dataUrl.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/);
  if (!m) throw new AdminError("INVALID_IMAGE");
  const bytes = Uint8Array.from(atob(m[3]!), (c) => c.charCodeAt(0));
  if (bytes.length > 2_000_000) throw new AdminError("IMAGE_TOO_BIG");
  const path = `${workshopId}/logo-${Date.now()}.${m[2] === "jpeg" ? "jpg" : m[2]}`;
  const up = await supabaseAdmin.storage
    .from("workshop-logos")
    .upload(path, bytes, { contentType: m[1]!, upsert: true });
  if (up.error) throw new AdminError("UPLOAD_FAILED");
  const url = supabaseAdmin.storage.from("workshop-logos").getPublicUrl(path).data.publicUrl;
  const { error } = await db().from("workshops").update({ logo_url: url }).eq("id", workshopId);
  if (error) throw new AdminError("FAILED");
  return url;
}

export async function removeLogo(userId: string, workshopId: string) {
  await requireWorkshop(userId, workshopId);
  await db().from("workshops").update({ logo_url: null }).eq("id", workshopId);
}

// ---------------------------------------------------------------- services
export type ServiceItem = { label: string; amount: number };
export type ServiceInput = {
  id?: string;
  name: string;
  description: string;
  price: number;
  quote_after_inspection: boolean;
  components: ServiceItem[];
};

export async function saveService(userId: string, workshopId: string, s: ServiceInput) {
  await requireWorkshop(userId, workshopId);
  const name = s.name.trim();
  if (name.length < 2 || name.length > 80) throw new AdminError("INVALID_NAME");
  if (!(s.price >= 0 && s.price <= 100000)) throw new AdminError("INVALID_PRICE");
  const row = {
    name,
    description: s.description.trim() || null,
    price: Math.round(s.price * 100) / 100,
    quote_after_inspection: s.quote_after_inspection,
    components: s.components
      .map((c) => ({
        label: c.label.trim().slice(0, 120),
        amount: Math.max(0, Math.round(Number(c.amount) * 100) / 100 || 0),
      }))
      .filter((c) => c.label)
      .slice(0, 20),
  };
  if (s.id) {
    const { error } = await db()
      .from("services")
      .update(row)
      .eq("id", s.id)
      .eq("workshop_id", workshopId);
    if (error) throw new AdminError("FAILED");
  } else {
    const last = await db()
      .from("services")
      .select("sort_order")
      .eq("workshop_id", workshopId)
      .order("sort_order", { ascending: false })
      .limit(1);
    const next =
      Number(((last.data ?? [])[0] as { sort_order?: number } | undefined)?.sort_order ?? 0) + 1;
    const { error } = await db()
      .from("services")
      .insert({ ...row, workshop_id: workshopId, sort_order: next });
    if (error) throw new AdminError("FAILED");
  }
}

export async function deleteService(userId: string, workshopId: string, serviceId: string) {
  await requireWorkshop(userId, workshopId);
  const { error } = await db()
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("workshop_id", workshopId);
  if (error) throw new AdminError("FAILED");
}

export async function moveService(
  userId: string,
  workshopId: string,
  serviceId: string,
  dir: -1 | 1,
) {
  await requireWorkshop(userId, workshopId);
  const { data } = await db()
    .from("services")
    .select("id, sort_order")
    .eq("workshop_id", workshopId)
    .order("sort_order");
  const list = (data ?? []) as { id: string; sort_order: number }[];
  const i = list.findIndex((s) => s.id === serviceId),
    j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  await Promise.all(
    list.map((s, k) =>
      db()
        .from("services")
        .update({ sort_order: k + 1 })
        .eq("id", s.id),
    ),
  );
}

// ---------------------------------------------------------------- owners
async function listOwners(workshopId: string) {
  const { data } = await db()
    .from("workshop_staff")
    .select("id, user_id, created_at")
    .eq("workshop_id", workshopId);
  const rows = (data ?? []) as { id: string; user_id: string; created_at: string }[];
  return Promise.all(
    rows.map(async (r) => {
      const u = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      return {
        id: r.id,
        email: u.data.user?.email ?? "(deleted account)",
        created_at: r.created_at,
      };
    }),
  );
}

export async function createOwner(
  userId: string,
  workshopId: string,
  email: string,
  password: string,
) {
  await requireMaster(userId);
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new AdminError("INVALID_EMAIL");
  const reserved = await db().from("platform_admins").select("email").eq("email", e).maybeSingle();
  if (reserved.data) throw new AdminError("INVALID_EMAIL");
  let user = await findUserByEmail(e);
  if (!user) {
    if (password.length < 8) throw new AdminError("WEAK_PASSWORD");
    const created = await supabaseAdmin.auth.admin.createUser({
      email: e,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new AdminError("CREATE_FAILED");
    user = created.data.user;
  }
  const { error } = await db()
    .from("workshop_staff")
    .upsert(
      { user_id: user.id, workshop_id: workshopId, role: "owner" },
      { onConflict: "user_id,workshop_id" },
    );
  if (error) throw new AdminError("FAILED");
}

export async function removeOwner(userId: string, workshopId: string, staffId: string) {
  await requireMaster(userId);
  const { error } = await db()
    .from("workshop_staff")
    .delete()
    .eq("id", staffId)
    .eq("workshop_id", workshopId);
  if (error) throw new AdminError("FAILED");
}

// ---------------------------------------------------------------- bookings & customers
export type AdminBooking = {
  id: string;
  status: string;
  created_at: string;
  preferred_date: string;
  preferred_time: string;
  confirmed_date: string | null;
  confirmed_time: string | null;
  services: string[];
  total: number | null;
  notes: string | null;
  workshop_message: string | null;
  customer: { name: string; mobile: string; email: string | null } | null;
  vehicle: { plate: string; make: string; model: string } | null;
};

export async function listBookings(userId: string, workshopId: string): Promise<AdminBooking[]> {
  await requireWorkshop(userId, workshopId);
  const { data, error } = await db()
    .from("booking_requests")
    .select("*")
    .eq("workshop_id", workshopId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new AdminError("FAILED");
  const rows = (data ?? []) as Record<string, unknown>[];
  const cIds = [...new Set(rows.map((r) => String(r["customer_id"])))];
  const vIds = [...new Set(rows.map((r) => String(r["vehicle_id"])).filter((v) => v !== "null"))];
  const [cs, vs] = await Promise.all([
    cIds.length ? db().from("customers").select("*").in("id", cIds) : Promise.resolve({ data: [] }),
    vIds.length
      ? db().from("vehicles").select("id, plate, make, model").in("id", vIds)
      : Promise.resolve({ data: [] }),
  ]);
  const cMap = new Map(
    ((cs.data ?? []) as Record<string, unknown>[]).map((c) => [String(c["id"]), c]),
  );
  const vMap = new Map(
    ((vs.data ?? []) as Record<string, unknown>[]).map((v) => [String(v["id"]), v]),
  );
  return rows.map((r) => {
    const c = cMap.get(String(r["customer_id"]));
    const v = vMap.get(String(r["vehicle_id"]));
    const snap = (r["price_snapshot"] as { name?: string }[] | null) ?? [];
    const cents = r["total_cents"] as number | null;
    return {
      id: String(r["id"]),
      status: String(r["status"]),
      created_at: String(r["created_at"]),
      preferred_date: String(r["preferred_date"]),
      preferred_time: String(r["preferred_time"]),
      confirmed_date: (r["confirmed_date"] as string | null) ?? null,
      confirmed_time: (r["confirmed_time"] as string | null) ?? null,
      services: snap.map((s) => String(s.name ?? "")).filter(Boolean),
      total: cents != null ? cents / 100 : ((r["estimate_total"] as number | null) ?? null),
      notes: (r["customer_notes"] as string | null) ?? null,
      workshop_message: (r["workshop_message"] as string | null) ?? null,
      customer: c
        ? {
            name: String(c["name"]),
            mobile: String(c["mobile"]),
            email: (c["email"] as string | null) ?? null,
          }
        : null,
      vehicle: v
        ? { plate: String(v["plate"]), make: String(v["make"]), model: String(v["model"]) }
        : null,
    };
  });
}

async function bookingInWorkshop(bookingId: string) {
  const { data } = await db()
    .from("booking_requests")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();
  if (!data) throw new AdminError("NOT_FOUND");
  return data as Record<string, unknown>;
}

export async function confirmBooking(
  userId: string,
  bookingId: string,
  date?: string,
  time?: string,
  message?: string,
) {
  const b = await bookingInWorkshop(bookingId);
  await requireWorkshop(userId, String(b["workshop_id"]));
  const d = date || String(b["preferred_date"]);
  const t = time || String(b["preferred_time"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !TIME_RE.test(t)) throw new AdminError("INVALID_TIME");
  if (!["requested", "confirmed"].includes(String(b["status"]))) throw new AdminError("NOT_OPEN");
  const { error } = await db()
    .from("booking_requests")
    .update({
      status: "confirmed",
      confirmed_date: d,
      confirmed_time: t,
      workshop_message: message?.trim() || null,
    })
    .eq("id", bookingId);
  if (error) throw new AdminError("FAILED");
  await notify("booking_confirmed", bookingId);
}

export async function declineBooking(userId: string, bookingId: string, message: string) {
  const b = await bookingInWorkshop(bookingId);
  await requireWorkshop(userId, String(b["workshop_id"]));
  if (String(b["status"]) !== "requested") throw new AdminError("NOT_OPEN");
  const { error } = await db()
    .from("booking_requests")
    .update({ status: "declined", workshop_message: message.trim().slice(0, 500) || null })
    .eq("id", bookingId);
  if (error) throw new AdminError("FAILED");
  await notify("booking_declined", bookingId);
}

export async function listCustomers(userId: string, workshopId: string) {
  await requireWorkshop(userId, workshopId);
  const [cs, vs, bs] = await Promise.all([
    db()
      .from("customers")
      .select("*")
      .eq("workshop_id", workshopId)
      .order("created_at", { ascending: false }),
    db()
      .from("vehicles")
      .select("customer_id, plate, make, model, mileage_km")
      .eq("workshop_id", workshopId),
    db().from("booking_requests").select("customer_id, status").eq("workshop_id", workshopId),
  ]);
  const vehicles = (vs.data ?? []) as {
    customer_id: string;
    plate: string;
    make: string;
    model: string;
    mileage_km: number;
  }[];
  const books = (bs.data ?? []) as { customer_id: string; status: string }[];
  return ((cs.data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c["id"]),
    name: String(c["name"]),
    mobile: String(c["mobile"]),
    email: (c["email"] as string | null) ?? null,
    company: (c["company_name"] as string | null) ?? null,
    joined: String(c["created_at"]),
    signedUp: Boolean(c["user_id"]),
    vehicles: vehicles
      .filter((v) => v.customer_id === c["id"])
      .map((v) => ({ plate: v.plate, name: `${v.make} ${v.model}`, mileage: v.mileage_km })),
    bookings: books.filter((b) => b.customer_id === c["id"]).length,
  }));
}

// ---------------------------------------------------------------- WhatsApp alerts (optional)
/**
 * Tells n8n about a booking event so it can WhatsApp the workshop (new
 * request) or the customer (confirmed / declined). Does nothing unless
 * BOOKING_WEBHOOK_URL is set; never fails the action that triggered it.
 */
export async function notify(
  event: "booking_requested" | "booking_confirmed" | "booking_declined",
  bookingId: string,
) {
  const url = process.env["BOOKING_WEBHOOK_URL"];
  const secret = process.env["OTP_WEBHOOK_SECRET"];
  if (!url || !secret) return;
  try {
    const b = await bookingInWorkshop(bookingId);
    const [w, c, v] = await Promise.all([
      db()
        .from("workshops")
        .select("name, slug, phone")
        .eq("id", String(b["workshop_id"]))
        .maybeSingle(),
      db()
        .from("customers")
        .select("name, mobile")
        .eq("id", String(b["customer_id"]))
        .maybeSingle(),
      db()
        .from("vehicles")
        .select("plate, make, model")
        .eq("id", String(b["vehicle_id"]))
        .maybeSingle(),
    ]);
    const ws = w.data as { name: string; slug: string; phone: string } | null;
    const cu = c.data as { name: string; mobile: string } | null;
    const ve = v.data as { plate: string; make: string; model: string } | null;
    const toWorkshop = event === "booking_requested";
    const workshopPhone = (ws?.phone ?? "").replace(/\D/g, "");
    const snap = (b["price_snapshot"] as { name?: string }[] | null) ?? [];
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-nodestudio-secret": secret },
      body: JSON.stringify({
        event,
        to: toWorkshop
          ? workshopPhone.length === 8
            ? `65${workshopPhone}`
            : workshopPhone
          : `65${cu?.mobile ?? ""}`,
        workshop: ws?.name,
        workshop_slug: ws?.slug,
        customer: cu?.name,
        customer_phone: `65${cu?.mobile ?? ""}`,
        vehicle: ve ? `${ve.plate} · ${ve.make} ${ve.model}` : null,
        services: snap
          .map((s) => s.name)
          .filter(Boolean)
          .join(", "),
        date: b["confirmed_date"] ?? b["preferred_date"],
        time: b["confirmed_time"] ?? b["preferred_time"],
        message: b["workshop_message"] ?? null,
      }),
    });
    if (res.ok) {
      await db()
        .from("booking_requests")
        .update(
          toWorkshop
            ? { workshop_notified_at: new Date().toISOString() }
            : { customer_notified_at: new Date().toISOString() },
        )
        .eq("id", bookingId);
    }
  } catch {
    // Alerts are best-effort.
  }
}

/** Called by the customer app right after a booking is made. */
export async function notifyNewBooking(userId: string, bookingId: string) {
  const b = await bookingInWorkshop(bookingId);
  if (b["workshop_notified_at"] || b["status"] !== "requested") return;
  const c = await db()
    .from("customers")
    .select("user_id")
    .eq("id", String(b["customer_id"]))
    .maybeSingle();
  if ((c.data as { user_id?: string } | null)?.user_id !== userId)
    throw new AdminError("NO_ACCESS");
  await notify("booking_requested", bookingId);
}
