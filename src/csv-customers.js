const normalizeHeader = (value = '') => String(value)
  .replace(/^\uFEFF/, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] || ''
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index]
    if (character === '"') {
      if (quoted && firstLine[index + 1] === '"') index += 1
      else quoted = !quoted
    } else if (!quoted && Object.hasOwn(counts, character)) counts[character] += 1
  }
  return Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0] || ','
}

function parseRows(text) {
  const delimiter = detectDelimiter(text)
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const input = String(text).replace(/^\uFEFF/, '')

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1 }
      else if (character === '"') quoted = false
      else field += character
      continue
    }
    if (character === '"') quoted = true
    else if (character === delimiter) { row.push(field); field = '' }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1
      row.push(field); field = ''
      if (row.some((value) => String(value).trim())) rows.push(row)
      row = []
    } else field += character
  }
  row.push(field)
  if (row.some((value) => String(value).trim())) rows.push(row)
  return { delimiter, rows }
}

const first = (row, aliases) => {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

const isTrue = (value) => ['1', 'true', 'yes', 'ja', 'y', 'akkoord', 'toegestaan'].includes(String(value || '').trim().toLowerCase())

function splitName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  return { first_name: parts.shift() || '', last_name: parts.join(' ') }
}

function mergeCustomer(current, incoming) {
  return {
    email: current.email,
    first_name: incoming.first_name || current.first_name,
    last_name: incoming.last_name || current.last_name,
    phone: incoming.phone || current.phone,
    address: {
      street: incoming.address.street || current.address.street,
      address2: incoming.address.address2 || current.address.address2,
      postal_code: incoming.address.postal_code || current.address.postal_code,
      city: incoming.address.city || current.address.city,
      country: incoming.address.country || current.address.country,
      country_code: incoming.address.country_code || current.address.country_code,
    },
    notes: incoming.notes || current.notes,
    marketing_opt_in: current.marketing_opt_in || incoming.marketing_opt_in,
  }
}

export function parseCustomerCsv(text) {
  const { delimiter, rows } = parseRows(text)
  const issues = []
  if (rows.length < 2) return { delimiter, headers: [], lineCount: 0, customers: [], duplicateCount: 0, issues: ['Het bestand bevat geen gegevensregels.'] }
  const headers = rows[0].map((header) => normalizeHeader(header))
  if (!headers.some(Boolean)) return { delimiter, headers: [], lineCount: 0, customers: [], duplicateCount: 0, issues: ['De kolomkoppen konden niet worden gelezen.'] }

  const customers = new Map()
  let duplicateCount = 0
  rows.slice(1).forEach((values, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']))
    const email = first(row, ['Email', 'E-mail', 'E-mailadres', 'Customer email']).toLowerCase()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      issues.push(`Regel ${index + 2}: een geldig e-mailadres ontbreekt.`)
      return
    }

    const names = splitName(first(row, ['Naam', 'Klantnaam', 'Customer name', 'Full name']))
    const street = first(row, ['Straat en huisnummer', 'Straat', 'Adres', 'Address', 'Address1', 'Default Address Address1', 'Billing Address 1'])
    const houseNumber = first(row, ['Huisnummer', 'House number'])
    const incoming = {
      email,
      first_name: first(row, ['Voornaam', 'First name', 'Firstname', 'Billing First Name']) || names.first_name,
      last_name: first(row, ['Achternaam', 'Last name', 'Lastname', 'Surname', 'Billing Last Name']) || names.last_name,
      phone: first(row, ['Telefoon', 'Telefoonnummer', 'Phone', 'Mobile', 'Mobiel', 'Default Address Phone', 'Billing Phone']),
      address: {
        street: [street, houseNumber].filter(Boolean).join(street && houseNumber ? ' ' : ''),
        address2: first(row, ['Toevoeging', 'Address2', 'Adresregel 2', 'Default Address Address2', 'Billing Address 2']),
        postal_code: first(row, ['Postcode', 'Zip', 'Postal code', 'Default Address Zip', 'Billing Postcode']).toUpperCase(),
        city: first(row, ['Plaats', 'Stad', 'City', 'Default Address City', 'Billing City']),
        country: first(row, ['Land', 'Country', 'Default Address Country', 'Billing Country']),
        country_code: first(row, ['Landcode', 'Country code', 'Default Address Country Code', 'Billing Country Code']).toUpperCase(),
      },
      notes: first(row, ['Notities', 'Notitie', 'Notes', 'Note']),
      marketing_opt_in: isTrue(first(row, ['Marketing toestemming', 'Marketing opt in', 'Accepts Marketing', 'Accepts Email Marketing', 'Nieuwsbrief'])),
    }

    if (customers.has(email)) {
      duplicateCount += 1
      customers.set(email, mergeCustomer(customers.get(email), incoming))
    } else customers.set(email, incoming)
  })

  return { delimiter, headers, lineCount: Math.max(0, rows.length - 1), customers: [...customers.values()], duplicateCount, issues }
}

export function customerImportTemplateCsv() {
  const headers = ['E-mailadres', 'Voornaam', 'Achternaam', 'Telefoon', 'Straat en huisnummer', 'Toevoeging', 'Postcode', 'Plaats', 'Land', 'Landcode', 'Marketing toestemming', 'Notities']
  const sample = ['klant@voorbeeld.nl', 'Voorbeeld', 'Klant', '0612345678', 'Voorbeeldstraat 1', '', '1234 AB', 'Amsterdam', 'Nederland', 'NL', 'nee', 'Voorbeeldregel — verwijder deze voor import']
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`
  return `\uFEFF${headers.map(quote).join(';')}\r\n${sample.map(quote).join(';')}\r\n`
}
