export const timepoints = [
  {
    key: 'baseline', label: '0-meting', delayDays: 0, templateKey: 'pilot_baseline', quickQuestion: 'pain_sport',
    questions: [
      { key: 'pain_duration', label: 'Hoe lang heeft je kind al last van hielpijn?', type: 'choice', required: true, options: [{ value: '0_10_weeks', label: '0 tot 10 weken' }, { value: '11_weeks_6_months', label: '11 weken tot 6 maanden' }, { value: '6_months_plus', label: '6 maanden en langer' }] },
      { key: 'sport_limit', label: 'Kan je kind meedoen met de sportactiviteiten?', type: 'choice', required: true, options: [{ value: 'full', label: 'Ja, volledig' }, { value: 'partial', label: 'Gedeeltelijk' }, { value: 'stopped', label: 'Nee, helemaal gestopt' }] },
      { key: 'physiotherapy', label: 'Gaat je kind naar de fysio voor behandelingen?', type: 'choice', required: true, options: [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nee' }] },
      { key: 'pain_sport', label: 'Welk cijfer geeft je kind de hielpijn voor het gebruik van de zolen?', help: '0 is geen pijn, 10 is veel pijn.', type: 'scale', min: 0, max: 10, minLabel: 'Geen pijn', maxLabel: 'Veel pijn', required: true },
    ],
  },
  {
    key: 'week1', label: 'Meting na 1 week', delayDays: 7, templateKey: 'pilot_week1', quickQuestion: 'comfort',
    questions: [
      { key: 'comfort', label: 'Hoe comfortabel zitten de ZOL’tjes?', help: '0 is niet comfortabel, 10 is zeer comfortabel.', type: 'scale', min: 0, max: 10, minLabel: 'Niet comfortabel', maxLabel: 'Zeer comfortabel', required: true },
      { key: 'usage_moments', label: 'Op welke momenten zijn de ZOL’tjes gedragen?', type: 'choice', required: true, options: [{ value: 'daily', label: 'Dagelijks leven' }, { value: 'sport', label: 'Tijdens sport' }, { value: 'daily_and_sport', label: 'Dagelijks leven en sport' }] },
      { key: 'fit_issue', label: 'Zijn er problemen met de pasvorm?', type: 'choice', required: true, options: [{ value: 'no', label: 'Nee, geen problemen' }, { value: 'a_little', label: 'Een beetje' }, { value: 'yes', label: 'Ja' }] },
      { key: 'pain_sport', label: 'Welk cijfer geeft je kind de hielpijn na week 1?', help: '0 is geen pijn, 10 is veel pijn.', type: 'scale', min: 0, max: 10, minLabel: 'Geen pijn', maxLabel: 'Veel pijn', required: true },
    ],
  },
  {
    key: 'week4', label: 'Meting na 4 weken', delayDays: 28, templateKey: 'pilot_week4', quickQuestion: 'change',
    questions: [
      { key: 'change', label: 'Hoe gaat het met de hielpijn vergeleken met de start?', type: 'choice', required: true, options: [{ value: 'much_better', label: 'Veel beter' }, { value: 'better', label: 'Beter' }, { value: 'same', label: 'Hetzelfde' }, { value: 'worse', label: 'Slechter' }, { value: 'much_worse', label: 'Veel slechter' }] },
      { key: 'sport_limit', label: 'Kan je kind meedoen met de sportactiviteiten?', type: 'choice', required: true, options: [{ value: 'full', label: 'Ja, volledig' }, { value: 'partial', label: 'Gedeeltelijk' }, { value: 'stopped', label: 'Nee, helemaal gestopt' }] },
      { key: 'pain_sport', label: 'Welk cijfer geeft je kind de hielpijn na week 4?', help: '0 is geen pijn, 10 is veel pijn.', type: 'scale', min: 0, max: 10, minLabel: 'Geen pijn', maxLabel: 'Veel pijn', required: true },
    ],
  },
  {
    key: 'week12', label: 'Meting na 12 weken', delayDays: 84, templateKey: 'pilot_week12', quickQuestion: 'continued_use',
    questions: [
      { key: 'continued_use', label: 'Worden de ZOL’tjes nog gebruikt?', type: 'choice', required: true, options: [{ value: 'yes', label: 'Ja tijdens sport en dagelijks leven' }, { value: 'sometimes', label: 'Alleen tijdens sport' }, { value: 'no', label: 'Nee, de ZOL’tjes worden niet meer gebruikt' }] },
      { key: 'pain_sport', label: 'Welk cijfer geeft je kind de hielpijn na week 12?', help: '0 is geen pijn, 10 is veel pijn.', type: 'scale', min: 0, max: 10, minLabel: 'Geen pijn', maxLabel: 'Veel pijn', required: true },
      { key: 'sport_limit', label: 'Kan je kind meedoen met de sportactiviteiten?', type: 'choice', required: true, options: [{ value: 'full', label: 'Ja, volledig' }, { value: 'partial', label: 'Gedeeltelijk' }, { value: 'stopped', label: 'Nee, helemaal gestopt' }] },
      { key: 'overall', label: 'Hoe gaat het vergeleken met de start?', type: 'choice', required: true, options: [{ value: 'much_better', label: 'Veel beter' }, { value: 'better', label: 'Beter' }, { value: 'same', label: 'Hetzelfde' }, { value: 'worse', label: 'Slechter' }, { value: 'much_worse', label: 'Veel slechter' }] },
      { key: 'comment', label: 'Heb je nog verdere opmerkingen?', help: 'Dit is niet verplicht.', type: 'text', required: false },
    ],
  },
]
