/*
 * The calculators' arithmetic and the words they show, against the real
 * data and the real messages. The totals are pou-rocks' calculator-ui tests,
 * which drove a browser to read them; here they are read straight off the
 * engine.
 */
import { describe, it, expect } from 'vitest'
import { translator } from '../../i18n/translate.js'
import en from '../../i18n/messages/calc/en.json'
import ko from '../../i18n/messages/calc/ko.json'
import pt from '../../i18n/messages/calc/pt.json'
import parts from './data/precision-parts.json'
import vehicle from './data/vehicle.json'
import weapons from './data/hero-weapons.json'
import stars from './data/hero-stars.json'
import equipment from './data/hero-equipment.json'
import chips from './data/vehicle-chips.json'
import { SLUGS, calculator, checkRows, newRow, stepsOf, totals, withEntity, withFrom, words } from './engine.js'

const DATA = {
  'precision-parts': parts,
  'vehicle-level': vehicle,
  'vehicle-parts': vehicle,
  'hero-weapon': weapons,
  'hero-stars': stars,
  'hero-equipment': equipment,
  'vehicle-chips': chips,
}

function wordsIn(lang, messages, dir = 'ltr') {
  const t = translator({ lang, locale: lang, messages: { calc: messages }, fallback: { calc: en } })
  return words({ t, number: (n) => new Intl.NumberFormat(lang).format(n), lang, dir })
}
const w = wordsIn('en', en)

const sheet = (slug, rows) => totals(calculator(slug), DATA[slug], rows, w)
const labels = (slug, id, list) => list.map((n) => calculator(slug).label(DATA[slug], id, n, w))
// The isolates around each end of a span only matter to Arabic.
const plain = (s) => s.replace(/[⁨⁩]/g, '')

