import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomer, fetchVehicle, type Customer, type Vehicle } from "@/lib/customer";

export type CustomerBundle = { customer: Customer; vehicle: Vehicle | null } | null;

/**
 * Loads the signed-in customer and their vehicle for this workshop.
 * Sends the visitor back to the sign-in screen when there is no session.
 */
export function useCustomer(slug: string) {
  const navigate = useNavigate();

  const query = useQuery<CustomerBundle>({
    queryKey: ["customer", slug],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      const customer = await fetchCustomer(slug);
      if (!customer) return null;
      const vehicle = await fetchVehicle(customer.id);
      return { customer, vehicle };
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.isLoading && query.data === null) {
      navigate({ to: "/$slug", params: { slug } });
    }
  }, [query.isLoading, query.data, navigate, slug]);

  return query;
}
