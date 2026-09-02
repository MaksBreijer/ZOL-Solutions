import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateVatBreakdown, ledgerExcelCsv, matchBankTransactions, parseBankCsv, vatSummary } from '../src/accounting.js'

test('splits VAT from an inclusive amount without losing cents', () => {
  assert.deepEqual(calculateVatBreakdown(9995, 21), { totalCents: 9995, excludingVatCents: 8260, vatCents: 1735, vatRate: 21 })
  assert.deepEqual(calculateVatBreakdown(1000, 0), { totalCents: 1000, excludingVatCents: 1000, vatCents: 0, vatRate: 0 })
})

test('reads a Knab-style bank CSV and matches exact order and expense amounts', () => {
  const csv = '\uFEFFTransactiedatum;Bedrag;Naam tegenpartij;Tegenrekening;Omschrijving\n02-09-2026;99,95;Klant;NL01TEST0123456789;ZOL-1001\n03-09-2026;-24,20;Leverancier;NL02TEST0123456789;Verpakking'
  const parsed = parseBankCsv(csv)
  assert.equal(parsed.issues.length, 0)
  assert.equal(parsed.transactions[0].amount_cents, 9995)
  assert.equal(parsed.transactions[1].amount_cents, -2420)

  const matched = matchBankTransactions(parsed.transactions, [
    { id: 'order-1', payment_status: 'paid', total_cents: 9995, created_at: '2026-09-01T10:00:00Z' },
  ], [
    { id: 'expense-1', total_cents: 2420, invoice_date: '2026-09-01' },
  ])
  assert.equal(matched[0].matched_order_id, 'order-1')
  assert.equal(matched[1].matched_expense_id, 'expense-1')
})

test('calculates payable VAT and protects ledger CSV cells', () => {
  const summary = vatSummary([{ recognisedTaxCents: 2100 }], [{ status: 'posted', vat_cents: 420 }, { status: 'draft', vat_cents: 100 }])
  assert.deepEqual(summary, { outputVatCents: 2100, inputVatCents: 420, payableVatCents: 1680 })

  const csv = ledgerExcelCsv([{ entry_number: 1, entry_date: '2026-09-02', journal: 'sales', reference: '=TEST', description: 'Sale', accounting_lines: [{ debit_cents: 9995, credit_cents: 0, vat_rate: 0, accounting_accounts: { code: '1300', name: 'Debiteuren' } }] }])
  assert.match(csv, /^\ufeffsep=;/)
  assert.match(csv, /"'=TEST"/)
})
