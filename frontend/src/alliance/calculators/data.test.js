/*
 * The game data, as pou-rocks extracted it from build 1.250.661, still adds
 * up to the totals dws-wiki documented. Ported from pou-rocks'
 * calculator-data.test.mjs and calculator.test.mjs.
 */
import { describe, it, expect } from 'vitest'
import parts from './data/precision-parts.json'
import vehicle from './data/vehicle.json'
import weapons from './data/hero-weapons.json'
import stars from './data/hero-stars.json'
import equipment from './data/hero-equipment.json'
import chips from './data/vehicle-chips.json'

// The data's language keys: pou-rocks calls Simplified Chinese `zh`.
const LOCALES = ['en', 'ko', 'ja', 'zh', 'zh-Hant', 'ar', 'id', 'th', 'vi', 'tr', 'de', 'fr', 'es', 'pt', 'it', 'ru']
const total = (list) => list.reduce((a, b) => a + b, 0)

describe('precision parts', () => {
  it('covers all 16 part-consuming buildings, ten industry bands each', () => {
    expect(parts.buildings).toHaveLength(16)
    expect(parts.buildings.filter((b) => b.bands.length !== 10).map((b) => b.id)).toEqual([])
  })

  it('reconciles with the documented grand total of 135,000', () => {
    expect(total(parts.buildings.map((b) => b.total))).toBe(135000)
    expect(parts.grandTotal).toBe(135000)
  })

  it('charges each band the same per level, five levels a band', () => {
    const bad = parts.buildings.flatMap((b) =>
      b.bands.filter((band) => band.perLevel * 5 !== band.total).map((band) => `${b.id} band ${band.band}`),
    )
    expect(bad).toEqual([])
  })

  it('names every building in every language, never two alike', () => {
    const gaps = parts.buildings.flatMap((b) => LOCALES.filter((l) => !b.names?.[l]).map((l) => `${b.id}/${l}`))
    expect(gaps).toEqual([])
    const clashes = LOCALES.flatMap((l) => {
      const names = parts.buildings.map((b) => b.names[l])
      return names.filter((n, i) => names.indexOf(n) !== i).map((n) => `${l}: ${n}`)
    })
    expect(clashes).toEqual([])
  })

  // 774000 and 893000 share name id 100292: the game calls both "Mart".
  it('tells the two buildings the game names "Mart" apart', () => {
    const mart = parts.buildings.find((b) => b.id === '774000')
    const second = parts.buildings.find((b) => b.id === '893000')
    expect(mart.names.en).toBe('Mart')
    for (const l of LOCALES) expect(second.names[l]).toBe(`${mart.names[l]} (2)`)
  })
})

describe('vehicle', () => {
  it('levels 1 to 500 for 23,035,170 Gears, charged per press', () => {
    const level = vehicle.level
    expect(level.cumulative).toHaveLength(500)
    expect(level.cumulative[499]).toBe(23035170)
    expect(level.total).toBe(23035170)
    expect(level.costIsPerPress).toBe(true)
    // The bare sum of per-press costs, 65 times too low, is not the total.
    expect(level.naiveSum).toBe(354130)
    expect(total(level.gearsPerPress)).toBe(level.naiveSum)
  })

  it('costs presses times the per-press price at every level', () => {
    const { cumulative, gearsPerPress, presses } = vehicle.level
    const bad = cumulative
      .map((c, i) => [i + 1, c - (i ? cumulative[i - 1] : 0) === gearsPerPress[i] * presses[i]])
      .filter(([, ok]) => !ok)
    expect(bad).toEqual([])
  })

  it('has nothing to charge at the top level', () => {
    expect(vehicle.level.gearsPerPress[499]).toBe(0)
    expect(vehicle.level.presses[499]).toBe(0)
  })

  it('reconciles its parts across all six slots', () => {
    const p = vehicle.parts
    expect(p.slots).toHaveLength(6)
    expect(total(p.titanium.slice(0, 66)) * 6).toBe(p.allSlotsTotals.titanium_alloy)
    expect(total(p.blueprint.slice(0, 66)) * 6).toBe(p.allSlotsTotals.design_blueprint)
  })
})

describe('hero weapons', () => {
  it('climbs 18 weapons, 53 levels, to 3,915 fragments', () => {
    expect(weapons.weapons).toHaveLength(18)
    expect(weapons.levels).toHaveLength(53)
    expect(weapons.levels[52].cumulative).toBe(3915)
    expect(weapons.total).toBe(3915)
  })
})

describe('hero stars', () => {
  it('reconciles to 955 fragments over five stars', () => {
    expect(stars.bands).toHaveLength(5)
    expect(total(stars.bands.map((b) => b.total))).toBe(955)
    expect(stars.bands[4].cumulative).toBe(955)
    expect(stars.caveat).toBeTruthy()
  })

  it('charges the last tick of a star at the next star’s rate, except star 0', () => {
    const b = stars.bands
    for (let i = 1; i < b.length - 1; i += 1) expect(b[i].tickCosts[4], `star ${i}`).toBe(b[i + 1].tickCosts[0])
    // Star 0 ends at 3 while star 1 starts at 5. If this ever matches,
    // dws-wiki's rule has no exception and should say so.
    expect(b[0].tickCosts[4]).not.toBe(b[1].tickCosts[0])
  })
})

describe('hero equipment', () => {
  it('reconciles promotion and levelling', () => {
    const rows = equipment.promote.rows
    expect(rows).toHaveLength(37)
    expect(total(rows.map((r) => r.powerCore))).toBe(equipment.promote.totals.power_core)
    expect(total(rows.map((r) => r.boostOre))).toBe(equipment.promote.totals.boost_ore)
    expect(total(rows.map((r) => r.dxBlueprint))).toBe(equipment.promote.totals.dx_blueprint)
    // Row 36 is the top, with nothing left to pay.
    expect(rows[36].powerCore).toBe(0)
    expect(equipment.upgrade.curves).toHaveLength(5)
    for (const c of equipment.upgrade.curves) expect(total(c.costPerLevel), `quality ${c.quality}`).toBe(c.total)
  })

  it('has promotion levels 0 to 10 all at rank 0 grade 0', () => {
    const early = equipment.promote.rows.filter((r) => r.level <= 10)
    expect(early).toHaveLength(11)
    expect(early.every((r) => r.rank === 0 && r.grade === 0)).toBe(true)
  })
})

describe('vehicle chips', () => {
  it('takes every ladder to 10 stars at 500 duplicates', () => {
    expect(chips.chips).toHaveLength(32)
    expect(chips.ladders.length).toBeGreaterThanOrEqual(2)
    for (const l of chips.ladders) {
      expect(l.stars).toHaveLength(10)
      expect(l.stars[9].cumulative, `${l.colour} ladder`).toBe(500)
    }
  })
})

it('names every weapon, chip and vehicle part in every language', () => {
  const gaps = []
  const check = (kind, list) => {
    for (const e of list) for (const l of LOCALES) if (!e.names?.[l]) gaps.push(`${kind}/${e.id || e.group || e.slot}/${l}`)
  }
  check('weapon', weapons.weapons)
  check('chip', chips.chips)
  check('part', vehicle.parts.slots)
  expect(gaps).toEqual([])
})
