// German versions of the customer order emails, used for deliveries to Germany.
const template = (subject_template, eyebrow_template, title_template, intro_template, body_template, button_label_template, button_url_template) => ({ subject_template, eyebrow_template, title_template, intro_template, body_template, button_label_template, button_url_template })
const home = '{{website_url}}/de/'
const contact = '{{website_url}}/de/kontakt/'

const templates = {
  order_received: template('Wir haben deine Bestellung #{{order_number}} erhalten', 'Bestellung #{{order_number}}', 'Danke, {{customer_first_name}}.', 'Deine Bestellung ist bei uns eingegangen.', 'Wir halten dich per E-Mail über Zahlung und Versand auf dem Laufenden. Unten findest du noch einmal alle Bestelldaten.', 'Zu ZOL Solutions', home),
  payment_confirmed: template('Zahlung für Bestellung #{{order_number}} erhalten', 'Zahlung erhalten', 'Deine Zahlung war erfolgreich.', 'Wir machen deine ZOL-Einlagen versandfertig.', 'Danke für deine Bestellung. Sobald das Paket beim Versanddienstleister ist, erhältst du automatisch die Sendungsdaten.', 'Zu ZOL Solutions', home),
  order_delayed: template('Deine Bestellung #{{order_number}} dauert etwas länger', 'Bestellung #{{order_number}}', 'Es dauert leider etwas länger.', 'Deine Bestellung ist noch nicht unterwegs.', 'Das tut uns leid. Wir arbeiten daran und melden uns, sobald das Paket verschickt ist. Hast du eine Frage? Antworte einfach auf diese E-Mail.', 'Kontakt aufnehmen', contact),
  order_shipped: template('Deine ZOL-Bestellung #{{order_number}} ist unterwegs', 'Unterwegs mit {{carrier}}', 'Deine ZOL-Einlagen sind unterwegs.', 'Dein Paket wurde an {{carrier}} übergeben.', 'Mit der Sendungsnummer unten kannst du die Lieferung verfolgen. Es kann etwas dauern, bis der erste Scan angezeigt wird.', 'Sendung verfolgen', '{{tracking_url}}'),
  order_delivered: template('Viel Freude mit deinen ZOL-Einlagen, {{customer_first_name}}', 'Bestellung #{{order_number}} geliefert', 'Weicher landen beginnt jetzt.', 'Laut Lieferstatus wurde deine Bestellung zugestellt.', 'Danke, dass du dich für ZOL entschieden hast. Steigere die Nutzung langsam und prüfe, ob die Fersenschale fest und bequem sitzt. Hast du eine Frage? Antworte einfach auf diese E-Mail.', 'Zu Größe & Passform', '{{website_url}}/de/produkt/'),
  order_returned: template('Rücksendung für Bestellung #{{order_number}} erfasst', 'Rücksendung erfasst', 'Wir haben deine Rücksendung bearbeitet.', 'Bestellung #{{order_number}} ist nun als Rücksendung erfasst.', 'Eine etwaige Erstattung bestätigen wir gesondert, sobald sie ausgeführt ist. Hast du noch Fragen? Antworte einfach auf diese E-Mail.', 'Kontakt aufnehmen', contact),
  order_cancelled: template('Bestellung #{{order_number}} wurde storniert', 'Bestellung storniert', 'Deine Bestellung wurde storniert.', 'Bestellung #{{order_number}} wird nicht weiter bearbeitet.', 'Hattest du schon bezahlt? Dann erhältst du eine gesonderte Bestätigung, sobald die Erstattung ausgeführt ist. Melde dich gerne, wenn du unsicher bist.', 'Kontakt aufnehmen', contact),
  refund_confirmed: template('Erstattung für Bestellung #{{order_number}}', 'Erstattung bearbeitet', '{{refund_amount}} wurden erstattet.', 'Die Erstattung für Bestellung #{{order_number}} ist bearbeitet.', 'Der Betrag wird über die ursprüngliche Zahlungsart zurückgezahlt. Je nach Bank kann es einige Werktage dauern, bis er sichtbar ist.', 'Kontakt aufnehmen', contact),
}

const german = { subtotal: 'Zwischensumme', discount: 'Rabatt', shipping: 'Versand', free: 'Kostenlos', total: 'Gesamt', address: 'Lieferadresse', tracking: 'Sendungsnummer', refunded: 'Erstatteter Betrag', tagline: 'Weicher landen. Besser Sport treiben.' }
const dutch = { subtotal: 'Subtotaal', discount: 'Korting', shipping: 'Verzending', free: 'Gratis', total: 'Totaal', address: 'Bezorgadres', tracking: 'Trackingcode', refunded: 'Terugbetaald bedrag', tagline: 'Zachter landen. Beter sporten.' }

export const isGermanOrder = order => order?.shipping_address?.country === 'DE'
export const orderEmailLabels = order => (isGermanOrder(order) ? german : dutch)
export const localizeOrderTemplate = (base, key, order) => (isGermanOrder(order) && base.audience !== 'admin' && templates[key] ? { ...base, ...templates[key] } : base)
export const localizeProductName = (name, order) => (isGermanOrder(order) ? String(name ?? '').replace('inlegzolen', 'Einlagen') : name)
