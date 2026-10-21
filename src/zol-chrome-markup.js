// Gedeelde navigatie en footer in het homepage-ontwerp. Wordt bij de build in elke pagina gezet.
const payments = [
  ['amex', 'American Express'], ['applepay', 'Apple Pay'], ['bancontact', 'Bancontact'], ['googlepay', 'Google Pay'],
  ['ideal', 'iDEAL | Wero'], ['mastercard', 'Mastercard'], ['visa', 'Visa'],
].map(([file, name]) => `<li><img src="/images/payment/${file}.svg" alt="${name}" width="48" height="36" loading="lazy" /></li>`).join('')

export function navMarkup({ overHero = false } = {}) {
  return `<a class="zn-skip" href="#main-content">Meteen naar de inhoud</a>
    <nav class="zn${overHero ? ' zn--hero' : ' is-solid'}" aria-label="Hoofdnavigatie">
      <a class="zn-logo" href="/" aria-label="ZOL Solutions home"><img src="/media/zol-logo-v2.png" alt="ZOL Solutions" /></a>
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
          <div><img src="/media/zol-logo-v2.png" alt="ZOL Solutions" /><p>Dempende 3/4 inlegzolen voor kinderen met hielpijn. Extra comfort, demping en stabiliteit voor jonge sporters in de groei.</p>
            <a class="zf-rating" href="https://maps.google.com/?cid=654808623137506283" target="_blank" rel="noopener noreferrer">★ 4,9/5 uit 12 Google-reviews ↗</a></div>
          <div><p class="zf-h">Snelle links</p><a href="/#werking">Hoe het werkt</a><a href="/product/">De ZOL'tjes</a><a href="/#prijs">Prijs</a><a href="/checkout/">Winkelwagen</a></div>
          <div><p class="zf-h">Info</p><a href="/kennisbank/">Kennisbank</a><a href="/#faq">Veelgestelde vragen</a><a href="/over-ons/">Ons verhaal</a></div>
          <div><p class="zf-h">Contact</p><a href="mailto:info@zolsolutions.nl">info@zolsolutions.nl</a><a href="/contact/">Contactformulier</a><a class="zf-social" href="https://www.instagram.com/zolsolutions/" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>Instagram ↗</a><a class="zf-social" href="https://www.linkedin.com/company/zolsolutions/" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>LinkedIn ↗</a></div>
        </div>
        <div class="zf-pay" aria-label="Betaalmethoden"><span>Veilig betalen via Mollie</span><ul>${payments}</ul><a class="zf-review" href="https://g.page/r/CetD-TH5WBYJEBM/review" target="_blank" rel="noopener noreferrer"><img src="/media/google-review-qr.svg" alt="QR-code om een Google-review achter te laten" width="72" height="72" loading="lazy"></a></div>
        <div class="zf-legal"><span>© 2026 ZOL Solutions. Alle rechten voorbehouden.</span><span><a href="/privacy/">Privacy</a> · <a href="/algemene-voorwaarden/">Algemene voorwaarden</a> · <button class="zf-cookie" data-cookie-preferences type="button">Cookievoorkeuren</button></span></div>
      </div>
    </footer>`
}