describe('precision parts', () => {
  it('totals the reference query to 2,600', () => {
    expect(sheet('precision-parts', [
      { id: '400000', from: 55, to: 60 },
      { id: '403000', from: 35, to: 40 },
    ])).toEqual({ parts: 2600 })
  })

  it('starts part-way through an industry level', () => {
    expect(sheet('precision-parts', [{ id: '400000', from: 57, to: 60 }])).toEqual({ parts: 900 })
  })

  it('totals the full span to the building’s own total', () => {
    for (const b of parts.buildings) {
      expect(sheet('precision-parts', [{ id: b.id, from: 30, to: 80 }])).toEqual({ parts: b.total })
    }
  })

  it('offers every building level, marked with its industry level', () => {
    const { from, to } = calculator('precision-parts').levels(parts)
    expect([from[0], from.at(-1), to[0], to.at(-1)]).toEqual([30, 79, 31, 80])
    expect(labels('precision-parts', '400000', [30, 34, 35, 80])).toEqual(['Lv.30 · i0', 'Lv.34 · i0', 'Lv.35 · i1', 'Lv.80 · i10'])
  })

  it('lists both of the game’s "Mart"s, told apart', () => {
    const names = calculator('precision-parts').entities(parts, w).map((x) => x.label)
    expect(names).toContain('Mart')
    expect(names).toContain('Mart (2)')
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('vehicle level', () => {
  // dws-wiki's documented total; pou-rocks showed 23,035,065, a level late.
  it('takes 23,035,170 Gears from level 1 to 500', () => {
    expect(sheet('vehicle-level', [{ id: null, from: 1, to: 500 }])).toEqual({ gear: 23035170 })
  })

  it('charges per button press, not per level', () => {
    const spec = calculator('vehicle-level')
    const [step] = stepsOf(spec, vehicle, { id: null, from: 1, to: 500 }, w)
    expect(step.presses).toBeGreaterThan(1)
    const all = stepsOf(spec, vehicle, { id: null, from: 1, to: 500 }, w)
    expect(all.reduce((n, s) => n + s.presses, 0)).toBe(25987)
    expect(spec.extra(vehicle, [{ id: null, from: 1, to: 500 }], w)).toBe('25,987 button presses in total')
    expect(spec.extra(vehicle, [{ id: null, from: 1, to: 2 }], w)).toBe('3 button presses in total')
    // 61 presses at 845 each, not 845.
    expect(sheet('vehicle-level', [{ id: null, from: 296, to: 297 }])).toEqual({ gear: 61 * 845 })
  })

  // In game, the Lv.289 button showed 832 Gears: config 925 less a 10% buff.
  // Row 289 is 925 and row 290 is 660, so Lv.289 -> 290 is priced by row 289.
  it('prices a level by its own config row', () => {
    const step = (level) => sheet('vehicle-level', [{ id: null, from: level, to: level + 1 }]).gear
    expect(step(1)).toBe(105)
    expect(step(289) / vehicle.level.presses[288]).toBe(925)
    expect(step(290) / vehicle.level.presses[289]).toBe(660)
  })

  it('totals Lv.296 to Lv.350 to 2,951,925 Gears', () => {
    expect(sheet('vehicle-level', [{ id: null, from: 296, to: 350 }])).toEqual({ gear: 2951925 })
  })

  it('breaks a long span into 25-level steps that add up', () => {
    const steps = stepsOf(calculator('vehicle-level'), vehicle, { id: null, from: 296, to: 350 }, w)
    expect(steps.map((s) => plain(s.label))).toEqual(['Lv.296 → Lv.321', 'Lv.321 → Lv.346', 'Lv.346 → Lv.350'])
    expect(steps.reduce((n, s) => n + s.amounts.gear, 0)).toBe(2951925)
    expect(steps[2].detail).toBe(`${vehicle.level.presses.slice(345, 349).reduce((a, b) => a + b)} presses`)
  })
})

describe('vehicle parts', () => {
  it('matches the costs members checked in game', () => {
    expect(sheet('vehicle-parts', [{ id: '1', from: 24, to: 25 }])).toEqual({ ti: 460, bp: 80 })
    expect(sheet('vehicle-parts', [{ id: '1', from: 27, to: 28 }])).toEqual({ ti: 540, bp: 110 })
  })

  it('totals one part from 0 to 66, and all six together', () => {
    expect(sheet('vehicle-parts', [{ id: '3', from: 0, to: 66 }])).toEqual({ ti: 38305, bp: 14380 })
    const six = vehicle.parts.slots.map((s) => ({ id: String(s.slot), from: 0, to: 66 }))
    expect(sheet('vehicle-parts', six)).toEqual({ ti: 229830, bp: 86280 })
  })
})

describe('hero stars', () => {
  it('totals 3★ to 5★ to 800 fragments', () => {
    expect(sheet('hero-stars', [{ id: null, from: 15, to: 25 }])).toEqual({ frag: 800 })
  })

  it('starts part-way through a star', () => {
    // Ticks 13 and 14 are the last two of star 2: 15 + 50.
    expect(sheet('hero-stars', [{ id: null, from: 13, to: 15 }])).toEqual({ frag: 65 })
  })

  it('totals the whole ladder to 955', () => {
    expect(sheet('hero-stars', [{ id: null, from: 0, to: 25 }])).toEqual({ frag: 955 })
  })

  it('charges star 0’s last tick at 3, not at star 1’s 5', () => {
    expect(sheet('hero-stars', [{ id: null, from: 4, to: 5 }])).toEqual({ frag: 3 })
    expect(sheet('hero-stars', [{ id: null, from: 9, to: 10 }])).toEqual({ frag: 15 })
  })

  it('offers every tick, labelled with the game’s own "Star {0} Rank {1}"', () => {
    const { from, to } = calculator('hero-stars').levels(stars)
    expect(from).toHaveLength(25)
    expect(to).toHaveLength(25)
    expect(labels('hero-stars', null, [0, 13, 25])).toEqual(['Star 0 Rank 0', 'Star 2 Rank 3', 'Star 5 Rank 0'])
    const kw = wordsIn('ko', ko)
    expect(calculator('hero-stars').label(stars, null, 13, kw)).toBe('2스타 3급')
  })

  it('never labels ticks with the military rank names', () => {
    const all = labels('hero-stars', null, [...Array(26).keys()]).join(' ')
    expect(all).not.toMatch(/Reservist|Lieutenant|Recruit|Captain/)
  })

  it('reads the Portuguese tick with both numbers', () => {
    // The game's own string repeats {0}; ours puts the rank in the second.
    const pw = wordsIn('pt', pt)
    expect(calculator('hero-stars').label(stars, null, 13, pw)).toBe('2 Estrelas Nv.3')
  })
})

describe('hero weapon', () => {
  it('takes an owned weapon to the top for 3,905 fragments, the unlock aside', () => {
    expect(sheet('hero-weapon', [{ id: '1004', from: 0, to: 52 }])).toEqual({ frag: weapons.total - weapons.levels[0].cost })
    expect(weapons.total - weapons.levels[0].cost).toBe(3905)
  })

  it('charges 100 to break through to red', () => {
    expect(sheet('hero-weapon', [{ id: '1004', from: 25, to: 26 }])).toEqual({ frag: 100 })
  })

  it('labels every tick, red ones with the game’s "Red", and the top as max', () => {
    expect(labels('hero-weapon', '1004', [0, 7, 25, 26, 33, 51, 52])).toEqual([
      'Star 0 Rank 0',
      'Star 1 Rank 2',
      'Star 5 Rank 0',
      'Red Star 0 Rank 0',
      'Red Star 1 Rank 2',
      'Red Star 5 Rank 0',
      'Max Star Level reached',
    ])
  })

  it('names steps by star, with the exact ticks beside', () => {
    const steps = stepsOf(calculator('hero-weapon'), weapons, { id: '1004', from: 23, to: 28 }, w)
    expect(steps.map((s) => [plain(s.label), plain(s.detail), s.amounts.frag])).toEqual([
      ['4★ → 5★', 'Star 4 Rank 3 → Star 5 Rank 0', 35 + 35],
      ['5★ → Red 0★', 'Star 5 Rank 0 → Red Star 0 Rank 0', 100],
      ['Red 0★ → Red 1★', 'Red Star 0 Rank 0 → Red Star 0 Rank 2', 50 + 50],
    ])
  })
})

describe('hero equipment', () => {
  it('totals promotion 0 to 36 to the documented materials', () => {
    expect(sheet('hero-equipment', [{ id: 'promote', from: 0, to: 36 }])).toEqual({ pc: 3000, bo: 705000, dx: 160 })
  })

  it('counts promotion by level, since levels 0 to 10 share rank 0 grade 0', () => {
    const list = labels('hero-equipment', 'promote', [...Array(11).keys()])
    expect(new Set(list).size).toBe(11)
    expect(list[10]).toBe('Level 10')
  })

  it('shows rank and grade in the breakdown, each step ending where the next begins', () => {
    const steps = stepsOf(calculator('hero-equipment'), equipment, { id: 'promote', from: 0, to: 36 }, w)
    expect(steps.map((s) => plain(s.label))).toEqual([
      'Level 0 → Level 6',
      'Level 6 → Level 12',
      'Level 12 → Level 18',
      'Level 18 → Level 24',
      'Level 24 → Level 30',
      'Level 30 → Level 36',
    ])
    expect(steps[1].detail).toBe('R0g0 → R1g1')
  })

  it('levels each quality on its own curve', () => {
    for (const c of equipment.upgrade.curves) {
      expect(sheet('hero-equipment', [{ id: `upgrade-${c.quality}`, from: 0, to: c.maxLevel }])).toEqual({ bo: c.total })
    }
  })
})

describe('vehicle chips', () => {
  it('takes a chip to 10★ for 500 duplicates', () => {
    expect(sheet('vehicle-chips', [{ id: '141000', from: 0, to: 100 }])).toEqual({ dup: 500 })
    expect(sheet('vehicle-chips', [{ id: '151000', from: 0, to: 100 }])).toEqual({ dup: 500 })
  })

  it('matches the stars members checked: 1, then 2, then 3 + 3', () => {
    expect(sheet('vehicle-chips', [{ id: '141000', from: 0, to: 10 }])).toEqual({ dup: 1 })
    expect(sheet('vehicle-chips', [{ id: '141000', from: 10, to: 20 }])).toEqual({ dup: 2 })
    expect(sheet('vehicle-chips', [{ id: '141000', from: 20, to: 30 }])).toEqual({ dup: 6 })
    // Part-way: only the charge on grade 4 of 2★.
    expect(sheet('vehicle-chips', [{ id: '141000', from: 20, to: 25 }])).toEqual({ dup: 3 })
  })

  it('offers only the chips that can be starred, by grade', () => {
    const list = calculator('vehicle-chips').entities(chips, w)
    expect(list).toHaveLength(24)
    expect(new Set(list.map((x) => x.colour))).toEqual(new Set(['purple', 'orange']))
    expect(labels('vehicle-chips', '141000', [0, 13, 99, 100])).toEqual(['0★', '1★ · 3/10', '9★ · 9/10', '10★'])
  })
})

describe('a sheet', () => {
  it('opens with one row, one step long, for every calculator', () => {
    for (const slug of SLUGS) {
      const spec = calculator(slug)
      const rows = checkRows(spec, DATA[slug], undefined, w)
      expect(rows, slug).toHaveLength(1)
      const { from, to } = spec.levels(DATA[slug], rows[0].id)
      expect([rows[0].from, rows[0].to], slug).toEqual([from[0], to[0]])
    }
  })

  it('adds the next thing not yet on it', () => {
    const spec = calculator('vehicle-parts')
    const rows = [newRow(spec, vehicle, [], w)]
    rows.push(newRow(spec, vehicle, rows, w))
    expect(rows.map((r) => r.id)).toEqual(['1', '2'])
  })

  it('keeps stored rows only where they still fit the data', () => {
    const spec = calculator('precision-parts')
    const rows = checkRows(spec, parts, [
      { id: '400000', from: 57, to: 60 },
      { id: '400000', from: 30, to: 31 },
      { id: 'gone', from: 30, to: 31 },
      { id: '403000', from: 12, to: 99 },
    ], w)
    expect(rows).toEqual([{ id: '400000', from: 57, to: 60 }, { id: '403000', from: 30, to: 31 }])
    expect(checkRows(calculator('hero-stars'), stars, [{ id: 'x', from: 3, to: 9 }, { id: null, from: 1, to: 2 }], w))
      .toEqual([{ id: null, from: 3, to: 9 }])
  })

  it('moves the target past a raised start, and keeps levels across a switch', () => {
    const spec = calculator('hero-equipment')
    expect(withFrom(spec, equipment, { id: 'promote', from: 0, to: 4 }, 10)).toEqual({ id: 'promote', from: 10, to: 11 })
    expect(withEntity(spec, equipment, { id: 'upgrade-5', from: 70, to: 90 }, 'upgrade-1')).toEqual({ id: 'upgrade-1', from: 0, to: 20 })
    expect(withEntity(spec, equipment, { id: 'upgrade-5', from: 5, to: 10 }, 'upgrade-2')).toEqual({ id: 'upgrade-2', from: 5, to: 10 })
  })

  it('writes a span the way the reader reads', () => {
    expect(wordsIn('ar', en, 'rtl').span('a', 'b')).toBe('⁨a⁩ ← ⁨b⁩')
    expect(w.span('a', 'b')).toBe('⁨a⁩ → ⁨b⁩')
  })
})
