// Zet de beschikbaarheid in de Google-productfeed gelijk aan de actuele voorraad per SKU.
export function applyStock(xml, stockBySku) {
  return xml.replace(/<item>[\s\S]*?<\/item>/g, (item) => {
    const sku = item.match(/<g:id>([^<]+)<\/g:id>/)?.[1]
    if (!sku || !(sku in stockBySku)) return item
    const availability = stockBySku[sku] > 0 ? 'in_stock' : 'out_of_stock'
    return item.replace(/<g:availability>[^<]*<\/g:availability>/, `<g:availability>${availability}</g:availability>`)
  })
}
