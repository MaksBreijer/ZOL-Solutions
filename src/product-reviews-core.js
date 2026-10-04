// Pure rendering helpers for the product reviews section, kept free of API
// imports so they can be tested without a browser bundle.

export const emptyReviewData = { count: 0, average: null, distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }, reviews: [] }

export function normalizeReviewData(data) {
  const source = data && typeof data === 'object' ? data : {}
  const reviews = Array.isArray(source.reviews) ? source.reviews : []
  const distribution = {}
  for (const stars of [5, 4, 3, 2, 1]) distribution[stars] = Math.max(0, Number(source.distribution?.[stars]) || 0)
  const count = Math.max(0, Number(source.count) || 0)
  const average = count && source.average !== null && source.average !== undefined ? Number(source.average) : null
  return { count, average: Number.isFinite(average) ? average : null, distribution, reviews }
}

export function formatAverage(average) {
  return average === null ? '–' : average.toFixed(1).replace('.', ',')
}

export function reviewCountLabel(count) {
  if (!count) return 'Nog geen reviews'
  return `Gebaseerd op ${count} ${count === 1 ? 'review' : 'reviews'}`
}

function starsElement(doc, rating) {
  const stars = doc.createElement('p')
  stars.className = 'product-review-stars'
  stars.setAttribute('role', 'img')
  stars.setAttribute('aria-label', `${rating} van 5 sterren`)
  const base = doc.createElement('span')
  base.textContent = '★★★★★'
  base.setAttribute('aria-hidden', 'true')
  const fill = doc.createElement('span')
  fill.className = 'product-review-stars-fill'
  fill.textContent = '★★★★★'
  fill.setAttribute('aria-hidden', 'true')
  fill.style.width = `${(Math.max(0, Math.min(5, rating)) / 5) * 100}%`
  stars.append(base, fill)
  return stars
}

function formatReviewDate(value, language) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

export function renderReviews(root, rawData, language = 'nl') {
  const doc = root.ownerDocument
  const data = normalizeReviewData(rawData)
  const average = root.querySelector('[data-review-average]')
  const count = root.querySelector('[data-review-count]')
  const summaryFill = root.querySelector('[data-review-stars] .product-review-stars-fill')
  const list = root.querySelector('[data-review-list]')
  const empty = root.querySelector('[data-review-empty]')

  if (average) average.textContent = formatAverage(data.average)
  if (count) count.textContent = reviewCountLabel(data.count)
  if (summaryFill) summaryFill.style.width = `${((data.average || 0) / 5) * 100}%`
  root.querySelector('[data-review-stars]')?.setAttribute('aria-label', data.average === null ? 'Nog geen score' : `${formatAverage(data.average)} van 5 sterren`)

  root.querySelectorAll('[data-review-distribution] [data-stars]').forEach((row) => {
    const amount = data.distribution[row.dataset.stars] || 0
    const bar = row.querySelector('b')
    if (bar) bar.style.width = data.count ? `${(amount / data.count) * 100}%` : '0%'
    const total = row.querySelector('strong')
    if (total) total.textContent = String(amount)
  })

  if (list) {
    list.replaceChildren(...data.reviews.map((review) => {
      const item = doc.createElement('li')
      item.className = 'product-review-item'
      const meta = doc.createElement('div')
      meta.className = 'product-review-item-meta'
      const time = doc.createElement('time')
      time.dateTime = String(review.created_at || '')
      time.textContent = formatReviewDate(review.created_at, language)
      time.setAttribute('translate', 'no')
      meta.append(starsElement(doc, Number(review.rating) || 0), time)

      // Customer words are shown exactly as written, also in the English view.
      const title = doc.createElement('h4')
      title.textContent = String(review.title || '')
      title.setAttribute('translate', 'no')
      const body = doc.createElement('p')
      body.className = 'product-review-item-body'
      body.textContent = String(review.body || '')
      body.setAttribute('translate', 'no')
      const author = doc.createElement('p')
      author.className = 'product-review-item-author'
      author.textContent = String(review.author_name || '')
      author.setAttribute('translate', 'no')
      item.append(meta, title, body, author)
      return item
    }))
  }
  if (empty) empty.hidden = data.count > 0
  root.classList.toggle('is-empty', data.count === 0)
  return data
}

export function reviewStructuredData(rawData, canonical) {
  const data = normalizeReviewData(rawData)
  if (!data.count || data.average === null || !data.reviews.length) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    '@id': `${canonical}#product`,
    name: 'ZOL 3/4 inlegzolen',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: data.average.toFixed(1), bestRating: '5', worstRating: '1', ratingCount: data.count, reviewCount: data.count },
    review: data.reviews.slice(0, 10).map((review) => ({
      '@type': 'Review',
      name: String(review.title || ''),
      reviewBody: String(review.body || ''),
      datePublished: String(review.created_at || '').slice(0, 10),
      author: { '@type': 'Person', name: String(review.author_name || '') },
      reviewRating: { '@type': 'Rating', ratingValue: String(review.rating), bestRating: '5', worstRating: '1' },
    })),
  }
}
