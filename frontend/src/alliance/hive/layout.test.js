import { describe, it, expect } from 'vitest'
import roster from './fixtures/roster.csv?raw'
// Made by pou-rocks.github.io's own engine (chunk 57, module 59506) from
// roster.csv, so these tests hold the port to that site's results.
import expected from './fixtures/expected-layouts.json'
import {
  FRANKENSTEIN, RALLY_SURE, RALLY_TILES, ROTATIONS, SHELTER, TILE, VERSIONS, applySwaps, compareClaims, layoutHive,
  placementOf, rallyReach, restorePlacement, rotateLayout, spareInRange, turn,
} from './layout.js'
import { readMembers } from './sheet.js'

const members = readMembers(roster)

const OPTIONS = {
  spread: { spreadTop: true, spreadIndustry: true },
  plain: { spreadTop: false, spreadIndustry: false },
  top10: { spreadTop: true, spreadIndustry: false },
}

/** A roster of `count` members on their own, strongest first. */
const singles = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i, name: `M${i}`, level: 8 - (i % 8), bgbCp: 1000 * (count - i), cp: 5000 * (count - i), outermost: false, group: null,
  }))

const cellsOf = (layout, list) => list.map((m) => layout.memberCell.get(m.id))

describe.each(VERSIONS)('version %i', (version) => {
  describe.each(Object.keys(OPTIONS))('%s', (name) => {
    const layout = layoutHive(members, { version, ...OPTIONS[name] })
    const cells = cellsOf(layout, members)

    it('places every member once', () => {
      expect(layout.N).toBe(members.length)
      expect(cells.every(Boolean)).toBe(true)
      expect(new Set(cells.map((c) => c.join())).size).toBe(members.length)
      expect(layout.total).toBe(members.reduce((sum, m) => sum + m.cp, 0))
    })

    it('never overlaps two shelters, or a shelter and Frankenstein', () => {
      for (let i = 0; i < cells.length; i += 1) {
        for (let j = i + 1; j < cells.length; j += 1) {
          const apart = Math.max(Math.abs(cells[i][0] - cells[j][0]), Math.abs(cells[i][1] - cells[j][1]))
          expect(apart).toBeGreaterThanOrEqual(SHELTER)
        }
        expect(Math.max(Math.abs(cells[i][0]), Math.abs(cells[i][1]))).toBeGreaterThanOrEqual((SHELTER + FRANKENSTEIN) / 2)
      }
    })

    // The gap square's blocks hold four, so a bigger group reaches across a
    // gap, diagonally at worst.
    const together = version === 2 ? 2 * (SHELTER + 30) ** 2 : (1.5 * SHELTER) ** 2

    it('keeps each stick group together', () => {
      for (const group of layout.groups.values()) {
        const own = cellsOf(layout, group)
        const reached = new Set([0])
        for (let grew = true; grew;) {
          grew = false
          own.forEach((c, i) => {
            if (reached.has(i)) return
            const near = [...reached].some((r) => (own[r][0] - c[0]) ** 2 + (own[r][1] - c[1]) ** 2 <= together)
            if (near) {
              reached.add(i)
              grew = true
            }
          })
        }
        expect(reached.size).toBe(group.length)
      }
    })

    // Where the member table says someone asked for the outside, they are placed before
    // the spread units, which pou-rocks' engine is not: the diamond, the circle and
    // v7 are the layouts where that moves someone, so those six are no longer its own.
    const movedForThoseWhoAsked = ['v3 spread', 'v3 top10', 'v4 spread', 'v4 top10', 'v7 spread', 'v7 top10'].includes(`v${version} ${name}`)
    it.skipIf(movedForThoseWhoAsked)("matches pou-rocks' own layout", () => {
      const want = expected[`v${version} ${name}`]
      expect(cells.map((c) => c.join()).join(' ')).toBe(want.cells)
      expect([layout.W, layout.H]).toEqual(want.size)
      expect(layout.farthest).toBe(want.farthest)
    })
  })

  it('places a large roster once each, with no overlaps', () => {
    const big = singles(140)
    const cells = cellsOf(layoutHive(big, { version, spreadTop: true, spreadIndustry: true }), big)
    expect(new Set(cells.map((c) => c.join())).size).toBe(big.length)
    const seen = new Set()
    for (const [x, y] of cells) {
      // Every shelter covers its own 3×3 tiles; none may be covered twice.
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const tile = `${Math.floor((x + dx * 30) / 30)},${Math.floor((y + dy * 30) / 30)}`
          expect(seen.has(tile)).toBe(false)
          seen.add(tile)
        }
      }
    }
  })
})

