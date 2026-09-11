import './language.css'
import { installLanguageChoice } from './language-core.js'

const start = () => installLanguageChoice(window)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
else start()
