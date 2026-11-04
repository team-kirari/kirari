import test from 'node:test'
import assert from 'node:assert/strict'
import { dDayLabel, seoulDate } from '../src/lib/dday.ts'

test('D-day handles future, past, same day and leap days by calendar date', () => {
  assert.equal(dDayLabel('2026-11-05', '2026-11-04'), 'D−1')
  assert.equal(dDayLabel('2026-11-03', '2026-11-04'), 'D+1')
  assert.equal(dDayLabel('2026-11-04', '2026-11-04'), 'D-DAY')
  assert.equal(dDayLabel('2024-03-01', '2024-02-28'), 'D−2')
  assert.equal(dDayLabel('2027-01-01', '2026-12-31'), 'D−1')
})

test('invalid and unset dates have no countdown', () => {
  for (const invalid of ['', '2026-02-29', '2026-13-01', 'garbage']) assert.equal(dDayLabel(invalid, '2026-11-04'), null)
})

test('the day changes at midnight in Seoul regardless of device timezone', () => {
  assert.equal(seoulDate(new Date('2026-11-04T14:59:59Z')), '2026-11-04')
  assert.equal(seoulDate(new Date('2026-11-04T15:00:00Z')), '2026-11-05')
})

