import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarGridRange, eventsForDay, googleCalendarEventUrl, parseCalendarEvents } from '../src/calendar-feed.js'

const fixture = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:single
DTSTART;VALUE=DATE:20260919
DTEND;VALUE=DATE:20260921
SUMMARY:Sportweekend
END:VEVENT
BEGIN:VEVENT
UID:weekly
DTSTART:20260907T090000Z
DTEND:20260907T100000Z
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Teamoverleg
END:VEVENT
END:VCALENDAR`

test('parses multi-day and recurring Google calendar events in a visible range', () => {
  const events = parseCalendarEvents(fixture, new Date('2026-09-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'))
  assert.equal(events.length, 5)
  assert.deepEqual(events.map((event) => event.title), ['Teamoverleg', 'Teamoverleg', 'Sportweekend', 'Teamoverleg', 'Teamoverleg'])
  assert.equal(eventsForDay(events, new Date(2026, 8, 20)).some((event) => event.title === 'Sportweekend'), true)
})

test('builds a six-week month grid starting on Monday', () => {
  const range = calendarGridRange(new Date(2026, 8, 1))
  assert.equal(range.start.getDay(), 1)
  assert.equal((range.end - range.start) / 86_400_000, 42)
})

test('builds a prefilled Google Calendar appointment without losing event details', () => {
  const url = new URL(googleCalendarEventUrl({
    title: ' Kennismaking Fysio Noord ',
    start: new Date(2026, 8, 4, 9, 30),
    end: new Date(2026, 8, 4, 10, 15),
    description: 'Samenwerking bespreken',
    location: 'Amsterdam',
  }))
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render')
  assert.equal(url.searchParams.get('action'), 'TEMPLATE')
  assert.equal(url.searchParams.get('text'), 'Kennismaking Fysio Noord')
  assert.equal(url.searchParams.get('dates'), '20260904T093000/20260904T101500')
  assert.equal(url.searchParams.get('ctz'), 'Europe/Amsterdam')
  assert.equal(url.searchParams.get('details'), 'Samenwerking bespreken')
  assert.equal(url.searchParams.get('location'), 'Amsterdam')
})

test('rejects an appointment that ends before it starts', () => {
  assert.throws(() => googleCalendarEventUrl({ title: 'Fout', start: '2026-09-04T10:00', end: '2026-09-04T09:00' }), /eindtijd/i)
})
