import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Car, KeyRound, LogOut, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCustomer } from "@/hooks/use-customer";
import { isDemoAccountEmail, setEmailAndPassword, signOut } from "@/lib/auth";
import { BrandButton, Loading, Pill, useWorkshop } from "@/components/app/workshop-ui";
import { InstallHint } from "@/components/app/install-hint";
import {
  directionsUrl,
  phoneLinks,
  ScreenHeader,
  SectionTitle,
  TabBar,
  WorkshopLogo,
} from "@/components/app/app-shell";

export const Route = createFileRoute("/$slug/account")({
  head: () => ({
    meta: [
      { title: "Account" },
      { name: "description", content: "Your details, sign-in options and workshop contact." },
    ],
  }),
  component: Account,
});

function Account() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();
  const { data, isLoading } = useCustomer(slug);

  const userQuery = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });

  if (isLoading || !data) return <Loading />;

  const { customer, vehicle } = data;
  const links = phoneLinks(workshop.phone);
  const email = userQuery.data?.email ?? null;
  const demoAccount = isDemoAccountEmail(email);

  return (
    <>
      <ScreenHeader title="Account" />
      <main className="mx-auto w-full max-w-[420px] space-y-3 px-4 pb-28 pt-3">
        <div className="app-card flex items-center gap-4 p-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-brand-soft text-xl font-semibold text-brand-strong">
            {customer.name[0]?.toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{customer.name}</p>
            <p className="text-sm text-muted-foreground">+65 {customer.mobile}</p>
            {vehicle ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Car className="h-3.5 w-3.5" /> {vehicle.plate} · {vehicle.make} {vehicle.model}
              </p>
            ) : null}
          </div>
        </div>

        <SectionTitle>Sign-in</SectionTitle>
        <div className="app-card divide-y divide-border">
          <div className="flex items-center gap-3 p-4">
            <Phone className="h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Mobile number</p>
              <p className="text-xs text-muted-foreground">+65 {customer.mobile}</p>
            </div>
            <Pill tone="success">On</Pill>
          </div>
          {demoAccount ? (
            <div className="flex items-center gap-3 p-4">
              <Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Email & password</p>
                <p className="text-xs text-muted-foreground">Not available on demo accounts.</p>
              </div>
            </div>
          ) : (
            <EmailPasswordForm currentEmail={email} onSaved={() => void userQuery.refetch()} />
          )}
        </div>

        <InstallHint slug={slug} workshopName={workshop.name} />

        <SectionTitle>Your workshop</SectionTitle>
        <div className="app-card divide-y divide-border">
          <div className="flex items-center gap-3 p-4">
            <WorkshopLogo workshop={workshop} size={40} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{workshop.name}</p>
              <p className="text-xs text-muted-foreground">{workshop.phone}</p>
            </div>
          </div>
          <ContactRow href={links.tel} icon={Phone} label="Call the workshop" />
          <ContactRow href={links.whatsapp} icon={MessageCircle} label="WhatsApp" external />
          <ContactRow
            href={directionsUrl(workshop.address)}
            icon={MapPin}
            label={workshop.address}
            external
          />
        </div>

        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate({ to: "/$slug", params: { slug } });
          }}
          className="app-card flex min-h-[52px] w-full items-center justify-center gap-2 text-[15px] font-semibold text-destructive"
        >
          <LogOut className="h-5 w-5" /> Sign out
        </button>
      </main>
      <TabBar slug={slug} active="account" />
    </>
  );
}

function ContactRow({
  href,
  icon: Icon,
  label,
  external = false,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex min-h-[52px] items-center gap-3 px-4 py-3 text-sm font-medium"
    >
      <Icon className="h-5 w-5 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">{label}</span>
    </a>
  );
}

function EmailPasswordForm({
  currentEmail,
  onSaved,
}: {
  currentEmail: string | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordValid = password.length >= 8;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <KeyRound className="h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Email & password</p>
          <p className="truncate text-xs text-muted-foreground">
            {currentEmail ? currentEmail : "Add them to sign in without a code"}
          </p>
        </div>
        <span className="text-sm font-medium text-brand">{currentEmail ? "Change" : "Add"}</span>
      </button>
    );
  }

  async function save() {
    setBusy(true);
    try {
      const needsConfirm = await setEmailAndPassword(email, password);
      toast.success(
        needsConfirm
          ? "Saved. Check your inbox to confirm the new email address."
          : "Saved. You can now sign in with your email and password.",
      );
      setPassword("");
      setOpen(false);
      onSaved();
    } catch {
      toast.error("We couldn't save that. Please check the email address and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (emailValid && passwordValid && !busy) void save();
      }}
    >
      <p className="text-sm font-medium">Email & password</p>
      <input
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        aria-label="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="min-h-[48px] w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus:border-brand"
      />
      <input
        type="password"
        autoComplete="new-password"
        placeholder="New password (8+ characters)"
        aria-label="New password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="min-h-[48px] w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus:border-brand"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[48px] flex-1 rounded-lg border border-border text-sm font-semibold"
        >
          Cancel
        </button>
        <BrandButton
          type="submit"
          disabled={!emailValid || !passwordValid || busy}
          className="min-h-[48px] flex-1"
        >
          {busy ? "Saving…" : "Save"}
        </BrandButton>
      </div>
    </form>
  );
}
