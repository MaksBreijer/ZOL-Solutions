const TIMEPOINT_ORDER = ['baseline', 'week1', 'week4', 'week12']

const asParticipants = (report) => Array.isArray(report?.participants) ? report.participants : []

export function pilotMeasurements(report) {
  return asParticipants(report).flatMap((participant) =>
    (participant.measurements || []).map((measurement) => ({ participant, measurement })),
  )
}

export function pilotSummary(report) {
  const participants = asParticipants(report)
  const measurements = pilotMeasurements(report).map((item) => item.measurement)
  const sent = measurements.filter((item) => item.sent_at || ['sent', 'started', 'completed'].includes(item.status)).length
  const completed = measurements.filter((item) => item.status === 'completed').length
  const answered = measurements.reduce((sum, item) => sum + Number(item.answer_count || 0), 0)

  return {
    participants: participants.length,
    sent,
    completed,
    answered,
    responseRate: sent ? Math.round((completed / sent) * 100) : 0,
  }
}

export function pilotAnswer(participant, timepoint, questionKey) {
  const measurement = (participant?.measurements || []).find((item) => item.timepoint === timepoint)
  return measurement?.answers?.find((answer) => answer.key === questionKey) || null
}

export function participantOverview(report) {
  return asParticipants(report).map((participant) => {
    const completed = (participant.measurements || []).filter((item) => item.status === 'completed').length
    return {
      code: participant.participant_code,
      name: participant.name,
      email: participant.email,
      baselinePain: pilotAnswer(participant, 'baseline', 'pain_sport')?.value ?? null,
      week1Comfort: pilotAnswer(participant, 'week1', 'comfort')?.value ?? null,
      week1Pain: pilotAnswer(participant, 'week1', 'pain_sport')?.value ?? null,
      week4Change: pilotAnswer(participant, 'week4', 'change')?.display_value || '',
      week4Pain: pilotAnswer(participant, 'week4', 'pain_sport')?.value ?? null,
      week12Outcome: pilotAnswer(participant, 'week12', 'overall')?.display_value || '',
      week12Pain: pilotAnswer(participant, 'week12', 'pain_sport')?.value ?? null,
      completed,
    }
  })
}

export function timepointSummary(report) {
  const participants = asParticipants(report)
  return TIMEPOINT_ORDER.map((timepoint) => {
    const measurements = participants
      .map((participant) => (participant.measurements || []).find((item) => item.timepoint === timepoint))
      .filter(Boolean)
    const numeric = (questionKey) => measurements
      .flatMap((item) => item.answers || [])
      .filter((answer) => answer.key === questionKey && typeof answer.value === 'number')
      .map((answer) => answer.value)
    const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

    return {
      timepoint,
      label: measurements[0]?.label || timepoint,
      sent: measurements.filter((item) => item.sent_at || ['sent', 'started', 'completed'].includes(item.status)).length,
      started: measurements.filter((item) => ['started', 'completed'].includes(item.status)).length,
      completed: measurements.filter((item) => item.status === 'completed').length,
      averagePain: average(numeric('pain_sport')),
      averageComfort: average(numeric('comfort')),
    }
  })
}

function safeSpreadsheetValue(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function csvCell(value) {
  return `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`
}

export function pilotExcelCsv(report) {
  const headers = [
    'Deelnemercode', 'Status deelnemer', 'Ingeschreven op', 'Toestemming vastgelegd op',
    'Meetmoment', 'Volgorde', 'Gepland op', 'Status meting', 'Verstuurd op', 'Gestart op', 'Afgerond op',
    'Vraagcode', 'Vraag', 'Antwoord waarde', 'Antwoord label', 'Ingevuld op',
  ]
  const rows = [headers]

  for (const participant of asParticipants(report)) {
    for (const measurement of participant.measurements || []) {
      const answers = measurement.answers?.length ? measurement.answers : [{ key: '', label: '', value: null, display_value: '', submitted_at: null }]
      for (const answer of answers) {
        rows.push([
          participant.participant_code,
          participant.status,
          participant.enrolled_at,
          participant.consent_confirmed_at,
          measurement.label,
          Number(measurement.sequence || 0) + 1,
          measurement.due_at,
          measurement.status,
          measurement.sent_at,
          measurement.started_at,
          measurement.completed_at,
          answer.key,
          answer.label,
          answer.value,
          answer.display_value,
          answer.submitted_at,
        ])
      }
    }
  }

  return `\ufeffsep=;\r\n${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`
}
