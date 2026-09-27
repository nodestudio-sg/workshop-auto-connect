import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signInWithCode } from "@/lib/auth";
import { BrandButton, useWorkshop } from "@/components/app/workshop-ui";
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

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/$slug/car", params: { slug } });
    });
  }, [navigate, slug]);

  const mobileValid = mobile.replace(/\D/g, "").length === 8;
  const codeValid = code.length === 6;

  async function submitCode() {
    setBusy(true);
    try {
      await signInWithCode(slug, mobile);
      navigate({ to: "/$slug/car", params: { slug } });
    } catch {
      toast.error("We couldn't sign you in. Please try again.");
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
        {step === "mobile" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (mobileValid) setStep("code");
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
              We'll send you a 6-digit code to sign in.
            </p>
            <BrandButton type="submit" disabled={!mobileValid} className="mt-5">
              Send code
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
            <p className="mt-1 text-xs text-muted-foreground">Sent to +65 {mobile}</p>
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
