import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { vehicleName } from "@/lib/vehicle-name";
import sedan from "@/assets/car-sedan.png";
import suv from "@/assets/car-suv.png";
import mpv from "@/assets/car-mpv.png";
import hatchback from "@/assets/car-hatchback.png";

type BodyType = "sedan" | "suv" | "mpv" | "hatchback";

const IMAGES: Record<BodyType, string> = { sedan, suv, mpv, hatchback };

const MODELS: Record<Exclude<BodyType, "sedan">, string[]> = {
  mpv: ["alphard", "vellfire", "noah", "voxy", "estima", "previa", "sienta", "wish", "serena", "elgrand", "odyssey", "stepwgn", "freed", "shuttle", "carnival", "sedona", "starex", "staria", "touran", "sharan", "multivan", "caddy", "c4 picasso", "grand picasso", "5008", "zafira", "v-class", "v class", "vito", "mazda5", "mazda 5", "stream", "exora", "spacia", "delica", "xpander"],
  suv: ["rav4", "harrier", "land cruiser", "prado", "fortuner", "corolla cross", "cx-3", "cx-30", "cx-5", "cx-8", "cx-9", "cx-60", "cr-v", "hr-v", "vezel", "br-v", "x-trail", "qashqai", "juke", "kicks", "outlander", "eclipse cross", "asx", "tucson", "santa fe", "kona", "creta", "sportage", "sorento", "seltos", "niro", "forester", "xv", "crosstrek", "outback", "x1", "x3", "x5", "x7", "glc", "gle", "gla", "glb", "gls", "q3", "q5", "q7", "q8", "tiguan", "touareg", "t-roc", "macan", "cayenne", "model y", "atto 3", "seal u", "range rover", "discovery", "defender", "evoque", "xc40", "xc60", "xc90", "3008", "2008", "ux", "nx", "rx", "lx", "yaris cross", "raize", "rush"],
  hatchback: ["jazz", "fit", "yaris", "swift", "march", "note", "mazda 2", "mazda2", "mazda 3 hatch", "golf", "polo", "i20", "i30", "picanto", "rio", "a-class", "a class", "1 series", "a1", "a3 sportback", "208", "clio", "fiesta", "focus", "mini", "leaf", "ioniq", "prius c", "aqua", "dolphin"],
};

export function bodyTypeFor(make: string, model: string): BodyType {
  const name = `${make} ${model}`.toLowerCase();
  for (const type of ["mpv", "suv", "hatchback"] as const) {
    if (MODELS[type].some((m) => name.includes(m))) return type;
  }
  return "sedan";
}

export const BODY_LABEL: Record<BodyType, string> = {
  sedan: "Sedan",
  suv: "SUV",
  mpv: "MPV",
  hatchback: "Hatchback",
};

function useSignedPhoto(path: string | null | undefined) {
  return useQuery({
    queryKey: ["vehicle-photo", path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("vehicle-photos").createSignedUrl(path!, 3600);
      return data?.signedUrl ?? null;
    },
  });
}

export function VehiclePhoto({
  vehicle,
  editable = true,
}: {
  vehicle: { id: string; make: string; model: string; photo_url?: string | null };
  editable?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const signed = useSignedPhoto(vehicle.photo_url);
  const type = bodyTypeFor(vehicle.make, vehicle.model);
  const custom = vehicle.photo_url ? signed.data : null;

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Please choose a photo."); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Photo must be under 8 MB."); return; }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("signed out");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${auth.user.id}/${vehicle.id}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("vehicle-photos").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      const { error } = await supabase.rpc("set_vehicle_photo", { _vehicle_id: vehicle.id, _photo_url: path });
      if (error) throw error;
      await queryClient.invalidateQueries();
      toast.success("Photo updated");
    } catch {
      toast.error("Couldn't upload the photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative -mx-2 mt-4 overflow-hidden rounded-3xl bg-gradient-to-b from-muted/40 to-muted">
      {custom ? (
        <img src={custom} alt={vehicleName(vehicle.make, vehicle.model)} className="aspect-[16/10] w-full object-cover" />
      ) : (
        <div className="relative">
          <img
            src={IMAGES[type]}
            alt={`${BODY_LABEL[type]} illustration`}
            width={1024}
            height={640}
            className="aspect-[16/10] w-full object-contain p-2"
          />
          <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm">
            {BODY_LABEL[type]}
          </span>
        </div>
      )}
      {editable ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              input.current?.click();
            }}
            disabled={busy}
            className="absolute bottom-3 right-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-card/95 px-3 text-xs font-semibold text-foreground shadow-md backdrop-blur"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {vehicle.photo_url ? "Change photo" : "Add your photo"}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
