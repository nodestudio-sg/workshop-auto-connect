import { Link } from "@tanstack/react-router";
import { CalendarDays, CarFront, House, Plus, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { PublicWorkshop } from "@/lib/workshop.functions";

/**
 * The workshop's logo from its record, or its initials on the brand colour
 * when it has none — so every workshop gets a recognisable mark.
 */
export function WorkshopLogo({
  workshop,
  size = 40,
  className,
}: {
  workshop: Pick<PublicWorkshop, "name" | "logo_url">;
  size?: number;
  className?: string;
}) {
  if (workshop.logo_url) {
    return (
      <img
        src={workshop.logo_url}
        alt={`${workshop.name} logo`}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("shrink-0 rounded-[22%] bg-white object-cover", className)}
      />
    );
  }
  const initials = workshop.name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z0-9]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-label={`${workshop.name} logo`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[22%] bg-brand font-bold text-brand-foreground",
        className,
      )}
    >
      {initials}
    </span>
  );
}

/** "SJT8888T" → "SJT 8888 T", in the style of a Singapore number plate. */
export function NumberPlate({ plate, className }: { plate: string; className?: string }) {
  const match = plate.replace(/\s/g, "").match(/^([A-Z]+)(\d+)([A-Z])$/i);
  const text = match ? `${match[1]} ${match[2]} ${match[3]}` : plate;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border-2 border-neutral-700 bg-neutral-900 px-3 py-1 font-mono text-lg font-bold tracking-[0.12em] text-white shadow-sm",
        className,
      )}
    >
      {text.toUpperCase()}
    </span>
  );
}

/** A simple side-view car drawing, tinted with the workshop's brand colour. */
export function CarIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 96" aria-hidden="true" className={className}>
      <ellipse cx="120" cy="88" rx="104" ry="6" className="fill-foreground/10" />
      <path
        d="M22 66c0-9 5-15 14-17l30-6 24-19c5-4 11-6 18-6h44c8 0 15 3 21 8l20 17 20 4c9 2 15 9 15 18v6c0 4-3 7-7 7H29c-4 0-7-3-7-7z"
        className="fill-brand"
      />
      <path
        d="M96 30c3-3 7-4 11-4h19v21H78zM134 26h17c6 0 11 2 15 6l14 15h-46z"
        className="fill-white/85"
      />
      <path
        d="M22 66h8M210 66h8"
        className="stroke-white/60"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="68" cy="78" r="15" className="fill-neutral-800" />
      <circle cx="68" cy="78" r="6" className="fill-neutral-300" />
      <circle cx="176" cy="78" r="15" className="fill-neutral-800" />
      <circle cx="176" cy="78" r="6" className="fill-neutral-300" />
    </svg>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-2">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/**
 * One chip per car, plus "Add car". Shown wherever the customer picks which
 * car they're looking at or booking for.
 */
export function VehicleSwitcher({
  slug,
  vehicles,
  selectedId,
  onSelect,
  tone = "light",
}: {
  slug: string;
  vehicles: { id: string; plate: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tone?: "light" | "onBrand";
}) {
  const onBrand = tone === "onBrand";
  return (
    <div
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      role="radiogroup"
      aria-label="Choose a car"
    >
      {vehicles.map((vehicle) => {
        const active = vehicle.id === selectedId;
        return (
          <button
            key={vehicle.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(vehicle.id)}
            className={cn(
              "min-h-[40px] shrink-0 rounded-full border px-4 font-mono text-sm font-bold tracking-wider",
              onBrand
                ? active
                  ? "border-white bg-white text-neutral-900"
                  : "border-white/40 text-white"
                : active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-card",
            )}
          >
            {vehicle.plate}
          </button>
        );
      })}
      <Link
        to="/$slug/add-car"
        params={{ slug }}
        className={cn(
          "flex min-h-[40px] shrink-0 items-center gap-1 rounded-full border border-dashed px-4 text-sm font-semibold",
          onBrand ? "border-white/60 text-white" : "border-brand/50 text-brand",
        )}
      >
        <Plus className="h-4 w-4" /> Add car
      </Link>
    </div>
  );
}

type Tab = "home" | "car" | "bookings" | "account";

const TABS = [
  { key: "home", label: "Home", to: "/$slug/home", icon: House },
  { key: "car", label: "My car", to: "/$slug/car", icon: CarFront },
  { key: "bookings", label: "Bookings", to: "/$slug/bookings", icon: CalendarDays },
  { key: "account", label: "Account", to: "/$slug/account", icon: UserRound },
] as const;

/** The app's bottom navigation, on the four main screens. */
export function TabBar({ slug, active }: { slug: string; active: Tab }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid w-full max-w-[420px] grid-cols-4">
        {TABS.map(({ key, label, to, icon: Icon }) => {
          const isActive = key === active;
          return (
            <li key={key}>
              <Link
                to={to}
                params={{ slug }}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  isActive ? "text-brand" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    isActive && "bg-brand-soft",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Plain title header for the tab screens. */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mx-auto w-full max-w-[420px] px-5 pb-1 pt-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}

/** tel: and WhatsApp links from a workshop's phone number. */
export function phoneLinks(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 8 ? `65${digits}` : digits;
  return {
    tel: `tel:+${intl}`,
    whatsapp: `https://wa.me/${intl}`,
  };
}

export function directionsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
