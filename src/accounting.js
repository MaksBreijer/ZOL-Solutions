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
    } else if (character === '"') quoted = true
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

function signedMoneyToCents(value) {
  let normalized = String(value ?? '').trim().replace(/\s/g, '').replace(/[^0-9,().+-]/g, '')
  const negative = normalized.startsWith('-') || (normalized.startsWith('(') && normalized.endsWith(')'))
  normalized = normalized.replace(/[()+-]/g, '')
  if (!normalized) return 0
  const comma = normalized.lastIndexOf(',')
  const dot = normalized.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.'
    normalized = normalized.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.')
  } else if (comma >= 0) normalized = normalized.replace(/\./g, '').replace(',', '.')
  else if (dot >= 0 && normalized.length - dot - 1 > 2) normalized = normalized.replace(/\./g, '')
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100) * (negative ? -1 : 1)
}

function dateToIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const match = raw.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/)
  if (match) {
    const [, one, two, three] = match
    const year = one.length === 4 ? one : three
    const month = one.length === 4 ? two : two
    const day = one.length === 4 ? three : one
    const iso = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    const date = new Date(`${iso}T12:00:00Z`)
    if (!Number.isNaN(date.getTime())) return iso
  }
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

const first = (row, aliases) => {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)]
    if (value != null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function stableHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `bank-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function calculateVatBreakdown(totalCents, vatRate) {
  const total = Math.max(0, Math.round(Number(totalCents) || 0))
  const rate = Number(vatRate) || 0
  const excludingVatCents = rate ? Math.round(total / (1 + rate / 100)) : total
  return { totalCents: total, excludingVatCents, vatCents: total - excludingVatCents, vatRate: rate }
}

export function parseBankCsv(text) {
  const { delimiter, rows } = parseRows(text)
  const issues = []
  if (rows.length < 2) return { delimiter, transactions: [], issues: ['Het bestand bevat geen bankregels.'], lineCount: 0 }
  const headers = rows[0].map(normalizeHeader)
  const transactions = []
  rows.slice(1).forEach((values, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']))
    const bookedOn = dateToIso(first(row, ['Transactiedatum', 'Boekdatum', 'Datum', 'Date', 'Booking date', 'Valutadatum']))
    const amount = first(row, ['Bedrag', 'Amount', 'Transactiebedrag', 'Bedrag EUR'])
    const debit = first(row, ['Af', 'Debit', 'Debet'])
    const credit = first(row, ['Bij', 'Credit', 'Creditbedrag'])
    const amountCents = amount ? signedMoneyToCents(amount) : signedMoneyToCents(credit) - Math.abs(signedMoneyToCents(debit))
    if (!bookedOn || !amountCents) {
      issues.push(`Regel ${index + 2}: geldige datum of bedrag ontbreekt.`)
      return
    }
    const counterparty = first(row, ['Naam tegenpartij', 'Tegenrekening naam', 'Naam', 'Counterparty', 'Name'])
    const description = first(row, ['Omschrijving', 'Mededelingen', 'Beschrijving', 'Description', 'Memo'])
    const iban = first(row, ['Tegenrekening', 'Tegenrekeningnummer', 'IBAN tegenpartij', 'IBAN', 'Counterparty IBAN']).replace(/\s/g, '').toUpperCase()
    const accountRef = first(row, ['Rekening', 'Rekeningnummer', 'Eigen rekening', 'Account'])
    const currency = first(row, ['Valuta', 'Currency']) || 'EUR'
    const fingerprint = [bookedOn, amountCents, counterparty, iban, description, accountRef].join('|').toLowerCase()
    transactions.push({
      import_hash: stableHash(fingerprint),
      account_ref: accountRef,
      booked_on: bookedOn,
      amount_cents: amountCents,
      currency: currency.toUpperCase().slice(0, 3),
      counterparty,
      counterparty_iban: iban,
      description,
      status: 'unmatched',
    })
  })
  return { delimiter, transactions, issues, lineCount: rows.length - 1 }
}

const daysBetween = (one, two) => Math.abs(new Date(one).getTime() - new Date(two).getTime()) / 86400000

export function matchBankTransactions(transactions, orders, expenses) {
  return transactions.map((transaction) => {
    if (transaction.amount_cents > 0) {
      const candidates = (orders || []).filter((order) =>
        ['paid', 'partially_refunded', 'refunded'].includes(order.payment_status)
        && Number(order.total_cents) === transaction.amount_cents
        && daysBetween(order.created_at, transaction.booked_on) <= 14,
      )
      if (candidates.length === 1) return { ...transaction, status: 'matched', matched_order_id: candidates[0].id }
    } else {
      const candidates = (expenses || []).filter((expense) =>
        Number(expense.total_cents) === Math.abs(transaction.amount_cents)
        && daysBetween(expense.invoice_date, transaction.booked_on) <= 30,
      )
      if (candidates.length === 1) return { ...transaction, status: 'matched', matched_expense_id: candidates[0].id }
    }
    return transaction
  })
}

export function vatSummary(financeRows, expenses) {
  const outputVatCents = (financeRows || []).reduce((sum, row) => sum + Number(row.recognisedTaxCents || 0), 0)
  const inputVatCents = (expenses || []).filter((expense) => expense.status === 'posted').reduce((sum, expense) => sum + Number(expense.vat_cents || 0), 0)
  return { outputVatCents, inputVatCents, payableVatCents: outputVatCents - inputVatCents }
}

const safeSpreadsheetValue = (value) => /^\s*[=+\-@]/.test(String(value ?? '')) ? `'${value}` : String(value ?? '')
const csvCell = (value) => `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`

export function ledgerExcelCsv(entries) {
  const headers = ['Boekstuk', 'Datum', 'Dagboek', 'Referentie', 'Omschrijving', 'Rekening', 'Rekeningnaam', 'Debet', 'Credit', 'BTW-percentage']
  const rows = (entries || []).flatMap((entry) => (entry.accounting_lines || []).map((line) => [
    entry.entry_number,
    entry.entry_date,
    entry.journal,
    entry.reference,
    entry.description,
    line.accounting_accounts?.code || '',
    line.accounting_accounts?.name || '',
    (Number(line.debit_cents || 0) / 100).toFixed(2),
    (Number(line.credit_cents || 0) / 100).toFixed(2),
    Number(line.vat_rate || 0).toFixed(0),
  ]))
  return `\ufeffsep=;\r\n${[headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}
