# ZOL Solutions website

De volledige ZOL Solutions-website en beheeromgeving zijn handmatig te bewerken in Visual Studio Code. Er is geen afgesloten page-builder nodig: de pagina's bestaan uit normale HTML, CSS en JavaScript.

## Openen in Visual Studio Code

Open `zol-solutions.code-workspace` door erop te dubbelklikken, of kies in Visual Studio Code **File → Open Workspace from File…**.

Vanuit een terminal kan het ook zo:

```bash
code zol-solutions.code-workspace
```

Installeer daarna de aanbevolen extensies wanneer Visual Studio Code dit vraagt. Gebruik **Terminal → Run Task… → ZOL: Website starten** om de lokale website te openen.

## Waar pas ik wat aan?

| Onderdeel | Bestand |
| --- | --- |
| Homepage en alle secties | `index.html` |
| Algemene vormgeving en responsive gedrag | `src/styles.css` |
| Interacties op de website | `src/main.js` en `src/site-runtime.js` |
| Productpagina | `product/index.html` en `src/product-commerce.js` |
| Winkelwagen | `src/cart.js` |
| Checkout | `checkout/index.html`, `src/checkout.js` en `src/checkout.css` |
| Contactpagina | `contact/index.html` |
| Kennisbank | `kennisbank/` en `src/knowledge.js` |
| Adminpagina | `admin/index.html` |
| Adminvormgeving | `src/admin.css` |
| Adminfunctionaliteit en Supabase-data | `src/admin.js` |
| Afbeeldingen en publieke bestanden | `public/` |
| Supabase-database en serverfuncties | `supabase/` |
| Pagina's die Vite bouwt | `vite.config.js` |

### Tekst of sectie op de homepage aanpassen

1. Open `index.html`.
2. Zoek met `Cmd + F` of `Ctrl + F` naar de zichtbare tekst of de `id` van de sectie.
3. Pas de tekst of HTML aan en sla op.
4. De lokale website ververst automatisch zolang `npm run dev` actief is.

### Kleur, ruimte of responsive gedrag aanpassen

Open `src/styles.css`. De algemene ontwerpvariabelen staan bovenin. Responsive aanpassingen staan in de `@media`-blokken lager in het bestand.

Voor de beheeromgeving gebruik je dezelfde werkwijze in `src/admin.css`. De HTML-structuur staat in `admin/index.html`; gegevens, tabellen, dialogen en acties worden opgebouwd in `src/admin.js`.

### Afbeelding vervangen

Plaats het nieuwe bestand in `public/images/` en verwijs er vanuit HTML of JavaScript naar met een pad vanaf `/images/`, bijvoorbeeld:

```html
<img src="/images/nieuwe-productfoto.jpg" alt="Duidelijke beschrijving" />
```

Bestanden in `dist/` nooit handmatig wijzigen. Die map wordt bij iedere build opnieuw gegenereerd.

## Stack

- Vite voor de statische websitebuild
- Cloudflare Pages voor hosting en automatische deployments vanaf `main`
- Supabase voor product-, klant-, order-, CMS- en e-maildata
- Supabase Edge Functions voor checkout, contact, Mollie-webhooks en transactionele e-mail

## Lokaal starten

```bash
cp .env.example .env
npm install
npm run dev
```

Vite toont daarna het lokale adres, meestal `http://127.0.0.1:5173/`. De beheeromgeving staat op `/admin/`.

Vul uitsluitend de publieke Supabase-waarden in:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Gebruik nooit een Supabase secret key of `service_role`-key in `VITE_`-variabelen.

## Build

```bash
npm run build
```

Cloudflare Pages publiceert de map `dist`.

Controleer vóór publicatie altijd:

```bash
npm run build
```

## Handmatig werken zonder het CMS

De CMS-velden in ZOL Admin schrijven dynamische inhoud naar Supabase. De broncode zelf blijft volledig lokaal bewerkbaar. Vaste lay-out, componenten, animaties en standaardteksten wijzig je in Visual Studio Code; dagelijkse content kan desgewenst via ZOL Admin worden bijgehouden.

Wijzig nooit de gegenereerde bestanden in `dist/` en zet geen geheime sleutels in HTML, JavaScript of een `VITE_`-variabele.

