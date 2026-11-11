import './language.css'
import { initialLanguage, installLanguageChoice } from './language-core.js'

// The English and German words are only downloaded when a visitor reads that language.
const loadEnglish = () => import('./english-core.js').then(module => module.translateEnglish)

const start = async () => {
  const language = initialLanguage(window)
  const german = language === 'de' ? (await import('./german.json')).default : null
  const english = language === 'en' ? await loadEnglish().catch(() => null) : null
  installLanguageChoice(window, { german, english, loadEnglish })
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
else start()
