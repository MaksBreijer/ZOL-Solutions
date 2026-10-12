// Gedeelde navigatie en footer in het homepage-ontwerp. Wordt bij de build in elke pagina gezet.
const payments = [
  ['amex', 'American Express'], ['applepay', 'Apple Pay'], ['bancontact', 'Bancontact'], ['googlepay', 'Google Pay'],
  ['ideal', 'iDEAL | Wero'], ['mastercard', 'Mastercard'], ['visa', 'Visa'],
].map(([file, name]) => `<li><img src="/images/payment/${file}.svg" alt="${name}" width="48" height="36" loading="lazy" /></li>`).join('')

export function navMarkup({ overHero = false } = {}) {
  return `<a class="zn-skip" href="#main-content">Meteen naar de inhoud</a>
    <nav class="zn${overHero ? ' zn--hero' : ' is-solid'}" aria-label="Hoofdnavigatie">
      <a class="zn-logo" href="/" aria-label="ZOL Solutions home"><img src="/media/zol-logo.png" alt="ZOL Solutions" /></a>
      <div class="zn-links" id="zn-links">
        <a href="/#werking">Hoe het werkt</a>
        <a href="/product/">De ZOL'tjes</a>
        <a href="/over-ons/">Ons verhaal</a>
        <a href="/kennisbank/">Kennisbank</a>
        <a class="zn-mobile-only" href="/contact/">Contact</a>
      </div>
      <a class="zn-btn zn-btn--line" href="/contact/">Contact</a>
      <a class="zn-btn zn-btn--brand" href="/product/">Bekijk de ZOL'tjes ↗</a>
      <button class="zn-toggle" type="button" aria-expanded="false" aria-controls="zn-links" aria-label="Menu openen"><span></span><span></span></button>
    </nav>`
}

export function footerMarkup() {
  return `<footer class="zf">
      <div class="zf-wrap">
        <div class="zf-cta">
          <span class="zf-badge"><i></i>Van de zijlijn terug het veld op</span>
          <p class="zf-title">Zachter landen. <b>Beter sporten.</b></p>
          <a class="zn-btn zf-btn" href="/product/">Bekijk de ZOL'tjes →</a>
        </div>
        <div class="zf-grid">
          <div><img src="/media/zol-logo.png" alt="ZOL Solutions" /><p>Dempende 3/4 inlegzolen voor kinderen met hielpijn. Extra comfort, demping en stabiliteit voor jonge sporters in de groei.</p>
            <a class="zf-rating" href="https://maps.google.com/?cid=654808623137506283" target="_blank" rel="noopener noreferrer">★ 4,9/5 uit 12 Google-reviews ↗</a></div>
          <div><p class="zf-h">Snelle links</p><a href="/#werking">Hoe het werkt</a><a href="/product/">De ZOL'tjes</a><a href="/#prijs">Prijs</a><a href="/checkout/">Winkelwagen</a></div>
          <div><p class="zf-h">Info</p><a href="/kennisbank/">Kennisbank</a><a href="/#faq">Veelgestelde vragen</a><a href="/over-ons/">Ons verhaal</a></div>
          <div><p class="zf-h">Contact</p><a href="mailto:info@zolsolutions.nl">info@zolsolutions.nl</a><a href="/contact/">Contactformulier</a><a href="https://www.instagram.com/zolsolutions/" target="_blank" rel="noopener noreferrer">Instagram ↗</a><a href="https://www.linkedin.com/company/zolsolutions/" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></div>
        </div>
        <div class="zf-pay" aria-label="Betaalmethoden"><span>Veilig betalen via Mollie</span><ul>${payments}</ul></div>
        <div class="zf-legal"><span>© 2026 ZOL Solutions. Alle rechten voorbehouden.</span><span><a href="/privacy/">Privacy</a> · <a href="/algemene-voorwaarden/">Algemene voorwaarden</a></span></div>
      </div>
    </footer>`
}
