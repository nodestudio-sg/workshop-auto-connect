import { useQuery } from "@tanstack/react-query";
import { adminOverview } from "@/lib/admin.functions";

/** Who's signed in to /admin and which workshops they can see. */
export function useOverview(enabled = true) {
  return useQuery({
    queryKey: ["admin", "overview"],
    enabled,
    queryFn: async () => {
      const res = await adminOverview();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    retry: false,
  });
}
