const text = (value) => {
  const result = String(value ?? '')
  return /^\s*[=+\-@]/.test(result) ? `'${result}` : result
}

const euros = (cents) => Number(cents || 0) / 100
const money = (value) => ({ value: euros(value), format: '#,##0.00' })
const header = (labels) => labels.map((value) => ({ value, fontWeight: 'bold', backgroundColor: '#DFECF8' }))

const orderDate = (value) => value
  ? new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
  : ''

export function orderWorkbookSheets(orders) {
  const orderRows = [header([
    'Bestelnummer', 'Extern nummer', 'Datum', 'Herkomst', 'Type', 'Klant', 'E-mail',
    'Straat', 'Postcode', 'Plaats', 'Land', 'Valuta', 'Subtotaal', 'Verzendkosten',
    'Korting', 'BTW', 'Totaal', 'Betaalstatus', 'Verzendstatus', 'Bestelstatus', 'Gearchiveerd',
  ])]
  const itemRows = [header([
    'Bestelnummer', 'Product', 'Variant', 'SKU', 'Aantal', 'Stukprijs', 'Regeltotaal',
  ])]

  for (const order of orders) {
    const address = order.shipping_address || {}
    orderRows.push([
      text(order.order_number), text(order.external_reference), orderDate(order.created_at),
      text(order.source), text(order.order_type), text(order.customer_name), text(order.customer_email),
      text(address.street), text(address.postal_code), text(address.city), text(address.country),
      text(order.currency || 'EUR'), money(order.subtotal_cents), money(order.shipping_cents),
      money(order.discount_cents), money(order.tax_cents), money(order.total_cents),
      text(order.payment_status), text(order.fulfillment_status), text(order.status),
      order.archived ? 'Ja' : 'Nee',
    ])

    for (const item of order.order_items || []) {
      itemRows.push([
        text(order.order_number), text(item.product_name), text(item.variant_name), text(item.sku),
        Number(item.quantity || 0), money(item.unit_price_cents), money(item.total_cents),
      ])
    }
  }

  return [
    { sheet: 'Bestellingen', data: orderRows, stickyRowsCount: 1, columns: [
      18, 20, 20, 18, 16, 26, 32, 30, 12, 20, 10, 10, 15, 16, 12, 12, 15, 19, 19, 18, 15,
    ].map((width) => ({ width })) },
    { sheet: 'Productregels', data: itemRows, stickyRowsCount: 1, columns: [
      18, 28, 22, 18, 12, 16, 16,
    ].map((width) => ({ width })) },
  ]
}
