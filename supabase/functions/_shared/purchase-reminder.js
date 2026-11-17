// Teksten voor de herinneringsreeks aan aanmelders die nog niets hebben gekocht.
// Stap 1 gaat na een half uur, stap 2 na een dag, stap 3 na drie dagen.
// Daarna (stap 4+) volgt een korte wekelijkse herinnering zolang de 10%-code ongebruikt is.
// Bewust kort, persoonlijk en zonder reclamewoorden: dat houdt de mail uit de spammap.

const weeklyVariants = [
  {
    subject: "Je code voor de ZOL'tjes staat nog klaar",
    intro: "Even een korte herinnering: je persoonlijke code voor 10% korting op de ZOL'tjes heb je nog niet gebruikt.",
  },
  {
    subject: "Nog vragen over de ZOL'tjes?",
    intro: "Je hebt je code voor 10% korting nog liggen. Twijfel je over de maat of over wat de ZOL'tjes voor je kind kunnen doen? Stuur gerust een berichtje terug, dan kijken we persoonlijk met je mee.",
  },
  {
    subject: "Je 10% op de ZOL'tjes is nog geldig",
    intro: "Je code voor 10% korting op de ZOL'tjes is nog steeds geldig. Je bestelt in een paar minuten via de website.",
  },
  {
    subject: "Een korte vraag over de ZOL'tjes",
    intro: "We zagen dat je je code nog niet hebt gebruikt. Is er iets waar we je mee kunnen helpen? Antwoord gewoon op deze mail.",
  },
]

export function purchaseReminderCopy({ step, firstName, code, validUntil, introduceCode = false }) {
  const number = Math.max(1, Number(step) || 1)
  const greeting = firstName ? `Hoi ${String(firstName).trim()},` : "Hoi,"
  const hasCode = Boolean(code)

  // Eerste wekelijkse mail voor wie de code net van ons kreeg (zonder 10%-actie aangemeld): code introduceren.
  if (number >= 4 && introduceCode && hasCode) {
    return {
      step: number, greeting, hasCode, weekly: true,
      subject: "Een persoonlijke code voor de ZOL'tjes",
      title: "Een persoonlijke code voor de ZOL'tjes",
      intro: "Je hebt je aangemeld voor mail van ZOL, maar de ZOL'tjes heb je nog niet besteld. Daarom hebben we een persoonlijke code voor je gemaakt: daarmee krijg je 10% korting op je bestelling.",
      closing: "Je vult de code in bij het afrekenen. Heb je een vraag? Antwoord gerust op deze mail.",
    }
  }

  if (number >= 4) {
    const variant = weeklyVariants[(number - 4) % weeklyVariants.length]
    return {
      step: number, greeting, hasCode, weekly: true,
      subject: variant.subject,
      title: variant.subject,
      intro: variant.intro,
      closing: hasCode
        ? "Je vult de code in bij het afrekenen. Heb je een vraag? Antwoord gerust op deze mail."
        : "Heb je een vraag? Antwoord gerust op deze mail.",
    }
  }

  const subject = number === 1
    ? "De ZOL'tjes voor je kind wachten nog op je"
    : number === 2
      ? "Twijfel je nog over de ZOL'tjes?"
      : (hasCode ? "Je code voor 10% korting op de ZOL'tjes" : "De ZOL'tjes voor je kind")

  const title = number === 1
    ? "De ZOL'tjes voor je kind wachten nog"
    : number === 2
      ? "Twijfel je nog? We denken graag mee"
      : "De ZOL'tjes wachten nog steeds"

  const intro = number === 1
    ? `De ZOL'tjes voor je kind liggen nog voor je klaar.${hasCode ? " Je persoonlijke code voor 10% korting staat er ook nog." : ""} Je bestelt ze in een paar minuten via de website.`
    : number === 2
      ? "De ZOL'tjes voor je kind wachten nog op je. Twijfel je over de maat, of weet je niet zeker of ze iets voor jouw kind zijn? Antwoord gerust op deze mail, dan denken we persoonlijk met je mee."
      : `De ZOL'tjes voor je kind wachten nog steeds op je.${hasCode ? ` Je code voor 10% korting is geldig tot ${validUntil}.` : ""}`

  const closing = hasCode
    ? "Je vult de code in bij het afrekenen. Heb je vragen over de maat of werking? Antwoord gerust op deze mail."
    : "Heb je vragen over de maat of werking? Antwoord gerust op deze mail."

  return { step: number, greeting, subject, title, intro, closing, hasCode, weekly: false }
}
