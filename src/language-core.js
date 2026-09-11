import english from './english.json' with { type: 'json' }
import { englishDynamic, englishPatterns } from './english-dynamic.js'

const dictionary = { ...english, ...englishDynamic }
const attributes = ['alt', 'title', 'aria-label', 'placeholder']
const excluded = 'script, style, textarea, code, pre, [translate="no"], [data-language-switcher]'
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

export function installLanguageChoice(win) {
  const doc = win.document
  if (/^\/(?:admin|zolsolutions\/admin|meting)(?:\/|$)/.test(win.location.pathname)) return null
  const previous = doc.querySelector('[data-language-switcher]')
  if (previous) return null
  const texts = new WeakMap()
  const attrs = new WeakMap()
  let language = 'nl'
  const initialUrl = new URL(win.location.href)
  const requested = initialUrl.searchParams.get('lang')
  try { language = win.localStorage.getItem('zol_language') === 'en' ? 'en' : 'nl' } catch { /* URL still works without storage. */ }
  if (requested === 'en' || requested === 'nl') {
    language = requested
    try { win.localStorage.setItem('zol_language', language) } catch { /* Keep using the URL. */ }
  }

  const choice = doc.createElement('div')
  choice.className = 'language-switcher'
  choice.dataset.languageSwitcher = ''
  choice.setAttribute('role', 'group')
  choice.innerHTML = '<button type="button" lang="nl" data-language="nl" aria-label="Nederlands">NL</button><button type="button" lang="en" data-language="en" aria-label="English">EN</button>'
  const nav = doc.querySelector('.nav-shell')
  const header = doc.querySelector('.checkout-header')
  if (nav) {
    nav.classList.add('has-language-choice')
    nav.insertBefore(choice, nav.querySelector('.menu-toggle'))
  } else if (header) header.append(choice)
  else { choice.classList.add('language-switcher--standalone'); doc.body.prepend(choice) }

  function translatedValue(value, records, key) {
    const record = records.get(key)
    const source = record && record.output === value ? record.source : value
    const output = language === 'en' ? translateEnglish(source) : source
    records.set(key, { source, output })
    return output
  }

  function translateNode(node) {
    if (node.nodeType === 3) {
      if (!node.parentElement || node.parentElement.closest(excluded)) return
      // An option's default value is its text. Preserve it before changing the label.
      if (node.parentElement.tagName === 'OPTION' && !node.parentElement.hasAttribute('value')) node.parentElement.setAttribute('value', node.parentElement.value)
      const value = translatedValue(node.nodeValue, texts, node)
      if (value !== node.nodeValue) node.nodeValue = value
      return
    }
    if (node.nodeType !== 1 && node.nodeType !== 9) return
    if (node.nodeType === 1 && node.matches(excluded)) return
    if (node.nodeType === 1) {
      let records = attrs.get(node)
      if (!records) { records = new Map(); attrs.set(node, records) }
      for (const name of attributes) {
        if (!node.hasAttribute(name)) continue
        const value = translatedValue(node.getAttribute(name), records, name)
        if (value !== node.getAttribute(name)) node.setAttribute(name, value)
      }
      if (node.matches('meta[name="description"]')) {
        const value = translatedValue(node.content, records, 'content')
        if (value !== node.content) node.content = value
      }
    }
    for (const child of node.childNodes) translateNode(child)
  }

  const observer = new win.MutationObserver(records => {
    observer.disconnect()
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) translateNode(node)
      else translateNode(record.target)
    }
    observe()
  })
  function observe() {
    observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes })
  }
  function refresh() {
    observer.disconnect()
    doc.documentElement.lang = language
    choice.setAttribute('aria-label', language === 'en' ? 'Language' : 'Taal')
    choice.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === language)))
    translateNode(doc.documentElement)
    observe()
  }
  function setLanguage(next) {
    if (!['nl', 'en'].includes(next)) return
    language = next
    try { win.localStorage.setItem('zol_language', next) } catch { /* Preference remains in URL. */ }
    const url = new URL(win.location.href)
    url.searchParams.set('lang', next)
    win.history.replaceState(win.history.state, '', url)
    refresh()
  }
  choice.addEventListener('click', event => {
    const button = event.target.closest('[data-language]')
    if (button) setLanguage(button.dataset.language)
  })
  // Carry the choice through internal links, also when browser storage is blocked.
  doc.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]')
    if (!link || link.hasAttribute('download') || link.getAttribute('href').startsWith('#')) return
    const url = new URL(link.href, win.location.href)
    if (url.origin !== win.location.origin || !/^https?:$/.test(url.protocol) || /^\/(?:admin|zolsolutions\/admin|meting)(?:\/|$)/.test(url.pathname)) return
    url.searchParams.set('lang', language)
    link.href = url.href
  }, true)
  refresh()
  return { setLanguage, get language() { return language }, disconnect: () => observer.disconnect() }
}
