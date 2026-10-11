// Eén bron voor navigatie en footer op alle pagina's.
// Vite vervangt <!-- zol:header --> en <!-- zol:footer --> in elke HTML-pagina door deze markup.

export const headerHtml = `<a class="skip-link" href="#main-content">Meteen naar de inhoud</a>
    <header class="zh" data-zol-header>
      <nav class="zh-bar" aria-label="Hoofdnavigatie">
        <div class="zh-links" id="zh-links">
          <a href="/product/">De ZOL'tjes</a>
          <a href="/#probleem">Voor wie</a>
          <a href="/#oplossing">Hoe ZOL werkt</a>
          <a href="/over-ons/">Ons verhaal</a>
          <a href="/kennisbank/">Kennisbank</a>
          <a href="/contact/">Contact</a>
        </div>
        <a class="zh-brand" href="/" aria-label="ZOL Solutions home"><img src="/media/zol-logo.png" alt="ZOL Solutions" width="180" height="49" /></a>
        <div class="zh-right" data-language-slot>
          <a class="zh-cart" href="/checkout/">Winkelwagen <span data-cart-count hidden>0</span></a>
          <a class="zh-cta" href="/product/">Bekijk de ZOL'tjes</a>
          <button class="zh-toggle" type="button" aria-expanded="false" aria-controls="zh-links" aria-label="Menu openen" data-menu-toggle><span></span><span></span></button>
        </div>
      </nav>
    </header>`

export const footerHtml = `<footer class="zf">
      <div class="zf-wrap">
        <div class="zf-top">
          <a href="/" aria-label="ZOL Solutions home"><img class="zf-logo" src="/media/zol-logo.png" alt="ZOL Solutions" width="180" height="49" /></a>
          <p class="zf-claim">Zachter landen. <em>Beter sporten.</em></p>
        </div>
        <div class="zf-cols">
          <div>
            <p class="zf-label">Ontdek</p>
            <a href="/product/">De ZOL'tjes</a>
            <a href="/over-ons/">Ons verhaal</a>
            <a href="/kennisbank/">Kennisbank</a>
            <a href="/contact/">Contact</a>
          </div>
          <div>
            <p class="zf-label">Contact</p>
            <a href="mailto:info@zolsolutions.nl">info@zolsolutions.nl</a>
            <a href="https://maps.google.com/?cid=654808623137506283" target="_blank" rel="noopener noreferrer">4,9/5 uit 12 Google-reviews</a>
          </div>
          <div>
            <p class="zf-label">Volg ons</p>
            <a href="https://www.instagram.com/zolsolutions/" target="_blank" rel="noopener noreferrer" aria-label="Volg ZOL Solutions op Instagram">Instagram</a>
            <a href="https://www.linkedin.com/company/zolsolutions/" target="_blank" rel="noopener noreferrer" aria-label="Volg ZOL Solutions op LinkedIn">LinkedIn</a>
          </div>
          <div class="zf-pay" aria-label="Betaalmethoden">
            <p class="zf-label">Veilig betalen via Mollie</p>
            <ul>
              <li><img src="/images/payment/ideal.svg" alt="iDEAL | Wero" width="48" height="36" loading="lazy" /></li>
              <li><img src="/images/payment/applepay.svg" alt="Apple Pay" width="48" height="36" loading="lazy" /></li>
              <li><img src="/images/payment/googlepay.svg" alt="Google Pay" width="48" height="36" loading="lazy" /></li>
              <li><img src="/images/payment/bancontact.svg" alt="Bancontact" width="48" height="36" loading="lazy" /></li>
              <li><img src="/images/payment/visa.svg" alt="Visa" width="48" height="36" loading="lazy" /></li>
              <li><img src="/images/payment/mastercard.svg" alt="Mastercard" width="48" height="36" loading="lazy" /></li>
              <li><img src="/images/payment/amex.svg" alt="American Express" width="48" height="36" loading="lazy" /></li>
            </ul>
          </div>
        </div>
        <div class="zf-legal">
          <span>© 2026 ZOL Solutions</span>
          <span><a href="/privacy/">Privacy</a><a href="/algemene-voorwaarden/">Voorwaarden</a></span>
        </div>
      </div>
    </footer>`

export function chromePlugin() {
  return {
    name: 'zol-chrome',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html
        .replace('<!-- zol:header over-hero -->', headerHtml.replace('class="zh"', 'class="zh zh--over-hero"'))
        .replace('<!-- zol:header -->', headerHtml)
        .replace('<!-- zol:footer -->', footerHtml),
    },
  }
}
