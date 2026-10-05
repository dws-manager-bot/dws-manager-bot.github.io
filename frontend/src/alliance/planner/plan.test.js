import { describe, it, expect } from 'vitest'
import en from '../../i18n/messages/planner/en.json'
import { AD_WEEK, OFFICIALS, SP_ROTATION, THEME_COLORS } from './data.js'
import {
  DAY, HOUR, SLOT, adTheme, dayStartOn, daySlots, nextDual, officialsFor, serverDay, slotAt, spTheme, windowIn,
} from './plan.js'

const at = (iso) => Date.parse(iso)
const short = {
  shelter_expansion: 'SE', hero_initiative: 'HI', unit_training: 'UT', age_of_science: 'AS', arms_expert: 'AE',
}

describe('the week, as the live pou-rocks planner shows it', () => {
  // What pou-rocks.github.io/planner's live build computes for each weekday.
  // If this changes, the data changed: check it against the game first.
  it('rotates the five SP themes through six slots a day', () => {
    const week = [0, 1, 2, 3, 4, 5, 6].map((d) => daySlots(d, 0).map((s) => short[s.theme]).join(' '))
    expect(week).toEqual([
      'SE HI UT AS AE SE',
      'HI UT AS AE SE HI',
      'UT AS AE SE HI UT',
      'AS AE SE HI UT AS',
      'AE SE HI UT AS AE',
      'SE HI UT AS AE SE',
      'HI UT AS AE SE HI',
    ])
  })

  it('gives each weekday its AD theme, and Sunday none', () => {
    expect(AD_WEEK.map((t) => t?.key ?? null)).toEqual([
      'shelter_expansion', 'hero_initiative', 'keep_progressing', 'arms_expert',
      'holistic_growth', 'enemy_buster', null,
    ])
  })

  it('finds the dual windows', () => {
    const duals = (d) => daySlots(d, 0).map((s) => s.dual.length)
    expect(duals(0)).toEqual([2, 0, 0, 3, 0, 2])
    expect(duals(2)).toEqual([3, 0, 2, 0, 0, 3])
    expect(duals(4)).toEqual([5, 1, 2, 7, 2, 5])
    expect(duals(5)).toEqual([0, 0, 0, 0, 0, 0])
    expect(duals(6)).toEqual([0, 0, 0, 0, 0, 0])
    expect(daySlots(2, 0)[2].dual).toEqual(['power_cores', 'hero_equipment_lucky_chests'])
    expect(daySlots(3, 0)[1].dual).toEqual(['gears', 'titaniums', 'design_blueprints', 'open_chip_chests'])
  })

  it('keeps what the live build added since the dws-planner repos', () => {
    expect(spTheme(0, 4).actions).toContain('open_chip_chests')
    expect(adTheme(3).actions).toContain('open_chip_chests')
    expect(OFFICIALS.unit_training.best).toEqual(['scale_of_law', 'supreme_general', 'secretary_of_security'])
  })

  it('splits a slot into SP only, dual and AD only, in each theme’s order', () => {
    const [first] = daySlots(0, 0)
    expect(first.dual).toEqual(['construction_speed_ups', 'finish_building_upgrades'])
    expect(first.spOnly).toEqual([])
    expect(first.adOnly).toEqual([
      'research_speed_ups', 'finish_science_tech_research', 'wisdom_medals', 'field_resource_gathering',
    ])
    const sunday = daySlots(6, 0)[0]
    expect(sunday.spOnly).toEqual(spTheme(6, 0).actions)
    expect(sunday.adOnly).toEqual([])
  })

  it('recommends capital titles only where a buff helps', () => {
    expect(officialsFor('shelter_expansion')).toEqual({
      best: ['secretary_of_construction'], also: ['scale_of_law', 'vice_president'],
    })
    expect(officialsFor('hero_initiative')).toEqual({ best: [], also: [] })
    expect(officialsFor('arms_expert')).toEqual({ best: [], also: [] })
  })
})

