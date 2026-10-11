import { applyGoogleRating } from '../src/google-rating.js'

const GOOGLE_CID = '654808623137506283'
const CACHE_SECONDS = 6 * 60 * 60

// Fetches the live Google rating and review count via the Places API (New), cached per data centre.
async function googleRating(context) {
  const apiKey = String(context.env.GOOGLE_PLACES_API_KEY || '').trim()
  if (!apiKey) return null
  const cache = caches.default
  const cacheKey = new Request('https://zolsolutions.nl/__google-rating')
  const cached = await cache.match(cacheKey)
  if (cached) return cached.json()

  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.rating,places.userRatingCount,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: 'ZOL Solutions Amsterdam', languageCode: 'nl', regionCode: 'NL' }),
  })
  const remember = (value) => {
    context.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(value), { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })))
    return value
  }
  // A failed lookup is remembered as well, so a wrong key never slows down every page view.
  if (!response.ok) return remember(null)
  const { places = [] } = await response.json()
  const place = places.find((candidate) => String(candidate.googleMapsUri || '').includes(GOOGLE_CID))
  const rating = place && { rating: Number(place.rating), count: Number(place.userRatingCount) }
  return remember(rating && rating.rating >= 1 && rating.rating <= 5 && rating.count >= 1 ? rating : null)
}

// Keeps the Google score and review count on every HTML page in sync with Google Maps.
export async function onRequest(context) {
  const response = await context.next()
  if (context.request.method !== 'GET' || !(response.headers.get('Content-Type') || '').includes('text/html')) return response
  try {
    const rating = await googleRating(context)
    if (!rating) return response
    const html = await response.text()
    const headers = new Headers(response.headers)
    headers.set('X-Google-Rating', `${rating.rating}/${rating.count}`)
    return new Response(applyGoogleRating(html, rating), { status: response.status, statusText: response.statusText, headers })
  } catch {
    return response
  }
}
