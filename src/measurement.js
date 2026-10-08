import { supabase } from './supabase-client.js'
import { timepoints } from '../supabase/functions/_shared/pilot-questions.js'

const content = document.querySelector('#measurement-content')
const progress = document.querySelector('#measurement-progress-bar')
const params = new URLSearchParams(window.location.search)
const preview = params.get('preview') || ''
const consentToken = params.get('toestemming') || ''
let token = params.get('token') || sessionStorage.getItem('zol-pain-checkin-token') || ''
const quickQuestion = params.get('q') || ''
const quickAnswer = params.get('a') || ''
let measurement = null
let stepIndex = 0

const previewMeasurements = Object.fromEntries(timepoints.map((definition) => [definition.key, {
  timepoint: definition.key,
  label: definition.label,
  completed: false,
  answers: {},
  questions: definition.questions,
}]))

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function showError(message) {
  progress.style.width = '0'
  content.innerHTML = `<div class="measurement-error"><p class="measurement-kicker">Deze link werkt niet</p><h1>We helpen je graag verder.</h1><p>${escapeHtml(message)} Antwoord op de e-mail of mail naar <a href="mailto:info@zolsolutions.nl">info@zolsolutions.nl</a>.</p></div>`
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('pilot-measurement', { body })
  if (error || data?.error) throw new Error(data?.error || 'De vragenlijst kon niet worden geladen.')
  return data
}

function showConsentFinished(declined = false, warning = '') {
  progress.style.width = declined ? '0' : '100%'
  content.innerHTML = `<div class="measurement-finished"><span class="measurement-finished-icon">${declined ? '✓' : '♥'}</span><p class="measurement-kicker">${declined ? 'Voorkeur opgeslagen' : 'Bedankt voor je toestemming'}</p><h1>${declined ? 'Je ontvangt geen vragenlijsten.' : 'We horen graag hoe het gaat.'}</h1><p>${declined ? 'We hebben je keuze opgeslagen. Je kunt deze pagina nu sluiten.' : `De 0-meting is per e-mail naar je verstuurd. Daarin staan de eerste korte vragen over de hielpijn.${warning ? ` ${escapeHtml(warning)}` : ''}`}</p></div>`
  history.replaceState({}, '', '/meting/')
}

function renderConsent(firstName) {
  progress.style.width = '0'
  content.innerHTML = `<div class="measurement-consent">
    <p class="measurement-kicker">Hoe gaat het met de hielpijn?</p>
    <h1>Hoi ${escapeHtml(firstName)}, mogen we blijven vragen hoe het gaat?</h1>
    <p class="measurement-intro">We willen echt weten hoe kinderen de ZOL’tjes ervaren en of de hielpijn verandert. Daarom sturen we vier korte vragenlijsten: nu, na 1 week, na 4 weken en na 12 weken.</p>
    <div class="measurement-consent-details">
      <strong>Wat leggen we vast?</strong>
      <ul><li>Hielpijn en hoe lang die al bestaat</li><li>Comfort, pasvorm en gebruik van de ZOL’tjes</li><li>Of je kind kan blijven sporten</li></ul>
      <p>De antwoorden zijn gezondheidsgegevens van je kind. Alleen bevoegde beheerders van ZOL Solutions kunnen ze bekijken. Deelname is vrijwillig en staat los van je bestelling.</p>
    </div>
    <label class="measurement-consent-check"><input type="checkbox" id="parent-consent"> <span>Ik ben de ouder of verzorger en geef expliciet toestemming om deze antwoorden te gebruiken om te volgen hoe het met de hielpijn en het gebruik van de ZOL’tjes gaat.</span></label>
    <p class="measurement-consent-error" id="consent-error"></p>
    <div class="measurement-consent-actions"><button class="measurement-button" type="button" data-decline>Niet deelnemen</button><button class="measurement-button measurement-button--primary" type="button" data-confirm>Toestemming geven</button></div>
  </div>`
  const checkbox = document.querySelector('#parent-consent')
  const confirm = content.querySelector('[data-confirm]')
  const decline = content.querySelector('[data-decline]')
  confirm.addEventListener('click', async () => {
    if (!checkbox.checked) { document.querySelector('#consent-error').textContent = 'Vink eerst de toestemming aan.'; return }
    if (preview) { showConsentFinished(false); return }
    confirm.disabled = true; decline.disabled = true; confirm.textContent = 'Toestemming opslaan…'
    try {
      const result = await invoke({ action: 'consent_confirm', token: consentToken, parent_confirmed: true })
      showConsentFinished(false, result.warning || '')
    } catch (error) { showError(error.message) }
  })
  decline.addEventListener('click', async () => {
    if (preview) { showConsentFinished(true); return }
    confirm.disabled = true; decline.disabled = true; decline.textContent = 'Voorkeur opslaan…'
    try { await invoke({ action: 'consent_decline', token: consentToken }); showConsentFinished(true) }
    catch (error) { showError(error.message) }
  })
}

