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
    <div className="mx-auto w-full max-w-[420px] px-4 pb-28 pt-4">
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function TopBar({
  backTo,
  showSignOut = false,
}: {
  backTo?: { to: string; params?: Record<string, string> };
  showSignOut?: boolean;
}) {
  const workshop = useWorkshop();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-[420px] items-center gap-3 px-4 py-3">
        {backTo ? (
          <Link
            to={backTo.to}
            params={backTo.params}
            aria-label="Go back"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground"
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
            className="h-9 w-9 shrink-0 rounded-md object-cover"
          />
        ) : null}
        <span className="truncate text-[15px] font-semibold">{workshop.name}</span>
        {showSignOut ? (
          <button
            type="button"
            aria-label="Sign out"
            onClick={async () => {
              await signOut();
              navigate({ to: "/$slug", params: { slug: workshop.slug } });
            }}
            className="-mr-2 ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground"
          >
            <LogOut className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("app-card p-4", className)}>{children}</section>;
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
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
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
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[52px] w-full items-center justify-center rounded-md bg-brand px-4 text-[15px] font-semibold text-brand-foreground transition-opacity active:opacity-80 disabled:opacity-40",
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
