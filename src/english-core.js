import english from './english.json' with { type: 'json' }
import { englishDynamic, englishPatterns } from './english-dynamic.js'

const dictionary = { ...english, ...englishDynamic }
const normalize = value => value.replace(/\s+/g, ' ').trim()

export function translateEnglish(value) {
  const key = normalize(value)
  let translated = dictionary[key]
  if (translated === undefined) {
    const match = englishPatterns.find(([pattern]) => pattern.test(key))
    if (match) translated = key.replace(...match)
  }
  // Format displayed euro amounts only; never change amounts, form values or API data.
  translated = (translated ?? key).replace(/€\s*([\d.]+),(\d{2})/g, (_, whole, cents) => `€${whole.replaceAll('.', ',')}.${cents}`)
  if (translated === key) return value
  return value.replace(/\S(?:[\s\S]*\S)?/, () => translated)
}

