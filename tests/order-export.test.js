import test from 'node:test'
import assert from 'node:assert/strict'
import writeExcelFile from 'write-excel-file/node'
import { orderWorkbookSheets } from '../src/order-export.js'

test('order export creates a valid Excel workbook with numeric amounts and safe text', async () => {
  const sheets = orderWorkbookSheets([{
    order_number: 'ZOL-42', created_at: '2026-10-01T10:00:00Z', customer_name: '=1+1',
    customer_email: 'klant@example.invalid', subtotal_cents: 9994, total_cents: 10489, shipping_cents: 495,
    order_items: [{ product_name: 'ZOL', variant_name: '34/35', sku: 'ZOL-XS', quantity: 2,
      unit_price_cents: 4997, total_cents: 9994 }],
  }])

  assert.deepEqual(sheets.map(({ sheet, data }) => [sheet, data.length]), [
    ['Bestellingen', 2], ['Productregels', 2],
  ])
  assert.equal(sheets[0].data[1][5], "'=1+1")
  assert.equal(sheets[0].data[1][16].value, 104.89)
  assert.equal(sheets[1].data[1][4], 2)
  assert.equal(sheets[1].data[1][5].value, 49.97)
  const file = await writeExcelFile(sheets).toBuffer()
  assert.equal(file.subarray(0, 2).toString(), 'PK')
})
