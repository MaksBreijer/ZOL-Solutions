import './cursor.css'

// Wisselt naar de witte cursor zodra de muis boven een donker (blauw) vlak komt.
const DARK_CLASS = 'cursor-op-donker'
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
const cache = new WeakMap()

function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value)
  if (!match) return null
  const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  return { r, g, b, a }
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

// Geeft true/false voor het eerste element met een eigen achtergrondkleur, of null als het doorzichtig is.
function ownBackgroundIsDark(element) {
  const style = getComputedStyle(element)
  const color = parseColor(style.backgroundColor)
  if (color && color.a >= 0.5) return luminance(color) < 0.3
  if (style.backgroundImage.includes('gradient')) {
    const first = parseColor(style.backgroundImage)
    if (first && first.a >= 0.5) return luminance(first) < 0.3
  }
  return null
}

function isOnDark(element) {
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    if (cache.has(node)) return cache.get(node)
    const dark = ownBackgroundIsDark(node)
    if (dark !== null) {
      cache.set(element, dark)
      return dark
    }
  }
  return false
}

document.addEventListener('pointerover', (event) => {
  if (event.pointerType !== 'mouse' || !finePointer.matches) return
  document.documentElement.classList.toggle(DARK_CLASS, isOnDark(event.target))
}, { passive: true })
