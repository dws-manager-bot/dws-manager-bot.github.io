import { describe, expect, it } from 'vitest'
import { TEMPLE_IV, blocked, boxOf, cleanPlacements, gapToZone, overlaps, sideOf, viewOf } from './geometry.js'
import { frameOf } from './draw.js'

const t = TEMPLE_IV
const view = viewOf(t, 15)

describe('the temple ground', () => {
  it('is the zone read in game: X414–434, Y913–933', () => {
    expect(t.zone).toEqual({ x0: 414, x1: 434, y0: 913, y1: 933 })
  })

  it('keeps both turrets inside the zone, against its top and bottom edges', () => {
    const [t1, t2] = t.turrets
    for (const tur of t.turrets) {
      expect(tur.box.x1 - tur.box.x0 + 1).toBe(3)
      expect(tur.box.y1 - tur.box.y0 + 1).toBe(3)
      expect(overlaps(tur.box, t.zone)).toBe(true)
      expect(tur.box.y0 >= t.zone.y0 && tur.box.y1 <= t.zone.y1).toBe(true)
    }
    expect(t1.box.y1).toBe(t.zone.y1)
    expect(t2.box.y0).toBe(t.zone.y0)
  })

  it('centers the temple in the zone, with both turrets in line with it', () => {
    const z = t.zone
    expect(t.temple.x).toBe((z.x0 + z.x1) / 2)
    expect(t.temple.y).toBe((z.y0 + z.y1) / 2)
    for (const tur of t.turrets) expect((tur.box.x0 + tur.box.x1) / 2).toBe(t.temple.x)
  })

  it('names a shelter by its center tile', () => {
    expect(boxOf(420, 940)).toEqual({ x0: 419, x1: 421, y0: 939, y1: 941 })
  })
})

describe('where a shelter may stand', () => {
  it('never inside the zone, not even one tile of it', () => {
    expect(blocked(t, view, [], 'a', 420, 935)).toBeNull()        // y 934–936: touches the edge from outside
    expect(blocked(t, view, [], 'a', 420, 934)).toMatch(/temple zone/)
    expect(blocked(t, view, [], 'a', 412, 920)).toBeNull()        // x 411–413
    expect(blocked(t, view, [], 'a', 413, 920)).toMatch(/temple zone/)
  })

  it('not on another shelter, but a shelter never blocks itself', () => {
    const others = [{ key: 'b', name: 'Bee', x: 420, y: 936 }]
    expect(blocked(t, view, others, 'a', 422, 937)).toBe('On Bee')
    expect(blocked(t, view, others, 'a', 423, 936)).toBeNull()
    expect(blocked(t, view, others, 'b', 421, 936)).toBeNull()
  })

  it('only on the ground shown', () => {
    expect(blocked(t, view, [], 'a', view.x0 + 1, 940)).toBeNull()
    expect(blocked(t, view, [], 'a', view.x0, 940)).toBe('Off the map')
  })

  it('counts the gap to the zone and the side it is on', () => {
    expect(gapToZone(t, 420, 935)).toBe(0)
    expect(gapToZone(t, 420, 938)).toBe(3)
    expect(sideOf(t, 420, 935)).toBe('top')
    expect(sideOf(t, 420, 911)).toBe('bottom')
    expect(sideOf(t, 412, 920)).toBe('left')
    expect(sideOf(t, 436, 920)).toBe('right')
    expect(sideOf(t, 412, 935)).toBeNull()                         // past a corner
  })

  it('drops pasted placements that overlap, keeping the first', () => {
    const kept = cleanPlacements(t, view, [
      { key: 'a', x: 420, y: 935 },
      { key: 'b', x: 421, y: 936 },     // on a
      { key: 'c', x: 425, y: 925 },     // in the zone
      { key: 'a', x: 430, y: 940 },     // a again
      { key: 'd', x: 423, y: 935 },
    ])
    expect(kept.map((p) => p.key)).toEqual(['a', 'd'])
  })
})

describe('the drawing', () => {
  it('puts higher Y further up, and reads a tile back from its pixel', () => {
    const f = frameOf(view, 20)
    expect(f.py(933)).toBeLessThan(f.py(913))
    expect(f.px(434)).toBeGreaterThan(f.px(414))
    expect(f.tileAt(f.px(420) + 10, f.py(940) + 10)).toEqual({ x: 420, y: 940 })
    expect(f.tileAt(0, 0)).toBeNull()
  })
})
