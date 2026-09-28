import { Link, useLoaderData, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function useWorkshop() {
  const data = useLoaderData({ from: "/$slug" });
  return data.workshop;
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[420px] px-5 pb-28 pt-5">
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export function TopBar({
  backTo,
  showSignOut = false,
}: {
  backTo?: { to: "/$slug/home" | "/$slug/car" | "/$slug/bookings"; params: { slug: string } };
  showSignOut?: boolean;
}) {
  const workshop = useWorkshop();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex min-h-[64px] w-full max-w-[420px] items-center gap-3 px-5 py-2">
        {backTo ? (
          <Link
            to={backTo.to}
            params={backTo.params}
            aria-label="Go back"
            className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
        ) : null}

        {workshop.logo_url ? (
          <img
            src={workshop.logo_url}
            alt=""
            width={36}
            height={36}
            className="h-8 w-8 shrink-0 rounded-sm border border-border object-cover"
          />
        ) : null}
        <span className="truncate text-sm font-semibold uppercase tracking-wider">{workshop.name}</span>
        {showSignOut ? (
          <button
            type="button"
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              navigate({ to: "/$slug", params: { slug: workshop.slug } });
            }}
            className="-mr-3 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
          >
            <LogOut className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("app-card p-5", className)}>{children}</section>;
}

export function Pill({
  children,
  tone = "attention",
}: {
  children: ReactNode;
  tone?: "attention" | "muted" | "success" | "brand";
}) {
  const tones = {
    attention: "bg-attention-soft text-attention",
    muted: "bg-muted text-muted-foreground",
    success: "bg-success-soft text-success",
    brand: "bg-brand-soft text-brand",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-1 text-[11px] font-semibold uppercase tracking-wide",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function BrandButton({
  children,
  onClick,
  type = "button",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string | undefined;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[52px] w-full items-center justify-center rounded-md bg-brand-strong px-4 text-sm font-semibold text-brand-foreground shadow-sm transition-[opacity,transform] active:translate-y-px disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TaxNote({ taxRate }: { taxRate: number }) {
  return (
    <p className="text-xs text-muted-foreground">
      {taxRate === 0 ? "No GST" : `Includes GST at ${Math.round(taxRate * 100)}%`}
    </p>
  );
}

export function Loading() {
  return (
    <div className="mx-auto w-full max-w-[420px] px-4 py-10 text-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
