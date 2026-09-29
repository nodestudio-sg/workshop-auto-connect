/**
 * "Mazda" + "3" → "Mazda 3", but "Mazda" + "Mazda 3" → "Mazda 3" (not
 * "Mazda Mazda 3"): customers often type the make into the model field too.
 */
export function vehicleName(
  make: string | null | undefined,
  model: string | null | undefined,
): string {
  const mk = (make ?? "").trim();
  const md = (model ?? "").trim();
  if (!mk) return md;
  if (!md) return mk;
  const escaped = mk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${escaped}(?=$|[\\s\\-\\d])`, "i").test(md)) return md;
  return `${mk} ${md}`;
}