describe('the lattices', () => {
  const axis = (layout, list) => new Set(cellsOf(layout, list).flatMap((c) => c.map(Math.abs)))

  it('packs shelters edge to edge either side of a two-tile lane', () => {
    const lane = [...axis(layoutHive(members, { version: 1 }), members)].sort((a, b) => a - b)
    expect(lane.every((v) => (v - 30 - 45) % 90 === 0)).toBe(true)
  })

  it('leaves a one-tile gap after every second shelter in the gap square', () => {
    // From the center out: 45, then +120 (a shelter and the gap), +90, +120, …
    const lattice = [45, 165, 255, 375, 465, 585, 675, 795, 885, 1005]
    const gap = axis(layoutHive(members, { version: 2 }), members)
    expect([...gap].every((v) => lattice.includes(v))).toBe(true)
  })
})

describe('reach', () => {
  it('pulls a square corner past 24 tiles in to the rows above', () => {
    // 97 shelters leave one corner of the square past 24 tiles; 95 do not.
    const corner = layoutHive(singles(97), { version: 1 })
    expect(corner.farthest).toBeLessThanOrEqual(24)
    const cells = cellsOf(corner, singles(97))
    expect(Math.min(...cells.map((c) => c[1]))).toBeLessThan(-Math.max(...cells.map((c) => c[1])))
  })

  it('leaves a drawn shape its outline', () => {
    expect(layoutHive(singles(140), { version: 6 }).farthest).toBeGreaterThan(24)
  })
})

describe('who has the strongest claim to the outside', () => {
  const m = (name, fields) => ({ name, level: 1, bgbCp: 0, cp: 0, growth: 0, outermost: false, ...fields })
  const strongestFirst = (list) => [...list].sort((a, b) => compareClaims(b, a)).map((x) => x.name)

  it('asked for it, then growth, then BGB CP, then industry level, then total CP', () => {
    const list = [
      m('cp', { cp: 9e9 }),
      m('level', { level: 8, cp: 1 }),
      m('bgb', { bgbCp: 5e8, level: 1 }),
      m('growth', { growth: 1e9 }),
      m('asked', { outermost: true }),
    ]
    expect(strongestFirst(list)).toEqual(['asked', 'growth', 'bgb', 'level', 'cp'])
  })

  it('puts growth before BGB CP even when BGB CP is far higher', () => {
    expect(strongestFirst([m('rich', { bgbCp: 9e9 }), m('grown', { growth: 1 })])).toEqual(['grown', 'rich'])
  })

  it('counts a member with no growth figure as none', () => {
    const bare = { name: 'bare', level: 1, bgbCp: 5, cp: 5, outermost: false }
    expect(strongestFirst([bare, m('zero', { bgbCp: 4 })])).toEqual(['bare', 'zero'])
  })
})

