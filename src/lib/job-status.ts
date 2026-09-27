export const STAGES = [
  { key: "arrived", label: "Arrived" },
  { key: "inspecting", label: "Inspecting" },
  { key: "awaiting_approval", label: "Waiting for your approval" },
  { key: "repairing", label: "Repairing" },
  { key: "ready", label: "Ready for collection" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export function stageIndex(status: string): number {
  const index = STAGES.findIndex((stage) => stage.key === status);
  return index === -1 ? STAGES.length - 1 : index;
}

export function statusLabel(status: string): string {
  if (status === "collected") return "Collected";
  return STAGES.find((stage) => stage.key === status)?.label ?? status;
}
