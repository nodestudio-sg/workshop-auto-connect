import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Node Studio blue for the admin console itself. */
export const ADMIN_BRAND = {
  "--brand": "#1297ea",
  "--brand-strong": "color-mix(in oklab, #1297ea 48%, black)",
  "--brand-soft": "color-mix(in oklab, #1297ea 8%, white)",
} as React.CSSProperties;

export const ERRORS: Record<string, string> = {
  NO_ACCESS: "This account doesn't have access here.",
  NOT_SET_UP: "The database needs the latest SQL update (0009 / 0010). Run it in Lovable Cloud.",
  NOT_FOUND: "That wasn't found. It may have been removed.",
  NOT_CLAIMABLE: "That email isn't a master account, or it's already set up. Sign in instead.",
  WEAK_PASSWORD: "Use at least 8 characters for the password.",
  CREATE_FAILED: "We couldn't create that account. The email may already be in use.",
  INVALID_NAME: "Please enter a name (2 to 80 characters).",
  INVALID_SLUG: "The link name can use lowercase letters, numbers and dashes (3 to 40 characters).",
  SLUG_TAKEN: "That link name is already taken.",
  INVALID_COLOR: "Please pick a colour.",
  INVALID_ADDRESS: "Please enter the workshop's address.",
  INVALID_PHONE: "Please enter a valid phone number.",
  INVALID_HOURS: "Please check the opening days, times and booking rules.",
  INVALID_TAX: "GST must be between 0% and 20%.",
  INVALID_IMAGE: "Please choose a PNG, JPG or WebP image.",
  IMAGE_TOO_BIG: "That image is too big. Please use one under 2 MB.",
  UPLOAD_FAILED: "The upload didn't work. Please try again.",
  INVALID_PRICE: "Please enter a valid price.",
  INVALID_EMAIL: "Please enter a valid email address.",
  INVALID_TIME: "Please choose a valid date and time.",
  NOT_OPEN: "This booking has already been answered.",
  HAS_CUSTOMERS: "Type the workshop's exact name to delete it with all its customers.",
  ALREADY_CHECKED_IN: "That car is already in the workshop.",
  INVALID_STAGE: "That isn't a valid stage.",
  FAILED: "Something went wrong. Please try again.",
};
export const errorText = (code: string) => ERRORS[code] ?? ERRORS["FAILED"]!;

/** The admin's sign-in session (shared with the customer app on this device). */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-border/60 bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.12)] sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "min-h-[46px] w-full rounded-2xl border border-input bg-card px-4 text-[15px] outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60";

export function PrimaryButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50",
        className,
      )}
    />
  );
}

export function GhostButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold transition hover:bg-muted disabled:opacity-50",
        className,
      )}
    />
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "attention";
}) {
  return (
    <div className="rounded-2xl bg-muted/60 px-4 py-3">
      <div
        className={cn(
          "text-2xl font-bold tracking-tight",
          tone === "attention" && Number(value) > 0 && "text-attention",
        )}
      >
        {value}
      </div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

export function WorkshopMark({
  name,
  color,
  logo,
  size = 44,
}: {
  name: string;
  color: string;
  logo: string | null;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return logo ? (
    <img
      src={logo}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-2xl border border-border bg-white object-contain p-1"
    />
  ) : (
    <div
      style={{ width: size, height: size, background: color }}
      className="grid shrink-0 place-items-center rounded-2xl text-sm font-bold text-white"
    >
      {initials}
    </div>
  );
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function niceDate(d: string | null | undefined) {
  if (!d) return "";
  const date = new Date(`${d}T00:00:00`);
  return date.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
}