describe('members who asked for the outside', () => {
  const ring = (c) => Math.max(Math.abs(c[0]), Math.abs(c[1]))

  /* Ten strong groups of three that the spread would send to the rim, and a few
     weaker members who asked for it, alone and in a pair. */
  const roster = () => {
    const list = []
    const add = (fields) => list.push({ id: list.length, level: 5, bgbCp: 1, cp: 1, growth: 0, outermost: false, group: null, ...fields })
    for (let g = 0; g < 10; g += 1) {
      for (let k = 0; k < 3; k += 1) add({ name: `S${g}${k}`, bgbCp: 9e8 - g * 1e6 - k, cp: 2e9, growth: 1e9, group: `strong${g}` })
    }
    for (let i = 0; i < 4; i += 1) add({ name: `Alone${i}`, bgbCp: 100 + i, outermost: true })
    add({ name: 'PairA', bgbCp: 50, outermost: true, group: 'pair' })
    add({ name: 'PairB', bgbCp: 49, group: 'pair' })
    for (let i = 0; i < 30; i += 1) add({ name: `Rest${i}`, bgbCp: 10 + i })
    return list
  }

  it.each([[1, true, true], [1, true, false], [1, false, true], [2, true, true], [3, true, true], [4, true, true]])(
    'sit on the outermost ring in v%i (spread top %s, spread Lv8 %s)', (version, spreadTop, spreadIndustry) => {
      const list = roster()
      const layout = layoutHive(list, { version, spreadTop, spreadIndustry })
      const all = list.map((m) => ring(layout.memberCell.get(m.id)))
      const farthest = Math.max(...all)
      for (const m of list.filter((x) => x.outermost)) {
        expect(ring(layout.memberCell.get(m.id)), m.name).toBe(farthest)
      }
    },
  )
})

describe('turning the formation', () => {
  const dist = (c) => Math.hypot(c[0], c[1])
  it.each(ROTATIONS)('keeps Frankenstein, every distance and every gap at %i°', (degrees) => {
    for (const version of VERSIONS) {
      const layout = layoutHive(members, { version, spreadTop: true, spreadIndustry: true })
      const before = new Map(layout.memberCell)
      rotateLayout(layout, degrees)
      for (const m of members) {
        expect(dist(layout.memberCell.get(m.id))).toBeCloseTo(dist(before.get(m.id)), 6)
      }
      const cells = [...layout.memberCell.values()]
      for (let i = 0; i < cells.length; i += 1) {
        expect(Math.max(Math.abs(cells[i][0]), Math.abs(cells[i][1]))).toBeGreaterThanOrEqual((FRANKENSTEIN + SHELTER) / 2)
        for (let j = i + 1; j < cells.length; j += 1) {
          expect(Math.max(Math.abs(cells[i][0] - cells[j][0]), Math.abs(cells[i][1] - cells[j][1]))).toBeGreaterThanOrEqual(SHELTER)
        }
      }
      // Frankenstein is still inside the canvas, and so is every shelter.
      const [fx, fy] = layout.toPx(0, 0)
      expect(fx).toBeGreaterThan(0)
      expect(fy).toBeGreaterThan(0)
    }
  })

  it('turns clockwise as drawn: right goes to the bottom', () => {
    expect(turn([10, 0], 90)).toEqual([-0, 10])
    expect(turn([10, 0], 180)).toEqual([-10, -0])
    expect(turn([10, 0], 270)).toEqual([0, -10])
  })

  it('puts the extra rows of the square on the side it is turned to', () => {
    const big = singles(99)
    const layout = layoutHive(big, { version: 1 })
    const above = [...layout.memberCell.values()].filter((c) => c[1] < 0).length
    rotateLayout(layout, 90)
    const right = [...layout.memberCell.values()].filter((c) => c[0] > 0).length
    expect(right).toBe(above)
    expect(above).toBeGreaterThan(49)
  })
})