describe('server time', () => {
  it('starts the server day at 00:00 UTC−2, which is 02:00 UTC', () => {
    expect(serverDay(at('2026-10-05T02:00:00Z'))).toEqual({ start: at('2026-10-05T02:00:00Z'), weekday: 0 })
    expect(serverDay(at('2026-10-05T01:59:59Z'))).toEqual({ start: at('2026-10-04T02:00:00Z'), weekday: 6 })
    expect(serverDay(at('2026-10-11T23:00:00Z')).weekday).toBe(6)
  })

  it('finds the slot an instant falls in, its first and last moment included', () => {
    expect(slotAt(at('2026-10-05T02:00:00Z'))).toMatchObject({ weekday: 0, slot: 0, theme: 'shelter_expansion' })
    expect(slotAt(at('2026-10-05T05:59:59Z')).slot).toBe(0)
    // 11:00 KST is 00:00 server time.
    expect(slotAt(at('2026-10-05T10:00:00Z'))).toMatchObject({
      slot: 2, theme: 'unit_training', start: at('2026-10-05T10:00:00Z'), end: at('2026-10-05T14:00:00Z'),
    })
    expect(slotAt(at('2026-10-06T01:59:59Z'))).toMatchObject({ weekday: 0, slot: 5 })
  })

  it('opens a weekday on today, or on the next one', () => {
    const monday = at('2026-10-05T12:00:00Z')
    expect(dayStartOn(0, monday)).toBe(at('2026-10-05T02:00:00Z'))
    expect(dayStartOn(1, monday)).toBe(at('2026-10-06T02:00:00Z'))
    expect(dayStartOn(6, monday)).toBe(at('2026-10-11T02:00:00Z'))
    // Sunday evening in Seoul is still Sunday on the server, until 11:00 Monday.
    expect(dayStartOn(6, at('2026-10-05T01:00:00Z'))).toBe(at('2026-10-04T02:00:00Z'))
  })

  it('lays the six slots end to end across the day', () => {
    const start = at('2026-10-05T02:00:00Z')
    const slots = daySlots(0, start)
    expect(slots.map((s) => s.start - start)).toEqual([0, 4, 8, 12, 16, 20].map((h) => h * HOUR))
    expect(slots[5].end - start).toBe(DAY)
  })
})

describe('nextDual', () => {
  it('finds the next dual slot later the same day', () => {
    const next = nextDual(at('2026-10-05T10:30:00Z'))
    expect(next).toMatchObject({ weekday: 0, slot: 3, theme: 'age_of_science', start: at('2026-10-05T14:00:00Z') })
  })

  it('looks past the one in progress, even when that one is dual', () => {
    expect(nextDual(at('2026-10-05T03:00:00Z')).slot).toBe(3)
  })

  it('skips Saturday and Sunday, which have none', () => {
    const next = nextDual(at('2026-10-10T12:00:00Z'))
    expect(next).toMatchObject({ weekday: 0, slot: 0, start: at('2026-10-12T02:00:00Z') })
  })

  it('gives up past its horizon', () => {
    expect(nextDual(at('2026-10-10T12:00:00Z'), 1)).toBeNull()
  })
})

describe('windowIn', () => {
  it('reads a slot on the server clock as 4 hours inside one day', () => {
    const s = daySlots(0, at('2026-10-05T02:00:00Z'))[5]
    const w = windowIn(s.start, s.end, 'Etc/GMT+2')
    expect(w.from).toMatchObject({ weekday: 0, hour: 20, minute: 0 })
    expect(w.to).toMatchObject({ weekday: 1, hour: 0 })
    expect(w.crossesDate).toBe(false)
  })

  it('crosses midnight where the reader’s zone puts it', () => {
    const s = daySlots(0, at('2026-10-05T02:00:00Z'))[3]
    const w = windowIn(s.start, s.end, 'Asia/Seoul')
    expect(w.from).toMatchObject({ weekday: 0, hour: 23 })
    expect(w.to).toMatchObject({ weekday: 1, hour: 3 })
    expect(w.crossesDate).toBe(true)
  })

  it('keeps half-hour zones on the half hour', () => {
    const s = daySlots(0, at('2026-10-05T02:00:00Z'))[0]
    expect(windowIn(s.start, s.end, 'Asia/Kolkata').from).toMatchObject({ hour: 7, minute: 30 })
  })

  it('shows a clock change as the wall clock has it, though the slot is still 4 hours', () => {
    // New York falls back at 06:00 UTC on 1 November 2026.
    const start = at('2026-11-01T02:00:00Z')
    const [first] = daySlots(6, start)
    expect(first.end - first.start).toBe(SLOT)
    const w = windowIn(first.start, first.end, 'America/New_York')
    expect(w.from).toMatchObject({ weekday: 5, hour: 22 })
    expect(w.to).toMatchObject({ weekday: 6, hour: 1 })
  })
})

describe('words for the data', () => {
  it('has an English name for every theme, action and title the planner shows', () => {
    const themes = new Set([...SP_ROTATION, ...AD_WEEK.filter(Boolean)].map((t) => t.key))
    const actions = new Set([...SP_ROTATION, ...AD_WEEK.filter(Boolean)].flatMap((t) => t.actions))
    const titles = new Set(Object.values(OFFICIALS).flatMap((o) => [...o.best, ...o.also]))
    expect([...themes].filter((k) => !en.themes[k])).toEqual([])
    expect([...themes].filter((k) => !THEME_COLORS[k])).toEqual([])
    expect([...actions].filter((k) => !en.actions[k])).toEqual([])
    expect([...titles].filter((k) => !en.titles[k])).toEqual([])
    expect(Object.keys(en.actions).sort()).toEqual([...actions].sort())
  })
})
