import test from 'node:test'
import assert from 'node:assert/strict'
import { participantOverview, pilotExcelCsv, pilotSummary, timepointSummary } from '../src/pilot-report.js'

const report = {
  participants: [{
    participant_code: 'P001',
    name: 'Test Persoon',
    email: 'test@example.com',
    status: 'active',
    enrolled_at: '2026-08-29T10:00:00.000Z',
    consent_confirmed_at: '2026-08-29T10:00:00.000Z',
    measurements: [
      {
        timepoint: 'baseline', label: 'Startmeting', sequence: 0, status: 'completed', sent_at: '2026-08-29T10:01:00.000Z', answer_count: 2,
        answers: [
          { key: 'pain_sport', label: 'Pijn', value: 7, display_value: '7', submitted_at: '2026-08-29T10:03:00.000Z' },
          { key: 'comment', label: 'Opmerking', value: '=2+2', display_value: '=2+2', submitted_at: '2026-08-29T10:04:00.000Z' },
        ],
      },
      {
        timepoint: 'week1', label: 'Meting na 1 week', sequence: 1, status: 'sent', sent_at: '2026-08-29T10:05:00.000Z', answer_count: 0,
        answers: [{ key: 'comfort', label: 'Comfort', value: null, display_value: '', submitted_at: null }],
      },
    ],
  }],
}

test('summarises pilot progress and visible participant metrics', () => {
  assert.deepEqual(pilotSummary(report), { participants: 1, sent: 2, completed: 1, answered: 2, responseRate: 50 })
  assert.equal(participantOverview(report)[0].baselinePain, 7)
  assert.equal(timepointSummary(report)[0].averagePain, 7)
})

test('creates an anonymous Excel-compatible CSV and neutralises formulas', () => {
  const csv = pilotExcelCsv(report)
  assert.match(csv, /^\ufeffsep=;/)
  assert.match(csv, /P001/)
  assert.match(csv, /'\=2\+2/)
  assert.doesNotMatch(csv, /Test Persoon|test@example\.com/)
})
