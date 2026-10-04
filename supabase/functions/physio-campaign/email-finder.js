// Zoekt een openbaar zakelijk e-mailadres op de website van een fysiopraktijk.
// Pure helpers zodat ze los van de edge function te testen zijn.

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "hotmail.nl", "outlook.com", "outlook.nl", "live.nl", "live.com", "icloud.com",
  "ziggo.nl", "kpnmail.nl", "kpnplanet.nl", "planet.nl", "xs4all.nl", "home.nl", "hetnet.nl", "upcmail.nl", "telfort.nl", "zeelandnet.nl", "quicknet.nl",
])
const SKIPPED_SITE_HOSTS = /(^|\.)(facebook|instagram|linkedin|google|youtube|twitter|x|tiktok|wa)\.(com|me|nl)$/i
const PREFERRED_LOCAL_PARTS = ["info", "praktijk", "contact", "receptie", "secretariaat", "administratie", "balie", "mail", "post"]
const IGNORED_LOCAL_PARTS = /^(noreply|no-reply|donotreply|privacy|avg|fg|webmaster|postmaster|abuse|wordpress|admin|example|u00|sentry)/i
export const MAX_HTML = 400_000
const ASSET_SUFFIX = /\.(png|jpe?g|gif|svg|webp|avif|css|js|ico)$/i

const decodeEntities = (value) => String(value || "")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
  .replace(/&(commat|#64);/gi, "@").replace(/&period;/gi, ".").replace(/&amp;/gi, "&")

export function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, "") } catch { return "" }
}

export function normalizeWebsite(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return ""
    if (SKIPPED_SITE_HOSTS.test(url.hostname)) return ""
    return url.href
  } catch { return "" }
}

// Ruwe kandidaten uit mailto-links en zichtbare tekst, inclusief "info [at] praktijk.nl".
// Alleen kleine stukjes rond een @ of [at] worden doorzocht: een regex over de hele pagina
// loopt kwadratisch op lange tekenreeksen (inline afbeeldingen, geminificeerde scripts).
export function extractEmails(html) {
  const source = String(html || "").slice(0, MAX_HTML)
  const found = new Set()
  const windows = []
  const anchor = /@|&#0*64;|&#x0*40;|&commat;|[[(]\s*(?:at|apenstaartje)\s*[\])]/gi
  for (const match of source.matchAll(anchor)) {
    windows.push(source.slice(Math.max(0, match.index - 80), match.index + 120))
    if (windows.length >= 300) break
  }
  for (const chunk of windows) {
    const text = decodeEntities(chunk)
      .replace(/\s*[[(]\s*(at|apenstaartje)\s*[\])]\s*/gi, "@")
      .replace(/\s*[[(]\s*(dot|punt)\s*[\])]\s*/gi, ".")
    for (const match of text.matchAll(/mailto:([^"'?\s>]{1,120})/gi)) {
      try { found.add(decodeURIComponent(match[1]).trim().toLowerCase()) } catch { found.add(match[1].trim().toLowerCase()) }
    }
    for (const match of text.matchAll(/[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,100}\.[a-z]{2,24}/gi)) found.add(match[0].toLowerCase())
  }
  return [...found]
    .map((email) => email.replace(/^[._-]+|[._-]+$/g, ""))
    .filter((email) => /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/.test(email))
    .filter((email) => !ASSET_SUFFIX.test(email) && !IGNORED_LOCAL_PARTS.test(email.split("@")[0]))
}

// Alleen adressen op het eigen domein van de praktijk, of een gangbare consumentenmail als die er niet is.
export function pickPracticeEmail(candidates, websiteUrl) {
  const site = hostOf(websiteUrl)
  if (!site) return ""
  const siteRoot = site.split(".").slice(-2).join(".")
  const rank = (email) => {
    const local = email.split("@")[0]
    const index = PREFERRED_LOCAL_PARTS.findIndex((part) => local === part || local.startsWith(`${part}.`) || local.startsWith(`${part}-`))
    return index === -1 ? PREFERRED_LOCAL_PARTS.length : index
  }
  const own = candidates.filter((email) => {
    const domain = email.split("@")[1]
    return domain === site || domain.endsWith(`.${siteRoot}`) || domain === siteRoot
  })
  const pool = own.length ? own : candidates.filter((email) => FREE_MAIL_DOMAINS.has(email.split("@")[1]))
  return [...pool].sort((a, b) => rank(a) - rank(b))[0] || ""
}

// Contactpagina's op hetzelfde domein, met een vaste fallback als de homepage er geen link naar heeft.
export function contactPageUrls(html, baseUrl, max = 2) {
  const source = String(html || "").slice(0, MAX_HTML)
  const site = hostOf(baseUrl)
  const urls = []
  for (const match of source.matchAll(/<a\b[^>]{0,400}?href\s*=\s*["']([^"'#<>]{1,300})["'][^>]{0,400}>/gi)) {
    const after = source.slice(match.index + match[0].length, match.index + match[0].length + 200)
    const label = `${match[1]} ${after.split(/<\/a>/i)[0].replace(/<[^>]*>/g, " ")}`
    if (!/contact|bereikbaar|over[-\s]?ons|praktijkinfo/i.test(label)) continue
    try {
      const url = new URL(match[1], baseUrl)
      if (hostOf(url.href) !== site || !["http:", "https:"].includes(url.protocol)) continue
      url.hash = ""
      if (!urls.includes(url.href) && url.href !== baseUrl) urls.push(url.href)
    } catch { /* ongeldige link */ }
    if (urls.length >= max) break
  }
  if (!urls.length) { try { urls.push(new URL("/contact", baseUrl).href) } catch { /* geen fallback */ } }
  return urls.slice(0, max)
}

// Praktijken die nog geen e-mailadres hebben, wel een website, en nog niet eerder zijn doorzocht.
export function leadsToScan(leads = []) {
  return leads.filter((lead) => lead?.type === "physio" && !lead.outreach_opt_out && !String(lead.email || "").trim()
    && !lead.email_scan_at && normalizeWebsite(lead.website))
}
