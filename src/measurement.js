import { supabase } from './supabase-client.js'

const content = document.querySelector('#measurement-content')
const progress = document.querySelector('#measurement-progress-bar')
const params = new URLSearchParams(window.location.search)
const preview = import.meta.env.DEV ? params.get('preview') : ''
let token = params.get('token') || sessionStorage.getItem('zol-pilot-token') || ''
const quickQuestion = params.get('q') || ''
const quickAnswer = params.get('a') || ''
let measurement = null
let stepIndex = 0

const previewMeasurements = {
  baseline: {
    timepoint: 'baseline', label: 'Startmeting', intro: 'Voor het eerste gebruik · ongeveer 1 minuut', completed: false, answers: {},
    questions: [
      { key: 'pain_sport', label: 'Hoeveel hielpijn was er tijdens het sporten?', help: '0 is geen pijn, 10 is de ergst denkbare pijn.', type: 'scale', min: 0, max: 10, required: true },
      { key: 'sport_limit', label: 'Kon je kind de sport gewoon meedoen?', type: 'choice', required: true, options: [{ value: 'full', label: 'Ja, volledig' }, { value: 'partial', label: 'Gedeeltelijk' }, { value: 'stopped', label: 'Nee, gestopt' }] },
      { key: 'pain_after', label: 'Hoeveel hielpijn was er na het sporten?', help: '0 is geen pijn, 10 is de ergst denkbare pijn.', type: 'scale', min: 0, max: 10, required: true },
    ],
  },
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function showError(message) {
  progress.style.width = '0'
  content.innerHTML = `<div class="measurement-error"><p class="measurement-kicker">Deze link werkt niet</p><h1>We helpen je graag verder.</h1><p>${escapeHtml(message)} Antwoord op de e-mail of mail naar <a href="mailto:info@zolsolutions.nl">info@zolsolutions.nl</a>.</p></div>`
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('pilot-measurement', { body })
  if (error || data?.error) throw new Error(data?.error || 'De meting kon niet worden geladen.')
  return data
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
  sessionStorage.removeItem('zol-pilot-token')
  content.innerHTML = `<div class="measurement-finished"><span class="measurement-finished-icon">✓</span><p class="measurement-kicker">Klaar</p><h1>Dank je wel.</h1><p>De antwoorden zijn veilig opgeslagen. De volgende korte meting komt vanzelf per e-mail.</p></div>`
}

async function boot() {
  if (preview && previewMeasurements[preview]) {
    measurement = JSON.parse(JSON.stringify(previewMeasurements[preview]))
    renderStep()
    return
  }
  if (!token) { showError('De persoonlijke meetlink ontbreekt of is verlopen.'); return }
  try {
    sessionStorage.setItem('zol-pilot-token', token)
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