async function bootConsent() {
  try {
    const consent = await invoke({ action: 'consent_load', token: consentToken })
    renderConsent(consent.first_name || 'daar')
  } catch (error) { showError(error.message) }
}

function optionMarkup(question, answer) {
  if (question.type === 'text') return `<textarea class="measurement-textarea" id="measurement-answer" maxlength="600" placeholder="Typ hier eventueel je toelichting…">${escapeHtml(answer || '')}</textarea>`
  const options = question.type === 'scale'
    ? Array.from({ length: question.max - question.min + 1 }, (_, index) => ({ value: String(question.min + index), label: String(question.min + index) }))
    : question.options
  return `<div class="measurement-options ${question.type === 'scale' ? 'measurement-options--scale' : ''}">${options.map((option) => `<button class="measurement-option ${String(answer) === String(option.value) ? 'is-selected' : ''}" type="button" data-answer="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join('')}</div>${question.type === 'scale' ? `<div class="measurement-scale-labels"><span>${escapeHtml(question.minLabel || 'Laag')}</span><span>${escapeHtml(question.maxLabel || 'Hoog')}</span></div>` : ''}`
}

function renderStep() {
  const question = measurement.questions[stepIndex]
  const answer = measurement.answers?.[question.key]
  progress.style.width = `${Math.round(((stepIndex + 1) / measurement.questions.length) * 100)}%`
  content.innerHTML = `<div class="measurement-step">
    <p class="measurement-kicker">${escapeHtml(measurement.label)} · vraag ${stepIndex + 1} van ${measurement.questions.length}</p>
    <h1>${escapeHtml(question.label)}</h1>
    <p class="measurement-intro">${escapeHtml(question.help || 'Kies het antwoord dat het beste past.')}</p>
    ${optionMarkup(question, answer)}
    <p class="measurement-saved" id="measurement-saved"></p>
    <div class="measurement-actions">
      ${stepIndex ? '<button class="measurement-button" type="button" data-back>← Vorige</button>' : ''}
      ${question.type === 'text' ? `<button class="measurement-button measurement-button--primary" type="button" data-next>${question.required ? 'Opslaan en verder' : 'Overslaan of opslaan'} →</button>` : ''}
    </div>
  </div>`

  content.querySelector('[data-back]')?.addEventListener('click', () => { stepIndex -= 1; renderStep() })
  content.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => saveAndAdvance(question, button.dataset.answer, button)))
  content.querySelector('[data-next]')?.addEventListener('click', () => saveAndAdvance(question, document.querySelector('#measurement-answer').value.trim()))
}

async function saveAndAdvance(question, answer, button) {
  if (question.required && answer === '') return
  content.querySelectorAll('button').forEach((item) => { item.disabled = true })
  button?.classList.add('is-selected')
  try {
    if (!preview) await invoke({ action: 'answer', token, question: question.key, answer })
    measurement.answers[question.key] = answer
    document.querySelector('#measurement-saved').textContent = 'Antwoord opgeslagen ✓'
    window.setTimeout(async () => {
      if (stepIndex < measurement.questions.length - 1) { stepIndex += 1; renderStep(); return }
      try {
        if (!preview) await invoke({ action: 'complete', token })
        showFinished()
      } catch (error) { showError(error.message) }
    }, 260)
  } catch (error) {
    showError(error.message)
  }
}

function showFinished() {
  progress.style.width = '100%'
  sessionStorage.removeItem('zol-pain-checkin-token')
  content.innerHTML = `<div class="measurement-finished"><span class="measurement-finished-icon">✓</span><p class="measurement-kicker">Klaar</p><h1>Dank je wel.</h1><p>De antwoorden zijn veilig opgeslagen. De volgende korte vragenlijst komt vanzelf per e-mail.</p></div>`
}

async function boot() {
  if (preview === 'consent') { renderConsent('ouder of verzorger'); return }
  if (consentToken) { await bootConsent(); return }
  if (preview && previewMeasurements[preview]) {
    measurement = JSON.parse(JSON.stringify(previewMeasurements[preview]))
    renderStep()
    return
  }
  if (!token) { showError('De persoonlijke meetlink ontbreekt of is verlopen.'); return }
  try {
    sessionStorage.setItem('zol-pain-checkin-token', token)
    measurement = await invoke({ action: 'load', token })
    if (!measurement.completed && quickQuestion && quickAnswer && measurement.questions.some((question) => question.key === quickQuestion)) {
      await invoke({ action: 'answer', token, question: quickQuestion, answer: quickAnswer })
      measurement.answers[quickQuestion] = quickAnswer
    }
    const unanswered = measurement.questions.findIndex((question) => measurement.answers?.[question.key] === undefined)
    stepIndex = unanswered === -1 ? measurement.questions.length - 1 : unanswered
    history.replaceState({}, '', '/meting/')
    if (measurement.completed) showFinished(); else renderStep()
  } catch (error) {
    showError(error.message)
  }
}

boot()
