import { applyGoogleRating } from '../src/google-rating.js'

const GOOGLE_CID = '654808623137506283'
const CACHE_SECONDS = 6 * 60 * 60

// Fetches the live Google rating and review count via the Places API (New), cached per data centre.
async function googleRating(context) {
  const apiKey = context.env.GOOGLE_PLACES_API_KEY
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
  if (!response.ok) return null
  const { places = [] } = await response.json()
  const place = places.find((candidate) => String(candidate.googleMapsUri || '').includes(GOOGLE_CID))
  if (!place) return null
  const rating = { rating: Number(place.rating), count: Number(place.userRatingCount) }
  if (!(rating.rating >= 1 && rating.rating <= 5 && rating.count >= 1)) return null
  context.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(rating), { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })))
  return rating
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
