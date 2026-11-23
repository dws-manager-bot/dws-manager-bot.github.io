import { describe, expect, it } from 'vitest'
import raw from './season6.json'
import { checkScenario, legalTargets, plannedRuins } from './targets.js'
import { dayOf, isAltarDay, isInvasion, paydays } from './season.js'
import { standings } from './standing.js'

// The real season 6 map, as mapdata.js hands it to the rules.
const cities = raw.cities.map((c) => ({ mithril: 0, destroy: 0, ...c, nearBy: c.nearBy || [] }))
const map = { cities, byId: new Map(cities.map((c) => [c.id, c])) }
const alliances = [
  { id: 1, name: 'PoU', camp: 3 },
  { id: 2, name: 'RPx', camp: 3 },
  { id: 5, name: 'RT', camp: 4 },
]
const ids = (list) => list.map((t) => t.city.id).sort((a, b) => a - b)
const DAY2 = '2026-11-24'   // Tuesday, before invasions start

describe('the season calendar', () => {
  it('counts days from Monday 23 Nov ST', () => {
    expect(dayOf('2026-11-23')).toBe(1)
    expect(dayOf(DAY2)).toBe(2)
    expect(dayOf('2026-12-31')).toBe(39)
  })
  it('opens invasions on Tuesdays and Thursdays from Day 16', () => {
    expect(isInvasion(DAY2)).toBe(false)              // Tuesday, Day 2
    expect(isInvasion('2026-12-08')).toBe(true)       // Tuesday, Day 16
    expect(isInvasion('2026-12-09')).toBe(false)      // Wednesday
    expect(isInvasion('2026-12-10')).toBe(true)       // Thursday
  })
  it('opens Altars on Thursdays from Day 39', () => {
    expect(isAltarDay('2026-12-24')).toBe(false)      // Thursday, Day 32
    expect(isAltarDay('2026-12-31')).toBe(true)       // Thursday, Day 39
  })
  it('pays each Monday 00:00 ST from Day 8', () => {
    const t = paydays(new Date('2026-12-08T00:00:00Z'))
    expect(t.map((d) => d.toISOString())).toEqual(['2026-11-30T02:00:00.000Z', '2026-12-07T02:00:00.000Z'])
  })
})

describe('legal targets', () => {
  it('starts an alliance that holds nothing on its camp’s Lv.1 Camp Outposts', () => {
    const r = legalTargets(map, new Map(), alliances, 1, { iso: DAY2 })
    expect(r.rule).toBe('start')
    expect(r.targets).toHaveLength(6)
    expect(r.targets.every((t) => t.city.kind === 'outpost' && t.city.camp === 3 && t.attack === 'challenge')).toBe(true)
  })

  it('reaches what borders ground any alliance of the camp holds', () => {
    // RPx holds the Camp Outpost; PoU, holding one elsewhere, may use RPx's border.
    const holders = new Map([[1011, 2], [920, 1]])
    const r = legalTargets(map, holders, alliances, 1, { iso: DAY2 })
    expect(r.rule).toBe('border')
    expect(ids(r.targets)).toContain(1010)
    expect(ids(r.targets)).not.toContain(1011)     // the camp's own
  })

  it('holds back what has not opened yet', () => {
    // 970 is a Lv.4 Fortress, open from Day 3, bordering 989.
    const holders = new Map([[989, 1]])
    const before = legalTargets(map, holders, alliances, 1, { iso: DAY2 })
    expect(before.later.map((t) => t.city.id)).toContain(970)
    expect(ids(before.targets)).not.toContain(970)
    const after = legalTargets(map, holders, alliances, 1, { iso: '2026-11-25' })
    expect(after.targets.find((t) => t.city.id === 970)).toMatchObject({ attack: 'war', when: 'any', today: true })
  })

  it('goes through a pass only once it opens', () => {
    // Dawn Pass 1068 joins Camp Base 5 (Outpost 667) to the Land of Strife (688), from Day 8.
    expect(map.byId.get(1068)).toMatchObject({ kind: 'pass', opens: 8, nearBy: [667, 688] })
    const camp5 = [...alliances, { id: 9, name: 'C5', camp: 5 }]
    // 5000 is no territory at all: it must border nothing, not crash.
    const holders = new Map([[667, 9], [5000, 9]])
    expect(ids(legalTargets(map, holders, camp5, 9, { iso: '2026-11-29' }).targets)).not.toContain(688) // Day 7
    expect(ids(legalTargets(map, holders, camp5, 9, { iso: '2026-11-30' }).targets)).toContain(688)     // Day 8
  })

  it('finds nothing to hold behind a Camp Pass: it leads to a Temple', () => {
    const pass = map.byId.get(1070)
    expect(pass).toMatchObject({ kind: 'pass', camp: 3, nearBy: [896] })
  })

  it('lets another camp’s ground be taken only on invasion days', () => {
    const holders = new Map([[989, 1], [988, 5]])
    const wed = legalTargets(map, holders, alliances, 1, { iso: '2026-12-09' })
    expect(wed.targets.find((t) => t.city.id === 988)).toMatchObject({ when: 'invasion', today: false })
    const tue = legalTargets(map, holders, alliances, 1, { iso: '2026-12-08' })
    expect(tue.targets.find((t) => t.city.id === 988)).toMatchObject({ when: 'invasion', today: true })
  })

  it('never targets a destroyed Fortress, nor reaches from one', () => {
    const holders = new Map([[989, 1], [970, 2]])
    const r = legalTargets(map, holders, alliances, 1, { iso: '2026-11-25', ruins: new Set([970]) })
    expect(ids(r.targets)).not.toContain(970)
  })
})

describe('a scenario', () => {
  it('destroys another camp’s Fortress it hands over, and nothing else', () => {
    const board = new Map([[970, 5], [991, 1]])
    const out = plannedRuins(map, board, new Set(), alliances, { 970: 1, 991: 2, 1010: 1 })
    expect([...out]).toEqual([[970, 1]])
  })

  it('counts 3 Challenges and 1 War per alliance', () => {
    const board = new Map([[1011, 1], [989, 1], [990, 1]])
    const scenario = { changes: { 1010: 1, 1043: 1, 1044: 1, 1009: 1, 970: 1, 991: 1 } }
    const w = checkScenario(map, board, alliances, scenario, { iso: '2026-11-25' })
    expect(w.filter((x) => x.kind === 'count').map((x) => x.text).join(' ')).toMatch(/4 Outposts.*2 Fortresses/)
  })

  it('pays weekly only for Fortresses and Altars, and nothing once destroyed', () => {
    const holders = new Map([[991, 1], [970, 1], [1010, 1], [1104, 2]])
    const rows = standings(map, holders, alliances, new Set([970]))
    const pou = rows.find((r) => r.alliance.id === 1)
    expect(pou).toMatchObject({ weekly: 20, fortresses: 1, outposts: 1, destroyed: 1 })
  })
})
