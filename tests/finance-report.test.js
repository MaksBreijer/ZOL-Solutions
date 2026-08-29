import test from 'node:test'
import assert from 'node:assert/strict'
import { financeExcelCsv, financeMonthOptions, financeRows, financeSummary } from '../src/finance-report.js'

const orders = [
  {
    id: 'order-paid', order_number: 1001, created_at: '2026-08-05T10:00:00.000Z', customer_name: 'Betaald', customer_email: 'paid@example.com',
    status: 'open', payment_status: 'paid', subtotal_cents: 10000, shipping_cents: 0, discount_cents: 0, tax_cents: 1736, total_cents: 10000, currency: 'EUR', source: 'webshop',
  },
  {
    id: 'order-refund', order_number: 1002, created_at: '2026-08-06T10:00:00.000Z', customer_name: ' =Test', customer_email: 'refund@example.com',
    status: 'open', payment_status: 'partially_refunded', subtotal_cents: 12100, shipping_cents: 0, discount_cents: 0, tax_cents: 2100, total_cents: 12100, currency: 'EUR', source: 'webshop',
  },
  {
    id: 'order-missing', order_number: 1003, created_at: '2026-08-07T10:00:00.000Z', customer_name: 'Ontbreekt', customer_email: 'missing@example.com',
    status: 'open', payment_status: 'paid', subtotal_cents: 5000, shipping_cents: 0, discount_cents: 0, tax_cents: 868, total_cents: 5000, currency: 'EUR', source: 'admin',
  },
]

const payments = [
  { order_id: 'order-paid', provider: 'mollie', provider_payment_id: 'tr_1', status: 'paid', amount_cents: 10000, refunded_cents: 0 },
  { order_id: 'order-refund', provider: 'mollie', provider_payment_id: 'tr_2', status: 'partially_refunded', amount_cents: 12100, refunded_cents: 2420 },
]

test('reconciles payments, refunds and missing payment records', () => {
  const rows = financeRows(orders, payments, '2026-08')
  assert.equal(rows.find((row) => row.order.id === 'order-paid').status, 'matched')
  assert.equal(rows.find((row) => row.order.id === 'order-refund').status, 'matched')
  assert.equal(rows.find((row) => row.order.id === 'order-missing').status, 'missing_payment')

  const summary = financeSummary(rows)
  assert.equal(summary.receivedCents, 22100)
  assert.equal(summary.refundedCents, 2420)
  assert.equal(summary.revenueIncludingTaxCents, 19680)
  assert.equal(summary.taxCents, 3416)
  assert.equal(summary.revenueExcludingTaxCents, 16264)
  assert.equal(summary.anomalyCount, 1)
})

test('builds newest-first month options and an Excel-safe Dutch CSV', () => {
  assert.deepEqual(financeMonthOptions(orders, '2026-09'), ['2026-09', '2026-08'])
  const csv = financeExcelCsv(financeRows(orders, payments, '2026-08'))
  assert.match(csv, /^\ufeffsep=;/)
  assert.match(csv, /"1001"/)
  assert.match(csv, /"' \=Test"/)
  assert.match(csv, /"100\.00"/)
})