describe('an applied map loaded back', () => {
  const keyed = singles(30).map((m) => ({ ...m, key: `p${m.id}` }))
  const saved = () => {
    const layout = layoutHive(keyed, { version: 1 })
    applySwaps(layout.memberCell, [[0, 29], [3, 17]])
    return { layout, placement: placementOf(layout.memberCell, keyed) }
  }

  it('puts everyone back exactly where they were, whatever the table says now', () => {
    const { layout, placement } = saved()
    // Their numbers have changed since: a fresh layout would move them.
    const now = keyed.map((m) => ({ ...m, cp: m.cp * (m.id % 3 === 0 ? 3 : 1) }))
    const again = layoutHive(now, { version: 1 })
    const r = restorePlacement(again, now, placement)
    expect(r).toMatchObject({ kept: 30, added: [], empty: 0 })
    for (const m of now) expect(again.memberCell.get(m.id)).toEqual(layout.memberCell.get(m.id))
  })

  it('finds members by player id, not by their place in the table', () => {
    const { layout, placement } = saved()
    const reordered = [...keyed].reverse().map((m, i) => ({ ...m, id: i, name: `${m.name}!` }))
    const again = layoutHive(reordered, { version: 1 })
    restorePlacement(again, reordered, placement)
    for (const m of reordered) expect(again.memberCell.get(m.id)).toEqual(layout.memberCell.get(Number(m.key.slice(1))))
  })

  it('leaves a leaver’s shelter empty, and gives a newcomer a free one', () => {
    const { placement } = saved()
    const now = keyed.filter((m) => m.key !== 'p5' && m.key !== 'p6')
      .concat([{ ...singles(1)[0], id: 100, key: 'new', name: 'New' }])
    const again = layoutHive(now, { version: 1 })
    const r = restorePlacement(again, now, placement)
    expect(r.kept).toBe(28)
    expect(r.added.map((m) => m.name)).toEqual(['New'])
    expect(r.empty).toBe(1)
    const cells = now.map((m) => again.memberCell.get(m.id))
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        expect(Math.max(Math.abs(cells[i][0] - cells[j][0]), Math.abs(cells[i][1] - cells[j][1]))).toBeGreaterThanOrEqual(SHELTER)
      }
    }
  })
})

describe('Frankenstein’s rally range', () => {
  it('is 25 tiles, sure inside 25 less the corner tile’s offset', () => {
    expect(RALLY_TILES).toBe(25)
    expect(RALLY_SURE).toBeCloseTo(22.879, 3)
    expect(rallyReach([22.8 * TILE, 0])).toBe('sure')
    expect(rallyReach([24 * TILE, 0])).toBe('likely')
    expect(rallyReach([25 * TILE, 0])).toBe('likely')
    expect(rallyReach([25.1 * TILE, 0])).toBe('out')
  })

  it('finds the square in range at 99, and the shapes that reach past it', () => {
    const reach = (version) => {
      const counts = { sure: 0, likely: 0, out: 0 }
      for (const c of layoutHive(singles(99), { version }).memberCell.values()) counts[rallyReach(c)] += 1
      return counts
    }
    expect(reach(1)).toEqual({ sure: 99, likely: 0, out: 0 })
    // A drawn shape keeps its outline, and the gap square its gaps: no pulling in.
    expect(reach(2).out).toBeGreaterThan(0)
    expect(reach(6).out).toBeGreaterThan(0)
  })

  it.each(ROTATIONS)('offers only empty lattice places in range, at %i°', (degrees) => {
    const layout = layoutHive(singles(99), { version: 1 })
    rotateLayout(layout, degrees)
    const spots = spareInRange(layout)
    expect(spots.length).toBeGreaterThan(0)
    const taken = [...layout.memberCell.values()]
    for (const { cell, tiles, reach } of spots) {
      expect(tiles).toBeLessThanOrEqual(RALLY_TILES)
      expect(reach).not.toBe('out')
      expect(Math.max(Math.abs(cell[0]), Math.abs(cell[1]))).toBeGreaterThanOrEqual((FRANKENSTEIN + SHELTER) / 2)
      for (const t of taken) expect(Math.max(Math.abs(t[0] - cell[0]), Math.abs(t[1] - cell[1]))).toBeGreaterThanOrEqual(SHELTER)
    }
    // The same number of places whichever way the formation faces.
    const plain = spareInRange(layoutHive(singles(99), { version: 1 }))
    expect(spots.length).toBe(plain.length)
  })
})
