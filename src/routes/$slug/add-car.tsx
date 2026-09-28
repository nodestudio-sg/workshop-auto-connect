import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useCustomer } from "@/hooks/use-customer";
import { addVehicle, VehicleError } from "@/lib/customer";
import { BrandButton, Loading, TopBar, useWorkshop } from "@/components/app/workshop-ui";
import { NumberPlate } from "@/components/app/app-shell";

export const Route = createFileRoute("/$slug/add-car")({
  head: () => ({
    meta: [
      { title: "Add a car" },
      { name: "description", content: "Add your car so you can book and follow its servicing." },
    ],
  }),
  component: AddCar,
});

const MAKES = [
  "Toyota",
  "Honda",
  "Mazda",
  "Nissan",
  "Hyundai",
  "Kia",
  "Mercedes-Benz",
  "BMW",
  "Audi",
  "Volkswagen",
  "Lexus",
  "Mitsubishi",
  "Subaru",
  "Suzuki",
  "Tesla",
  "BYD",
  "Volvo",
  "Porsche",
];

const PLATE = /^[A-Z]{1,3}[0-9]{1,4}[A-Z]$/;
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear + 1 - 1990 + 1 }, (_, i) => thisYear + 1 - i);

const inputClass =
  "mt-2 min-h-[52px] w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus:border-brand";

const MESSAGES: Record<VehicleError["reason"], string> = {
  "plate-taken":
    "That car is already registered with the workshop under another customer. Please call them to have it moved to you.",
  "invalid-plate": "That doesn't look like a Singapore plate, e.g. SKA 1234 B.",
  invalid: "Please check the make, model and year.",
  "too-many": "You can have up to 5 cars. Call the workshop if you need more.",
  unavailable: "Adding a car isn't switched on yet. Please ask the workshop to add it for you.",
  failed: "We couldn't add your car just now. Please try again.",
};

function AddCar() {
  const { slug } = Route.useParams();
  const workshop = useWorkshop();
  const navigate = useNavigate();
  const { data, isLoading, selectVehicle } = useCustomer(slug);

  const [plate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [otherMake, setOtherMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading || !data) return <Loading />;

  const cleanPlate = plate.toUpperCase().replace(/\s/g, "");
  const finalMake = make === "Other" ? otherMake.trim() : make;
  const valid =
    PLATE.test(cleanPlate) && finalMake.length > 0 && model.trim().length > 0 && year !== "";

  async function save() {
    setBusy(true);
    try {
      const id = await addVehicle({
        workshopId: workshop.id,
        plate: cleanPlate,
        make: finalMake,
        model: model.trim(),
        year: Number(year),
        mileageKm: mileage ? Number(mileage.replace(/\D/g, "")) : null,
      });
      await selectVehicle(id);
      toast.success(`${cleanPlate} added.`);
      navigate({ to: "/$slug/home", params: { slug } });
    } catch (error) {
      toast.error(MESSAGES[error instanceof VehicleError ? error.reason : "failed"]);
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar backTo={{ to: "/$slug/home", params: { slug } }} />
      <main className="mx-auto w-full max-w-[420px] space-y-4 px-4 pb-12 pt-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add a car</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            So you can book it in and see its service history with {workshop.name}.
          </p>
        </div>

        <div className="flex flex-col items-center border-y border-border py-6">
          <NumberPlate
            plate={cleanPlate || "SKA1234B"}
            className={cleanPlate ? "" : "opacity-30"}
          />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Singapore vehicle registration
          </p>
        </div>

        <form
          className="app-card space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !busy) void save();
          }}
        >
          <div>
            <label htmlFor="plate" className="text-sm font-medium">
              Plate number
            </label>
            <input
              id="plate"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="SKA 1234 B"
              value={plate}
              maxLength={10}
              onChange={(event) => setPlate(event.target.value.toUpperCase())}
              className={`${inputClass} font-mono tracking-wider`}
            />
            {plate && !PLATE.test(cleanPlate) ? (
              <p className="mt-1 text-xs text-attention">
                Letters, numbers, then a letter — e.g. SKA 1234 B
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="make" className="text-sm font-medium">
              Make
            </label>
            <select
              id="make"
              value={make}
              onChange={(event) => setMake(event.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Choose a make
              </option>
              {MAKES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
            {make === "Other" ? (
              <input
                aria-label="Make"
                placeholder="Make"
                value={otherMake}
                maxLength={40}
                onChange={(event) => setOtherMake(event.target.value)}
                className={inputClass}
              />
            ) : null}
          </div>

          <div>
            <label htmlFor="model" className="text-sm font-medium">
              Model
            </label>
            <input
              id="model"
              placeholder="e.g. Corolla Altis 1.6"
              value={model}
              maxLength={60}
              onChange={(event) => setModel(event.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="year" className="text-sm font-medium">
                Year
              </label>
              <select
                id="year"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Year
                </option>
                {YEARS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mileage" className="text-sm font-medium">
                Mileage <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                id="mileage"
                inputMode="numeric"
                placeholder="km"
                value={mileage}
                onChange={(event) => setMileage(event.target.value.replace(/[^\d,]/g, ""))}
                className={inputClass}
              />
            </div>
          </div>

          <BrandButton type="submit" disabled={!valid || busy}>
            {busy ? "Adding…" : "Add car"}
          </BrandButton>
        </form>
      </main>
    </>
  );
}
