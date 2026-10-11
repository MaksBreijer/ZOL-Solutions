// Replaces the Google score and review count in the static (Dutch) HTML with live values.
export function applyGoogleRating(html, { rating, count }) {
  const score = rating.toFixed(1).replace('.', ',')
  return html
    .replace(/(<[^>]*\bdata-google-score\b[^>]*>)\d,\d/g, `$1${score}`)
    .replace(/\b\d,\d(?=(?:\/5)? (?:uit|op basis van|·) \d+ Google-reviews|<\/strong><span aria-hidden="true">★★★★★<\/span><small>\d+ Google-reviews| op Google<)/g, score)
    .replace(/\b\d+(?= Google-reviews)/g, String(count))
    .replace(/<small>\d+ reviews ↗<\/small>/g, `<small>${count} reviews ↗</small>`)
}
