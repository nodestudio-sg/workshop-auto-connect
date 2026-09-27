# Workshop Connect

Build a mobile-first customer web app (installable PWA) for Singapore car workshops. It is the customer-facing half of an existing workshop management system. Use Lovable Cloud for data and auth.

WHITE-LABEL BY URL PATH
Every workshop gets its own branded app at a path:
  /sgcarservices  -> SG Car Services
  /88autogarage   -> 88 AutoGarage
The workshop's name, logo, brand colour, address and tax rate come from the workshop record and are applied throughout that workshop's screens. The root path / shows only a simple message telling the visitor to open their workshop's own link. No marketing site.

PWA REQUIREMENTS (important, build these from the start)
- Installable per workshop. A customer who opens /sgcarservices and adds it to their home screen must get an icon and app name for SG CAR SERVICES, not for the platform.
- Serve a dynamic web app manifest per workshop at /:slug/manifest.webmanifest with name, short_name, theme_color, background_color and icons taken from that workshop's record, and with start_url and scope both set to /:slug/
- Reference it with <link rel="manifest"> pointing at the current workshop's manifest.
- Include apple-touch-icon and apple-mobile-web-app-title so iOS shows the workshop's name.
- Service worker so it opens standalone and shows a cached offline screen with no connection.
- On first visit, show a dismissible "Add to home screen" hint with the correct instructions for iOS Safari and for Android Chrome. Remember the dismissal.

DESIGN
Mobile-first, single column, max width 420px, generous tap targets.
Workshop brand colour for identity and primary buttons, default #1b8ed4.
Orange #ef7a1f used only for things needing attention - status pills and counts.
Charcoal #2f3a41 text, #f5f7fa page background, white cards, 8px radius, subtle borders.
Inter font. Currency S$. The tax rate comes from the workshop record: SG Car Services is 0%, so totals must show "No GST".

SCREENS

1. Sign in, at /:slug
Workshop logo and name. Enter mobile number, then a 6-digit code. DEMO BEHAVIOUR: accept any 6 digits and sign the customer in. Keep the session.

2. My car
The signed-in customer's vehicle: plate, make, model, year, last recorded mileage. A banner showing when the next service is due. Below it, service history - date, work done, mileage, amount, paid or unpaid. Tapping a past job expands to show its inspection photos and a link to its invoice. A prominent "Book a service" button.

3. Book a service
Services suitable for this car, each showing an itemised price: engine oil (product name, viscosity spec, litres), oil filter, labour. The customer ticks what they want and a sticky bottom bar shows the running total. Then they pick a preferred date and time from the workshop's slots, with some slots shown as unavailable. Name, mobile and vehicle are pre-filled from the customer record. Submitting creates a BOOKING REQUEST.

4. Request sent
States clearly that the slot is REQUESTED and NOT CONFIRMED, and that the workshop will message to confirm it or offer another time. Shows the service, the estimate and the workshop address.

5. My car today
Live job progress as a vertical tracker: Arrived, Inspecting, Waiting for your approval, Repairing, Ready for collection, with timestamps on completed stages. If extra work was found during inspection, show the reason, the inspection photos and the added price, with "Approve" and "Ask a question" buttons. Approving advances the tracker and adds the item to the total.

DATA
workshops: slug, name, logo, brand colour, address, phone, tax rate
customers: name, mobile, workshop
vehicles: plate, make, model, year, mileage, oil grade, oil capacity in litres, oil filter, owner
services: workshop, name, description, itemised components, price
jobs: vehicle, workshop, status, dates, line items, photos, total, paid
booking_requests: customer, vehicle, chosen services, preferred date and time, status (requested / confirmed / declined), and a snapshot of the price that was shown at submission

RULES
- A requested time must never look confirmed anywhere in the interface.
- Never show internal cost, margin or supplier information.
- A customer only ever sees their own vehicles, jobs, photos and invoices.
- All data is scoped to one workshop; a customer of one workshop can never see another workshop's data.

SEED DATA
Workshop 1: slug sgcarservices, name "SG Car Services", 60 Jalan Lam Huat, Sungei Kadut, brand colour #1b8ed4, tax rate 0.
Workshop 2: slug 88autogarage, name "88 AutoGarage", a clearly different brand colour, so the white-labelling is visibly working.

For SG Car Services:
Customer Tan Wei Ming, mobile 91234567.
Vehicle SJT8888T, Toyota Alphard 2.5, 2019, 92,400 km, 0W-20, 4.2 litres, genuine Toyota oil filter.
Four past jobs across the last 18 months with realistic Singapore prices, one of them with three inspection photos.
One active job today at "Waiting for your approval", with front brake pads at +$180 pending approval.
Three bookable services: Standard servicing $138 (engine oil $88, oil filter $18, labour $32), Major servicing $268, and Brake inspection at no charge, quoted after inspection.

DO NOT BUILD
Multiple oil product choices, online payment, multiple vehicles per customer, any workshop or staff screens, an admin area, or marketing pages.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://workshop-auto-connect.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/16432a26-f03e-4d19-9d89-8089d3c5a9a2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
