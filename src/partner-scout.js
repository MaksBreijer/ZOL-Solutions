export const PARTNER_STATUSES = [
  ['new', 'Nieuw'],
  ['research', 'Te onderzoeken'],
  ['qualified', 'Kansrijk'],
  ['contacted', 'Benaderd'],
  ['follow_up', 'Opvolgen'],
  ['meeting', 'Gesprek gepland'],
  ['pilot', 'Pilot'],
  ['won', 'Samenwerking'],
  ['lost', 'Niet passend'],
]

export const PARTNER_TYPES = [
  ['physio', 'Fysiopraktijk'],
  ['school', 'School / LO'],
  ['sports_club', 'Sportclub'],
  ['retail', 'Sportretail'],
  ['medical', 'Zorgorganisatie'],
  ['other', 'Overig'],
]

export const PARTNER_REGIONS = [
  ['NL-NH', 'Noord-Holland'], ['NL-ZH', 'Zuid-Holland'], ['NL-UT', 'Utrecht'],
  ['NL-NB', 'Noord-Brabant'], ['NL-GE', 'Gelderland'], ['NL-OV', 'Overijssel'],
  ['NL-LI', 'Limburg'], ['NL-FL', 'Flevoland'], ['NL-FR', 'Friesland'],
  ['NL-GR', 'Groningen'], ['NL-DR', 'Drenthe'], ['NL-ZE', 'Zeeland'],
]

const now = () => new Date().toISOString()
const clean = (value = '') => String(value || '').trim()
const statusLabelMap = Object.fromEntries(PARTNER_STATUSES)
const typeLabelMap = Object.fromEntries(PARTNER_TYPES)
const regionLabelMap = Object.fromEntries(PARTNER_REGIONS)
const doneStatuses = new Set(['won', 'lost'])

const seedLeads = [
  {
    id: 'partner-tulp-hoofdklasse', name: 'Tulp Hoofdklasse', type: 'sports_club', city: '', region: 'Nederland',
    website: 'https://tulphoofdklasse.com/', score: 92, status: 'won', contact_name: '', contact_role: 'Jeugdsport / partnerships',
    match_reason: 'Bestaande partner met direct bereik onder hockeyclubs en jonge sporters.', angle: 'Jeugdhockey en blijven sporten met hielpijn.',
    source_provider: 'ZOL-netwerk', source_url: 'https://tulphoofdklasse.com/', last_verified_at: '2026-09-03T00:00:00.000Z', estimated_units: 20,
  },
  {
    id: 'partner-bb-kids-care', name: 'B&B Kids Care', type: 'medical', city: '', region: 'Nederland',
    website: 'https://benbkidscare.nl/', score: 95, status: 'won', contact_name: '', contact_role: 'Kinderzorg',
    match_reason: 'Bestaande zorgpartner met een doelgroep die sterk aansluit op ZOL.', angle: 'Kinderen met hielpijn praktisch en verantwoord ondersteunen.',
    source_provider: 'ZOL-netwerk', source_url: 'https://benbkidscare.nl/', last_verified_at: '2026-09-03T00:00:00.000Z', estimated_units: 16,
  },
  {
    id: 'partner-bp-college', name: 'BP College', type: 'school', city: '', region: 'Nederland',
    website: 'https://bpcollege.nl/', score: 88, status: 'won', contact_name: '', contact_role: 'Onderwijs / sport',
    match_reason: 'Bestaande onderwijspartner en ingang naar leerlingen, docenten en sportprogramma’s.', angle: 'Sportende leerlingen eerder herkennen en ondersteunen.',
    source_provider: 'ZOL-netwerk', source_url: 'https://bpcollege.nl/', last_verified_at: '2026-09-03T00:00:00.000Z', estimated_units: 12,
  },
  {
    id: 'partner-dutch-bootfitter', name: 'Dutch Bootfitter', type: 'retail', city: '', region: 'Nederland',
    website: 'https://www.bootfitter.nl/', score: 86, status: 'won', contact_name: '', contact_role: 'Retail / pasvorm',
    match_reason: 'Bestaande partner met expertise in pasvorm en een sportieve klantgroep.', angle: 'Comfort, stabiliteit en pasvorm voor jonge sporters.',
    source_provider: 'ZOL-netwerk', source_url: 'https://www.bootfitter.nl/', last_verified_at: '2026-09-03T00:00:00.000Z', estimated_units: 15,
  },
  {
    id: 'prospect-gijs-fysiotherapie', name: 'Gijs Fysiotherapie', type: 'physio', city: 'Haarlem', region: 'Noord-Holland',
    website: 'https://gijsfysiotherapie.nl/therapie/kinderfysiotherapie/', score: 94, status: 'qualified', contact_name: '', contact_role: 'Kinderfysiotherapeut',
    match_reason: 'Noemt Morbus Sever, groeipijn, enkelpijn en sportspecifieke revalidatie.', angle: 'Hoe zij sportende kinderen met Morbus Sever nu begeleiden.',
    source_provider: 'Openbare website', source_url: 'https://gijsfysiotherapie.nl/therapie/kinderfysiotherapie/', last_verified_at: '2026-09-03T00:00:00.000Z', estimated_units: 8,
  },
  {
    id: 'prospect-amsterdamfysio', name: 'AmsterdamFysio', type: 'physio', city: 'Amsterdam', region: 'Noord-Holland',
    website: 'https://www.amsterdamfysio.nl/fysiotherapievoor-kinderen/', score: 89, status: 'new', contact_name: '', contact_role: 'Kinderfysiotherapeut',
    match_reason: 'Combineert kinderfysiotherapie, sportblessures en aandacht voor het looppatroon.', angle: 'Hulpmiddelen bij sportende kinderen met voet- of hielpijn.',
    source_provider: 'Openbare website', source_url: 'https://www.amsterdamfysio.nl/fysiotherapievoor-kinderen/', last_verified_at: '2026-09-03T00:00:00.000Z', estimated_units: 7,
  },
  {
    id: 'prospect-arena-fysio', name: 'Arena Fysio', type: 'physio', city: 'Amsterdam Zuidoost', region: 'Noord-Holland',
    website: 'https://arena-fysio.nl/zuidoost/', score: 84, status: 'new', contact_name: '', contact_role: 'Sportfysiotherapeut',
    match_reason: 'Aandacht voor sportende kinderen en enkel- en voetrevalidatie.', angle: 'Wat ZOL aantoonbaar moet opleveren binnen return-to-sport.',
    source_provider: 'Openbare website', source_url: 'https://arena-fysio.nl/zuidoost/', last_verified_at: '2026-09-03T00:00:00.000Z', estimated_units: 6,
  },
]

