// Dutch page -> German page. Only pages listed here exist under /de/.
export const germanRoutes = {
  '/': '/de/',
  '/product/': '/de/produkt/',
  '/over-ons/': '/de/ueber-uns/',
  '/contact/': '/de/kontakt/',
  '/checkout/': '/de/kasse/',
  '/algemene-voorwaarden/': '/de/agb/',
  '/privacy/': '/de/datenschutz/',
  '/kennisbank/': '/de/ratgeber/',
  '/kennisbank/ziekte-van-sever/': '/de/ratgeber/morbus-sever/',
  '/kennisbank/hielpijn-bij-kinderen/': '/de/ratgeber/fersenschmerzen-bei-kindern/',
  '/kennisbank/inlegzolen-bij-ziekte-van-sever/': '/de/ratgeber/einlagen-bei-morbus-sever/',
}
const dutchRoutes = Object.fromEntries(Object.entries(germanRoutes).map(([nl, de]) => [de, nl]))
const slash = path => (path.endsWith('/') ? path : `${path}/`)
export const isGermanPath = path => slash(path).startsWith('/de/')
export const germanPathFor = path => germanRoutes[slash(path)] || null
export const dutchPathFor = path => dutchRoutes[slash(path)] || '/'
