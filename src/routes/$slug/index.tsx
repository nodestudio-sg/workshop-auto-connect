import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cleanMobile, requestCode, verifyCode } from "@/lib/auth";
import { fetchCustomer } from "@/lib/customer";
import { isDemoSignInActive } from "@/lib/demo-mode";
import { BrandButton, Pill, useWorkshop } from "@/components/app/workshop-ui";
import { InstallHint } from "@/components/app/install-hint";

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

function SignInScreen() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();

  const [step, setStep] = useState<"mobile" | "code">("mobile");
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Demo sign-in only when DEMO_MODE is on in code AND this workshop is
  // flagged in the database. Until that answers, the real OTP path is used.
  const { data: demo = false, isPending: demoPending } = useQuery({
    queryKey: ["demo-sign-in", workshop.id],
    queryFn: () => isDemoSignInActive(workshop.id),
    staleTime: Infinity,
  });

  // Skip sign-in only if the session already belongs to a customer of THIS
  // workshop. A session from another workshop's link must still sign in here,
  // or the car screen would bounce straight back.
  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      if (data.session && (await fetchCustomer(slug))) {
        navigate({ to: "/$slug/car", params: { slug } });
      }
    });
  }, [navigate, slug]);

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
      navigate({ to: "/$slug/car", params: { slug } });
    } catch {
      toast.error("That code didn't work, or it has expired. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-5 pb-10 pt-12">
      <div className="flex flex-col items-center text-center">
        {workshop.logo_url ? (
          <img
            src={workshop.logo_url}
            alt={workshop.name}
            width={88}
            height={88}
            className="rounded-2xl object-cover"
            style={{ height: 88, width: 88 }}
          />
        ) : null}
        <h1 className="mt-4 text-xl font-bold">{workshop.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your car, your service history</p>
      </div>

      <div className="app-card mt-8 p-5">
        {demo ? (
          <div className="mb-4">
            <Pill>Demo sign-in</Pill>
          </div>
        ) : null}
        {step === "mobile" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (mobileValid && !busy && !demoPending) void sendCode();
            }}
          >
            <label htmlFor="mobile" className="text-sm font-medium">
              Mobile number
            </label>
            <div className="mt-2 flex items-center gap-2 rounded-md border border-input bg-card px-3">
              <span className="text-sm text-muted-foreground">+65</span>
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
            <BrandButton
              type="submit"
              disabled={!mobileValid || busy || demoPending}
              className="mt-5"
            >
              {busy ? "Sending…" : "Send code"}
            </BrandButton>
          </form>
        ) : (
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
              className="mt-3 min-h-[56px] w-full rounded-md border border-input bg-card px-3 text-center text-2xl tracking-[0.4em] outline-none"
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
        )}
      </div>

      <div className="mt-4">
        <InstallHint slug={slug} workshopName={workshop.name} />
      </div>

      <p className="mt-auto pt-8 text-center text-xs leading-relaxed text-muted-foreground">
        {workshop.address}
        <br />
        {workshop.phone}
      </p>
    </main>
  );
}
