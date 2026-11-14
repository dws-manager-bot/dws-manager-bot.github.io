import { describe, it, expect } from 'vitest'
import { startTimesText } from './schedule.js'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

describe('startTimesText', () => {
  it('is the start time when nothing else is set', () => {
    expect(startTimesText({ schedule_type: 'weekly', start_time: '20:30' }, DAYS)).toBe('20:30')
  })

  it('shows runs taking turns, then each weekday with its own time', () => {
    const ev = {
      schedule_type: 'rotation', start_time: '23:00', alternate_times: ['19:00'],
      weekday_times: { 6: '19:00', 0: '21:00' },
    }
    expect(startTimesText(ev, DAYS)).toBe('23:00 ⇄ 19:00 · Mon 21:00 · Sun 19:00')
  })

  it('leaves out turns on a schedule that is not a rotation', () => {
    const ev = { schedule_type: 'weekly', start_time: '20:30', alternate_times: ['10:00'] }
    expect(startTimesText(ev, DAYS)).toBe('20:30')
  })
})
