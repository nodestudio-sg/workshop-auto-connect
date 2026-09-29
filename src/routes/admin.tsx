import { useState } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminClaim, adminClaimStatus } from "@/lib/admin.functions";
import { useOverview } from "@/components/admin/use-overview";
import {
  ADMIN_BRAND,
  errorText,
  Field,
  GhostButton,
  inputCls,
  Panel,
  PrimaryButton,
  useSession,
} from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Node Studio Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

const LOGO = (
  <svg viewBox="300 300 400 400" className="h-7 w-7 text-brand" aria-hidden>
    <g fill="none" stroke="currentColor" strokeWidth="34" strokeLinecap="round">
      <path d="M616.8 388.1 A133 133 0 0 1 557.5 595" />
      <path d="M408.6 553.7 A133 133 0 0 1 592.1 363.7" />
      <path d="M355 625 L600 376" />
      <path d="M467 511 L558 600" />
    </g>
    <g fill="currentColor">
      <circle cx="355" cy="625" r="36" />
      <circle cx="540" cy="437" r="38" />
      <circle cx="558" cy="600" r="42" />
    </g>
  </svg>
);

function AdminLayout() {
  const session = useSession();
  const overview = useOverview(Boolean(session));
  const qc = useQueryClient();

  async function signOut() {
    await supabase.auth.signOut();
    qc.removeQueries({ queryKey: ["admin"] });
  }

  return (
    <div style={ADMIN_BRAND} className="min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/admin" className="flex items-center gap-2.5">
            {LOGO}
            <span className="whitespace-nowrap text-[17px] font-bold tracking-tight">
              Node Studio
            </span>
            <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">
              Admin
            </span>
          </Link>
          {session ? (
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <Link
                to="/admin/account"
                aria-label="Account"
                className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card sm:hidden"
              >
                <UserRound className="h-4 w-4" />
              </Link>
              <Link
                to="/admin/account"
                className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
              >
                {session.user.email}
              </Link>
              <GhostButton onClick={() => void signOut()} aria-label="Sign out">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </GhostButton>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        {session === undefined || (session && overview.isLoading) ? (
          <div className="grid place-items-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !session ? (
          <SignIn />
        ) : overview.error ? (
          <Panel className="mx-auto max-w-md text-center">
            <h1 className="text-lg font-bold">No admin access</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {errorText(overview.error.message)} You're signed in as {session.user.email}.
            </p>
            <PrimaryButton className="mt-5" onClick={() => void signOut()}>
              Sign in with another account
            </PrimaryButton>
          </Panel>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function SignIn() {
  const [mode, setMode] = useState<"signin" | "setup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "setup") {
        if (password !== confirm) {
          toast.error("The passwords don't match.");
          return;
        }
        const status = await adminClaimStatus({ data: { email } });
        if (!status.ok || !status.data) {
          toast.error(errorText(status.ok ? "NOT_CLAIMABLE" : status.error));
          return;
        }
        const claimed = await adminClaim({ data: { email, password } });
        if (!claimed.ok) {
          toast.error(errorText(claimed.error));
          return;
        }
        toast.success("Master account created. Signing you in…");
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast.error("That email and password don't match.");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mx-auto mt-6 max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">
        {mode === "signin" ? "Sign in" : "Set up the master account"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {mode === "signin"
          ? "For Node Studio and workshop owners."
          : "One time only, for the reserved master email. Choose the password you'll use from now on."}
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
        <Field label="Email">
          <input
            className={inputCls}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <input
            className={inputCls}
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "setup" ? 8 : undefined}
          />
        </Field>
        {mode === "setup" ? (
          <Field label="Confirm password">
            <input
              className={inputCls}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>
        ) : null}
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "signin" ? "Sign in" : "Create master account"}
        </PrimaryButton>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "setup" : "signin")}
        className="mt-5 w-full text-center text-sm font-medium text-brand"
      >
        {mode === "signin" ? "First time? Set up the master account" : "Back to sign in"}
      </button>
    </Panel>
  );
}
