// Zoekt een openbaar zakelijk e-mailadres op de website van een fysiopraktijk.
// Pure helpers zodat ze los van de edge function te testen zijn.

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "hotmail.nl", "outlook.com", "outlook.nl", "live.nl", "live.com", "icloud.com",
  "ziggo.nl", "kpnmail.nl", "kpnplanet.nl", "planet.nl", "xs4all.nl", "home.nl", "hetnet.nl", "upcmail.nl", "telfort.nl", "zeelandnet.nl", "quicknet.nl",
])
const SKIPPED_SITE_HOSTS = /(^|\.)(facebook|instagram|linkedin|google|youtube|twitter|x|tiktok|wa)\.(com|me|nl)$/i
const PREFERRED_LOCAL_PARTS = ["info", "praktijk", "contact", "receptie", "secretariaat", "administratie", "balie", "mail", "post"]
// Algemene postvakken: bruikbaar, maar een persoonlijk adres (jan@praktijk.nl) gaat voor.
const GENERIC_LOCAL_PARTS = /^(info|praktijk|contact|receptie|secretariaat|administratie|balie|mail|post|afspraak|afspraken|planning|fysio|fysiotherapie|team|office|kantoor|hallo|hello|welkom|zorg|spoed|factu|financ|boekhouding|vacature|sollicit|jobs|werkenbij|hr|support|service|algemeen|aanmelden|aanmelding)/i
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

export const isGenericEmail = (email) => GENERIC_LOCAL_PARTS.test(String(email || "").split("@")[0])

// Alleen adressen op het eigen domein van de praktijk, of een gangbare consumentenmail als die er niet is.
// Een persoonlijk adres gaat voor op een algemeen postvak, omdat de fysiomail zo persoonlijk mogelijk moet zijn.
export function pickPracticeEmail(candidates, websiteUrl) {
  const site = hostOf(websiteUrl)
  if (!site) return ""
  const siteRoot = site.split(".").slice(-2).join(".")
  const rank = (email) => {
    const local = email.split("@")[0]
    if (!GENERIC_LOCAL_PARTS.test(local)) return -1
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
// Met `personal` ook praktijken met alleen een algemeen adres, zodat we daar nog een persoonlijk adres zoeken.
export function leadsToScan(leads = [], { personal = false, type = "physio" } = {}) {
  return leads.filter((lead) => {
    if (lead?.type !== type || lead.outreach_opt_out || !normalizeWebsite(lead.website)) return false
    const email = String(lead.email || "").trim()
    if (!email) return !lead.email_scan_at
    return personal && isGenericEmail(email) && lead.email_scan_result !== "personal_checked"
  })
}

// Gangbare voornamen. Alleen een herkende naam telt, zodat amsterdam@ of vraag@ nooit "Beste Amsterdam" wordt.
const FIRST_NAMES = new Set("aad abdel abdul ad adam adriaan adrie agnes ahmed aimee alain albert alex alexander alexandra alice alicia alida alie aline amber amy ana andre andrea andreas angela angelique anita anja anke ankie ann anna anne anneke annelies annemarie annemieke annet annette anouk anton antoinette arend arie arjan arjen arnold arthur astrid babette barbara bart bas bastiaan bea beatrix ben benjamin bente bernadette bernard bert bianca bjorn bob boris bram brenda brigitte britt bruno carla carin carl carlijn carmen carolien caroline cas casper cathelijne cees celine charlotte chantal chris christa christian christiaan christine cindy claire claudia coen colin connie cor corina corine cornelis daan daisy dana daniel daniela danielle danny david debby demi dennis denise derk desiree dewi dick diederik dimitri dirk dominique dorien dorothea douwe dylan edwin eefje eelco egbert eline elise elisabeth ellen els elsa elske emiel emily emma erik erika erna esmee esther eva evelien evert ewout fabian fatima fenna femke fleur floor floris francis frank frans frederik freek frits gea geert gerard gerben gerda gerrit gert gijs gina greta guus hanna hanneke hannah hans harm harold harry hein hendrik henk henny herman hester hilde hugo ilse inge ingrid iris irma isabel isabelle ivo jaap jacco jacob jacqueline jan jana janine janneke jannes jasmijn jasper jeanette jelle jennifer jeroen jesse jet jim joanne jochem joep joey johan johanna john jolanda jolien jonas joost jop joris jos jose josephine joyce judith julia julian julie justin karin karen karel kees kevin kick kim klaas koen kees kris laura lars lea leon lex lieke lies lieve linda lisa lisanne liz lotte louise luc lucas lucy luuk maaike maarten madelon manon marc marcel marco margo maria marianne marieke marien marijke marijn marina mario marion marjolein mark marleen marloes martijn martin martine mathijs matthijs max maxime melanie melissa merel michael michel michelle miek mieke mike milan mirjam monique myrthe nadia natasja nathalie naomi niels nienke nick nico nicole niek nina noah noor olaf olivier pascal patrick paul paula peter petra pieter pim priscilla quinten rachel ramon raymond rebecca remco renate rene richard rick rik rob robert robbert robin roel roos rosa ruben rudi rutger ruud sabine sam samantha sander sandra sanne sara sarah saskia sebastiaan simon sjoerd sofie sophie stan stefan stefanie stephan steven susan suzanne sven tamara tanja tess teun thijs thomas tim timo tineke tirza tom tommy ton tonny twan valerie vera victor vincent wendy wesley wilco willem willemijn wim wouter yara yvonne zoe".split(" "))

// Voornaam uit een persoonlijk adres: jan@, jan.devries@ of kim_rijswijk@ wordt "Jan" of "Kim". Anders leeg.
export function firstNameFromEmail(email) {
  const local = String(email || "").split("@")[0].toLowerCase()
  const first = local.split(/[._\-0-9]+/).filter(Boolean)[0] || ""
  if (!FIRST_NAMES.has(first)) return ""
  return first.charAt(0).toUpperCase() + first.slice(1)
}

// Aanhef voor de fysiomail: eerst een handmatig ingevulde contactpersoon, dan een voornaam uit het adres, anders het team.
export function physioSalutationName({ contactPerson = "", email = "", practiceName = "" } = {}) {
  return String(contactPerson || "").trim() || firstNameFromEmail(email) || `team van ${String(practiceName || "").trim() || "de praktijk"}`
}


// Plaats uit het adres op de website: de eerste Nederlandse postcode gevolgd door een plaatsnaam ("1071 AB Amsterdam").
export function cityFromHtml(html) {
  const text = String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")
  const match = text.match(/\b[1-9]\d{3}\s?[A-Z]{2}[,\s]+([A-Z][a-zA-Z'\u00C0-\u017F]+(?:[- ](?:aan|den|de|der|op|[A-Z][a-zA-Z'\u00C0-\u017F]+))*)/)
  return match ? match[1].trim() : ""
}
