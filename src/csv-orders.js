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
      if (character === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
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

function moneyToCents(value) {
  let normalized = String(value ?? '').trim().replace(/[^0-9,.-]/g, '')
  if (!normalized) return 0
  const comma = normalized.lastIndexOf(',')
  const dot = normalized.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    normalized = normalized.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.')
  } else if (comma >= 0) {
    const decimals = normalized.length - comma - 1
    normalized = decimals > 0 && decimals <= 2 ? normalized.replace(',', '.') : normalized.replace(/,/g, '')
  } else if (dot >= 0) {
    const decimals = normalized.length - dot - 1
    if (decimals === 0 || decimals > 2) normalized = normalized.replace(/\./g, '')
  }
  const amount = Number(normalized)
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0
}

function dateToIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw)
    if (serial > 20000 && serial < 100000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString()
  }
  const dutch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (dutch) {
    const [, day, month, year, hour = '12', minute = '00', second = '00'] = dutch
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}`)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

const first = (row, aliases) => {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

const isTrue = (value) => ['1', 'true', 'yes', 'ja', 'y'].includes(String(value || '').trim().toLowerCase())

function splitName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)
  return { first_name: parts.shift() || '', last_name: parts.join(' ') }
}

function paymentStatus(value) {
  const status = String(value || '').trim().toLowerCase().replaceAll(' ', '_')
  if (['paid', 'betaald', 'authorized'].includes(status)) return 'paid'
  if (['refunded', 'terugbetaald'].includes(status)) return 'refunded'
  if (['partially_refunded', 'partial_refund', 'gedeeltelijk_terugbetaald'].includes(status)) return 'partially_refunded'
  if (['voided', 'failed', 'mislukt', 'cancelled', 'canceled'].includes(status)) return 'failed'
  return 'pending'
}

function fulfillmentStatus(value) {
  const status = String(value || '').trim().toLowerCase().replaceAll(' ', '_')
  if (['fulfilled', 'delivered', 'bezorgd'].includes(status)) return 'delivered'
  if (['shipped', 'verzonden'].includes(status)) return 'shipped'
  if (['partial', 'processing', 'in_behandeling'].includes(status)) return 'processing'
  if (['returned', 'retour'].includes(status)) return 'returned'
  return 'unfulfilled'
}

function itemFromRow(row) {
  const productName = first(row, ['Lineitem name', 'Productnaam', 'Product', 'Artikel'])
  const sku = first(row, ['Lineitem sku', 'SKU', 'Artikelnummer'])
  if (!productName && !sku) return null
  const variantName = first(row, ['Lineitem variant', 'Variant', 'Maat'])
  const quantity = Math.max(1, Math.round(Number(first(row, ['Lineitem quantity', 'Aantal', 'Quantity'])) || 1))
  const unitPriceCents = moneyToCents(first(row, ['Lineitem price', 'Stukprijs', 'Prijs', 'Unit price']))
  return {
    product_name: productName || 'Geïmporteerd artikel',
    variant_name: variantName,
    sku,
    quantity,
    unit_price_cents: unitPriceCents,
    total_cents: unitPriceCents * quantity,
  }
}

export function parseOrderCsv(text) {
  const { delimiter, rows } = parseRows(text)
  const issues = []
  if (rows.length < 2) return { delimiter, headers: [], lineCount: 0, orders: [], issues: ['Het bestand bevat geen gegevensregels.'] }
  const headers = rows[0].map((header) => normalizeHeader(header))
  if (!headers.some(Boolean)) return { delimiter, headers: [], lineCount: 0, orders: [], issues: ['De kolomkoppen konden niet worden gelezen.'] }

  const grouped = new Map()
  rows.slice(1).forEach((values, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']))
    const externalReference = first(row, ['Name', 'Bestelnummer', 'Ordernummer', 'Order number', 'Order ID'])
    const email = first(row, ['Email', 'E-mail', 'E-mailadres', 'Customer email']).toLowerCase()
    if (!externalReference || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      issues.push(`Regel ${index + 2}: bestelnummer of geldig e-mailadres ontbreekt.`)
      return
    }

    const key = externalReference.toLowerCase()
    const item = itemFromRow(row)
    if (grouped.has(key)) {
      if (item) grouped.get(key).items.push(item)
      return
    }

    const fullName = first(row, ['Shipping Name', 'Billing Name', 'Klantnaam', 'Customer name', 'Naam'])
    const names = splitName(fullName)
    const financial = first(row, ['Financial Status', 'Betaalstatus', 'Payment status'])
    const fulfillment = fulfillmentStatus(first(row, ['Fulfillment Status', 'Verzendstatus', 'Fulfillment status']))
    const cancelledAt = first(row, ['Cancelled at', 'Geannuleerd op', 'Canceled at'])
    const shippingCents = moneyToCents(first(row, ['Shipping', 'Verzendkosten', 'Shipping amount']))
    const discountCents = moneyToCents(first(row, ['Discount Amount', 'Korting', 'Discount']))
    const subtotalCents = moneyToCents(first(row, ['Subtotal', 'Subtotaal']))
    const taxCents = moneyToCents(first(row, ['Taxes', 'BTW', 'Tax']))
    const totalCents = moneyToCents(first(row, ['Total', 'Totaal', 'Order total']))
    const refundCents = moneyToCents(first(row, ['Refunded Amount', 'Terugbetaald bedrag', 'Refund amount']))

    grouped.set(key, {
      external_reference: externalReference,
      email,
      ...names,
      phone: first(row, ['Shipping Phone', 'Billing Phone', 'Phone', 'Telefoon']),
      address: {
        street: first(row, ['Shipping Street', 'Shipping Address1', 'Billing Street', 'Billing Address1', 'Straat', 'Adres']),
        address2: first(row, ['Shipping Address2', 'Billing Address2', 'Toevoeging']),
        postal_code: first(row, ['Shipping Zip', 'Billing Zip', 'Postcode', 'ZIP']),
        city: first(row, ['Shipping City', 'Billing City', 'Plaats', 'City']),
        country: first(row, ['Shipping Country', 'Billing Country', 'Land', 'Country']),
        country_code: first(row, ['Shipping Country Code', 'Billing Country Code', 'Landcode', 'Country code']),
      },
      status: cancelledAt ? 'cancelled' : fulfillment === 'delivered' ? 'completed' : 'open',
      payment_status: paymentStatus(financial),
      fulfillment_status: fulfillment,
      currency: first(row, ['Currency', 'Valuta']) || 'EUR',
      subtotal_cents: subtotalCents,
      shipping_cents: shippingCents,
      discount_cents: discountCents,
      tax_cents: taxCents,
      total_cents: totalCents || Math.max(0, subtotalCents + shippingCents - discountCents),
      refunded_cents: refundCents,
      note: first(row, ['Notes', 'Notities', 'Note']),
      created_at: dateToIso(first(row, ['Created at', 'Aangemaakt op', 'Order date', 'Datum'])),
      marketing_opt_in: isTrue(first(row, ['Accepts Marketing', 'Marketing toestemming', 'Marketing opt in'])),
      items: item ? [item] : [],
    })
  })

  return { delimiter, headers, lineCount: Math.max(0, rows.length - 1), orders: [...grouped.values()], issues }
}

export function orderImportTemplateCsv() {
  const headers = ['Bestelnummer', 'E-mailadres', 'Klantnaam', 'Telefoon', 'Straat', 'Postcode', 'Plaats', 'Land', 'Datum', 'Betaalstatus', 'Verzendstatus', 'Valuta', 'Subtotaal', 'Verzendkosten', 'Korting', 'BTW', 'Totaal', 'SKU', 'Productnaam', 'Variant', 'Aantal', 'Stukprijs', 'Notities']
  const sample = ['ZOL-1001', 'klant@voorbeeld.nl', 'Voorbeeld Klant', '0612345678', 'Voorbeeldstraat 1', '1234 AB', 'Amsterdam', 'Nederland', '24-08-2026 14:30', 'betaald', 'bezorgd', 'EUR', '99,95', '0,00', '0,00', '17,35', '99,95', 'ZOL-XS-3435', "ZOL'tjes", 'XS 34/35', '1', '99,95', 'Voorbeeldregel — verwijder deze voor import']
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`
  return `\uFEFF${headers.map(quote).join(';')}\r\n${sample.map(quote).join(';')}\r\n`
}
