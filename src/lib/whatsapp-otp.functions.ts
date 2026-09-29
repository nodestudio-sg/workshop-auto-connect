import { createServerFn } from "@tanstack/react-start";

/**
 * Browser-callable wrappers for WhatsApp sign-in codes. The work happens in
 * whatsapp-otp.server.ts, loaded inside the handlers so the admin client never
 * reaches the browser bundle. Failures come back as { error: code }.
 */
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    return { ok: false, error: /^[A-Z_]+$/.test(code) ? code : "SEND_FAILED" };
  }
}

export const sendWhatsAppCode = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; mobile: string }) => data)
  .handler(async ({ data }) => {
    const otp = await import("./whatsapp-otp.server");
    return run(() => otp.sendCode(data.slug, data.mobile));
  });

export const verifyWhatsAppCode = createServerFn({ method: "POST" })
  .inputValidator((data: { mobile: string; code: string }) => data)
  .handler(async ({ data }) => {
    const otp = await import("./whatsapp-otp.server");
    return run(() => otp.verifyCode(data.mobile, data.code));
  });
