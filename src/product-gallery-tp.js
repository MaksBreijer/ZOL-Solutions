// Productgalerij: miniaturen links, grote foto met pijlen, swipen op telefoons.
const gallery = document.querySelector('[data-tp-gallery]')

if (gallery) {
  const track = gallery.querySelector('[data-tp-track]')
  const slides = [...track.children]
  const thumbs = [...gallery.querySelectorAll('[data-tp-thumb]')]
  const dots = [...gallery.querySelectorAll('.tp-dots span')]
  let current = 0

  const mark = (index) => {
    current = index
    thumbs.forEach((thumb, i) => {
      thumb.classList.toggle('is-active', i === index)
      thumb.setAttribute('aria-selected', String(i === index))
    })
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index))
  }

  const go = (index) => {
    const next = (index + slides.length) % slides.length
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' })
    mark(next)
  }

  thumbs.forEach((thumb) => thumb.addEventListener('click', () => go(Number(thumb.dataset.tpThumb))))
  gallery.querySelector('[data-tp-prev]')?.addEventListener('click', () => go(current - 1))
  gallery.querySelector('[data-tp-next]')?.addEventListener('click', () => go(current + 1))

  let frame = 0
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1))
      if (index !== current) mark(Math.min(index, slides.length - 1))
    })
  }, { passive: true })

  gallery.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') go(current - 1)
    if (event.key === 'ArrowRight') go(current + 1)
  })

  mark(0)
}
