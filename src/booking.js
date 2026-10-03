import './cursor.css'
import './booking.css'
import { invokePublicFunction } from './public-api.js'

const slotsElement = document.querySelector('#booking-slots')
const form = document.querySelector('#booking-form')
const status = document.querySelector('.booking-status')
const practice = new URLSearchParams(window.location.search).get('praktijk') || ''
form.elements.practice_name.value = practice.slice(0, 180)

function formatDate(value, options) {
  return new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', ...options }).format(new Date(value))
}

async function loadSlots() {
  const { data, error } = await invokePublicFunction('physio-booking', { action: 'availability' })
  if (error) { slotsElement.textContent = `${error.message} Je kunt ook mailen naar info@zolsolutions.nl.`; return }
  const slots = Array.isArray(data?.slots) ? data.slots : []
  if (!slots.length) { slotsElement.textContent = 'Er zijn nu geen vrije momenten. Mail ons gerust op info@zolsolutions.nl.'; return }
  const byDay = new Map()
  for (const slot of slots) {
    if (!byDay.has(slot.day)) byDay.set(slot.day, [])
    byDay.get(slot.day).push(slot)
  }
  slotsElement.replaceChildren()
  for (const [day, daySlots] of byDay) {
    const group = document.createElement('div')
    group.className = 'booking-day'
    const title = document.createElement('h3')
    title.textContent = formatDate(daySlots[0].start, { weekday: 'long', day: 'numeric', month: 'long' })
    group.append(title)
    const times = document.createElement('div')
    times.className = 'booking-times'
    for (const slot of daySlots) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = formatDate(slot.start, { hour: '2-digit', minute: '2-digit' })
      button.dataset.start = slot.start
      button.addEventListener('click', () => {
        slotsElement.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', 'false'))
        button.setAttribute('aria-pressed', 'true')
        form.elements.start.value = slot.start
        form.hidden = false
        form.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      times.append(button)
    }
    group.append(times)
    slotsElement.append(group)
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!form.elements.start.value) { status.textContent = 'Kies eerst een tijd.'; return }
  const button = form.querySelector('[type="submit"]')
  button.disabled = true
  status.textContent = 'We zetten je afspraak in de agenda…'
  const values = Object.fromEntries(new FormData(form))
  const { data, error } = await invokePublicFunction('physio-booking', { action: 'book', ...values })
  if (error) {
    status.textContent = error.message
    button.disabled = false
    if (error.message.includes('niet meer vrij') || error.message.includes('zojuist geboekt')) await loadSlots()
    return
  }
  document.querySelector('#booking-form-wrap').hidden = true
  document.querySelector('#booking-success').hidden = false
  document.querySelector('#booking-success-time').textContent = formatDate(data.start, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  const end = data.end || new Date(new Date(data.start).getTime() + 10 * 60_000).toISOString()
  const details = `ZOL Solutions belt je op ${values.phone}.`
  const dates = `${data.start.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}/${end.replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
  document.querySelector('#booking-google-calendar').href = `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: '10 minuten bellen met ZOL Solutions', dates, details, location: 'Telefonisch' })}`
  document.querySelector('#booking-outlook-calendar').href = `https://outlook.live.com/calendar/0/deeplink/compose?${new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: '10 minuten bellen met ZOL Solutions', startdt: data.start, enddt: end, body: details, location: 'Telefonisch' })}`
  if (data.notification_warning) document.querySelector('#booking-success').append(' Er is een probleem met de e-mailbevestiging; je afspraak staat wel in onze agenda.')
})

void loadSlots()
