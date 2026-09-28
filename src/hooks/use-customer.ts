import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomer, fetchVehicles, type Customer, type Vehicle } from "@/lib/customer";

export type CustomerBundle = {
  customer: Customer;
  vehicles: Vehicle[];
  /** The car the customer is looking at: their last pick, else their first car. */
  vehicle: Vehicle | null;
} | null;

const selectedKey = (slug: string) => `selected-vehicle:${slug}`;

function readSelected(slug: string): string | null {
  try {
    return window.localStorage.getItem(selectedKey(slug));
  } catch {
    return null;
  }
}

/**
 * Loads the signed-in customer and their cars for this workshop.
 * Sends the visitor back to the sign-in screen when there is no session.
 */
export function useCustomer(slug: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery<CustomerBundle>({
    queryKey: ["customer", slug],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      const customer = await fetchCustomer(slug);
      if (!customer) return null;
      const vehicles = await fetchVehicles(customer.id);
      const picked = readSelected(slug);
      const vehicle = vehicles.find((v) => v.id === picked) ?? vehicles[0] ?? null;
      return { customer, vehicles, vehicle };
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.isLoading && query.data === null) {
      navigate({ to: "/$slug", params: { slug } });
    }
  }, [query.isLoading, query.data, navigate, slug]);

  /** Switch the car shown across the app (remembered on this device). */
  const selectVehicle = useCallback(
    async (vehicleId: string) => {
      try {
        window.localStorage.setItem(selectedKey(slug), vehicleId);
      } catch {
        /* the pick just won't be remembered */
      }
      await queryClient.invalidateQueries({ queryKey: ["customer", slug] });
    },
    [queryClient, slug],
  );

  return { ...query, selectVehicle };
}
