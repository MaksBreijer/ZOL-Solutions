import './styles.css'
import './unsubscribe.css'
import { supabase } from './supabase-client.js'

const button = document.querySelector('#unsubscribe-button')
const status = document.querySelector('#unsubscribe-status')
const copy = document.querySelector('#unsubscribe-copy')
const token = new URLSearchParams(window.location.search).get('token') || ''

if (!/^[0-9a-f-]{36}$/i.test(token)) {
  button.hidden = true
  status.textContent = 'Deze afmeldlink is niet geldig. Je kunt ons ook mailen via info@zolsolutions.nl.'
  status.classList.add('is-error')
}

button?.addEventListener('click', async () => {
  button.disabled = true
  button.textContent = 'Afmelden…'
  status.textContent = ''
  const { data, error } = await supabase.functions.invoke('marketing-unsubscribe', { body: { token } })
  if (error || data?.error) {
    status.textContent = data?.error || 'Afmelden is niet gelukt. Probeer het nog een keer of mail info@zolsolutions.nl.'
    status.classList.add('is-error')
    button.disabled = false
    button.innerHTML = 'Opnieuw proberen <span>→</span>'
    return
  }
  button.hidden = true
  copy.textContent = 'Je bent afgemeld. Je ontvangt geen driewekelijkse producttips meer van ZOL Solutions.'
  status.textContent = data.already_unsubscribed ? 'Je stond al afgemeld.' : 'Afmelding opgeslagen.'
  status.classList.remove('is-error')
})
