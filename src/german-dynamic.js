// Text that JavaScript builds with changing values (stock, sizes, order numbers).
export const germanPatterns = [
  [/^(\d,\d)\/5 uit (\d+) Google-reviews ↗$/, '★ $1/5 von $2 Google-Bewertungen ↗'],
  [/^(\d,\d) op basis van (\d+) Google-reviews ↗$/, '$1 auf Basis von $2 Google-Bewertungen ↗'],
  [/^(\d,\d) · (\d+) Google-reviews ↗$/, '$1 · $2 Google-Bewertungen ↗'],
  [/^(\d,\d) op Google$/, '$1 bei Google'],
  [/^(\d+) Google-reviews ↗$/, '$1 Google-Bewertungen ↗'],
  [/^Bekijk (?:de|alle) (\d+) Google-reviews van ZOL Solutions$/, 'Alle $1 Google-Bewertungen von ZOL Solutions ansehen'],
  [/^Toon alle (\d+) reviews$/, 'Alle $1 Bewertungen anzeigen'],
  [/^\+ (\d+) reviews? op deze website$/, '+ $1 Bewertungen auf dieser Website'],
  [/^([\d,]+) van 5 sterren$/, '$1 von 5 Sternen'],
  [/^Niet genoeg voorraad voor (.+)\.$/, 'Nicht genug Bestand für $1.'],
  [/^Besteed minimaal €(.+) om deze kortingscode te gebruiken\.$/, 'Mindestbestellwert für diesen Rabattcode: €$1.'],
  [/^Op voorraad — maat (.+)$/, 'Verfügbar — Größe $1'],
  [/^Nog maar (\d+) op voorraad — maat (.+)$/, 'Nur noch $1 verfügbar — Größe $2'],
  [/^Bijna uitverkocht — maat (.+)$/, 'Fast ausverkauft — Größe $1'],
  [/^Maat (.+) is uitverkocht\.$/, 'Größe $1 ist ausverkauft.'],
  [/^Maat (.+) is uitverkocht — kies deze maat voor een voorraadmelding$/, 'Größe $1 ist ausverkauft — wähle sie für eine Benachrichtigung'],
  [/^Maat (.+), schoenmaat (.+?), uitverkocht$/, 'Größe $1, Schuhgröße $2, ausverkauft'],
  [/^Maat (.+), schoenmaat (.+)$/, 'Größe $1, Schuhgröße $2'],
  [/^Ontvang een seintje voor maat (.+)$/, 'Benachrichtigung für Größe $1'],
  [/^Aantal (\d+)$/, 'Anzahl $1'],
  [/^(.+) per paar$/, '$1 pro Paar'],
  [/^ZOL (.+) verwijderen$/, 'ZOL $1 entfernen'],
  [/^Korting\s*(\(.+\))$/, 'Rabatt $1'],
  [/^Bestelling #(.+) is ontvangen$/, 'Bestellung #$1 ist eingegangen'],
  [/^Bestelling #(.+)$/, 'Bestellung #$1'],
  [/^Bewaar bestelnummer #(.+) voor vragen over je bestelling\.$/, 'Bewahre die Bestellnummer #$1 für Fragen zu deiner Bestellung auf.'],
  [/^Automatische korting toegepast — (.+)\.$/, 'Automatischer Rabatt angewendet — $1.'],
  [/^Code (.+) toegepast — (.+)\.$/, 'Code $1 angewendet — $2.'],
]

export function createGermanTranslator(dictionary) {
  return value => {
    const key = value.replace(/\s+/g, ' ').trim()
    let translated = dictionary[key]
    if (translated === undefined) {
      const match = germanPatterns.find(([pattern]) => pattern.test(key))
      if (match) translated = key.replace(...match)
    }
    if (translated === undefined || translated === key) return value
    return value.replace(/\S(?:[\s\S]*\S)?/, () => translated)
  }
}
