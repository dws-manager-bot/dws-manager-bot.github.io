import { describe, it, expect } from 'vitest'
import { byDay, dayIn, daysBetween, duration, isOn, startsIn } from './schedule.js'

const at = (iso) => new Date(iso).getTime()
const item = (starts_at, duration_minutes = 60, name = 'x') => ({ starts_at, duration_minutes, name })

describe('byDay', () => {
  it("files each occurrence under the reader's own day, not UTC's", () => {
    // 23:30 UTC on the 5th is already the 6th in Seoul.
    const items = [item('2026-10-05T13:00:00Z'), item('2026-10-05T23:30:00Z')]
    const now = at('2026-10-05T00:00:00Z')
    expect(byDay(items, 'Asia/Seoul', now).map((g) => [g.day, g.items.length])).toEqual([
      ['2026-10-05', 1],
      ['2026-10-06', 1],
    ])
    expect(byDay(items, 'UTC', now).map((g) => [g.day, g.items.length])).toEqual([['2026-10-05', 2]])
  })

  it('drops what has finished, keeps what is under way', () => {
    const items = [item('2026-10-05T10:00:00Z'), item('2026-10-05T11:30:00Z'), item('2026-10-05T14:00:00Z')]
    const now = at('2026-10-05T12:00:00Z')
    expect(byDay(items, 'UTC', now)[0].items.map((i) => i.starts_at)).toEqual([
      '2026-10-05T11:30:00Z',
      '2026-10-05T14:00:00Z',
    ])
  })
})

describe('isOn', () => {
  it('is true from the start until the length runs out', () => {
    const it90 = item('2026-10-05T10:00:00Z', 90)
    expect(isOn(it90, at('2026-10-05T09:59:00Z'))).toBe(false)
    expect(isOn(it90, at('2026-10-05T10:00:00Z'))).toBe(true)
    expect(isOn(it90, at('2026-10-05T11:29:00Z'))).toBe(true)
    expect(isOn(it90, at('2026-10-05T11:30:00Z'))).toBe(false)
  })
})

describe('words', () => {
  it('says how far off in the largest sensible unit', () => {
    const now = at('2026-10-05T10:00:00Z')
    expect(startsIn(item('2026-10-05T10:25:00Z'), now, 'en')).toBe('in 25 minutes')
    expect(startsIn(item('2026-10-05T13:10:00Z'), now, 'en')).toBe('in 3 hours')
    expect(startsIn(item('2026-10-07T10:00:00Z'), now, 'en')).toBe('in 2 days')
    expect(startsIn(item('2026-10-05T13:10:00Z'), now, 'ko')).toBe('3시간 후')
  })

  it('writes a length in hours when it is whole hours', () => {
    expect(duration(60, 'en')).toBe('1 hr')
    expect(duration(90, 'en')).toBe('90 min')
  })

  it('counts days across a month end', () => {
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1)
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0)
    expect(dayIn('2026-10-05T23:30:00Z', 'Asia/Seoul')).toBe('2026-10-06')
  })
})
