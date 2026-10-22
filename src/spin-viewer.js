// 360° product viewer: drag (or swipe) to turn the product. Frames live in /media/360/ and are listed in frames.json.
// Zonder frames.json blijft de sectie verborgen. Frames maken: npm run draai -- pad/naar/filmpje.mov
const viewer = document.querySelector('[data-spin]')

if (viewer) {
  const base = viewer.dataset.spin || '/media/360/'
  const stage = viewer.querySelector('.spin-stage')
  const img = viewer.querySelector('.spin-frame')
  const hint = viewer.querySelector('.spin-hint')
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const load = async () => {
    const response = await fetch(`${base}frames.json`, { cache: 'no-cache' })
    if (!response.ok) return null
    const meta = await response.json().catch(() => null)
    return meta && Number.isInteger(meta.count) && meta.count > 1 ? meta : null
  }

  load().then((meta) => {
    if (!meta) return
    const { count } = meta
    const ext = meta.ext || 'jpg'
    const urls = Array.from({ length: count }, (_, i) => `${base}${String(i + 1).padStart(3, '0')}.${ext}`)
    const frames = urls.map((src) => Object.assign(new Image(), { src }))
    if (meta.alt) stage.setAttribute('aria-label', meta.alt)
    if (meta.width && meta.height) stage.style.aspectRatio = `${meta.width} / ${meta.height}`

    let position = 0
    let shown = -1
    const render = () => {
      const index = ((Math.round(position) % count) + count) % count
      if (index === shown) return
      shown = index
      img.src = urls[index]
      stage.setAttribute('aria-valuenow', String(index + 1))
    }

    img.addEventListener('load', () => { viewer.hidden = false }, { once: true })
    render()
    stage.setAttribute('aria-valuemin', '1')
    stage.setAttribute('aria-valuemax', String(count))

    // Slepen: één volle breedte van het vlak = één hele rondje.
    let dragging = false
    let startX = 0
    let startPosition = 0
    let idle
    const stopAuto = () => { cancelAnimationFrame(idle); idle = 0 }

    stage.addEventListener('pointerdown', (event) => {
      dragging = true
      startX = event.clientX
      startPosition = position
      stopAuto()
      stage.setPointerCapture(event.pointerId)
      stage.classList.add('is-dragging')
      hint?.classList.add('is-gone')
    })
    stage.addEventListener('pointermove', (event) => {
      if (!dragging) return
      position = startPosition - ((event.clientX - startX) / stage.clientWidth) * count
      render()
    })
    const end = () => { dragging = false; stage.classList.remove('is-dragging') }
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)

    stage.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      stopAuto()
      position += event.key === 'ArrowRight' ? 1 : -1
      render()
    })

    // Draait één keer rustig rond zodra hij in beeld komt, zodat meteen duidelijk is dat het kan.
    if (!reduceMotion && 'IntersectionObserver' in window) {
      const seen = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return
        seen.disconnect()
        const total = count
        const duration = 2600
        const t0 = performance.now()
        const tick = (now) => {
          if (dragging) return
          const t = Math.min((now - t0) / duration, 1)
          position = total * (1 - Math.pow(1 - t, 3))
          render()
          if (t < 1) idle = requestAnimationFrame(tick)
        }
        idle = requestAnimationFrame(tick)
      }, { threshold: 0.6 })
      seen.observe(stage)
    }
  }).catch(() => {})
}