export function defaultPartnerScoutState() {
  const stamp = now()
  return {
    version: 2,
    leads: seedLeads.map((lead) => ({
      email: '', phone: '', notes: '', next_action_at: '', last_contacted_at: '', tags: [],
      created_at: stamp, updated_at: stamp, ...lead,
    })),
    interactions: [],
    default_region: 'NL-NH',
    auto_refresh_days: 7,
    last_scan_at: '',
    scan_profile: '',
    last_scan_region: '',
    last_scan_added: 0,
    updated_at: stamp,
  }
}

export function normalizePartnerScoutState(value = {}) {
  const fallback = defaultPartnerScoutState()
  const leads = Array.isArray(value.leads) && value.leads.length ? value.leads : fallback.leads
  const allowedLeads = leads.filter((lead) => {
    const identity = [lead.type, lead.name, lead.contact_role, lead.match_reason, lead.website].map(clean).join(' ')
    return !/podotherap|podolog|podiatr|chiropod/i.test(identity)
  })
  const normalizedLeads = allowedLeads.map((lead, index) => ({
    id: clean(lead.id) || `partner-${index}-${Date.now()}`,
    name: clean(lead.name) || 'Naamloos contact',
    type: typeLabelMap[lead.type] ? lead.type : 'other',
    city: clean(lead.city), region: clean(lead.region), website: clean(lead.website),
    email: clean(lead.email), phone: clean(lead.phone), score: Math.max(0, Math.min(100, Number(lead.score) || 0)),
    status: statusLabelMap[lead.status] ? lead.status : 'new', contact_name: clean(lead.contact_name),
    contact_role: clean(lead.contact_role), match_reason: clean(lead.match_reason), angle: clean(lead.angle),
    notes: clean(lead.notes), next_action_at: clean(lead.next_action_at), last_contacted_at: clean(lead.last_contacted_at),
    tags: Array.isArray(lead.tags) ? lead.tags.map(clean).filter(Boolean).slice(0, 12) : [],
    source_provider: clean(lead.source_provider), source_url: clean(lead.source_url), external_id: clean(lead.external_id),
    last_verified_at: clean(lead.last_verified_at), estimated_units: Math.max(0, Math.min(10000, Number(lead.estimated_units) || 0)),
    created_at: clean(lead.created_at) || now(), updated_at: clean(lead.updated_at) || now(),
  }))
  const leadIds = new Set(normalizedLeads.map((lead) => lead.id))
  return {
    ...fallback,
    ...value,
    version: 2,
    leads: normalizedLeads,
    interactions: Array.isArray(value.interactions) ? value.interactions.filter((item) => leadIds.has(item.lead_id)).slice(0, 1000) : [],
  }
}

