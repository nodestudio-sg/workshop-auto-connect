import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { adminCreateWorkshop } from "@/lib/admin.functions";
import { errorText, Field, inputCls, Panel, PrimaryButton } from "@/components/admin/admin-ui";
import { AppPreview, ColorPicker } from "@/components/admin/brand-preview";

export const Route = createFileRoute("/admin/new")({ component: NewWorkshop });

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);

function NewWorkshop() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [color, setColor] = useState("#1297ea");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await adminCreateWorkshop({
      data: { name, slug, brand_color: color, address, phone, demo_mode: demo },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    toast.success(`${name} is live at /${slug}`);
    await qc.invalidateQueries({ queryKey: ["admin"] });
    void navigate({
      to: "/admin/w/$workshopId",
      params: { workshopId: res.data },
      search: { tab: "share" },
    });
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <div className="space-y-5">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All workshops
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">New workshop</h1>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Panel>
          <form onSubmit={(e) => void create(e)} className="space-y-5">
            <Field label="Workshop name">
              <input
                className={inputCls}
                value={name}
                required
                placeholder="e.g. 88 AutoGarage"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugEdited) setSlug(toSlug(e.target.value));
                }}
              />
            </Field>
            <Field
              label="App link"
              hint="Lowercase letters, numbers and dashes. This can't be changed later."
            >
              <div className="flex items-center rounded-2xl border border-input bg-card focus-within:border-brand">
                <span className="pl-4 text-sm text-muted-foreground">
                  {origin.replace(/^https?:\/\//, "")}/
                </span>
                <input
                  className="min-h-[46px] w-full bg-transparent pr-4 text-[15px] outline-none"
                  value={slug}
                  required
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    setSlugEdited(true);
                  }}
                />
              </div>
            </Field>
            <Field label="Brand colour">
              <ColorPicker value={color} onChange={setColor} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Address">
                <input
                  className={inputCls}
                  value={address}
                  required
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Field>
              <Field label="Phone (gets new-booking WhatsApps)">
                <input
                  className={inputCls}
                  value={phone}
                  required
                  placeholder="6123 4567"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Demo mode</span>
                <span className="text-xs text-muted-foreground">
                  Any 6-digit code signs in. Only for showing the app, never for a live workshop.
                </span>
              </span>
              <Switch checked={demo} onCheckedChange={setDemo} />
            </label>
            <p className="text-xs text-muted-foreground">
              We'll add three starter services you can edit straight away. Logo, opening hours and
              prices are on the next screen.
            </p>
            <PrimaryButton type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create workshop
            </PrimaryButton>
          </form>
        </Panel>
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live preview
          </p>
          <AppPreview name={name} color={color} logo={null} />
        </div>
      </div>
    </div>
  );
}
