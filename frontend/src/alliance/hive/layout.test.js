import { describe, it, expect } from 'vitest'
import roster from './fixtures/roster.csv?raw'
// Made by pou-rocks.github.io's own engine (chunk 57, module 59506) from
// roster.csv, so these tests hold the port to that site's results.
import expected from './fixtures/expected-layouts.json'
import { FRANKENSTEIN, SHELTER, VERSIONS, layoutHive } from './layout.js'
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

    it("matches pou-rocks' own layout", () => {
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
