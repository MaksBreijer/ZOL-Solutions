// CRM-scherm voor de admin: organisaties, contactpersonen, samenwerkingen, taken, activiteiten, inbox, evenementen en privacybeheer.
// Rechten (owner/admin -> beheerder, editor -> medewerker, viewer -> leesrechten) worden in de database afgedwongen; de UI toont alleen wat past.
import { reviewCandidates, today, visibleOrganizations } from './model.js'
import { createCrmStore } from './store.js'

const STAGE_LABELS = { onbekend: 'Onbekend', 'te-benaderen': 'Te benaderen', 'contact-gelegd': 'Contact gelegd', voorstel: 'Voorstel', onderhandeling: 'In gesprek', gewonnen: 'Samenwerking', verloren: 'Afgesloten' }
const TASK_LABELS = { open: 'Open', bezig: 'Bezig', 'wacht-op-reactie': 'Wacht op reactie', afgerond: 'Afgerond', vervallen: 'Vervallen' }
const SEGMENTS = ['Sportvereniging', 'Fysiopraktijk', 'Medische organisatie', 'Partner', 'Intern', 'Onbekend']
const ACTIVITY_TYPES = { notitie: 'Notitie', mail: 'E-mail verstuurd', telefoon: 'Telefoongesprek', whatsapp: 'WhatsApp', afspraak: 'Afspraak', wijziging: 'Wijziging', bestand: 'Bestand' }
const TABS = [
  ['overview', 'Overzicht'], ['organizations', 'Organisaties'], ['contacts', 'Contactpersonen'], ['deals', 'Samenwerkingen'], ['tasks', 'Taken & opvolging'],
  ['activities', 'Activiteiten'], ['inbox', 'Inbox & bestanden'], ['events', 'Evenementen'], ['data', 'Gegevens'], ['privacy', 'Beheer & privacy'],
]
const SINGULAR = { organizations: 'organisatie', contacts: 'contactpersoon', deals: 'samenwerking', tasks: 'taak', activities: 'contactmoment', events: 'evenement', inbox: 'inboxnotitie' }

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const fmtDate = (value) => (value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Geen datum')
const fmtMoney = (value) => (value === null || value === undefined ? 'Niet ingevuld' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value))
const initials = (name) => String(name || 'Z').split(/\s/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
const isOpen = (task) => !['afgerond', 'vervallen'].includes(task.status)
const pill = (text, tone = '') => `<span class="status-pill${tone ? ` is-${tone}` : ''}">${esc(text)}</span>`
const button = (text, action, attrs = '', kind = '') => `<button class="button${kind ? ` button--${kind}` : ''}" type="button" data-crm-action="${action}" ${attrs}>${esc(text)}</button>`
const empty = (title, text = '') => `<div class="empty-state"><span>◇</span><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`
const taskOrder = (a, b) => ({ hoog: 0, normaal: 1, laag: 2 }[a.priority ?? 'normaal'] - { hoog: 0, normaal: 1, laag: 2 }[b.priority ?? 'normaal']) || (a.due || '9999').localeCompare(b.due || '9999')

export function createCrmView(ctx) {
  const store = createCrmStore(ctx.supabase)
  const view = { state: null, tab: 'overview', search: '', segment: '', status: '', taskMode: 'active', error: '', loading: false, busy: false, audit: null }
  const content = ctx.content
  const can = {
    write: () => ['admin', 'member'].includes(view.state?.me?.role),
    admin: () => view.state?.me?.role === 'admin',
  }
  const org = (id) => view.state.organizations.find((item) => item.id === id)
  const contact = (id) => view.state.contacts.find((item) => item.id === id)
  const matches = (record) => JSON.stringify(record).toLocaleLowerCase('nl').includes(view.search.toLocaleLowerCase('nl'))
  const orgOptions = () => Object.fromEntries([...visibleOrganizations(view.state)].sort((a, b) => a.name.localeCompare(b.name)).map((item) => [item.id, item.name]))
  const contactOptions = () => Object.fromEntries(view.state.contacts.map((item) => [item.id, item.name]))

  async function load(showSpinner = true) {
    if (showSpinner) { view.loading = true; render() }
    try { view.state = await store.loadState(); view.error = '' } catch (error) { view.error = error.message }
    view.loading = false
    render()
  }

  // --- Weergave ---
  function render() {
    if (ctx.isActive && !ctx.isActive()) return
    const tabs = TABS.filter(([id]) => id !== 'privacy' || can.admin())
    const body = view.loading && !view.state ? empty('CRM laden…')
      : view.error && !view.state ? `<div class="empty-state"><span>!</span><h3>CRM nog niet bereikbaar</h3><p>${esc(view.error)}</p>${button('Opnieuw proberen', 'refresh', '', 'primary')}</div>`
        : bodyFor(view.tab)
    content.innerHTML = `<div class="page-container crm-page">
      <header class="page-header"><div><div class="page-breadcrumb"><span>ZOL Solutions</span><i data-lucide="chevron-right"></i><strong>CRM</strong></div><h1>CRM</h1><p>Relaties, opvolging en samenwerkingen op één plek.</p></div><div class="page-actions">${view.state ? button('Vernieuwen', 'refresh') : ''}${view.state && can.write() ? button('Organisatie toevoegen', 'new', 'data-collection="organizations"', 'primary') : ''}</div></header>
      ${view.state ? `<nav class="finance-tabs" aria-label="CRM-onderdelen">${tabs.map(([id, label]) => `<button type="button" data-crm-action="tab" data-tab="${id}" class="${view.tab === id ? 'is-active' : ''}">${esc(label)}${tabCount(id)}</button>`).join('')}</nav>` : ''}
      ${view.state && view.state.me.role === 'viewer' ? '<p class="form-hint">Dit account heeft alleen leesrechten in het CRM.</p>' : ''}
      <div id="crm-body">${body}</div></div>`
    renderResults()
    ctx.refreshIcons?.()
  }

  function tabCount(id) {
    const state = view.state
    const count = { organizations: visibleOrganizations(state).length, contacts: state.contacts.length, tasks: state.tasks.filter(isOpen).length, inbox: state.inbox.filter((item) => item.status === 'te-verwerken').length }[id]
    return count ? ` <small>${count}</small>` : ''
  }

  function bodyFor(tab) {
    const renderers = { overview, organizations: () => listShell('Zoek in organisaties…', selectFilter('crm-segment', 'Alle segmenten', Object.fromEntries(SEGMENTS.map((item) => [item, item])), view.segment) + (can.admin() ? button('Organisaties samenvoegen', 'merge-form') : '')), contacts: () => listShell('Zoek in contactpersonen…', can.write() ? button('Contactpersoon toevoegen', 'new', 'data-collection="contacts"', 'primary') : ''), deals: () => listShell('Zoek in samenwerkingen…', can.write() ? button('Samenwerking toevoegen', 'new', 'data-collection="deals"', 'primary') : ''), tasks: tasksShell, activities: () => listShell('Zoek in activiteiten…', can.write() ? button('Contactmoment vastleggen', 'new', 'data-collection="activities"', 'primary') : ''), inbox: inboxShell, events: () => listShell('Zoek in evenementen…', can.write() ? button('Evenement toevoegen', 'new', 'data-collection="events"', 'primary') : ''), data: dataView, privacy: privacyView }
    return renderers[tab]()
  }

  const selectFilter = (id, all, items, value) => `<select class="crm-filter" id="${id}" aria-label="${esc(all)}"><option value="">${esc(all)}</option>${Object.entries(items).map(([key, label]) => `<option value="${esc(key)}" ${value === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`
  const listShell = (placeholder, extras = '') => `<section class="panel"><div class="crm-toolbar"><label class="crm-search"><input id="crm-search" type="search" placeholder="${esc(placeholder)}" value="${esc(view.search)}" aria-label="Zoeken" autocomplete="off"></label>${extras}<span class="crm-count" id="crm-count"></span></div><div id="crm-results"></div></section>`
  const tasksShell = () => listShell('Zoek in taken…', `<span class="crm-segmented">${button('Open', 'task-mode', 'data-mode="active"', view.taskMode === 'active' ? 'primary' : '')}${button('Alle taken', 'task-mode', 'data-mode="all"', view.taskMode === 'all' ? 'primary' : '')}</span>${selectFilter('crm-status', 'Alle statussen', TASK_LABELS, view.status)}${can.write() ? button('Nieuwe taak', 'new', 'data-collection="tasks"', 'primary') : ''}`)
  const inboxShell = () => listShell('Zoek in inbox…', `${selectFilter('crm-status', 'Alle statussen', { 'te-verwerken': 'Te verwerken', verwerkt: 'Verwerkt' }, view.status)}${can.write() ? `${button('Losse notitie', 'new', 'data-collection="inbox"')}${button('Bestand toevoegen', 'upload', '', 'primary')}` : ''}`)

  function renderResults() {
    const target = content.querySelector('#crm-results')
    if (!target || !view.state) return
    const fn = { organizations: orgResults, contacts: contactResults, deals: dealResults, tasks: taskResults, activities: activityResults, inbox: inboxResults, events: eventResults }[view.tab]
    target.innerHTML = fn()
  }
  const setCount = (n, label) => { const el = content.querySelector('#crm-count'); if (el) el.textContent = `${n} ${label}` }

  function taskRow(task) {
    const done = task.status === 'afgerond'
    return `<div class="crm-task"><button class="crm-check${done ? ' is-done' : ''}" type="button" data-crm-action="toggle-task" data-id="${esc(task.id)}" aria-label="${done ? 'Heropen' : 'Rond af'}: ${esc(task.title)}" ${can.write() ? '' : 'disabled'}>${done ? '✓' : ''}</button>
      <div><button class="crm-link" type="button" data-crm-action="edit" data-collection="tasks" data-id="${esc(task.id)}">${esc(task.title)}</button>
      <div class="crm-meta">${(task.organizationIds || []).map((id) => pill(org(id)?.name || id)).join('')}<span class="${isOpen(task) && task.due && task.due < today() ? 'crm-overdue' : ''}">${task.due ? fmtDate(task.due) : 'Geen deadline'}</span>${task.owner ? `<span>· ${esc(task.owner)}</span>` : ''}${task.priority === 'hoog' ? pill('Hoge prioriteit', 'orange') : ''}${task.status !== 'open' ? pill(TASK_LABELS[task.status] || task.status, task.status === 'afgerond' ? 'green' : '') : ''}</div></div></div>`
  }

  const timeline = (items) => `<div class="crm-timeline">${[...items].sort((a, b) => `${b.date}${b.createdAt || ''}`.localeCompare(`${a.date}${a.createdAt || ''}`)).map((item) => `<div class="crm-timeline-item"><small>${fmtDate(item.date)} · ${esc(ACTIVITY_TYPES[item.type] || item.type || 'notitie')}</small><p>${esc(item.text)}</p><small>${esc(item.source || 'CRM')}</small></div>`).join('') || empty('Nog geen activiteiten')}</div>`

  function overview() {
    const { state } = view
    const tasks = state.tasks.filter(isOpen).sort(taskOrder)
    const deals = state.deals.filter((deal) => !['gewonnen', 'verloren'].includes(deal.stage))
    const stages = ['te-benaderen', 'contact-gelegd', 'voorstel', 'onderhandeling', 'gewonnen']
    return `<section class="metric-grid">${[['Organisaties', visibleOrganizations(state).length, 'Relaties in één overzicht'], ['Contactpersonen', state.contacts.length, 'De mensen achter je netwerk'], ['Open taken', tasks.length, `${tasks.filter((task) => !task.due).length} zonder deadline`], ['Lopende kansen', deals.length, 'Samen verder bouwen']].map(([label, n, note]) => `<article class="metric-card"><header><span>${label}</span></header><strong>${n}</strong><footer><span>${esc(note)}</span></footer></article>`).join('')}</section>
      <section class="panel"><header class="panel-header"><div><h2>Volgende stappen</h2><p>Open acties, gesorteerd op prioriteit en deadline.</p></div>${button('Alle taken', 'tab', 'data-tab="tasks"')}</header><div class="crm-pad">${tasks.slice(0, 6).map(taskRow).join('') || empty('Alles bijgewerkt', 'Maak een nieuwe taak aan voor je volgende stap.')}${tasks.length > 6 ? `<p class="form-hint">+ ${tasks.length - 6} andere open taken</p>` : ''}</div></section>
      <section class="panel"><header class="panel-header"><div><h2>Samenwerkingspipeline</h2><p>Alleen vastgelegde kansen; organisaties worden niet automatisch als verkoopkans geteld.</p></div>${button('Bekijk pipeline', 'tab', 'data-tab="deals"')}</header><div class="crm-stages">${stages.map((stage) => `<div><strong>${state.deals.filter((deal) => deal.stage === stage).length}</strong><span>${STAGE_LABELS[stage]}</span></div>`).join('')}</div></section>`
  }

  function orgResults() {
    const rows = visibleOrganizations(view.state).filter((item) => matches(item) && (!view.segment || item.segment === view.segment))
    setCount(rows.length, 'organisaties')
    return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Organisatie</th><th>Segment</th><th>Contact</th><th>Open taken</th></tr></thead><tbody>${rows.map((item) => {
      const open = view.state.tasks.filter((task) => isOpen(task) && (task.organizationIds || []).includes(item.id)).length
      return `<tr data-crm-action="detail" data-id="${esc(item.id)}"><td><strong>${esc(item.name)}</strong><small class="table-subline">${esc(item.city || 'Locatie onbekend')}</small></td><td>${pill(item.segment || 'Onbekend', item.segment === 'Partner' ? 'orange' : '')}</td><td>${esc(item.email || 'Nog niet ingevuld')}${item.phone ? `<small class="table-subline">${esc(item.phone)}</small>` : ''}</td><td>${open ? pill(`${open} open`, 'orange') : '—'}</td></tr>`
    }).join('')}</tbody></table></div>${rows.length ? '' : empty('Geen organisaties gevonden', 'Pas je zoekopdracht of filter aan.')}`
  }

  function contactResults() {
    const rows = view.state.contacts.filter((item) => matches({ ...item, organization: org(item.organizationId)?.name }))
    setCount(rows.length, 'contactpersonen')
    return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Naam</th><th>Organisatie</th><th>E-mail / telefoon</th><th>Functie</th></tr></thead><tbody>${rows.map((item) => `<tr data-crm-action="edit" data-collection="contacts" data-id="${esc(item.id)}"><td><strong>${esc(item.name)}</strong></td><td>${esc(org(item.organizationId)?.name || 'Niet bevestigd')}</td><td>${esc(item.email || 'Geen persoonlijk e-mailadres')}${item.phone ? `<small class="table-subline">${esc(item.phone)}</small>` : ''}</td><td>${esc(item.role || '—')}</td></tr>`).join('')}</tbody></table></div>${rows.length ? '' : empty('Geen contactpersonen gevonden')}`
  }

  function dealResults() {
    const rows = view.state.deals.filter((deal) => matches({ ...deal, organization: org(deal.organizationId)?.name }))
    setCount(rows.length, 'kansen')
    return `<div class="crm-kanban">${Object.entries(STAGE_LABELS).map(([stage, label]) => `<section class="crm-lane"><h3>${label} <span>${rows.filter((deal) => deal.stage === stage).length}</span></h3>${rows.filter((deal) => deal.stage === stage).map((deal) => `<article class="crm-card"><small>${esc(org(deal.organizationId)?.name || 'Organisatie onbekend')}</small><button class="crm-link" type="button" data-crm-action="edit" data-collection="deals" data-id="${esc(deal.id)}">${esc(deal.title)}</button><p>${esc(deal.nextAction || 'Volgende actie nog bepalen')}</p>${deal.nextDate ? `<small class="${deal.nextDate < today() ? 'crm-overdue' : ''}">${fmtDate(deal.nextDate)}</small>` : ''}<strong>${fmtMoney(deal.value)}</strong></article>`).join('') || '<p class="form-hint">Nog geen kansen in deze fase</p>'}</section>`).join('')}</div>`
  }

  function taskResults() {
    const rows = view.state.tasks.filter((task) => matches({ ...task, orgs: (task.organizationIds || []).map((id) => org(id)?.name) }) && (view.taskMode === 'all' || isOpen(task)) && (!view.status || view.status === task.status)).sort(taskOrder)
    setCount(rows.length, 'taken')
    return `<div class="crm-pad">${rows.map(taskRow).join('') || empty('Geen taken in deze selectie', 'Je kunt een nieuwe taak aanmaken of de filters aanpassen.')}</div>`
  }

  function activityResults() {
    const rows = view.state.activities.filter(matches)
    setCount(rows.length, 'activiteiten')
    return `<div class="crm-pad">${timeline(rows)}</div>`
  }

  function inboxResults() {
    const rows = view.state.inbox.filter((item) => matches(item) && (!view.status || item.status === view.status))
    setCount(rows.length, 'items')
    return `<div class="crm-files">${rows.map((item) => `<article class="crm-card">${pill(item.status === 'verwerkt' ? 'Verwerkt' : 'Te verwerken', item.status === 'verwerkt' ? 'green' : 'orange')}<strong>${esc(item.title)}</strong><small>${fmtDate(item.date)}${item.organizationId ? ` · ${esc(org(item.organizationId)?.name || '')}` : ''}</small><p>${esc(item.notes || 'Geen toelichting toegevoegd.')}</p>${item.fileName ? `<small>${esc(item.fileName)} · ${Math.round((item.size || 0) / 1024)} kB</small>` : ''}<div>${item.fileKey ? button('Bestand openen', 'open-file', `data-key="${esc(item.fileKey)}"`) : ''}${can.write() ? button('Verwerken', 'edit', `data-collection="inbox" data-id="${esc(item.id)}"`) : ''}</div></article>`).join('')}</div>${rows.length ? '' : empty('Ruimte voor nieuwe informatie', 'Voeg een screenshot, document of losse notitie toe.')}`
  }

  function eventResults() {
    const rows = view.state.events.filter(matches).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
    setCount(rows.length, 'evenementen')
    return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Datum</th><th>Evenement</th><th>Club / locatie</th><th>Sport</th></tr></thead><tbody>${rows.map((item) => `<tr data-crm-action="edit" data-collection="events" data-id="${esc(item.id)}"><td>${fmtDate(item.date)}${item.date && item.date < today() ? '<small class="table-subline">Verleden datum</small>' : ''}</td><td><strong>${esc(item.title)}</strong></td><td>${esc(org(item.organizationId)?.name || item.club || '—')}<small class="table-subline">${esc(item.city || '')}</small></td><td>${esc(item.sport || '—')}</td></tr>`).join('')}</tbody></table></div>${rows.length ? '' : empty('Geen evenementen gevonden')}`
  }

  function dataView() {
    const { state } = view
    return `<section class="panel"><header class="panel-header"><div><h2>Gegevens meenemen</h2><p>Een JSON-export (versie 1) met organisaties, personen, taken, kansen, activiteiten, evenementen en inbox. Bijlagen en privacybeheer zitten er niet in.</p></div>${can.admin() ? button('Gegevens exporteren', 'export', '', 'primary') : ''}</header>
      <div class="crm-pad"><p class="form-hint">De export bevat leesbare persoonsgegevens en wordt in het controlelogboek vastgelegd. De oorspronkelijke gegevens migreer je met <code>scripts/crm-import.mjs</code>, niet met een bestandsupload.</p></div></section>
      <section class="panel"><header class="panel-header"><div><h2>Aandacht voor gegevenskwaliteit</h2></div></header><div class="crm-pad"><ul class="crm-list"><li>${visibleOrganizations(state).filter((item) => !item.email && !item.phone).length} organisaties zonder e-mail of telefoon.</li><li>${state.tasks.filter((task) => isOpen(task) && !task.due).length} open taken zonder deadline.</li><li>${state.contacts.filter((item) => !item.organizationId).length} personen zonder bevestigde organisatie.</li></ul>${state.uncertainties.length ? `<h3>Nog te verduidelijken</h3><ul class="crm-list">${state.uncertainties.map((text) => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}</div></section>`
  }

  function privacyView() {
    const privacy = view.state.privacy
    if (!privacy) return empty('Alleen voor beheerders')
    const { policy, register } = privacy
    const open = privacy.requests.filter((item) => !['afgerond', 'afgewezen'].includes(item.status))
    const merges = privacy.organizationMerges.filter((item) => item.status === 'merged')
    return `<p class="form-hint">Dit scherm ondersteunt jullie AVG-werkwijze. De termijnen zijn instelbare voorstellen, geen wettelijke standaard. Persoonlijke accounts en rollen beheer je bij Beheerders; het CRM gebruikt die accounts.</p>
      <section class="metric-grid">${[['Open verzoeken', open.length], ['Incidenten open', privacy.incidents.filter((item) => item.status !== 'afgesloten').length], ['Verwijderlijst', privacy.erasedIds.length]].map(([label, n]) => `<article class="metric-card"><header><span>${label}</span></header><strong>${n}</strong></article>`).join('')}</section>
      <section class="panel"><header class="panel-header"><div><h2>Bewaarbeleid</h2><p>Prospectdossiers na ${policy.prospectReviewMonths} maanden beoordelen. Controlelog ${policy.auditDays} dagen. Back-ups ${policy.backupDays} dagen. Dossiers worden nooit automatisch verwijderd.</p></div><div>${button('Termijnen instellen', 'policy-form')} ${button('Dossiers beoordelen', 'candidates')}</div></header></section>
      <section class="panel"><header class="panel-header"><div><h2>Verwerkingsregister & afspraken</h2><p>${esc(register.controller)} · ${esc(register.purpose)}<br>Grondslag: ${esc(register.legalBasis)} · Regio: ${esc(register.hostingRegion || 'Nog niet bevestigd')} · Verwerkersovereenkomst: ${register.processorAgreement ? 'bevestigd' : 'nog te controleren'}</p></div><div>${pill(register.approvedAt ? 'Door beheerder beoordeeld' : 'Actie nodig: wijzigen is geblokkeerd tot dit klaar is', register.approvedAt ? 'green' : 'orange')} ${button('Register bijwerken', 'register-form')}</div></header></section>
      ${merges.length ? `<section class="panel"><header class="panel-header"><h2>Samenvoegingen herstellen</h2></header><div class="crm-pad">${merges.map((item) => `<div class="crm-task"><div>${esc(org(item.targetId)?.name || item.targetId)}<div class="crm-meta"><span>${fmtDate(item.createdAt)}</span></div></div>${button('Terugdraaien', 'unmerge', `data-id="${esc(item.id)}"`)}</div>`).join('')}</div></section>` : ''}
      <section class="panel"><header class="panel-header"><div><h2>Privacyverzoeken</h2><p>Een maand als standaard werktermijn; beoordeel bijzondere situaties afzonderlijk.</p></div>${button('Verzoek registreren', 'request-form', '', 'primary')}</header><div class="table-scroll"><table class="data-table"><thead><tr><th>Contact</th><th>Verzoek</th><th>Uiterlijk</th><th>Status</th><th></th></tr></thead><tbody>${privacy.requests.map((item) => `<tr><td>${esc(contact(item.contactId)?.name || 'Contact verwijderd')}<small class="table-subline">Identiteit ${item.identityVerified ? 'handmatig bevestigd' : 'nog te controleren'}</small></td><td>${esc(item.type)}</td><td class="${item.due < today() && !['afgerond', 'afgewezen'].includes(item.status) ? 'crm-overdue' : ''}">${fmtDate(item.due)}</td><td>${esc(item.status)}</td><td>${button('Afhandelen', 'request-form', `data-id="${esc(item.id)}"`, 'small')}</td></tr>`).join('')}</tbody></table></div>${privacy.requests.length ? '' : empty('Nog geen privacyverzoeken')}</section>
      <section class="panel"><header class="panel-header"><div><h2>Incidentenregister</h2><p>Ondersteunt beoordeling; het CRM doet geen automatische melding bij de AP.</p></div>${button('Incident vastleggen', 'incident-form')}</header><div class="crm-pad">${privacy.incidents.map((item) => `<div class="crm-task"><div><strong>${esc(item.summary)}</strong><div class="crm-meta"><span>${fmtDate(item.detectedAt)} · ${esc(item.status)} · 72-uurs aandachtspunt ${esc(new Date(item.assessmentDue).toLocaleString('nl-NL'))}</span></div>${item.reportingDecision ? `<p>${esc(item.reportingDecision)}</p>` : ''}</div>${button('Bijwerken', 'incident-form', `data-id="${esc(item.id)}"`)}</div>`).join('') || empty('Nog geen incidenten vastgelegd')}</div></section>
      <section class="panel"><header class="panel-header"><div><h2>Controlelogboek</h2><p>Serverregistratie van toegang, wijzigingen, downloads en beheeracties. Niet te bewerken.</p></div>${button(view.audit ? 'Vernieuwen' : 'Laden', 'load-audit')}</header>${view.audit ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Tijdstip</th><th>Gebruiker</th><th>Actie</th><th>Onderdeel</th></tr></thead><tbody>${view.audit.map((entry) => `<tr><td>${esc(new Date(entry.at).toLocaleString('nl-NL'))}</td><td>${esc(entry.actorEmail || entry.actorId || '')}</td><td>${esc(entry.action)}</td><td>${esc(entry.resource || 'werkruimte')}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>`
  }

  // --- Dialogen en formulieren ---
  const field = (name, label, value = '', type = 'text', full = false) => `<label class="field${full ? ' field--full' : ''}">${esc(label)}<input name="${name}" type="${type}" value="${esc(value ?? '')}" ${['name', 'title'].includes(name) ? 'required maxlength="500"' : ''}${type === 'number' ? ' min="0" step="0.01"' : ''}></label>`
  const area = (name, label, value = '', required = false) => `<label class="field field--full">${esc(label)}<textarea name="${name}" ${required ? 'required' : ''}>${esc(value)}</textarea></label>`
  const checkbox = (name, label, checked = false) => `<label class="field field--full"><span><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${esc(label)}</span></label>`
  const options = (name, label, values, value = '', multiple = false) => `<label class="field${multiple ? ' field--full' : ''}">${esc(label)}<select name="${name}" ${multiple ? 'multiple size="5"' : ''}>${multiple ? '' : '<option value="">Niet ingevuld</option>'}${Object.entries(values).map(([id, text]) => `<option value="${esc(id)}" ${(multiple ? (value || []).includes(id) : value === id) ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>${multiple ? '<small>Meerdere koppelingen: houd ⌘ (Mac) of Ctrl ingedrukt.</small>' : ''}</label>`

  function form(title, eyebrow, fields, onSubmit, { wide = false, submit = 'Opslaan' } = {}) {
    ctx.openDialog(title, eyebrow, `<form id="crm-form"><div class="form-grid">${fields}</div><p class="form-hint crm-form-error" role="alert"></p><div class="form-actions"><button class="button" type="button" data-close-dialog>Annuleren</button><button class="button button--primary" type="submit">${esc(submit)}</button></div></form>`)
    ctx.setWide?.(wide)
    const element = ctx.dialogBody().querySelector('#crm-form')
    element.addEventListener('submit', async (event) => {
      event.preventDefault()
      if (view.busy) return
      const submitButton = element.querySelector('[type=submit]')
      view.busy = true; submitButton.disabled = true
      try { await onSubmit(new FormData(element), element) } catch (error) { element.querySelector('.crm-form-error').textContent = error.message } finally { view.busy = false; submitButton.disabled = false }
    })
  }

  const apply = async (promise, message = 'Opgeslagen in het CRM.') => {
    const result = await promise
    view.state = result.state || result
    ctx.closeDialog()
    render()
    ctx.toast(message)
    return result
  }

  function recordForm(collection, id, defaults = {}) {
    const existing = id ? view.state[collection].find((item) => item.id === id) : null
    const r = existing || defaults
    let fields = ''
    if (collection === 'organizations') fields = field('name', 'Naam *', r.name) + options('segment', 'Segment', Object.fromEntries(SEGMENTS.map((item) => [item, item])), r.segment || 'Onbekend') + field('city', 'Plaats', r.city) + field('sport', 'Sport', r.sport) + field('email', 'E-mail organisatie', r.email, 'email') + field('phone', 'Telefoon', r.phone, 'tel') + field('website', 'Website', r.website, 'url', true) + area('notes', 'Notities', r.notes)
    if (collection === 'contacts') fields = field('name', 'Naam *', r.name) + options('organizationId', 'Organisatie', orgOptions(), r.organizationId) + field('email', 'Persoonlijk e-mailadres', r.email, 'email') + field('phone', 'Telefoon', r.phone, 'tel') + field('role', 'Functie', r.role, 'text', true) + options('legalBasis', 'Grondslag (na beoordeling)', { 'te-beoordelen': 'Nog te beoordelen', overeenkomst: 'Uitvoering overeenkomst', toestemming: 'Toestemming', gerechtvaardigd_belang: 'Gerechtvaardigd belang, onderbouwd' }, r.legalBasis || 'te-beoordelen') + field('noticeProvidedAt', 'Privacyinformatie verstrekt op', r.noticeProvidedAt, 'date') + checkbox('marketingObjection', 'Geen commerciële benadering / bezwaar vastgelegd', r.marketingObjection) + area('notes', 'Notities / context', r.notes)
    if (collection === 'deals') fields = field('title', 'Samenwerking *', r.title, 'text', true) + options('organizationId', 'Organisatie', orgOptions(), r.organizationId) + options('stage', 'Fase', STAGE_LABELS, r.stage || 'te-benaderen') + field('value', 'Waarde (€, optioneel)', r.value, 'number') + field('nextDate', 'Volgende contactdatum', r.nextDate, 'date') + field('nextAction', 'Volgende actie', r.nextAction, 'text', true) + options('contactIds', 'Betrokken personen', contactOptions(), r.contactIds || [], true) + area('notes', 'Notities', r.notes)
    if (collection === 'tasks') fields = field('title', 'Actie *', r.title, 'text', true) + options('status', 'Status', TASK_LABELS, r.status || 'open') + options('priority', 'Prioriteit', { laag: 'Laag', normaal: 'Normaal', hoog: 'Hoog' }, r.priority || 'normaal') + field('due', 'Deadline', r.due, 'date') + field('owner', 'Verantwoordelijke', r.owner) + options('organizationIds', 'Organisaties', orgOptions(), r.organizationIds || [], true) + options('contactIds', 'Contactpersonen', contactOptions(), r.contactIds || [], true) + area('notes', 'Toelichting', r.notes)
    if (collection === 'activities') fields = options('type', 'Contacttype', ACTIVITY_TYPES, r.type || 'notitie') + field('date', 'Datum *', r.date || today(), 'date') + options('relatedIds', 'Gekoppelde dossiers', Object.fromEntries([...visibleOrganizations(view.state).map((item) => [item.id, `Organisatie · ${item.name}`]), ...view.state.contacts.map((item) => [item.id, `Persoon · ${item.name}`]), ...view.state.tasks.map((item) => [item.id, `Taak · ${item.title}`]), ...view.state.deals.map((item) => [item.id, `Kans · ${item.title}`])]), r.relatedIds || [], true) + area('text', 'Wat is besproken of gedaan? *', r.text, true)
    if (collection === 'events') fields = field('title', 'Evenement *', r.title, 'text', true) + field('date', 'Datum', r.date, 'date') + options('organizationId', 'Organisatie', orgOptions(), r.organizationId) + field('club', 'Clubnaam (als niet gekoppeld)', r.club) + field('city', 'Locatie', r.city) + field('sport', 'Sport', r.sport, 'text', true) + area('notes', 'Notities / deelname', r.notes)
    if (collection === 'inbox') fields = field('title', 'Titel *', r.title, 'text', true) + options('organizationId', 'Organisatie', orgOptions(), r.organizationId) + options('status', 'Verwerkingsstatus', { 'te-verwerken': 'Te verwerken', verwerkt: 'Verwerkt' }, r.status || 'te-verwerken') + area('notes', 'Informatie / verwerking', r.notes)
    if (collection === 'contacts' && existing && can.admin()) fields += `<div class="field field--full">${button('Privacyopties voor dit contact', 'subject-options', `data-id="${esc(id)}"`)}</div>`
    fields += field('source', 'Bron / herkomst', r.source || 'Handmatig ingevoerd in CRM', 'text', true)
    const readOnly = !can.write()
    form(`${existing ? 'Bewerk' : 'Nieuwe'} ${SINGULAR[collection]}`, 'CRM', fields, async (data, element) => {
      const next = { ...(existing || {}), ...Object.fromEntries(data.entries()), id: existing?.id || crypto.randomUUID() }
      for (const key of ['organizationIds', 'contactIds', 'relatedIds']) if (element.elements.namedItem(key)) next[key] = data.getAll(key)
      if (collection === 'contacts') next.marketingObjection = data.has('marketingObjection')
      if (collection === 'deals') next.value = data.get('value') === '' ? null : Number(data.get('value'))
      if (collection === 'inbox') next.date = next.date || today()
      if (collection === 'organizations' && view.state.organizations.some((item) => item.id !== next.id && item.name.trim().toLowerCase() === next.name.trim().toLowerCase())) throw new Error('Deze organisatienaam bestaat al. Bewerk het bestaande dossier.')
      await apply(store.saveRecord(view.state, collection, next, existing ? (existing.revision || existing.updatedAt || null) : null))
    }, { wide: true })
    if (readOnly) ctx.dialogBody().querySelector('[type=submit]').disabled = true
  }

  async function detail(id) {
    const item = org(id)
    if (!item) return
    try { await store.readRecord('organizations', id) } catch (error) { ctx.toast('Dossier openen mislukt', error.message, true); return }
    const { state } = view
    const contacts = state.contacts.filter((person) => person.organizationId === id)
    const tasks = state.tasks.filter((task) => (task.organizationIds || []).includes(id))
    const deals = state.deals.filter((deal) => deal.organizationId === id)
    const related = new Set([id, ...contacts.map((x) => x.id), ...tasks.map((x) => x.id), ...deals.map((x) => x.id)])
    const files = state.inbox.filter((file) => file.organizationId === id)
    let website = null
    try { const url = new URL(item.website); if (['http:', 'https:'].includes(url.protocol)) website = url.href } catch { /* geen geldige link */ }
    ctx.openDialog(item.name, [item.segment, item.city].filter(Boolean).join(' · ') || 'Organisatie', `<div class="crm-detail">
      ${can.write() ? `<div class="crm-actions">${button('Organisatie bewerken', 'edit', `data-collection="organizations" data-id="${esc(id)}"`, 'primary')}${button('+ Taak', 'new-related', `data-collection="tasks" data-org="${esc(id)}"`)}${button('+ Contactmoment', 'new-related', `data-collection="activities" data-org="${esc(id)}"`)}${button('+ Samenwerking', 'new-related', `data-collection="deals" data-org="${esc(id)}"`)}${button('+ Contactpersoon', 'new-related', `data-collection="contacts" data-org="${esc(id)}"`)}</div>` : ''}
      <dl class="crm-fields"><div><dt>E-mail</dt><dd>${esc(item.email || 'Nog niet ingevuld')}</dd></div><div><dt>Telefoon</dt><dd>${esc(item.phone || 'Nog niet ingevuld')}</dd></div><div><dt>Website</dt><dd>${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">${esc(item.website)}</a>` : 'Nog niet ingevuld'}</dd></div><div><dt>Sport</dt><dd>${esc(item.sport || 'Nog niet ingevuld')}</dd></div></dl>
      <h3>Notities</h3><p class="crm-prewrap">${esc(item.notes || 'Nog geen notities.')}</p>
      <p class="form-hint crm-prewrap">Bron: ${esc(item.source || 'Onbekend')}${item.aliases?.length ? ` · Ook bekend als ${esc(item.aliases.join(', '))}` : ''}</p>
      <h3>Contactpersonen</h3><p>${contacts.map((person) => button(person.name, 'edit', `data-collection="contacts" data-id="${esc(person.id)}"`)).join(' ') || 'Nog geen bevestigde contactpersoon.'}</p>
      <h3>Taken & opvolging</h3><div>${tasks.sort(taskOrder).map(taskRow).join('') || '<p class="form-hint">Geen taken gekoppeld.</p>'}</div>
      ${deals.length ? `<h3>Samenwerkingen</h3><p>${deals.map((deal) => button(`${deal.title} · ${STAGE_LABELS[deal.stage]}`, 'edit', `data-collection="deals" data-id="${esc(deal.id)}"`)).join(' ')}</p>` : ''}
      ${files.length ? `<h3>Inbox & bestanden</h3><p>${files.map((file) => button(file.title, 'edit', `data-collection="inbox" data-id="${esc(file.id)}"`)).join(' ')}</p>` : ''}
      <h3>Contactgeschiedenis</h3>${timeline(state.activities.filter((activity) => (activity.relatedIds || []).some((rid) => related.has(rid))))}</div>`)
    ctx.setWide?.(true)
  }

  function uploadForm() {
    form('Bestand toevoegen', 'CRM-inbox', `${field('title', 'Titel *', '', 'text', true)}<label class="field field--full">Bestand *<input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" required></label>${options('organizationId', 'Organisatie', orgOptions())}${area('notes', 'Wat wil je hiermee vastleggen?')}<p class="form-hint field--full">PNG, JPG, WebP of PDF, maximaal 10 MB. Alleen beheerders kunnen bijlagen openen.</p>`, async (data) => {
      await apply(store.uploadFile(view.state, { file: data.get('file'), title: data.get('title'), organizationId: data.get('organizationId'), notes: data.get('notes') }), 'Bestand toegevoegd aan je inbox.')
    }, { submit: 'Uploaden' })
  }

  const memberless = (fn) => (...args) => { if (!can.admin()) { ctx.toast('Alleen beheerders', 'Je account heeft hiervoor geen toestemming.', true); return } return fn(...args) }

  function mergeForm() {
    form('Organisaties samenvoegen', 'Beheer', `${options('targetId', 'Doeldossier (blijft bestaan)', orgOptions())}${options('sourceIds', 'Andere dossiers die hierbij horen', orgOptions(), [], true)}${field('name', 'Juiste organisatienaam *', '', 'text', true)}${options('segment', 'Segment', Object.fromEntries(SEGMENTS.map((item) => [item, item])), 'Fysiopraktijk')}<p class="form-hint field--full">Taken, personen en geschiedenis worden overgezet. Brondossiers blijven als verborgen archief bewaard; terugdraaien kan in Beheer & privacy.</p>`, async (data) => {
      const targetId = data.get('targetId'), sourceIds = data.getAll('sourceIds')
      await apply(store.merge(view.state, { targetId, sourceIds, name: data.get('name'), segment: data.get('segment'), revisions: Object.fromEntries([targetId, ...sourceIds].map((id) => [id, org(id)?.revision || org(id)?.updatedAt || null])) }), 'Organisaties samengevoegd.')
    })
  }

  function policyForm() {
    const policy = view.state.privacy.policy
    form('Bewaartermijnen instellen', 'Beheer & privacy', `${field('prospectReviewMonths', 'Prospect beoordelen na (maanden)', policy.prospectReviewMonths, 'number')}${field('auditDays', 'Controlelog bewaren (dagen)', policy.auditDays, 'number')}${field('backupDays', 'Back-ups bewaren (dagen)', policy.backupDays, 'number')}<p class="form-hint field--full">Deze instellingen vragen een passende onderbouwing; lokale kopieën en oude Excel-lijsten worden niet automatisch opgeruimd.</p>`, async (data) => {
      await apply(store.savePolicy(view.state, Object.fromEntries(['prospectReviewMonths', 'auditDays', 'backupDays'].map((key) => [key, Number(data.get(key))]))))
    })
  }

  function registerForm() {
    const register = view.state.privacy.register
    form('Verwerkingsregister', 'Beheer & privacy', `${field('controller', 'Verantwoordelijke organisatie', register.controller, 'text', true)}${area('purpose', 'Doel en noodzakelijke gegevens', register.purpose)}${area('legalBasis', 'Grondslag en onderbouwing per doel', register.legalBasis)}${field('contactEmail', 'Contact voor privacyverzoeken', register.contactEmail, 'email')}${field('noticeUrl', 'Privacyverklaring (HTTPS)', register.noticeUrl, 'url')}${field('processor', 'Hostingpartij / verwerker', register.processor)}${field('hostingRegion', 'Bevestigde opslagregio', register.hostingRegion)}${checkbox('processorAgreement', 'Verwerkersovereenkomst en onderaannemers gecontroleerd', register.processorAgreement)}${checkbox('approved', 'Doel, grondslag, transparantie en afspraken door ons beoordeeld', Boolean(register.approvedAt))}`, async (data) => {
      await apply(store.saveRegister(view.state, { ...Object.fromEntries(['controller', 'purpose', 'legalBasis', 'contactEmail', 'noticeUrl', 'processor', 'hostingRegion'].map((key) => [key, data.get(key) || ''])), processorAgreement: data.has('processorAgreement'), approved: data.has('approved') }))
    })
  }

  function requestForm(id) {
    const request = id ? view.state.privacy.requests.find((item) => item.id === id) : null
    form(request ? 'Verzoek afhandelen' : 'Privacyverzoek registreren', 'Beheer & privacy', request
      ? options('status', 'Status', { ontvangen: 'Ontvangen', 'in-behandeling': 'In behandeling', afgerond: 'Afgerond', afgewezen: 'Afgewezen' }, request.status) + checkbox('identityVerified', 'Identiteit passend gecontroleerd, zonder kopie-ID op te slaan', request.identityVerified)
      : options('contactId', 'Betrokken contactpersoon', contactOptions()) + field('receivedDate', 'Ontvangen op', today(), 'date') + options('type', 'Soort verzoek', { inzage: 'Inzage', correctie: 'Correctie', verwijdering: 'Verwijdering', beperking: 'Beperking', bezwaar: 'Bezwaar' }, 'inzage') + checkbox('identityVerified', 'Identiteit passend gecontroleerd, zonder kopie-ID op te slaan'),
    async (data) => apply(store.saveRequest(view.state, request ? { id, status: data.get('status'), identityVerified: data.has('identityVerified') } : { contactId: data.get('contactId'), receivedDate: data.get('receivedDate'), type: data.get('type'), identityVerified: data.has('identityVerified') })))
  }

  function incidentForm(id) {
    const incident = id ? view.state.privacy.incidents.find((item) => item.id === id) : null
    form(incident ? 'Incident bijwerken' : 'Incident vastleggen', 'Beheer & privacy', area('summary', 'Korte beschrijving, zonder onnodige persoonsgegevens', incident?.summary || '', true)
      + (!incident ? field('detectedAt', 'Ontdekt op', new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), 'datetime-local', true) : '')
      + (incident ? options('status', 'Status', { 'te-beoordelen': 'Te beoordelen', 'in-onderzoek': 'In onderzoek', afgesloten: 'Afgesloten' }, incident.status) + area('reportingDecision', 'Beoordeling, maatregelen en meldbesluit', incident.reportingDecision || '') : '')
      + '<p class="form-hint field--full">Onderzoek onmiddellijk. Het 72-uurs aandachtspunt is geen toestemming om te wachten; beoordeel apart of en wanneer sprake is van kennisname en meldplicht.</p>',
    async (data) => apply(store.saveIncident(view.state, { ...(incident ? { id } : {}), summary: data.get('summary'), ...(!incident && data.get('detectedAt') ? { detectedAt: new Date(data.get('detectedAt')).toISOString() } : {}), status: data.get('status'), reportingDecision: data.get('reportingDecision') || '' })))
  }

  function candidatesDialog() {
    const rows = reviewCandidates(view.state)
    ctx.openDialog('Bewaartermijnen beoordelen', 'Beheer & privacy', `<div class="crm-pad">${rows.map((item) => `<div class="crm-task"><div>${esc(item.name)}<div class="crm-meta"><span>${esc(item.reason)} · ${item.lastActivity ? fmtDate(item.lastActivity) : 'Datum onbekend'}</span></div></div>${button('Beoordelen', 'subject-options', `data-id="${esc(item.id)}"`)}</div>`).join('') || empty('Geen dossiers die nu om beoordeling vragen')}</div>`)
  }

  function subjectOptions(id) {
    const person = contact(id)
    ctx.openDialog('Privacyopties', person.name, `<p class="form-hint">Controleer de identiteit en grondslag voordat je gegevens verstrekt of verwijdert. Losse tekst en bijlagen vragen een handmatige controle.</p><div class="crm-actions">${button('Inzagebestand ter controle', 'subject-export', `data-id="${esc(id)}"`)}${button('Bewaren onderbouwen', 'retention-form', `data-id="${esc(id)}"`)}${button('Verwijdering beoordelen', 'erase-form', `data-id="${esc(id)}"`)}</div>`)
  }

  function retentionForm(id) {
    const person = contact(id)
    form('Bewaren onderbouwen', person.name, `${area('retentionReason', 'Waarom zijn deze gegevens nog noodzakelijk?', person.retentionReason || '', true)}${checkbox('retentionHold', 'Verwijderen tijdelijk blokkeren, met bovenstaande onderbouwing', person.retentionHold)}`, async (data) => {
      await apply(store.reviewRetention(view.state, { contactId: id, retentionReason: data.get('retentionReason'), retentionHold: data.has('retentionHold') }))
    })
  }

  function eraseForm(id) {
    const person = contact(id)
    const subject = { attachments: view.state.inbox.filter((item) => item.organizationId && item.organizationId === person.organizationId) }
    form('Contactgegevens verwijderen', person.name, `<div class="form-hint field--full">Dit verwijdert het contact, gekoppelde persoonsactiviteiten en herkenbare naam/e-mail/telefoon in de CRM-tekstvelden. Controleer ook vrije tekst, de oorspronkelijke bronbestanden en exports. Oudere back-ups verlopen volgens beleid; bij herstel moet de verwijderlijst opnieuw worden toegepast.</div>${field('confirmName', 'Typ ter bevestiging de volledige naam', '', 'text', true)}${subject.attachments.map((file) => checkbox(`file-${file.id}`, `Ook verwijderen na inhoudscontrole: ${file.title}`)).join('')}${checkbox('manualReviewConfirmed', 'Ik heb de identiteit, noodzaak, gekoppelde bestanden en vrije tekst gecontroleerd')}`, async (data) => {
      if (!data.has('manualReviewConfirmed')) throw new Error('Bevestig eerst de controle.')
      await apply(store.erase(view.state, { contactId: id, confirmName: data.get('confirmName'), manualReviewConfirmed: true, attachmentIds: subject.attachments.filter((file) => data.has(`file-${file.id}`)).map((file) => file.id) }), 'Contactgegevens verwijderd.')
    }, { submit: 'Definitief verwijderen' })
  }

  function download(data, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // --- Acties ---
  const actions = {
    refresh: () => load(false),
    tab: (el) => { view.tab = el.dataset.tab; view.search = ''; view.segment = ''; view.status = ''; render() },
    'task-mode': (el) => { view.taskMode = el.dataset.mode; render() },
    new: (el) => recordForm(el.dataset.collection),
    edit: (el) => recordForm(el.dataset.collection, el.dataset.id),
    'new-related': (el) => {
      const collection = el.dataset.collection, orgId = el.dataset.org
      recordForm(collection, null, collection === 'tasks' ? { organizationIds: [orgId] } : collection === 'activities' ? { relatedIds: [orgId] } : { organizationId: orgId })
    },
    detail: (el) => detail(el.dataset.id),
    upload: uploadForm,
    'open-file': async (el) => {
      try { window.open(await store.openFile(el.dataset.key), '_blank', 'noopener') } catch (error) { ctx.toast('Bestand openen mislukt', error.message, true) }
    },
    'toggle-task': async (el) => {
      const task = view.state.tasks.find((item) => item.id === el.dataset.id)
      if (!task) return
      try { view.state = (await store.saveRecord(view.state, 'tasks', { ...task, status: task.status === 'afgerond' ? 'open' : 'afgerond' }, task.revision || task.updatedAt || null)).state; render() } catch (error) { ctx.toast('Opslaan mislukt', error.message, true) }
    },
    export: memberless(async () => {
      if (!window.confirm('Deze export bevat leesbare persoonsgegevens. Bewaar hem alleen op een veilige plek. Doorgaan?')) return
      try { download(await store.exportData(view.state), `zol-crm-${today()}.json`); ctx.toast('Export vastgelegd in het controlelogboek.', 'Bijlagen blijven apart.') } catch (error) { ctx.toast('Export mislukt', error.message, true) }
    }),
    'merge-form': memberless(mergeForm),
    unmerge: memberless(async (el) => { try { await apply(store.unmerge(view.state, el.dataset.id), 'Samenvoeging teruggedraaid.') } catch (error) { ctx.toast('Terugdraaien mislukt', error.message, true) } }),
    'policy-form': memberless(policyForm),
    'register-form': memberless(registerForm),
    'request-form': memberless((el) => requestForm(el.dataset.id)),
    'incident-form': memberless((el) => incidentForm(el.dataset.id)),
    candidates: memberless(candidatesDialog),
    'subject-options': memberless((el) => subjectOptions(el.dataset.id)),
    'retention-form': memberless((el) => retentionForm(el.dataset.id)),
    'erase-form': memberless((el) => eraseForm(el.dataset.id)),
    'subject-export': memberless(async (el) => {
      try { download(await store.subjectExport(view.state, el.dataset.id), `zol-inzage-ter-controle-${el.dataset.id}.json`); ctx.toast('Concept gedownload.', 'Controleer eerst informatie over andere personen.') } catch (error) { ctx.toast('Export mislukt', error.message, true) }
    }),
    'load-audit': memberless(async () => { try { view.audit = await store.audit(100); render() } catch (error) { ctx.toast('Logboek laden mislukt', error.message, true) } }),
  }
  const writeActions = new Set(['new', 'edit', 'new-related', 'toggle-task', 'upload'])

  // Eén gedelegeerde luisteraar voor het scherm en het gedeelde dialoogvenster.
  const onClick = async (event) => {
    const el = event.target.closest('[data-crm-action]')
    if (!el || view.busy) return
    const name = el.dataset.crmAction
    if (!view.state && name !== 'refresh') return
    if (view.state?.me?.role === 'viewer' && writeActions.has(name) && !(name === 'edit')) { ctx.toast('Alleen lezen', 'Dit account heeft alleen leesrechten.', true); return }
    await actions[name]?.(el)
  }
  content.addEventListener('click', onClick)
  ctx.dialog.addEventListener('click', onClick)
  content.addEventListener('input', (event) => { if (event.target.id === 'crm-search') { view.search = event.target.value; renderResults() } })
  content.addEventListener('change', (event) => {
    if (event.target.id === 'crm-segment') { view.segment = event.target.value; renderResults() }
    if (event.target.id === 'crm-status') { view.status = event.target.value; renderResults() }
  })

  return { show: () => { if (view.state) render(); else load() }, reload: () => load(false), view }
}
