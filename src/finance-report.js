const PAID_STATUSES = new Set(['paid', 'partially_refunded', 'refunded'])

const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
})

export function financeMonthKey(value = new Date()) {
  const parts = Object.fromEntries(monthFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]))
  return `${parts.year}-${parts.month}`
}

export function financeMonthLabel(month) {
  if (month === 'all') return 'Alle periodes'
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1))
}

export function financeMonthOptions(orders, currentMonth = financeMonthKey()) {
  const months = new Set([currentMonth])
  for (const order of orders || []) {
    if (order?.created_at) months.add(financeMonthKey(order.created_at))
  }
  return [...months].sort().reverse()
}

function paymentsByOrder(payments) {
  const result = new Map()
  for (const payment of payments || []) {
    if (!result.has(payment.order_id)) result.set(payment.order_id, [])
    result.get(payment.order_id).push(payment)
  }
  return result
}

function derivedPaymentStatus(receivedCents, refundedCents, payments) {
  if (receivedCents > 0 && refundedCents >= receivedCents) return 'refunded'
  if (refundedCents > 0) return 'partially_refunded'
  if (receivedCents > 0) return 'paid'
  if (payments.some((payment) => payment.status === 'failed')) return 'failed'
  return 'pending'
}

function reconciliationStatus(order, payments, receivedCents, refundedCents, derivedStatus) {
  const orderIsSettled = PAID_STATUSES.has(order.payment_status)
  const molliePaymentMissingId = payments.some((payment) =>
    payment.provider === 'mollie' && PAID_STATUSES.has(payment.status) && !payment.provider_payment_id,
  )

  if (orderIsSettled && receivedCents === 0) return 'missing_payment'
  if (receivedCents > 0 && receivedCents !== Number(order.total_cents || 0)) return 'amount_mismatch'
  if (order.payment_status !== derivedStatus) return 'status_mismatch'
  if (molliePaymentMissingId) return 'missing_provider_id'
  if (order.status === 'cancelled' && receivedCents === 0) return 'cancelled'
  if (derivedStatus === 'failed') return 'failed'
  if (!orderIsSettled) return 'open'
  return 'matched'
}

export function financeRows(orders, payments, month = financeMonthKey()) {
  const paymentLookup = paymentsByOrder(payments)
  return (orders || [])
    .filter((order) => month === 'all' || financeMonthKey(order.created_at) === month)
    .map((order) => {
      const orderPayments = paymentLookup.get(order.id) || []
      const settledPayments = orderPayments.filter((payment) => PAID_STATUSES.has(payment.status))
      const receivedCents = settledPayments.reduce((sum, payment) => sum + Number(payment.amount_cents || 0), 0)
      const refundedCents = orderPayments.reduce((sum, payment) => sum + Number(payment.refunded_cents || 0), 0)
      const netReceivedCents = Math.max(0, receivedCents - refundedCents)
      const derivedStatus = derivedPaymentStatus(receivedCents, refundedCents, orderPayments)
      const status = reconciliationStatus(order, orderPayments, receivedCents, refundedCents, derivedStatus)
      const recognisedRevenueCents = Math.min(Number(order.total_cents || 0), netReceivedCents)
      const recognisedTaxCents = order.total_cents
        ? Math.round(Number(order.tax_cents || 0) * (recognisedRevenueCents / Number(order.total_cents)))
        : 0

      return {
        order,
        payments: orderPayments,
        receivedCents,
        refundedCents,
        netReceivedCents,
        recognisedRevenueCents,
        recognisedTaxCents,
        derivedStatus,
        status,
        differenceCents: receivedCents - Number(order.total_cents || 0),
        providers: [...new Set(orderPayments.map((payment) => payment.provider).filter(Boolean))].join(', '),
        providerPaymentIds: orderPayments.map((payment) => payment.provider_payment_id).filter(Boolean).join(', '),
      }
    })
    .sort((a, b) => {
      const priority = { missing_payment: 0, amount_mismatch: 1, status_mismatch: 2, missing_provider_id: 3, failed: 4, open: 5, matched: 6, cancelled: 7 }
      return (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || new Date(b.order.created_at) - new Date(a.order.created_at)
    })
}

export function financeSummary(rows) {
  const receivedCents = rows.reduce((sum, row) => sum + row.receivedCents, 0)
  const refundedCents = rows.reduce((sum, row) => sum + row.refundedCents, 0)
  const revenueIncludingTaxCents = rows.reduce((sum, row) => sum + row.recognisedRevenueCents, 0)
  const taxCents = rows.reduce((sum, row) => sum + row.recognisedTaxCents, 0)
  const anomalyStatuses = new Set(['missing_payment', 'amount_mismatch', 'status_mismatch', 'missing_provider_id'])

  return {
    orderCount: rows.length,
    receivedCents,
    refundedCents,
    netCashCents: receivedCents - refundedCents,
    revenueIncludingTaxCents,
    revenueExcludingTaxCents: revenueIncludingTaxCents - taxCents,
    taxCents,
    openCount: rows.filter((row) => ['open', 'failed'].includes(row.status)).length,
    matchedCount: rows.filter((row) => row.status === 'matched').length,
    anomalyCount: rows.filter((row) => anomalyStatuses.has(row.status)).length,
  }
}

function safeSpreadsheetValue(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /^\s*[=+\-@]/.test(text) ? `'${text}` : text
}

function csvCell(value) {
  return `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`
}

const cents = (value) => (Number(value || 0) / 100).toFixed(2)

export function financeExcelCsv(rows) {
  const headers = [
    'Datum', 'Bestelnummer', 'Extern nummer', 'Bron', 'Klant', 'E-mail', 'Valuta',
    'Subtotaal', 'Verzendkosten', 'Korting', 'BTW', 'Totaal incl. BTW',
    'Ontvangen', 'Terugbetaald', 'Netto ontvangen', 'Verschil',
    'Order betaalstatus', 'Berekende betaalstatus', 'Controle', 'Provider', 'Provider betaal-ID',
  ]
  const data = rows.map((row) => [
    row.order.created_at,
    row.order.order_number,
    row.order.external_reference || '',
    row.order.source || '',
    row.order.customer_name || '',
    row.order.customer_email || '',
    row.order.currency || 'EUR',
    cents(row.order.subtotal_cents),
    cents(row.order.shipping_cents),
    cents(row.order.discount_cents),
    cents(row.order.tax_cents),
    cents(row.order.total_cents),
    cents(row.receivedCents),
    cents(row.refundedCents),
    cents(row.netReceivedCents),
    cents(row.differenceCents),
    row.order.payment_status,
    row.derivedStatus,
    row.status,
    row.providers,
    row.providerPaymentIds,
  ])

  return `\ufeffsep=;\r\n${[headers, ...data].map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}
