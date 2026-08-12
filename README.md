# ZOL Solutions website

Nieuwe ZOL Solutions-website, los van Shopify.

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

## Transactionele e-mail activeren

De mailflow staat standaard veilig uit. Activeer deze pas nadat het afzenderdomein bij Resend is geverifieerd:

1. Voer `supabase/email-system.sql` uit als de e-mailtabellen en betaaltrigger nog niet zijn gemigreerd.
2. Verifieer het ZOL-afzenderdomein in Resend.
3. Voeg `RESEND_API_KEY` toe aan de Supabase Edge Function Secrets; zet deze sleutel nooit in een `VITE_`-variabele of in Git.
4. Controleer in ZOL Admin onder **Instellingen → E-mail** het afzenderadres, antwoordadres en interne meldingsadres.
5. Schakel daar **Verzending activeren** in.

Daarna worden contactberichten naar het interne adres verstuurd, krijgen klant en beheer automatisch bericht zodra een bestelling betaald is, en kunnen beheerders vanuit een klantprofiel e-mailen. De betaalmail wordt getriggerd door de orderstatus; de Mollie-webhook werkt zodra ook `MOLLIE_API_KEY` server-side is ingesteld.
