import { describe, expect, it } from 'vitest'
import { TEMPLE_IV, blocked, boxOf, overlaps, viewOf } from './geometry.js'
import { GROUP, fillAround, looseName, parseVotes, sortMembers } from './plan.js'

const t = TEMPLE_IV
const view = viewOf(t, 40)

const members = [
  { key: 'a', name: 'Anya Forger☥', uid: '1227616677000406', rank: 4, bgb: 40e6, base: 500e6 },
  { key: 'b', name: 'Dubai88', uid: '1148283609000414', rank: 4, bgb: 50e6, base: 600e6 },
  { key: 'c', name: '• Rosé •', uid: '1000000000000001', rank: 3, bgb: 30e6, base: 700e6 },
  { key: 'd', name: 'Noe85', uid: null, rank: 2, bgb: null, base: 100e6 },
]

describe('sorting members', () => {
  it('by BGB CP, CP without troops, rank or vote', () => {
    const keys = (by, votes) => sortMembers(members, by, votes).map((m) => m.key)
    expect(keys('bgb')).toEqual(['b', 'a', 'c', 'd'])
    expect(keys('base')).toEqual(['c', 'b', 'a', 'd'])
    expect(keys('rank')).toEqual(['b', 'a', 'c', 'd'])       // R4s by CP without troops, then R3, R2
    expect(keys('vote', { a: 2, c: 1, d: 4 })).toEqual(['c', 'a', 'd', 'b'])   // no vote last
  })
})

describe('reading pasted votes', () => {
  it('matches a game id, then a name exactly, then loosely', () => {
    const { votes, unmatched } = parseVotes([
      '1227616677000406 1',
      'Dubai88, 2',
      'Rose\t3',
      'Somebody Else 1',
      'no number here',
    ].join('\n'), members)
    expect(votes).toEqual({ a: 1, b: 2, c: 3 })
    expect(unmatched).toEqual(['Somebody Else 1', 'no number here'])
  })

  it('ignores decorations when matching loosely', () => {
    expect(looseName('• Rosé •')).toBe(looseName('rose'))
    expect(looseName('Anya Forger☥')).toBe('anyaforger')
  })
})

describe('filling a group round its anchor', () => {
  const anchor = { key: 'a', name: 'A', x: 424, y: 911 }   // just under the zone, below Turret 2

  it('packs the nearest spots on the anchor’s lattice, never in the zone or on a shelter', () => {
    const placed = [anchor, { key: 'z', name: 'Z', x: 427, y: 911 }]
    const got = fillAround(t, view, placed, anchor, ['b', 'c', 'd', 'e', 'f'], GROUP.t2.target(t))
    expect(got).toHaveLength(5)
    const all = [...placed, ...got]
    for (const p of got) {
      expect(Math.abs((p.x - anchor.x) % 3)).toBe(0)
      expect(Math.abs((p.y - anchor.y) % 3)).toBe(0)
      expect(overlaps(boxOf(p.x, p.y), t.zone)).toBe(false)
      expect(blocked(t, view, all.filter((q) => q !== p), p.key, p.x, p.y)).toBeNull()
    }
    // 427 is taken, so the first goes to the other side of the anchor, the strongest nearest
    expect(got[0]).toEqual({ key: 'b', x: 421, y: 911 })
    const d = got.map((p) => Math.hypot(p.x - anchor.x, p.y - anchor.y))
    expect([...d].sort((x, y) => x - y)).toEqual(d)
  })

  it('breaks a tie toward the group’s target', () => {
    // From an anchor on the right of the zone, Turret 1 is up and Turret 2 down.
    const right = { key: 'r', name: 'R', x: 437, y: 923 }
    const up = fillAround(t, view, [right], right, ['b'], GROUP.t1.target(t))
    const down = fillAround(t, view, [right], right, ['b'], GROUP.t2.target(t))
    expect(up[0]).toEqual({ key: 'b', x: 437, y: 926 })
    expect(down[0]).toEqual({ key: 'b', x: 437, y: 920 })
  })

  it('stops when the ground runs out', () => {
    const small = viewOf(t, 4)
    const keys = Array.from({ length: 200 }, (_, i) => `k${i}`)
    const got = fillAround(t, small, [anchor], anchor, keys, GROUP.t2.target(t))
    expect(got.length).toBeGreaterThan(10)
    expect(got.length).toBeLessThan(200)
  })
})