## Transactionele e-mail activeren

De mailflow staat standaard veilig uit. Activeer deze pas nadat het afzenderdomein bij Resend is geverifieerd:

1. Voer `supabase/email-system.sql` uit als de e-mailtabellen en betaaltrigger nog niet zijn gemigreerd.
2. Verifieer het ZOL-afzenderdomein in Resend.
3. Voeg `RESEND_API_KEY` toe aan de Supabase Edge Function Secrets; zet deze sleutel nooit in een `VITE_`-variabele of in Git.
4. Controleer in ZOL Admin onder **Instellingen → E-mail** het afzenderadres, antwoordadres en interne meldingsadres.
5. Schakel daar **Verzending activeren** in.

Daarna worden contactberichten naar het interne adres verstuurd, krijgen klant en beheer automatisch bericht zodra een bestelling betaald is, en kunnen beheerders vanuit een klantprofiel e-mailen. De betaalmail wordt getriggerd door de orderstatus; de Mollie-webhook werkt zodra ook `MOLLIE_API_KEY` server-side is ingesteld.

## Rechtstreeks opslaan in ZOL Teamagenda

Nieuwe afspraken uit ZOL Admin worden via de Supabase Edge Function `calendar-events` rechtstreeks in de vaste Google-agenda **ZOL Teamagenda** opgeslagen. De browser krijgt geen Google-sleutel en kan daardoor nooit stilletjes terugvallen op een persoonlijke agenda.

Voor de eenmalige serverkoppeling:

1. Maak in Google Cloud een serviceaccount aan en schakel de Google Calendar API in.
2. Deel ZOL Teamagenda met het e-mailadres van dat serviceaccount en geef **Wijzigingen aanbrengen in afspraken**.
3. Voeg `GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL` en `GOOGLE_CALENDAR_PRIVATE_KEY` toe als Supabase Edge Function Secrets. Gebruik voor de private key de volledige PEM-waarde; zowel echte regeleinden als `\\n` worden ondersteund.
4. Deploy `supabase/functions/calendar-events/index.ts` met JWT-verificatie ingeschakeld.

Zonder deze twee secrets weigert de admin de afspraak veilig met een duidelijke melding; er wordt niets in een persoonlijke agenda opgeslagen.

## Mollie activeren

De betaalintegratie draait volledig in Supabase Edge Functions. Plaats een Mollie-sleutel daarom alleen als server-side secret en nooit in `.env`, HTML of een `VITE_`-variabele.

1. Voeg in Supabase onder **Edge Functions → Secrets** de Mollie-testsleutel toe als `MOLLIE_API_KEY`.
2. Zet in ZOL Admin onder **Instellingen → Checkout & btw** Mollie aan.
3. Doorloop een testbestelling en controleer betaling, terugkeer naar de website, orderstatus en terugbetaling.
4. Vervang na een geslaagde test de secret door de live-sleutel.

De checkout ondersteunt `zol-solutions.pages.dev`, de branch-preview, `zolsolutions.nl`, `www.zolsolutions.nl` en de lokale ontwikkelomgeving. Voeg nieuwe productie- of previewdomeinen ook toe aan de originlijsten in `supabase/functions/create-checkout/index.ts` en `supabase/functions/_shared/email.ts`.

## Domein omschakelen

De website-assets in `public/media/` zijn lokaal opgeslagen en hebben geen Shopify-CDN meer nodig. De DNS-omschakeling kan daardoor zonder ontbrekende beelden worden uitgevoerd.

1. Bewaar vóór de verhuizing alle bestaande DNS-records, in het bijzonder MX, SPF, DKIM en DMARC voor e-mail.
2. Voeg `zolsolutions.nl` en `www.zolsolutions.nl` eerst toe aan het Cloudflare Pages-project.
3. Zet daarna de nameservers bij de domeinbeheerder om en controleer of alle mailrecords in Cloudflare staan.
4. Laat `www` permanent doorsturen naar `https://zolsolutions.nl`.
5. Controleer homepage, product, checkout, admin, privacy, voorwaarden, sitemap en e-mail voordat Shopify definitief wordt losgekoppeld.
