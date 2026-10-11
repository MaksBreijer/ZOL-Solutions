// Product photos: swipe between them on phones, tap or click to open a full-screen viewer.
const gallery = document.querySelector('.product-gallery')

if (gallery) {
  const images = [...gallery.querySelectorAll('img')]
  const sources = images.map((img) => ({ src: img.currentSrc || img.src, alt: img.alt }))

  // Dots under the swipeable strip on phones.
  const dots = document.createElement('div')
  dots.className = 'product-gallery-dots'
  dots.setAttribute('aria-hidden', 'true')
  dots.innerHTML = images.map(() => '<span></span>').join('')
  gallery.after(dots)
  const setActiveDot = (index) => [...dots.children].forEach((dot, i) => dot.classList.toggle('is-active', i === index))
  setActiveDot(0)
  gallery.addEventListener('scroll', () => {
    const index = Math.round(gallery.scrollLeft / Math.max(gallery.clientWidth, 1))
    setActiveDot(Math.min(index, images.length - 1))
  }, { passive: true })

  // Full-screen viewer.
  const viewer = document.createElement('div')
  viewer.className = 'gallery-viewer'
  viewer.setAttribute('role', 'dialog')
  viewer.setAttribute('aria-modal', 'true')
  viewer.setAttribute('aria-label', 'Productfoto’s')
  viewer.hidden = true
  viewer.innerHTML = `
    <button class="gallery-viewer-close" type="button" aria-label="Sluiten">×</button>
    <button class="gallery-viewer-nav gallery-viewer-prev" type="button" aria-label="Vorige foto">‹</button>
    <div class="gallery-viewer-track">${sources.map(({ alt }) => `<figure><img alt="${alt.replaceAll('"', '&quot;')}" /></figure>`).join('')}</div>
    <button class="gallery-viewer-nav gallery-viewer-next" type="button" aria-label="Volgende foto">›</button>
    <p class="gallery-viewer-count" aria-live="polite"></p>`
  document.body.append(viewer)
  const track = viewer.querySelector('.gallery-viewer-track')
  const count = viewer.querySelector('.gallery-viewer-count')
  const viewerImages = [...track.querySelectorAll('img')]
  let current = 0
  let opener = null

  const show = (index, smooth = true) => {
    current = (index + sources.length) % sources.length
    track.scrollTo({ left: current * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
    count.textContent = `${current + 1} / ${sources.length}`
  }

  const open = (index) => {
    opener = document.activeElement
    viewerImages.forEach((img, i) => { if (!img.src) img.src = images[i].currentSrc || images[i].src })
    viewer.hidden = false
    document.documentElement.classList.add('gallery-viewer-open')
    show(index, false)
    viewer.querySelector('.gallery-viewer-close').focus()
  }

  const close = () => {
    viewer.hidden = true
    document.documentElement.classList.remove('gallery-viewer-open')
    opener?.focus?.()
  }

  images.forEach((img, index) => {
    img.tabIndex = 0
    img.setAttribute('role', 'button')
    img.setAttribute('aria-label', `${img.alt} vergroten`)
    img.addEventListener('click', () => open(index))
    img.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open(index)
      }
    })
  })

  track.addEventListener('scroll', () => {
    const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1))
    if (index !== current && index >= 0 && index < sources.length) {
      current = index
      count.textContent = `${current + 1} / ${sources.length}`
    }
  }, { passive: true })
  viewer.querySelector('.gallery-viewer-close').addEventListener('click', close)
  viewer.querySelector('.gallery-viewer-prev').addEventListener('click', () => show(current - 1))
  viewer.querySelector('.gallery-viewer-next').addEventListener('click', () => show(current + 1))
  viewer.addEventListener('click', (event) => { if (event.target === viewer || event.target.tagName === 'FIGURE') close() })
  document.addEventListener('keydown', (event) => {
    if (viewer.hidden) return
    if (event.key === 'Escape') close()
    else if (event.key === 'ArrowLeft') show(current - 1)
    else if (event.key === 'ArrowRight') show(current + 1)
    else if (event.key === 'Tab') {
      const focusable = [...viewer.querySelectorAll('button')]
      const index = focusable.indexOf(document.activeElement)
      event.preventDefault()
      focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus()
    }
  })
}
