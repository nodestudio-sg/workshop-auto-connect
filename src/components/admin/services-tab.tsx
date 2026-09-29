import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Pill } from "@/components/app/workshop-ui";
import { adminDeleteService, adminMoveService, adminSaveService } from "@/lib/admin.functions";
import type { AdminService, ServiceItem } from "@/lib/admin.server";
import {
  errorText,
  Field,
  GhostButton,
  inputCls,
  Panel,
  PrimaryButton,
} from "@/components/admin/admin-ui";

type Draft = {
  id?: string;
  name: string;
  description: string;
  price: string;
  quote: boolean;
  items: { label: string; amount: string }[];
};
const blank: Draft = { name: "", description: "", price: "", quote: false, items: [] };
const toDraft = (s: AdminService): Draft => ({
  id: s.id,
  name: s.name,
  description: s.description,
  price: String(s.price),
  quote: s.quote_after_inspection,
  items: s.components.map((c) => ({ label: c.label, amount: String(c.amount) })),
});

export function ServicesTab({
  workshopId,
  services,
}: {
  workshopId: string;
  services: AdminService[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "workshop", workshopId] });

  async function save() {
    if (!draft) return;
    setBusy(true);
    const components: ServiceItem[] = draft.items
      .filter((i) => i.label.trim())
      .map((i) => ({ label: i.label, amount: Number(i.amount) || 0 }));
    const res = await adminSaveService({
      data: {
        id: workshopId,
        service: {
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          description: draft.description,
          price: Number(draft.price) || 0,
          quote_after_inspection: draft.quote,
          components,
        },
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    toast.success("Saved. Customers see the new price straight away.");
    setDraft(null);
    await refresh();
  }
  async function remove(s: AdminService) {
    if (!window.confirm(`Remove "${s.name}"? Existing bookings keep their price.`)) return;
    const res = await adminDeleteService({ data: { id: workshopId, serviceId: s.id } });
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    await refresh();
  }
  async function move(s: AdminService, dir: -1 | 1) {
    await adminMoveService({ data: { id: workshopId, serviceId: s.id, dir } });
    await refresh();
  }
  const itemsTotal = (draft?.items ?? []).reduce((n, i) => n + (Number(i.amount) || 0), 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            What customers can book, in this order. Prices show in the app.
          </p>
          <PrimaryButton onClick={() => setDraft({ ...blank })}>
            <Plus className="h-4 w-4" />
            Add service
          </PrimaryButton>
        </div>
        {services.map((s, i) => (
          <Panel key={s.id} className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-base">{s.name}</b>
                  {s.quote_after_inspection ? (
                    <Pill tone="muted">Quoted after inspection</Pill>
                  ) : null}
                </div>
                {s.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                ) : null}
                {s.components.length ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Includes: {s.components.map((c) => c.label).join(" · ")}
                  </p>
                ) : null}
              </div>
              <div className="text-right text-lg font-bold">
                {s.quote_after_inspection && !s.price ? "Free check" : `S$${s.price.toFixed(2)}`}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <GhostButton onClick={() => setDraft(toDraft(s))}>
                <Pencil className="h-4 w-4" />
                Edit
              </GhostButton>
              <GhostButton disabled={i === 0} onClick={() => void move(s, -1)} aria-label="Move up">
                <ArrowUp className="h-4 w-4" />
              </GhostButton>
              <GhostButton
                disabled={i === services.length - 1}
                onClick={() => void move(s, 1)}
                aria-label="Move down"
              >
                <ArrowDown className="h-4 w-4" />
              </GhostButton>
              <GhostButton onClick={() => void remove(s)} className="text-destructive">
                <Trash2 className="h-4 w-4" />
                Remove
              </GhostButton>
            </div>
          </Panel>
        ))}
        {!services.length ? (
          <Panel className="text-center text-sm text-muted-foreground">
            No services yet. Add your first one.
          </Panel>
        ) : null}
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        {draft ? (
          <Panel>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{draft.id ? "Edit service" : "New service"}</h2>
              <button onClick={() => setDraft(null)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <Field label="Name">
                <input
                  className={inputCls}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Standard servicing"
                />
              </Field>
              <Field label="Description">
                <textarea
                  className={`${inputCls} min-h-[70px] py-2.5`}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>
              <Field label="Price (S$)">
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(e) =>
                    setDraft({ ...draft, price: e.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </Field>
              <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
                <span>
                  <b className="block">Quoted after inspection</b>
                  <span className="text-xs text-muted-foreground">
                    For work you can only price once you've seen the car.
                  </span>
                </span>
                <Switch
                  checked={draft.quote}
                  onCheckedChange={(v) => setDraft({ ...draft, quote: v })}
                />
              </label>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What's included
                </span>
                <div className="mt-1.5 space-y-2">
                  {draft.items.map((it, k) => (
                    <div key={k} className="flex gap-2">
                      <input
                        className={inputCls}
                        placeholder="e.g. Oil filter"
                        value={it.label}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            items: draft.items.map((x, j) =>
                              j === k ? { ...x, label: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <input
                        className={`${inputCls} w-24`}
                        placeholder="S$"
                        inputMode="decimal"
                        value={it.amount}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            items: draft.items.map((x, j) =>
                              j === k ? { ...x, amount: e.target.value.replace(/[^\d.]/g, "") } : x,
                            ),
                          })
                        }
                      />
                      <button
                        onClick={() =>
                          setDraft({ ...draft, items: draft.items.filter((_, j) => j !== k) })
                        }
                        aria-label="Remove item"
                        className="px-1 text-muted-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <GhostButton
                    onClick={() =>
                      setDraft({ ...draft, items: [...draft.items, { label: "", amount: "" }] })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add item
                  </GhostButton>
                  {draft.items.length && itemsTotal !== Number(draft.price) ? (
                    <p className="text-xs text-attention">
                      Items add up to S${itemsTotal.toFixed(2)}; the price is S$
                      {(Number(draft.price) || 0).toFixed(2)}.
                    </p>
                  ) : null}
                </div>
              </div>
              <PrimaryButton disabled={busy} onClick={() => void save()} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save service
              </PrimaryButton>
            </div>
          </Panel>
        ) : (
          <Panel className="text-sm text-muted-foreground">
            Choose <b>Edit</b> on a service, or <b>Add service</b>, to change what customers can
            book.
          </Panel>
        )}
      </div>
    </div>
  );
}
