// Teksten voor de herinneringsreeks aan aanmelders die nog niets hebben gekocht.
// Stap 1 gaat na een half uur, stap 2 na een dag, stap 3 na drie dagen.
// Bewust tijdneutraal geschreven: bestaande aanmelders starten de reeks pas bij het live-zetten.

export function purchaseReminderCopy({ step, firstName, code, validUntil }) {
  const number = [1, 2, 3].includes(Number(step)) ? Number(step) : 1
  const greeting = firstName ? `Hoi ${firstName},` : "Hoi,"
  const hasCode = Boolean(code)

  const subject = number === 1
    ? (hasCode ? `Je ZOL-code ${code} staat nog voor je klaar` : "Je ZOL'tjes wachten nog op je")
    : number === 2
      ? "Twijfel je nog over de ZOL'tjes?"
      : (hasCode ? "Laatste herinnering: je 10% ZOL-korting" : "Laatste herinnering van ZOL")

  const title = number === 1
    ? "Je ZOL'tjes wachten nog op je"
    : number === 2
      ? "Twijfel je nog? We denken graag mee"
      : "Laatste herinnering"

  const intro = number === 1
    ? `Je hebt je bij ZOL aangemeld, maar je hebt nog geen ZOL'tjes besteld. Geen haast, we wilden je er alleen even aan herinneren.${hasCode ? " Je persoonlijke code voor 10% korting staat nog voor je klaar." : ""}`
    : number === 2
      ? "Je hebt nog geen ZOL'tjes besteld. Twijfel je over de maat, of weet je niet zeker of ze iets voor jouw kind zijn? Antwoord gerust op deze mail, dan denken we persoonlijk met je mee."
      : `Dit is de laatste keer dat we je hieraan herinneren. Wil je de ZOL'tjes toch proberen? Je bestelt ze in een paar minuten via de website.${hasCode ? ` Je code voor 10% korting is geldig tot ${validUntil}.` : ""}`

  const closing = number === 3
    ? "Heb je nog een vraag? Antwoord gerust op deze mail."
    : hasCode
      ? "Je vult de code in bij het afrekenen. Heb je vragen over de maat of werking? Antwoord gerust op deze mail."
      : "Heb je vragen over de maat of werking? Antwoord gerust op deze mail."

  return { step: number, greeting, subject, title, intro, closing, hasCode }
}
