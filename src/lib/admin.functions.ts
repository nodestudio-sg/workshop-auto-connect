import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ServiceInput, WorkshopInput } from "@/lib/admin.server";

/**
 * Browser-callable admin actions. Each one needs a signed-in user
 * (requireSupabaseAuth) and does its permission checks in admin.server.ts,
 * loaded inside the handler so the service-role client never reaches the
 * browser. Failures come back as { ok: false, error: CODE }.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    return { ok: false, error: /^[A-Z_]+$/.test(code) ? code : "FAILED" };
  }
}
const server = () => import("./admin.server");

// ---- master account setup (no sign-in yet)
export const adminClaimStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }) => run(async () => (await server()).masterClaimable(data.email)));

export const adminClaim = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) =>
    run(async () => (await server()).claimMaster(data.email, data.password)),
  );

// ---- everything else needs a signed-in admin
export const adminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => run(async () => (await server()).overview(context.userId)));

export const adminGetWorkshop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).getWorkshop(context.userId, data.id)),
  );

export const adminCreateWorkshop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: WorkshopInput) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).createWorkshop(context.userId, data)),
  );

export const adminUpdateWorkshop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; input: WorkshopInput }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).updateWorkshop(context.userId, data.id, data.input)),
  );

export const adminSetArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; archived: boolean }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).setArchived(context.userId, data.id, data.archived)),
  );

export const adminDeleteWorkshop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).deleteWorkshop(context.userId, data.id)),
  );

export const adminUploadLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; dataUrl: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).uploadLogo(context.userId, data.id, data.dataUrl)),
  );

export const adminRemoveLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).removeLogo(context.userId, data.id)),
  );

export const adminSaveService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; service: ServiceInput }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).saveService(context.userId, data.id, data.service)),
  );

export const adminDeleteService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; serviceId: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).deleteService(context.userId, data.id, data.serviceId)),
  );

export const adminMoveService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; serviceId: string; dir: -1 | 1 }) => d)
  .handler(async ({ data, context }) =>
    run(async () =>
      (await server()).moveService(context.userId, data.id, data.serviceId, data.dir),
    ),
  );

export const adminCreateOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; email: string; password: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () =>
      (await server()).createOwner(context.userId, data.id, data.email, data.password),
    ),
  );

export const adminRemoveOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; staffId: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).removeOwner(context.userId, data.id, data.staffId)),
  );

export const adminListBookings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).listBookings(context.userId, data.id)),
  );

export const adminConfirmBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bookingId: string; date?: string; time?: string; message?: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () =>
      (await server()).confirmBooking(
        context.userId,
        data.bookingId,
        data.date,
        data.time,
        data.message,
      ),
    ),
  );

export const adminDeclineBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bookingId: string; message: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).declineBooking(context.userId, data.bookingId, data.message)),
  );

export const adminListCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).listCustomers(context.userId, data.id)),
  );

/** Customer app: WhatsApp the workshop about a booking just made (best-effort). */
export const notifyNewBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bookingId: string }) => d)
  .handler(async ({ data, context }) =>
    run(async () => (await server()).notifyNewBooking(context.userId, data.bookingId)),
  );
