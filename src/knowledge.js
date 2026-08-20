import './styles.css'

document.documentElement.classList.add('js')
const main = document.querySelector('main')
if (main && !main.id) main.id = 'main-content'

if (!document.querySelector('.site-header')) {
  document.body.insertAdjacentHTML('afterbegin', `<a class="skip-link" href="#main-content">Meteen naar de inhoud</a><header class="site-header"><nav class="nav-shell" aria-label="Hoofdnavigatie"><a class="brand" href="/" aria-label="ZOL Solutions home"><img src="https://zolsolutions.nl/cdn/shop/files/zol_wit.png?v=1774353653&width=180" alt="ZOL Solutions"></a><div class="nav-links" id="nav-links"><a href="/">Home</a><a href="/product/">De ZOL'tjes</a><a href="/kennisbank/">Kennisbank</a><a href="/contact/">Contact</a></div><a class="nav-cta" href="/product/">Bekijk de zool</a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Menu openen"><span></span><span></span></button></nav></header>`)
}

if (!document.querySelector('.site-footer')) {
  document.body.insertAdjacentHTML('beforeend', `<footer class="site-footer"><a class="footer-brand" href="/" aria-label="ZOL Solutions home"><img src="https://zolsolutions.nl/cdn/shop/files/zol_wit.png?v=1774353653&width=180" alt="ZOL Solutions"></a><p>Zachter landen. Beter sporten.</p><div class="footer-contact"><a href="/product/">De ZOL'tjes</a><a href="/kennisbank/">Kennisbank</a><a href="/contact/">Contact</a></div><div class="footer-legal"><span>© 2026 ZOL Solutions</span><a href="https://zolsolutions.nl/policies/privacy-policy">Privacy</a><a href="https://zolsolutions.nl/policies/terms-of-service">Voorwaarden</a></div></footer>`)
}

const button = document.querySelector('.menu-toggle')
const navigation = document.querySelector('.nav-links')
button?.addEventListener('click', () => {
  const open = button.getAttribute('aria-expanded') === 'true'
  button.setAttribute('aria-expanded', String(!open))
  button.setAttribute('aria-label', open ? 'Menu openen' : 'Menu sluiten')
  navigation?.classList.toggle('is-open', !open)
})

document.querySelectorAll('.reveal').forEach((element) => element.classList.add('in-view'))
