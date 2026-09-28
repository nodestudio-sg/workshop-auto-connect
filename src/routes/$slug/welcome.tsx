import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { useCustomer } from "@/hooks/use-customer";
import { needsProfile, ProfileError, updateMyProfile } from "@/lib/customer";
import { Loading, useWorkshop } from "@/components/app/workshop-ui";
import { WorkshopLogo } from "@/components/app/app-shell";
import { PROFILE_ERRORS, ProfileForm } from "@/components/app/profile-form";

export const Route = createFileRoute("/$slug/welcome")({
  head: () => ({
    meta: [{ title: "Tell us about you" }, { name: "robots", content: "noindex" }],
  }),
  component: Welcome,
});

/**
 * The one-time step after a customer's first sign-in (or for anyone whose
 * profile is incomplete): name and email are required, company optional.
 */
function Welcome() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useCustomer(slug, { allowIncompleteProfile: true });

  // Already complete (or not supported yet): nothing to do here.
  useEffect(() => {
    if (data && !needsProfile(data.customer)) {
      navigate({ to: "/$slug/home", params: { slug } });
    }
  }, [data, navigate, slug]);

  if (isLoading || !data) return <Loading />;
  const { customer } = data;
  const placeholderName = customer.name === `Customer ${customer.mobile}`;

  return (
    <div className="flex min-h-[100dvh] flex-col px-5">
      <div className="mx-auto w-full max-w-[380px] border-b-2 border-brand-strong pb-8 pt-12">
        <div className="flex items-center gap-4">
          <WorkshopLogo workshop={workshop} size={52} />
          <div className="min-w-0">
            <h1 className="text-xl">Welcome to {workshop.name}</h1>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              One quick step
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[380px] flex-1 pb-10 pt-8">
        <div className="app-card p-6">
          <h2 className="text-lg">Tell us about you</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            So {workshop.name} knows who's booking. Signed in as +65 {customer.mobile}.
          </p>
          <ProfileForm
            initial={{
              name: placeholderName ? "" : customer.name,
              email: customer.email ?? "",
              company: customer.company_name ?? "",
            }}
            submitLabel="Continue"
            onSubmit={async (values) => {
              try {
                await updateMyProfile({ workshopId: workshop.id, ...values });
                await queryClient.invalidateQueries({ queryKey: ["customer", slug] });
                toast.success(`Welcome, ${values.name.trim().split(/\s+/)[0]}!`);
                navigate({ to: "/$slug/home", params: { slug } });
              } catch (error) {
                toast.error(
                  PROFILE_ERRORS[error instanceof ProfileError ? error.reason : "failed"],
                );
              }
            }}
          />
        </div>
      </main>
    </div>
  );
}
