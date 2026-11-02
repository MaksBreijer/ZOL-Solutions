// 360° product viewer: drag (or swipe) to turn the product. Frames live in /media/360/ and are listed in frames.json.
// Zonder frames.json: 3D-model uit één foto (data-model-top/mask), en als WebGL niet kan kantelt de foto (data-still). Frames maken: npm run draai -- pad/naar/filmpje.mov
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

  // Zonder frames: één foto die meekantelt met vinger of muis.
  const tilt = () => {
    const still = viewer.dataset.still
    if (!still) return
    img.src = still
    img.classList.add('is-tilt')
    img.addEventListener('load', () => { viewer.hidden = false }, { once: true })
    let dragging = false
    let startX = 0
    let angle = 0
    let base = 0
    const set = (deg, animate) => {
      angle = Math.max(-70, Math.min(70, deg))
      img.style.transition = animate ? 'transform 0.7s cubic-bezier(.2,1.3,.3,1)' : 'none'
      img.style.transform = `perspective(900px) rotateY(${angle}deg) rotateX(${Math.abs(angle) / 10}deg)`
    }
    stage.addEventListener('pointerdown', (event) => {
      dragging = true
      startX = event.clientX
      base = angle
      stage.setPointerCapture(event.pointerId)
      stage.classList.add('is-dragging')
      hint?.classList.add('is-gone')
    })
    stage.addEventListener('pointermove', (event) => {
      if (dragging) set(base + ((event.clientX - startX) / stage.clientWidth) * 140, false)
    })
    const end = () => { dragging = false; stage.classList.remove('is-dragging'); set(0, true) }
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)
    stage.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      set(event.key === 'ArrowRight' ? 35 : -35, true)
      setTimeout(() => set(0, true), 500)
    })
  }

  load().then((meta) => {
    if (!meta) {
      const top = viewer.dataset.modelTop
      const mask = viewer.dataset.modelMask
      if (!top || !mask) return tilt()
      img.hidden = true
      hint?.remove()
      return import('./zol-3d.js')
        .then(({ mountZol3d }) => mountZol3d(stage, { top, mask }))
        .then(() => { viewer.hidden = false })
        .catch(() => { img.hidden = false; tilt() })
    }
    const { count } = meta
    const ext = meta.ext || 'jpg'
    const frames = Array.from({ length: count }, (_, i) => Object.assign(new Image(), { src: `${base}${String(i + 1).padStart(3, '0')}.${ext}` }))
    if (meta.alt) stage.setAttribute('aria-label', meta.alt)
    stage.setAttribute('aria-valuemin', '1')
    stage.setAttribute('aria-valuemax', String(count))

    // Vrijstaande frames op een canvas; 180 frames op gelijke hoekstappen, dus geen overvloeien nodig.
    img.hidden = true
    const canvas = document.createElement('canvas')
    canvas.className = 'spin-canvas spin-float'
    stage.prepend(canvas)
    stage.classList.add('has-frames')
    const ctx = canvas.getContext('2d')
    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * ratio)
      canvas.height = Math.round(canvas.clientHeight * ratio)
      shownAt = NaN; shownFrame = -1
    }

    let position = 0
    let target = 0
    let velocity = 0
    let shownAt = NaN
    let shownFrame = -1
    // Elk frame wordt vooraf uitgepakt tot een ImageBitmap. Anders pakt de browser het pas uit bij de eerste keer tekenen
    // (gemeten tot 30 ms per frame) en hapert het draaien juist in het eerste rondje.
    const bitmaps = new Array(count)
    const ready = (i) => Boolean(bitmaps[i])
    // Nog niet klaar? Dan het dichtstbijzijnde frame dat er wel is, zodat het beeld nooit leeg is.
    const nearest = (i) => {
      for (let d = 0; d < count / 2; d++) {
        if (ready((i + d) % count)) return bitmaps[(i + d) % count]
        if (ready((i - d + count) % count)) return bitmaps[(i - d + count) % count]
      }
      return null
    }
    const draw = (index) => {
      const image = nearest(index)
      if (!image) return
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height) * 0.86
      const w = image.width * scale
      const h = image.height * scale
      ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
    }
    const render = () => {
      if (position === shownAt) return
      shownAt = position
      const i = ((Math.round(position) % count) + count) % count
      if (i === shownFrame) return
      shownFrame = i
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      draw(i)
      stage.setAttribute('aria-valuenow', String(i + 1))
    }

    // Eén lus, tijdgebaseerd zodat 60 Hz en 120 Hz schermen hetzelfde aanvoelen:
    // de getoonde stand volgt het doel zacht, en na loslaten loopt hij uit met traagheid (velocity in frames per ms).
    let dragging = false
    let loop = 0
    let previous = 0
    const step = (now) => {
      const dt = Math.min(now - (previous || now), 50)
      previous = now
      if (!dragging && Math.abs(velocity) > 0.0004) {
        target += velocity * dt
        velocity *= Math.exp(-dt / 420)
      }
      // Tijdens slepen volgt hij de vinger vrijwel direct; daarna landt hij zacht.
      position += (target - position) * (1 - Math.exp(-dt / (dragging ? 16 : 60)))
      if (Math.abs(target - position) < 0.002) position = target
      render()
      if (dragging || position !== target || Math.abs(velocity) > 0.0004) loop = requestAnimationFrame(step)
      else { loop = 0; previous = 0 }
    }
    const wake = () => { if (!loop) loop = requestAnimationFrame(step) }

    let shown = false
    const show = () => { if (shown) return; shown = true; viewer.hidden = false; fit(); render() }
    const prepare = (frame, i) => {
      const done = (bitmap) => {
        bitmaps[i] = bitmap
        if (i === 0) show()
        shownAt = NaN; shownFrame = -1; wake()
      }
      const decoded = 'createImageBitmap' in window ? createImageBitmap(frame) : frame.decode().then(() => frame)
      decoded.then(done, () => { if (frame.naturalWidth) done(frame) })
    }
    frames.forEach((frame, i) => {
      if (frame.complete && frame.naturalWidth) prepare(frame, i)
      else frame.addEventListener('load', () => prepare(frame, i), { once: true })
    })
    new ResizeObserver(() => { fit(); render() }).observe(canvas)

    // Slepen: één volle breedte van het vlak = één hele rondje. De snelheid komt uit de laatste 100 ms beweging.
    let lastX = 0
    let samples = []
    stage.addEventListener('pointerdown', (event) => {
      dragging = true
      lastX = event.clientX
      samples = [{ t: event.timeStamp, p: target }]
      velocity = 0
      intro = false
      stage.setPointerCapture(event.pointerId)
      stage.classList.add('is-dragging')
      hint?.classList.add('is-gone')
      wake()
    })
    stage.addEventListener('pointermove', (event) => {
      if (!dragging) return
      target -= ((event.clientX - lastX) / stage.clientWidth) * count
      lastX = event.clientX
      samples.push({ t: event.timeStamp, p: target })
      while (samples.length > 2 && event.timeStamp - samples[0].t > 100) samples.shift()
    })
    const end = (event) => {
      if (!dragging) return
      dragging = false
      const first = samples[0]
      const span = event.timeStamp - first.t
      velocity = span > 0 && event.timeStamp - samples[samples.length - 1].t < 60 ? (target - first.p) / span : 0
      velocity = Math.max(-0.12, Math.min(0.12, velocity))
      stage.classList.remove('is-dragging')
      wake()
    }
    stage.addEventListener('pointerup', end)
    stage.addEventListener('pointercancel', end)

    stage.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      intro = false
      target += (event.key === 'ArrowRight' ? 1 : -1) * count / 12
      wake()
    })

    // Draait één keer rustig rond zodra hij in beeld komt, zodat meteen duidelijk is dat het kan.
    let intro = true
    if (!reduceMotion && 'IntersectionObserver' in window) {
      const seen = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return
        seen.disconnect()
        const duration = 3200
        const t0 = performance.now()
        const tick = (now) => {
          if (!intro) return
          const t = Math.min((now - t0) / duration, 1)
          target = count * (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
          wake()
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }, { threshold: 0.6 })
      seen.observe(stage)
    }
  }).catch(() => {})
}
