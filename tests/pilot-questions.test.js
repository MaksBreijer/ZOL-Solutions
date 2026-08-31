import test from 'node:test'
import assert from 'node:assert/strict'
import { timepoints } from '../supabase/functions/_shared/pilot-questions.js'

const questionKeys = (timepoint) => timepoints.find((item) => item.key === timepoint).questions.map((question) => question.key)

test('uses the requested pilot questions in the requested order', () => {
  assert.deepEqual(questionKeys('baseline'), ['pain_duration', 'sport_limit', 'physiotherapy', 'pain_sport'])
  assert.deepEqual(questionKeys('week1'), ['comfort', 'usage_moments', 'fit_issue', 'pain_sport'])
  assert.deepEqual(questionKeys('week4'), ['change', 'sport_limit', 'pain_sport'])
  assert.deepEqual(questionKeys('week12'), ['continued_use', 'pain_sport', 'sport_limit', 'overall', 'comment'])
})

test('keeps pain scales at 0–10 and the final comment optional', () => {
  const painQuestions = timepoints.flatMap((item) => item.questions).filter((question) => question.key === 'pain_sport')
  assert.equal(painQuestions.length, 4)
  painQuestions.forEach((question) => {
    assert.equal(question.min, 0)
    assert.equal(question.max, 10)
    assert.equal(question.minLabel, 'Geen pijn')
    assert.equal(question.maxLabel, 'Veel pijn')
  })
  assert.equal(timepoints.find((item) => item.key === 'week12').questions.at(-1).required, false)
})
