import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updatePassword } from "@/lib/auth";
import { BrandButton, useWorkshop } from "@/components/app/workshop-ui";
import { WorkshopLogo } from "@/components/app/app-shell";

export const Route = createFileRoute("/$slug/reset-password")({
  head: () => ({ meta: [{ title: "Set a new password" }, { name: "robots", content: "noindex" }] }),
  component: ResetPassword,
});

/** Opened from the password-reset email; the link signs the customer in. */
function ResetPassword() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // The client picks the recovery session up from the link; give it a moment.
    const timer = setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  async function save() {
    setBusy(true);
    try {
      await updatePassword(password);
      toast.success("Password updated.");
      navigate({ to: "/$slug/home", params: { slug } });
    } catch {
      toast.error("We couldn't update your password. Please request a new link.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[420px] flex-col px-5 pt-12">
      <div className="flex flex-col items-center text-center">
        <WorkshopLogo workshop={workshop} size={64} />
        <h1 className="mt-4 text-xl font-bold">Set a new password</h1>
      </div>
      <div className="app-card mt-8 p-5">
        {ready === false ? (
          <>
            <p className="text-sm text-muted-foreground">
              This link has expired or was already used. Request a new one from the sign-in screen.
            </p>
            <Link
              to="/$slug"
              params={{ slug }}
              className="mt-4 flex min-h-[48px] items-center justify-center rounded-lg border border-border text-sm font-semibold"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (password.length >= 8 && !busy && ready) void save();
            }}
          >
            <label htmlFor="new-password" className="text-sm font-medium">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="8+ characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 min-h-[52px] w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus:border-brand"
            />
            <BrandButton
              type="submit"
              disabled={password.length < 8 || busy || !ready}
              className="mt-5"
            >
              {busy ? "Saving…" : "Save password"}
            </BrandButton>
          </form>
        )}
      </div>
    </main>
  );
}