export const partnerStatusLabel = (status) => statusLabelMap[status] || status
export const partnerTypeLabel = (type) => typeLabelMap[type] || type
export const partnerRegionLabel = (region) => regionLabelMap[region] || region
export const partnerIsDone = (lead) => doneStatuses.has(lead?.status)

export function partnerStats(leads = [], today = new Date()) {
  const active = leads.filter((lead) => !partnerIsDone(lead))
  const due = active.filter((lead) => lead.next_action_at && new Date(lead.next_action_at) <= today)
  const hot = active.filter((lead) => lead.score >= 80)
  const won = leads.filter((lead) => lead.status === 'won')
  const stale = leads.filter((lead) => !lead.last_verified_at || today - new Date(lead.last_verified_at) > 90 * 86400000)
  const pipelineCents = active.reduce((sum, lead) => sum + (Number(lead.estimated_units) || 0) * 9995, 0)
  return { total: leads.length, active: active.length, due: due.length, hot: hot.length, won: won.length, stale: stale.length, pipelineCents }
}

export function filterPartnerLeads(leads = [], filters = {}) {
  const query = clean(filters.query).toLowerCase()
  return leads.filter((lead) => {
    const haystack = [lead.name, lead.city, lead.region, lead.type, partnerTypeLabel(lead.type), lead.contact_name, lead.contact_role, lead.email, lead.match_reason, ...(lead.tags || [])].join(' ').toLowerCase()
    if (query && !haystack.includes(query)) return false
    if (filters.type && lead.type !== filters.type) return false
    if (filters.status && lead.status !== filters.status) return false
    if (filters.flow === 'todo' && partnerIsDone(lead)) return false
    if (filters.flow === 'done' && !partnerIsDone(lead)) return false
    if (filters.priority === 'hot' && lead.score < 80) return false
    if (filters.priority === 'due' && (!lead.next_action_at || new Date(lead.next_action_at) > new Date())) return false
    return true
  }).sort((a, b) => {
    const dueA = a.next_action_at && new Date(a.next_action_at) <= new Date() ? 1 : 0
    const dueB = b.next_action_at && new Date(b.next_action_at) <= new Date() ? 1 : 0
    return dueB - dueA || b.score - a.score || a.name.localeCompare(b.name, 'nl')
  })
}

function leadCategory(element) {
  const tags = element.tags || {}
  if (['podiatrist', 'chiropodist'].includes(tags.healthcare) || /podotherap|podolog/i.test(tags.name || '')) return 'excluded'
  if (tags.healthcare === 'physiotherapist' || /fysio/i.test(`${tags.name || ''} ${tags['healthcare:speciality'] || ''}`)) return 'physio'
  if (['school', 'college'].includes(tags.amenity)) return 'school'
  if (tags.club === 'sport' || ['sports_centre', 'sports_club'].includes(tags.leisure)) return 'sports_club'
  return 'other'
}

function scoreDiscoveredLead(type, tags = {}) {
  let score = { physio: 80, sports_club: 66, school: 62, medical: 72, retail: 58, other: 48 }[type] || 48
  const text = Object.values(tags).join(' ').toLowerCase()
  if (/kind|jeugd|junior|youth/.test(text)) score += 10
  if (/sport|voetbal|hockey|tennis|atletiek|gymnastiek|handbal|basketbal/.test(text)) score += 7
  if (/voet|enkel|hiel|sever|podother/.test(text)) score += 8
  if (tags.website || tags['contact:website']) score += 3
  if (tags.email || tags['contact:email']) score += 4
  return Math.min(99, score)
}

