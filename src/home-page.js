import './font-faces.css'
import './home-page.css'
import './site-runtime.js'

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
