import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Mail, MapPin, Phone, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  cleanMobile,
  NotACustomerError,
  requestCode,
  requestPasswordReset,
  signInWithEmail,
  verifyCode,
} from "@/lib/auth";
import { fetchCustomer } from "@/lib/customer";
import { isDemoSignInActive } from "@/lib/demo-mode";
import { BrandButton, Pill, useWorkshop } from "@/components/app/workshop-ui";
import { InstallHint } from "@/components/app/install-hint";
import { phoneLinks, WorkshopLogo } from "@/components/app/app-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/$slug/")({
  head: ({ params }) => ({
    meta: [
      { title: "Sign in" },
      {
        name: "description",
        content: `Sign in with your mobile number to see your car at ${params.slug}.`,
      },
      { property: "og:title", content: "Sign in" },
      {
        property: "og:description",
        content: "Sign in with your mobile number to see your car and book a service.",
      },
    ],
  }),
  component: SignInScreen,
});

const inputClass =
  "min-h-[52px] w-full rounded-md border border-input bg-card px-4 text-base outline-none transition-colors focus:border-brand-strong";

function SignInScreen() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();
  const [method, setMethod] = useState<"mobile" | "email">("mobile");

  // Demo sign-in only when DEMO_MODE is on in code AND this workshop is
  // flagged in the database. Until that answers, the real OTP path is used.
  const { data: demo = false, isPending: demoPending } = useQuery({
    queryKey: ["demo-sign-in", workshop.id],
    queryFn: () => isDemoSignInActive(workshop.id),
    staleTime: Infinity,
  });

  // Skip sign-in only if the session already belongs to a customer of THIS
  // workshop. A session from another workshop's link must still sign in here,
  // or the home screen would bounce straight back.
  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && (await fetchCustomer(slug))) {
        navigate({ to: "/$slug/home", params: { slug } });
      }
    });
  }, [navigate, slug]);

  const goHome = () => navigate({ to: "/$slug/home", params: { slug } });

  return (
    <div className="flex min-h-[100dvh] flex-col px-5">
      <div className="mx-auto w-full max-w-[380px] border-b-2 border-brand-strong pb-8 pt-12">
        <div className="flex items-center gap-4">
          <WorkshopLogo workshop={workshop} size={52} />
          <div className="min-w-0">
            <h1 className="truncate text-xl">{workshop.name}</h1>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Customer service portal
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[380px] flex-1 pb-10 pt-8">
        <div className="app-card overflow-hidden">
          <div className="p-6">
          <h2 className="mb-5 text-lg">Sign in</h2>
          {demo ? (
            <div className="mb-4">
              <Pill>Demo sign-in</Pill>
            </div>
          ) : null}

          <div
            role="tablist"
            aria-label="Sign-in method"
            className="grid grid-cols-2 border-b border-border"
          >
            <MethodTab
              active={method === "mobile"}
              onClick={() => setMethod("mobile")}
              icon={Smartphone}
              label="Mobile"
            />
            <MethodTab
              active={method === "email"}
              onClick={() => setMethod("email")}
              icon={Mail}
              label="Email"
            />
          </div>

          <div className="mt-6">
            {method === "mobile" ? (
              <MobileSignIn slug={slug} demo={demo} demoPending={demoPending} onDone={goHome} />
            ) : (
              <EmailSignIn slug={slug} workshopName={workshop.name} onDone={goHome} />
            )}
          </div>
          </div>
        </div>

        <div className="mt-6">
          <InstallHint slug={slug} workshopName={workshop.name} />
        </div>

        <div className="mt-8 space-y-1 border-t border-border pt-5 text-center text-xs text-muted-foreground">
          <p className="flex items-start justify-center gap-1.5 leading-relaxed">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {workshop.address}
          </p>
          <a
            href={phoneLinks(workshop.phone).tel}
             className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-brand-strong"
          >
            <Phone className="h-3.5 w-3.5" />
            {workshop.phone}
          </a>
        </div>
      </main>
    </div>
  );
}

function MethodTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Mail;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex min-h-[44px] items-center justify-center gap-2 border-b-2 text-sm font-semibold transition-colors",
        active ? "border-brand-strong text-foreground" : "border-transparent text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MobileSignIn({
  slug,
  demo,
  demoPending,
  onDone,
}: {
  slug: string;
  demo: boolean;
  demoPending: boolean;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"mobile" | "code">("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const mobileValid = cleanMobile(mobile).length === 8;
  const codeValid = code.length === 6;

  async function sendCode() {
    setBusy(true);
    try {
      await requestCode(mobile, demo);
      setCode("");
      setStep("code");
    } catch {
      toast.error("We couldn't send a code just now. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    try {
      await verifyCode(slug, mobile, code, demo);
      onDone();
    } catch {
      toast.error("That code didn't work, or it has expired. Please try again.");
      setBusy(false);
    }
  }

  if (step === "mobile") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (mobileValid && !busy && !demoPending) void sendCode();
        }}
      >
        <label htmlFor="mobile" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Mobile number
        </label>
        <div className="mt-2 flex items-center gap-2 rounded-md border border-input bg-card px-4 focus-within:border-brand-strong">
          <span className="text-base text-muted-foreground">+65</span>
          <input
            id="mobile"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="9123 4567"
            value={mobile}
            onChange={(event) => setMobile(event.target.value.replace(/[^\d ]/g, ""))}
            className="min-h-[52px] w-full bg-transparent text-base outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {demo
            ? "Demo: no code is sent. Any 6-digit code signs you in."
            : "We'll send you a 6-digit code to sign in."}
        </p>
        <BrandButton type="submit" disabled={!mobileValid || busy || demoPending} className="mt-5">
          {busy ? "Sending…" : "Send code"}
        </BrandButton>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (codeValid && !busy) void submitCode();
      }}
    >
      <label htmlFor="code" className="text-sm font-medium">
        Enter the 6-digit code
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        {demo ? `Demo: any 6-digit code works for +65 ${mobile}` : `Sent to +65 ${mobile}`}
      </p>
      <input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        value={code}
        maxLength={6}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        className="mt-3 min-h-[56px] w-full rounded-lg border border-input bg-card px-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-brand"
      />
      <BrandButton type="submit" disabled={!codeValid || busy} className="mt-5">
        {busy ? "Signing in…" : "Sign in"}
      </BrandButton>
      <button
        type="button"
        onClick={() => {
          setCode("");
          setStep("mobile");
        }}
        className="mt-3 min-h-[44px] w-full text-sm text-muted-foreground"
      >
        Change number
      </button>
    </form>
  );
}

function EmailSignIn({
  slug,
  workshopName,
  onDone,
}: {
  slug: string;
  workshopName: string;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit() {
    setBusy(true);
    try {
      await signInWithEmail(slug, email, password);
      onDone();
    } catch (error) {
      toast.error(
        error instanceof NotACustomerError
          ? `This email isn't linked to ${workshopName} yet. Sign in with your mobile number first.`
          : "That email or password isn't right. Please try again.",
      );
      setBusy(false);
    }
  }

  async function forgot() {
    if (!emailValid) {
      toast.error("Enter your email address first.");
      return;
    }
    try {
      await requestPasswordReset(slug, email);
      toast.success("If that email has an account, we've sent a link to reset the password.");
    } catch {
      toast.error("We couldn't send the reset email just now. Please try again.");
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (emailValid && password && !busy) void submit();
      }}
      className="space-y-3"
    >
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={cn(inputClass, "mt-2")}
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <button
            type="button"
            onClick={() => void forgot()}
            className="min-h-[36px] text-xs font-medium text-brand"
          >
            Forgot password?
          </button>
        </div>
        <div className="relative mt-1">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={cn(inputClass, "pr-12")}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <BrandButton type="submit" disabled={!emailValid || !password || busy} className="!mt-5">
        {busy ? "Signing in…" : "Sign in"}
      </BrandButton>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        First time? Sign in with your mobile number, then add an email and password in Account.
      </p>
    </form>
  );
}
