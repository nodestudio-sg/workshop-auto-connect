import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Trash2, UserPlus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { adminCreateOwner, adminRemoveOwner } from "@/lib/admin.functions";
import {
  errorText,
  Field,
  GhostButton,
  inputCls,
  Panel,
  PrimaryButton,
} from "@/components/admin/admin-ui";

function tempPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function OwnersTab({
  workshopId,
  owners,
}: {
  workshopId: string;
  owners: { id: string; email: string; created_at: string }[];
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(tempPassword());
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ email: string; password: string } | null>(null);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await adminCreateOwner({ data: { id: workshopId, email, password } });
    setBusy(false);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    setMade({ email: email.trim().toLowerCase(), password });
    setEmail("");
    setPassword(tempPassword());
    await refresh();
  }
  async function remove(id: string, who: string) {
    if (!window.confirm(`Remove ${who}'s access to this workshop?`)) return;
    const res = await adminRemoveOwner({ data: { id: workshopId, staffId: id } });
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    await refresh();
  }
  const loginText = made
    ? `Your Node Studio workshop login:\n${window.location.origin}/admin\nEmail: ${made.email}\nPassword: ${made.password}\n(Change it after signing in: tap your email at the top.)`
    : "";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <h2 className="text-lg font-bold">Add an owner login</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Owners sign in at /admin and see only this workshop: bookings, customers, services and
          branding.
        </p>
        <form onSubmit={(e) => void add(e)} className="mt-4 space-y-4">
          <Field label="Owner's email">
            <input
              type="email"
              required
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            label="Temporary password"
            hint="If this email already has a login, it's simply given access and keeps its own password."
          >
            <div className="flex gap-2">
              <input
                className={`${inputCls} font-mono`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <GhostButton
                type="button"
                onClick={() => setPassword(tempPassword())}
                aria-label="New password"
              >
                <Wand2 className="h-4 w-4" />
              </GhostButton>
            </div>
          </Field>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create login
          </PrimaryButton>
        </form>
        {made ? (
          <div className="mt-4 rounded-2xl bg-success-soft p-4 text-sm">
            <b>Login ready.</b> Send these details to the owner privately:
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-card p-3 font-mono text-xs">
              {loginText}
            </pre>
            <GhostButton
              className="mt-2"
              onClick={() =>
                void navigator.clipboard.writeText(loginText).then(() => toast.success("Copied"))
              }
            >
              <Copy className="h-4 w-4" />
              Copy
            </GhostButton>
          </div>
        ) : null}
      </Panel>
      <Panel>
        <h2 className="text-lg font-bold">Who has access</h2>
        <ul className="mt-3 divide-y divide-border/70">
          {owners.map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{o.email}</div>
                <div className="text-xs text-muted-foreground">
                  added {new Date(o.created_at).toLocaleDateString("en-SG")}
                </div>
              </div>
              <GhostButton onClick={() => void remove(o.id, o.email)} className="text-destructive">
                <Trash2 className="h-4 w-4" />
              </GhostButton>
            </li>
          ))}
          {!owners.length ? (
            <li className="py-3 text-sm text-muted-foreground">
              No owner logins yet. Only master accounts can manage this workshop.
            </li>
          ) : null}
        </ul>
      </Panel>
    </div>
  );
}
