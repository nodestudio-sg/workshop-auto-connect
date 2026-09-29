import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls, Panel, PrimaryButton } from "@/components/admin/admin-ui";

export const Route = createFileRoute("/admin/account")({ component: Account });

function Account() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("The passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("We couldn't change the password. Please try again.");
      return;
    }
    setPassword("");
    setConfirm("");
    toast.success("Password changed.");
  }

  return (
    <Panel className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">Change password</h1>
      <form onSubmit={(e) => void save(e)} className="mt-5 space-y-4">
        <Field label="New password">
          <input
            type="password"
            autoComplete="new-password"
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            autoComplete="new-password"
            className={inputCls}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <PrimaryButton type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save new password
        </PrimaryButton>
      </form>
    </Panel>
  );
}
