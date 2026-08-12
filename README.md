# ZOL Solutions website

Nieuwe ZOL Solutions-website, los van Shopify.

## Stack

- Vite voor de statische websitebuild
- Cloudflare Pages voor hosting en automatische deployments vanaf `main`
- Supabase voor toekomstige product-, klant- en orderdata

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