export function parseOverpassLeads(payload, regionCode, stamp = now()) {
  const region = partnerRegionLabel(regionCode)
  return (payload?.elements || []).map((element) => {
    const tags = element.tags || {}
    const name = clean(tags.name || tags.operator || tags.brand)
    if (!name) return null
    const type = leadCategory(element)
    if (type === 'other' || type === 'excluded') return null
    const city = clean(tags['addr:city'] || tags['addr:place'] || tags['is_in:city'])
    const website = clean(tags.website || tags['contact:website'] || tags.url)
    const email = clean(tags.email || tags['contact:email'])
    const phone = clean(tags.phone || tags['contact:phone'])
    const score = scoreDiscoveredLead(type, tags)
    const sport = clean(tags.sport).replaceAll(';', ', ')
    const reason = type === 'physio' ? 'Openbare vermelding als fysiopraktijk; relevant voor kinderen met sportgerelateerde hielklachten.'
      : type === 'school' ? 'School met bereik onder leerlingen; kansrijk via LO-docent, zorgcoördinator of sportprogramma.'
        : `Sportorganisatie${sport ? ` voor ${sport}` : ''} met direct bereik onder sporters en begeleiders.`
    return {
      id: `osm-${element.type}-${element.id}`, external_id: `osm:${element.type}:${element.id}`, name, type, city, region,
      website, email, phone, score, status: 'new', contact_name: '',
      contact_role: type === 'school' ? 'LO-docent / zorgcoördinator' : type === 'sports_club' ? 'Jeugdcoördinator / medische staf' : 'Kinder- of sportfysiotherapeut',
      match_reason: reason, angle: type === 'school' ? 'Sportende leerlingen met terugkerende hielpijn eerder herkennen.' : type === 'sports_club' ? 'Jeugdleden langer verantwoord laten sporten.' : 'Ondersteuning bij sportende kinderen met hielpijn.',
      notes: '', next_action_at: '', last_contacted_at: '', tags: sport ? sport.split(',').map(clean) : [],
      source_provider: 'OpenStreetMap', source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      last_verified_at: stamp, estimated_units: type === 'school' ? 10 : type === 'sports_club' ? 12 : 6,
      created_at: stamp, updated_at: stamp,
    }
  }).filter(Boolean)
}

export function buildNominatimQueries(regionCode, type = 'all', limit = 180) {
  const region = partnerRegionLabel(regionCode || 'NL-NH')
  const terms = {
    physio: ['fysiotherapie'],
    school: ['middelbare school', 'basisschool'],
    sports_club: ['hockeyclub', 'voetbalclub', 'tennisclub', 'atletiekvereniging'],
  }
  const types = type === 'all' ? Object.keys(terms) : [terms[type] ? type : 'physio']
  const searches = types.flatMap((leadType) => terms[leadType].map((term) => ({ leadType, term })))
  const perSearch = Math.max(5, Math.min(50, Math.ceil((Number(limit) || 180) / searches.length)))
  return searches.map(({ leadType, term }) => ({
    type: leadType,
    url: `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=nl&addressdetails=1&extratags=1&namedetails=1&limit=${perSearch}&q=${encodeURIComponent(`${term} ${region}`)}`,
  }))
}

export function parseNominatimLeads(payload, type, regionCode, stamp = now()) {
  const typeTags = {
    physio: { healthcare: 'physiotherapist' },
    school: { amenity: 'school' },
    sports_club: { leisure: 'sports_club' },
  }
  const elements = (Array.isArray(payload) ? payload : []).map((item) => ({
    type: item.osm_type === 'N' ? 'node' : item.osm_type === 'W' ? 'way' : item.osm_type === 'R' ? 'relation' : item.osm_type,
    id: item.osm_id,
    tags: {
      ...(item.extratags || {}),
      ...(typeTags[type] || {}),
      name: item.namedetails?.name || item.name || clean(item.display_name).split(',')[0],
      'addr:city': item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || '',
    },
  }))
  return parseOverpassLeads({ elements }, regionCode, stamp)
}

