import './font-faces.css'
import './home-page.css'
import './site-runtime.js'
import './language.js'

const v = document.getElementById('storyVideo')
const b = document.getElementById('storyPlay')
// Speelt zonder geluid af zodra de video in beeld komt; de knop zet het geluid aan of pauzeert.
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) v.play().catch(() => {})
  else v.pause()
}, { threshold: 0.25 }).observe(v)
b.textContent = '🔊 Geluid aan'
b.onclick = () => {
  if (v.muted) { v.muted = false; v.play(); b.textContent = '❚❚ Pauze' }
  else if (v.paused) { v.play(); b.textContent = '❚❚ Pauze' }
  else { v.pause(); b.textContent = '▶ Afspelen' }
}


const socialPhones = document.querySelector('.social-phones')
if (socialPhones && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  socialPhones.addEventListener('pointermove', (event) => {
    const box = socialPhones.getBoundingClientRect()
    socialPhones.style.setProperty('--mx', (((event.clientX - box.left) / box.width) * 2 - 1).toFixed(3))
    socialPhones.style.setProperty('--my', (((event.clientY - box.top) / box.height) * 2 - 1).toFixed(3))
  })
  socialPhones.addEventListener('pointerleave', () => {
    socialPhones.style.setProperty('--mx', '0')
    socialPhones.style.setProperty('--my', '0')
  })
}

const zolHang = document.querySelector('#zolHang')
if (zolHang && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const setHang = (event) => {
    const box = zolHang.getBoundingClientRect()
    const x = ((event.clientX - box.left) / box.width) * 2 - 1
    zolHang.style.setProperty('--rot', (x * 16).toFixed(2))
    zolHang.style.setProperty('--ry', (x * 18).toFixed(2))
    zolHang.style.setProperty('--tx', (x * 14).toFixed(2))
    zolHang.style.setProperty('--bgx', (-x * 10).toFixed(2))
  }
  const resetHang = () => ['--rot', '--ry', '--tx', '--bgx'].forEach((name) => zolHang.style.setProperty(name, '0'))
  zolHang.addEventListener('pointermove', (event) => { if (event.pointerType === 'mouse') setHang(event) })
  zolHang.addEventListener('pointerleave', resetHang)
  zolHang.addEventListener('pointerdown', (event) => { if (event.pointerType !== 'mouse') setHang(event) })
  zolHang.addEventListener('pointerup', resetHang)
  zolHang.addEventListener('pointercancel', resetHang)
}
