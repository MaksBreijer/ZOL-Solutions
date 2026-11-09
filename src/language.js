import './language.css'
import { installLanguageChoice } from './language-core.js'
import { isGermanPath } from './german-routes.js'

const start = async () => {
  // The German words are only downloaded on German pages.
  const german = isGermanPath(window.location.pathname) ? (await import('./german.json')).default : null
  installLanguageChoice(window, { german })
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
else start()