export function mergeDiscoveredLeads(existing = [], discovered = []) {
  const byId = new Map(existing.map((lead) => [lead.external_id || lead.id, lead]))
  let added = 0
  let refreshed = 0
  discovered.forEach((incoming) => {
    const key = incoming.external_id || incoming.id
    const current = byId.get(key)
    if (!current) { byId.set(key, incoming); added += 1; return }
    byId.set(key, {
      ...incoming,
      ...current,
      name: incoming.name || current.name,
      city: incoming.city || current.city,
      region: incoming.region || current.region,
      website: incoming.website || current.website,
      email: incoming.email || current.email,
      phone: incoming.phone || current.phone,
      source_url: incoming.source_url || current.source_url,
      last_verified_at: incoming.last_verified_at,
      updated_at: incoming.updated_at,
    })
    refreshed += 1
  })
  return { leads: [...byId.values()].slice(0, 750), added, refreshed }
}

export function buildOverpassQuery(regionCode, type = 'all', limit = 180) {
  const region = regionLabelMap[regionCode] ? regionCode : 'NL-NH'
  const safeLimit = Math.max(10, Math.min(300, Number(limit) || 180))
  const blocks = {
    physio: ['nwr["healthcare"="physiotherapist"](area.searchArea);', 'nwr["healthcare:speciality"~"physiotherapy"](area.searchArea);'],
    school: ['nwr["amenity"~"school|college"](area.searchArea);'],
    sports_club: ['nwr["leisure"~"sports_centre|sports_club"](area.searchArea);', 'nwr["club"="sport"](area.searchArea);'],
  }
  const selected = type === 'all' ? Object.values(blocks).flat() : (blocks[type] || blocks.physio)
  return `[out:json][timeout:28];area["ISO3166-2"="${region}"][admin_level=4]->.searchArea;(${selected.join('')});out tags center ${safeLimit};`
}

export function partnerMailDraft(lead) {
  const firstName = clean(lead.contact_name).split(/\s+/)[0]
  const greeting = firstName ? `Hoi ${firstName}` : `Beste ${lead.name}`
  const intro = lead.type === 'school'
    ? 'Jullie bereiken dagelijks sportende leerlingen. Bij ZOL Solutions helpen we jonge sporters met hielpijn om comfortabel en verantwoord te blijven bewegen.'
    : lead.type === 'sports_club'
      ? 'Jullie begeleiden jonge sporters op het moment dat hielpijn training en plezier in de weg kan zitten. ZOL Solutions ontwikkelt hiervoor een praktische ondersteunende zool.'
      : 'Op jullie openbare informatie zagen we een duidelijke combinatie van jeugd, sport en bewegen. ZOL Solutions ontwikkelt een ondersteunende zool voor sportende kinderen met hielpijn.'
  const angle = lead.angle ? ` Vooral jullie aandacht voor ${lead.angle.charAt(0).toLowerCase()}${lead.angle.slice(1)} viel ons op.` : ''
  const ask = lead.status === 'won'
    ? 'Zullen we kort afstemmen welke volgende gezamenlijke stap de meeste waarde oplevert?'
    : 'Hebben jullie binnenkort 15 minuten om ervaringen uit te wisselen en te bekijken of een kleine samenwerking of pilot past?'
  return {
    subject: `Jonge sporters met hielpijn × ${lead.name}`,
    body: `${greeting},\n\n${intro}${angle}\n\n${ask}\n\nGroet,\nMaks & Thijn\nZOL Solutions\nhttps://zolsolutions.nl`,
  }
}

export function partnerCsv(leads = []) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const rows = [
    ['Organisatie', 'Type', 'Plaats', 'Regio', 'Score', 'Status', 'Contactpersoon', 'Rol', 'E-mail', 'Telefoon', 'Website', 'Volgende actie', 'Potentiële paren', 'Matchreden', 'Notities'],
    ...leads.map((lead) => [lead.name, partnerTypeLabel(lead.type), lead.city, lead.region, lead.score, partnerStatusLabel(lead.status), lead.contact_name, lead.contact_role, lead.email, lead.phone, lead.website, lead.next_action_at, lead.estimated_units, lead.match_reason, lead.notes]),
  ]
  return rows.map((row) => row.map(quote).join(',')).join('\n')
}
