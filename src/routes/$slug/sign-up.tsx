import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { cleanMobile, CodeError, requestCode, verifyCode } from "@/lib/auth";
import { ProfileError, updateMyProfile } from "@/lib/customer";
import { isDemoSignInActive } from "@/lib/demo-mode";
import { BrandButton, Pill, useWorkshop } from "@/components/app/workshop-ui";
import { WorkshopLogo } from "@/components/app/app-shell";
import {
  isValidEmail,
  isValidName,
  PROFILE_ERRORS,
  ProfileFields,
  type ProfileValues,
} from "@/components/app/profile-form";

export const Route = createFileRoute("/$slug/sign-up")({
  head: () => ({
    meta: [
      { title: "Create an account" },
      { name: "description", content: "Create an account to book servicing and track your car." },
    ],
  }),
  component: SignUp,
});

/** Singapore mobile numbers start with 8 or 9. */
const SG_MOBILE = /^[89]\d{7}$/;

function SignUp() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: demo = false, isPending: demoPending } = useQuery({
    queryKey: ["demo-sign-in", workshop.id],
    queryFn: () => isDemoSignInActive(workshop.id),
    staleTime: Infinity,
  });

  const [step, setStep] = useState<"details" | "code">("details");
  const [profile, setProfile] = useState<ProfileValues>({ name: "", email: "", company: "" });
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const detailsValid =
    isValidName(profile.name) && isValidEmail(profile.email) && SG_MOBILE.test(cleanMobile(mobile));

  async function sendCode() {
    setBusy(true);
    try {
      await requestCode(slug, mobile, demo);
      setCode("");
      setStep("code");
    } catch (error) {
      toast.error(
        error instanceof CodeError
          ? error.message
          : "We couldn't send a code just now. Please try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await verifyCode(slug, mobile, code, demo);
    } catch (error) {
      toast.error(
        error instanceof CodeError
          ? error.message
          : "That code didn't work, or it has expired. Please try again.",
      );
      setBusy(false);
      return;
    }

    try {
      await updateMyProfile({ workshopId: workshop.id, ...profile });
    } catch (error) {
      // Signed in either way. If the details didn't save, the one-time
      // "Tell us about you" step asks again; before migration 0005 there's
      // nowhere to save them, so carry on.
      if (!(error instanceof ProfileError && error.reason === "unavailable")) {
        toast.error(PROFILE_ERRORS[error instanceof ProfileError ? error.reason : "failed"]);
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["customer", slug] });
    toast.success(`Welcome, ${profile.name.trim().split(/\s+/)[0]}!`);
    navigate({ to: "/$slug/home", params: { slug } });
  }

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
        <div className="app-card p-6">
          <h2 className="text-lg">Create an account</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Book servicing, follow repairs live and keep every invoice in one place. Add your car
            now or later.
          </p>
          {demo ? (
            <div className="mb-4">
              <Pill>Demo sign-in</Pill>
            </div>
          ) : null}

          {step === "details" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (detailsValid && !busy && !demoPending) void sendCode();
              }}
            >
              <ProfileFields values={profile} onChange={setProfile} />
              <div className="mt-4">
                <label htmlFor="signup-mobile" className="text-sm font-medium">
                  Mobile number
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-md border border-input bg-card px-4 focus-within:border-brand-strong">
                  <span className="text-base text-muted-foreground">+65</span>
                  <input
                    id="signup-mobile"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="9123 4567"
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value.replace(/[^\d ]/g, ""))}
                    className="min-h-[52px] w-full bg-transparent text-base outline-none"
                  />
                </div>
                {mobile &&
                cleanMobile(mobile).length === 8 &&
                !SG_MOBILE.test(cleanMobile(mobile)) ? (
                  <p className="mt-1 text-xs text-attention">
                    Singapore mobile numbers start with 8 or 9.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {demo
                      ? "Demo: no code is sent. Any 6-digit code works."
                      : "We'll WhatsApp you a 6-digit code to confirm it's yours."}
                  </p>
                )}
              </div>
              <BrandButton
                type="submit"
                disabled={!detailsValid || busy || demoPending}
                className="mt-6"
              >
                {busy ? "Sending…" : "Send code"}
              </BrandButton>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (code.length === 6 && !busy) void finish();
              }}
            >
              <label htmlFor="signup-code" className="text-sm font-medium">
                Enter the 6-digit code
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {demo ? `Demo: any 6-digit code works for +65 ${mobile}` : `Sent on WhatsApp to +65 ${mobile}`}
              </p>
              <input
                id="signup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                maxLength={6}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-3 min-h-[56px] w-full rounded-md border border-input bg-card px-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-brand-strong"
              />
              <BrandButton type="submit" disabled={code.length !== 6 || busy} className="mt-5">
                {busy ? "Creating account…" : "Create account"}
              </BrandButton>
              <button
                type="button"
                onClick={() => {
                  setCode("");
                  setStep("details");
                }}
                className="mt-3 min-h-[44px] w-full text-sm text-muted-foreground"
              >
                Change details
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already a customer?{" "}
          <Link to="/$slug" params={{ slug }} className="font-semibold text-brand-strong">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
