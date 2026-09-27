export function money(amount: number): string {
  return `S$${Number(amount).toLocaleString("en-SG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function km(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString("en-SG")} km`;
}

export function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function dayLabel(value: string): { weekday: string; day: string; month: string } {
  const date = new Date(`${value}T00:00:00`);
  return {
    weekday: date.toLocaleDateString("en-SG", { weekday: "short" }),
    day: date.toLocaleDateString("en-SG", { day: "numeric" }),
    month: date.toLocaleDateString("en-SG", { month: "short" }),
  };
}
