// Teksten voor de herinneringsreeks aan aanmelders die nog niets hebben gekocht.
// Stap 1 gaat na een half uur, stap 2 na een dag, stap 3 na drie dagen.
// Bewust tijdneutraal geschreven: bestaande aanmelders starten de reeks pas bij het live-zetten.

export function purchaseReminderCopy({ step, firstName, code, validUntil }) {
  const number = [1, 2, 3].includes(Number(step)) ? Number(step) : 1
  const greeting = firstName ? `Hoi ${firstName},` : "Hoi,"
  const hasCode = Boolean(code)

  const subject = number === 1
    ? "De ZOL'tjes voor je kind wachten nog op je"
    : number === 2
      ? "Twijfel je nog over de ZOL'tjes?"
      : (hasCode ? "Laatste herinnering: 10% korting op de ZOL'tjes" : "Laatste herinnering: de ZOL'tjes voor je kind")

  const title = number === 1
    ? "De ZOL'tjes voor je kind wachten nog"
    : number === 2
      ? "Twijfel je nog? We denken graag mee"
      : "De ZOL'tjes wachten nog steeds"

  const intro = number === 1
    ? `De ZOL'tjes voor je kind liggen nog voor je klaar.${hasCode ? " Je persoonlijke code voor 10% korting staat er ook nog." : ""} Je bestelt ze in een paar minuten via de website.`
    : number === 2
      ? "De ZOL'tjes voor je kind wachten nog op je. Twijfel je over de maat, of weet je niet zeker of ze iets voor jouw kind zijn? Antwoord gerust op deze mail, dan denken we persoonlijk met je mee."
      : `De ZOL'tjes voor je kind wachten nog steeds op je. Dit is de laatste keer dat we je eraan herinneren.${hasCode ? ` Je code voor 10% korting is geldig tot ${validUntil}.` : ""}`

  const closing = number === 3
    ? "Heb je nog een vraag? Antwoord gerust op deze mail."
    : hasCode
      ? "Je vult de code in bij het afrekenen. Heb je vragen over de maat of werking? Antwoord gerust op deze mail."
      : "Heb je vragen over de maat of werking? Antwoord gerust op deze mail."

  return { step: number, greeting, subject, title, intro, closing, hasCode }
}
