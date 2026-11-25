import { describe, it, expect } from 'vitest'
import { FRANKENSTEIN, SHELTER, TILE, applySwaps, fitsAt, layoutHive, memberAt, snapToTile } from './layout.js'

const singles = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: i, name: `M${i}`, level: 8 - (i % 8), bgbCp: 1000 * (count - i), cp: 5000 * (count - i), outermost: false, group: null,
  }))

describe('swapping by hand', () => {
  const members = singles(98)

  it('trades two cells and leaves everyone else where they were', () => {
    const layout = layoutHive(members, { version: 1 })
    const before = new Map(layout.memberCell)
    applySwaps(layout.memberCell, [[3, 40]])
    expect(layout.memberCell.get(3)).toEqual(before.get(40))
    expect(layout.memberCell.get(40)).toEqual(before.get(3))
    for (const m of members) if (m.id !== 3 && m.id !== 40) expect(layout.memberCell.get(m.id)).toBe(before.get(m.id))
  })

  it('applies swaps in order, so a chain moves three people round', () => {
    const layout = layoutHive(members, { version: 1 })
    const before = new Map(layout.memberCell)
    applySwaps(layout.memberCell, [[1, 2], [2, 3]])
    expect(layout.memberCell.get(1)).toEqual(before.get(2))
    expect(layout.memberCell.get(2)).toEqual(before.get(3))
    expect(layout.memberCell.get(3)).toEqual(before.get(1))
  })

  it('undoes itself when the same pair is traded twice', () => {
    const layout = layoutHive(members, { version: 2 })
    const before = new Map(layout.memberCell)
    applySwaps(layout.memberCell, [[5, 60], [5, 60]])
    for (const m of members) expect(layout.memberCell.get(m.id)).toEqual(before.get(m.id))
  })

  it('skips a pair naming someone not on the map, and a member traded with themself', () => {
    const layout = layoutHive(members, { version: 1 })
    const before = new Map(layout.memberCell)
    applySwaps(layout.memberCell, [[5, 999], [7, 7]])
    for (const m of members) expect(layout.memberCell.get(m.id)).toEqual(before.get(m.id))
    expect(applySwaps(layout.memberCell, undefined)).toBe(layout.memberCell)
  })
})

describe('memberAt', () => {
  const layout = layoutHive(singles(98), { version: 1 })

  it('finds the member whose shelter covers a point, edge to edge', () => {
    for (const [id, cell] of layout.memberCell) {
      const [x, y] = layout.toPx(...cell)
      expect(memberAt(layout, x, y)).toBe(id)
      expect(memberAt(layout, x - SHELTER / 2 + 1, y + SHELTER / 2 - 1)).toBe(id)
    }
  })

  it('finds no one on Frankenstein, in a lane or off the formation', () => {
    const [fx, fy] = layout.toPx(0, 0)
    expect(memberAt(layout, fx, fy)).toBe(null)
    expect(memberAt(layout, fx, fy - 6 * SHELTER)).toBe(null) // the vertical lane
    expect(memberAt(layout, 2, 2)).toBe(null)
  })

  it('follows a swap', () => {
    const swapped = layoutHive(singles(98), { version: 1 })
    const [x, y] = swapped.toPx(...swapped.memberCell.get(10))
    applySwaps(swapped.memberCell, [[10, 20]])
    expect(memberAt(swapped, x, y)).toBe(20)
  })
})

describe('moving by hand', () => {
  const members = singles(30)
  const outside = (layout) => {
    const far = Math.max(...[...layout.memberCell.values()].map((c) => Math.abs(c[0])))
    return [far + 2 * SHELTER, 0.5 * TILE]
  }

  it('snaps a shelter’s middle to a tile’s middle, where the lattice keeps it', () => {
    expect(snapToTile(0, 0)).toEqual([0.5 * TILE, 0.5 * TILE])
    expect(snapToTile(2.4 * TILE, -2.6 * TILE)).toEqual([2.5 * TILE, -2.5 * TILE])
    const layout = layoutHive(members, { version: 1 })
    for (const c of layout.memberCell.values()) expect(snapToTile(...c)).toEqual(c)
  })

  it('fits a shelter only clear of the others and of Frankenstein', () => {
    const layout = layoutHive(members, { version: 1 })
    const [x0, y0] = layout.memberCell.get(0)
    expect(fitsAt(layout.memberCell, 0, [x0, y0])).toBe(true)
    expect(fitsAt(layout.memberCell, 1, [x0 + TILE, y0])).toBe(false)
    expect(fitsAt(layout.memberCell, 1, [0.5 * TILE, 0.5 * TILE])).toBe(false)
    expect(fitsAt(layout.memberCell, 1, [(FRANKENSTEIN + SHELTER) / 2 - TILE / 2, 0.5 * TILE])).toBe(false)
    expect(fitsAt(layout.memberCell, 1, outside(layout))).toBe(true)
  })

  it('moves one shelter to empty ground and leaves the rest', () => {
    const layout = layoutHive(members, { version: 1 })
    const before = new Map(layout.memberCell)
    const to = outside(layout)
    applySwaps(layout.memberCell, [{ move: 4, to }])
    expect(layout.memberCell.get(4)).toEqual(to)
    for (const m of members) if (m.id !== 4) expect(layout.memberCell.get(m.id)).toBe(before.get(m.id))
  })

  it('mixes swaps and moves in order, and skips a move that no longer fits', () => {
    const layout = layoutHive(members, { version: 1 })
    const before = new Map(layout.memberCell)
    const to = outside(layout)
    applySwaps(layout.memberCell, [{ move: 4, to }, [4, 9], { move: 2, to }])
    expect(layout.memberCell.get(9)).toEqual(to)
    expect(layout.memberCell.get(4)).toEqual(before.get(9))
    expect(layout.memberCell.get(2)).toEqual(before.get(2))  // 9 is there now
  })
})
