import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ImageUp, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  adminDeleteWorkshop,
  adminRemoveLogo,
  adminSetArchived,
  adminUpdateWorkshop,
  adminUploadLogo,
} from "@/lib/admin.functions";
import type { AdminWorkshop } from "@/lib/admin.server";
import {
  DAY_NAMES,
  errorText,
  Field,
  GhostButton,
  inputCls,
  Panel,
  PrimaryButton,
} from "@/components/admin/admin-ui";
import { AppPreview, ColorPicker } from "@/components/admin/brand-preview";
import { cn } from "@/lib/utils";

/** Shrinks an image to at most 512 px and returns it as a PNG data URL. */
async function toDataUrl(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function SettingsTab({
  workshop,
  role,
}: {
  workshop: AdminWorkshop;
  role: "master" | "owner";
}) {
  const [w, setW] = useState(workshop);
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["admin"] });
  };
  const set = <K extends keyof AdminWorkshop>(k: K, v: AdminWorkshop[K]) => setW({ ...w, [k]: v });

  async function save() {
    setBusy(true);
    const res = await adminUpdateWorkshop({
      data: {
        id: w.id,
        input: {
          name: w.name,
          brand_color: w.brand_color,
          address: w.address,
          phone: w.phone,
          tax_rate: w.tax_rate,
          open_days: w.open_days,
          slot_times: w.slot_times,
          slot_capacity: w.slot_capacity,
          booking_window_days: w.booking_window_days,
          min_notice_hours: w.min_notice_hours,
          ...(role === "master" ? { demo_mode: w.demo_mode } : {}),
        },
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    toast.success("Saved. The customer app has the changes now.");
    await refresh();
  }
  async function upload(f: File) {
    setUploading(true);
    try {
      const res = await adminUploadLogo({ data: { id: w.id, dataUrl: await toDataUrl(f) } });
      if (!res.ok) {
        toast.error(errorText(res.error));
        return;
      }
      set("logo_url", res.data);
      toast.success("Logo updated.");
      await refresh();
    } catch {
      toast.error(errorText("INVALID_IMAGE"));
    } finally {
      setUploading(false);
    }
  }
  async function archive(archived: boolean) {
    if (
      archived &&
      !window.confirm(
        `Archive ${w.name}? Customers won't be able to open the app until you restore it.`,
      )
    )
      return;
    const res = await adminSetArchived({ data: { id: w.id, archived } });
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    set("archived", archived);
    await refresh();
  }
  async function remove() {
    const typed = window.prompt(
      `Delete ${w.name} for good?\n\nThis also deletes all its customers, cars, bookings and service history. It can't be undone.\n\nType the workshop name to confirm:`,
    );
    if (typed == null) return;
    if (typed.trim() !== w.name) {
      toast.error("The name didn't match, so nothing was deleted.");
      return;
    }
    const res = await adminDeleteWorkshop({ data: { id: w.id, confirmName: typed.trim() } });
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    toast.success("Workshop deleted.");
    await refresh();
    void navigate({ to: "/admin" });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-5">
        <Panel>
          <h2 className="text-lg font-bold">Branding</h2>
          <div className="mt-4 space-y-5">
            <Field
              label="Logo"
              hint="PNG with a transparent background looks best. It shows at the top of the app."
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-border bg-white">
                  {w.logo_url ? (
                    <img src={w.logo_url} alt="" className="h-full w-full object-contain p-1" />
                  ) : (
                    <ImageUp className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={file}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
                <GhostButton onClick={() => file.current?.click()} disabled={uploading}>
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageUp className="h-4 w-4" />
                  )}
                  {w.logo_url ? "Replace logo" : "Upload logo"}
                </GhostButton>
                {w.logo_url ? (
                  <GhostButton
                    onClick={() =>
                      void adminRemoveLogo({ data: { id: w.id } }).then(() => {
                        set("logo_url", null);
                        void refresh();
                      })
                    }
                  >
                    Remove
                  </GhostButton>
                ) : null}
              </div>
            </Field>
            <Field label="Brand colour">
              <ColorPicker value={w.brand_color} onChange={(v) => set("brand_color", v)} />
            </Field>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-lg font-bold">Workshop details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                className={inputCls}
                value={w.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Phone" hint="New-booking WhatsApp alerts go to this number.">
              <input
                className={inputCls}
                value={w.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <input
                  className={inputCls}
                  value={w.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
            </div>
            <Field label="GST">
              <div className="flex gap-2">
                {[0, 0.09].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set("tax_rate", r)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold",
                      Math.abs(w.tax_rate - r) < 1e-6
                        ? "border-brand bg-brand text-white"
                        : "border-border bg-card",
                    )}
                  >
                    {r ? "9% GST included" : "No GST"}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-lg font-bold">Opening hours & booking rules</h2>
          <div className="mt-4 space-y-5">
            <Field label="Open on">
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((d, i) => {
                  const on = w.open_days.includes(i + 1);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        set(
                          "open_days",
                          on
                            ? w.open_days.filter((x) => x !== i + 1)
                            : [...w.open_days, i + 1].sort(),
                        )
                      }
                      className={cn(
                        "h-10 w-14 rounded-full border text-sm font-semibold",
                        on
                          ? "border-brand bg-brand text-white"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Booking times" hint="Customers pick from these times on open days.">
              <div className="flex flex-wrap items-center gap-2">
                {w.slot_times.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand"
                  >
                    {t}
                    <button
                      onClick={() =>
                        set(
                          "slot_times",
                          w.slot_times.filter((x) => x !== t),
                        )
                      }
                      aria-label={`Remove ${t}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="time"
                  className="min-h-[38px] rounded-full border border-input bg-card px-3 text-sm"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                />
                <GhostButton
                  disabled={!newTime}
                  onClick={() => {
                    if (!w.slot_times.includes(newTime))
                      set("slot_times", [...w.slot_times, newTime].sort());
                    setNewTime("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </GhostButton>
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Cars per time slot">
                <input
                  type="number"
                  min={1}
                  max={50}
                  className={inputCls}
                  value={w.slot_capacity}
                  onChange={(e) => set("slot_capacity", Number(e.target.value))}
                />
              </Field>
              <Field label="Book up to (days ahead)">
                <input
                  type="number"
                  min={1}
                  max={180}
                  className={inputCls}
                  value={w.booking_window_days}
                  onChange={(e) => set("booking_window_days", Number(e.target.value))}
                />
              </Field>
              <Field label="Minimum notice (hours)">
                <input
                  type="number"
                  min={0}
                  max={168}
                  className={inputCls}
                  value={w.min_notice_hours}
                  onChange={(e) => set("min_notice_hours", Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </Panel>

        {role === "master" ? (
          <Panel>
            <h2 className="text-lg font-bold">Master controls</h2>
            <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-muted/60 px-4 py-3">
              <span>
                <b className="block text-sm">Demo mode</b>
                <span className="text-xs text-muted-foreground">
                  Any 6-digit code signs in. Turn off before real customers use it.
                </span>
              </span>
              <Switch checked={w.demo_mode} onCheckedChange={(v) => set("demo_mode", v)} />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              {w.archived ? (
                <GhostButton onClick={() => void archive(false)}>
                  <RotateCcw className="h-4 w-4" />
                  Restore workshop
                </GhostButton>
              ) : (
                <GhostButton onClick={() => void archive(true)}>
                  <Archive className="h-4 w-4" />
                  Archive workshop
                </GhostButton>
              )}
              <GhostButton onClick={() => void remove()} className="text-destructive">
                <Trash2 className="h-4 w-4" />
                Delete workshop
              </GhostButton>
            </div>
          </Panel>
        ) : null}

        <div className="sticky bottom-4 z-10 flex justify-end">
          <PrimaryButton disabled={busy} onClick={() => void save()} className="shadow-lg">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save changes
          </PrimaryButton>
        </div>
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Live preview
        </p>
        <AppPreview name={w.name} color={w.brand_color} logo={w.logo_url} />
      </div>
    </div>
  );
}
