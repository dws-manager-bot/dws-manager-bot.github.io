/*
 * The seven calculators, as plain functions of the game data. Ported from
 * pou-rocks.github.io's calculator/app.js; the data files are its, unchanged.
 *
 * A row is one thing being raised (`id`, or null where there is only one)
 * between two positions on its ladder, `from` and `to`. A spec turns a row
 * into steps, each with what it costs in every material. Words come through
 * `w` (see `words`), so the arithmetic reads the same in every language.
 */

export const SLUGS = [
  'precision-parts',
  'vehicle-level',
  'vehicle-parts',
  'hero-weapon',
  'hero-stars',
  'hero-equipment',
  'vehicle-chips',
]

const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)

function sum(list, from, to) {
  let n = 0
  for (let i = from; i < to; i += 1) n += list[i] || 0
  return n
}

/** The reader's words, as the specs need them. */
export function words({ t, number = String, lang = 'en', dir = 'ltr' }) {
  // The data files call Simplified Chinese `zh`, as pou-rocks did.
  const key = lang === 'zh-Hans' ? 'zh' : lang
  const arrow = dir === 'rtl' ? '←' : '→'
  return {
    t,
    number,
    name: (names, fallback = '') => (names && (names[key] || names.en)) || fallback,
    lv: (level) => t('calc.lv', { level }),
    tick: (star, rank) => t('calc.tick', { star, rank }),
    // Each end is isolated, so a Latin "Lv.30" keeps its place in Arabic.
    span: (a, b) => `⁨${a}⁩ ${arrow} ⁨${b}⁩`,
  }
}

// Weapons climb five stars, break through to red, then climb five red stars.
function weaponLabel(d, level, w) {
  const red = d.redLevel
  if (level < red) return w.tick(Math.floor(level / 5), level % 5)
  const rel = level - red
  if (rel > 25) return w.t('calc.max')
  return `${w.t('calc.red')} ${w.tick(Math.floor(rel / 5), rel % 5)}`
}

function weaponStar(d, level, w) {
  if (level < d.redLevel) return `${Math.floor(level / 5)}★`
  return `${w.t('calc.red')} ${Math.floor((level - d.redLevel) / 5)}★`
}

const curve = (d, id) => d.upgrade.curves.find((c) => c.quality === Number(id.split('-')[1]))
const equipLabel = (id, level, w) => (id === 'promote' ? `${w.t('calc.level')} ${level}` : w.lv(level))

const SPECS = {
  'precision-parts': {
    data: 'precision-parts',
    title: 'precision_parts',
    entityWord: 'calc.building',
    materials: (d, w) => [{ key: 'parts', name: w.name(d.material.names) }],
    entities: (d, w) =>
      d.buildings.map((b) => ({ value: b.id, label: w.name(b.names, b.id), detail: w.name(b.descriptions) })),
    levels: () => ({ from: range(30, 79), to: range(31, 80) }),
    // Five building levels make one industry level, from Lv.30.
    label: (d, id, level, w) => `${w.lv(level)} · i${Math.floor((level - 30) / 5)}`,
    cost(d, id, from, to, w) {
      const building = d.buildings.find((b) => b.id === id)
      const steps = []
      building.bands.forEach((band, i) => {
        const lo = 30 + i * 5
        const a = Math.max(lo, from)
        const z = Math.min(lo + 5, to)
        if (z <= a) return
        steps.push({
          label: w.span(w.lv(a), w.lv(z)),
          detail: `i${i}→i${i + 1} · ${w.t('calc.per_level', { amount: w.number(band.perLevel) })}`,
          amounts: { parts: band.perLevel * (z - a) },
        })
      })
      return steps
    },
  },

  'vehicle-level': {
    data: 'vehicle',
    title: 'vehicle_level',
    subtitle: 'calc.per_press',
    materials: (d, w) => [{ key: 'gear', name: w.name(d.materials.gear) }],
    entities: null,
    levels: () => ({ from: range(1, 499), to: range(2, 500) }),
    label: (d, id, level, w) => w.lv(level),
    // The config row for level N, at index N - 1, is what N -> N+1 costs:
    // its Gears are charged per button press, and a level takes many.
    // pou-rocks read it one level late; Lv.289 shows 925 in game, not 660.
    cost(d, id, from, to, w) {
      const { cumulative, presses } = d.level
      const through = (level) => (level >= 1 ? cumulative[level - 1] : 0)
      const steps = []
      for (let a = from; a < to; a += 25) {
        const b = Math.min(a + 25, to)
        const pressed = sum(presses, a - 1, b - 1)
        steps.push({
          label: w.span(w.lv(a), w.lv(b)),
          detail: w.t('calc.presses', { count: pressed, amount: w.number(pressed) }),
          amounts: { gear: through(b - 1) - through(a - 1) },
          presses: pressed,
        })
      }
      return steps
    },
    extra(d, rows, w) {
      const pressed = rows.reduce((n, r) => n + sum(d.level.presses, r.from - 1, r.to - 1), 0)
      return pressed ? w.t('calc.presses_total', { count: pressed, amount: w.number(pressed) }) : ''
    },
  },

  'vehicle-parts': {
    data: 'vehicle',
    title: 'vehicle_parts',
    entityWord: 'calc.part',
    materials: (d, w) => [
      { key: 'ti', name: w.name(d.materials.titanium) },
      { key: 'bp', name: w.name(d.materials.blueprint) },
    ],
    entities: (d, w) => d.parts.slots.map((s) => ({ value: String(s.slot), label: w.name(s.names), detail: '' })),
    levels: () => ({ from: range(0, 65), to: range(1, 66) }),
    label: (d, id, level, w) => w.lv(level),
    // Every part shares one curve; row N is what N -> N+1 costs.
    cost(d, id, from, to, w) {
      const { titanium, blueprint } = d.parts
      const steps = []
      for (let a = from; a < to; a += 10) {
        const b = Math.min(a + 10, to)
        steps.push({
          label: w.span(w.lv(a), w.lv(b)),
          detail: '',
          amounts: { ti: sum(titanium, a, b), bp: sum(blueprint, a, b) },
        })
      }
      return steps
    },
  },

  'hero-weapon': {
    data: 'hero-weapons',
    title: 'hero_weapon',
    entityWord: 'calc.select_weapon',
    materials: (d, w) => [{ key: 'frag', name: w.t('calc.fragment') }],
    // The data names each weapon's hero only in English, as "Tristan Exclusive".
    entities: (d, w) =>
      d.weapons.map((x) => ({ value: x.group, label: w.name(x.names, x.group), detail: x.hero.replace(/ Exclusive$/, '') })),
    levels: () => ({ from: range(0, 51), to: range(1, 52) }),
    label: (d, id, level, w) => weaponLabel(d, level, w),
    // A level's cost is what reaching it takes; level 0 is the unlock, which
    // no span counts, since the ladder starts at a weapon already owned.
    cost(d, id, from, to, w) {
      const cost = new Map(d.levels.map((x) => [x.level, x.cost]))
      const steps = []
      for (const band of d.bands) {
        const [lo, hi] = String(band.levels).split('-').map(Number)
        if (hi <= from || lo > to) continue
        const a = Math.max(lo, from + 1)
        const z = Math.min(hi, to)
        let n = 0
        for (let level = a; level <= z; level += 1) n += cost.get(level) || 0
        if (!n) continue
        steps.push({
          label: w.span(weaponStar(d, lo - 1, w), weaponStar(d, hi, w)),
          detail: w.span(weaponLabel(d, a - 1, w), weaponLabel(d, z, w)),
          amounts: { frag: n },
        })
      }
      return steps
    },
  },

  'hero-stars': {
    data: 'hero-stars',
    title: 'hero_stars',
    materials: (d, w) => [{ key: 'frag', name: w.t('calc.fragment') }],
    entities: null,
    // Every tick is offered: members are usually part-way through a star.
    levels: () => ({ from: range(0, 24), to: range(1, 25) }),
    label: (d, id, tick, w) => w.tick(Math.floor(tick / 5), tick % 5),
    cost(d, id, from, to, w) {
      const steps = []
      d.bands.forEach((band, star) => {
        const lo = star * 5
        const a = Math.max(lo, from)
        const z = Math.min(lo + 5, to)
        if (z <= a) return
        steps.push({
          label: w.span(`${star}★`, `${star + 1}★`),
          detail: w.span(w.tick(Math.floor(a / 5), a % 5), w.tick(Math.floor(z / 5), z % 5)),
          amounts: { frag: sum(band.tickCosts, a - lo, z - lo) },
        })
      })
      return steps
    },
  },

  'hero-equipment': {
    data: 'hero-equipment',
    title: 'hero_equipment',
    entityWord: 'calc.titles.hero_equipment',
    materials: (d, w) => [
      { key: 'pc', name: w.name(d.materials.powerCore) },
      { key: 'bo', name: w.name(d.materials.boostOre) },
      { key: 'dx', name: w.name(d.materials.dxBlueprint) },
    ],
    entities: (d, w) => [
      { value: 'promote', label: w.t('calc.equip_breakthrough'), detail: '' },
      ...d.upgrade.curves.map((c) => ({
        value: `upgrade-${c.quality}`,
        label: `D${c.quality} · ${w.t('calc.level')} 0–${c.maxLevel}`,
        detail: '',
      })),
    ],
    // Promotion levels 0-10 are all rank 0 grade 0, so the selector counts
    // levels; rank and grade show in the breakdown.
    levels(d, id) {
      if (id === 'promote') return { from: range(0, 35), to: range(1, 36) }
      const c = curve(d, id)
      return { from: range(0, c.maxLevel - 1), to: range(1, c.maxLevel) }
    },
    label: (d, id, level, w) => equipLabel(id, level, w),
    cost(d, id, from, to, w) {
      if (id !== 'promote') {
        const q = Number(id.split('-')[1])
        return [{
          label: w.span(w.lv(from), w.lv(to)),
          detail: `D${q}`,
          amounts: { bo: sum(curve(d, id).costPerLevel, from, to) },
        }]
      }
      // Row N is what N -> N+1 costs; the last row is the top, at no cost.
      const rows = d.promote.rows
      const at = (level) => rows.find((r) => r.level === level)
      const charged = rows.filter((r) => r.level >= from && r.level < to)
      const steps = []
      for (let i = 0; i < charged.length; i += 6) {
        const part = charged.slice(i, i + 6)
        const a = part[0]
        const z = at(part[part.length - 1].level + 1)
        const total = (k) => part.reduce((n, r) => n + r[k], 0)
        steps.push({
          label: w.span(equipLabel(id, a.level, w), equipLabel(id, z.level, w)),
          detail: `R${a.rank}g${a.grade} → R${z.rank}g${z.grade}`,
          amounts: { pc: total('powerCore'), bo: total('boostOre'), dx: total('dxBlueprint') },
        })
      }
      return steps
    },
  },

  'vehicle-chips': {
    data: 'vehicle-chips',
    title: 'vehicle_chips',
    entityWord: 'calc.chip',
    materials: (d, w) => [{ key: 'dup', name: w.t('calc.chip') }],
    // Green and blue chips cannot be starred.
    entities: (d, w) =>
      d.chips
        .filter((c) => c.colour === 'purple' || c.colour === 'orange')
        .map((c) => ({ value: c.id, label: w.name(c.names, c.id), detail: w.t(`calc.${c.colour}`), colour: c.colour })),
    levels: (d) => {
      const per = d.gradesPerStar
      return { from: range(0, per * d.maxStar - 1), to: range(1, per * d.maxStar) }
    },
    label(d, id, position) {
      const per = d.gradesPerStar
      if (position >= per * d.maxStar) return `${d.maxStar}★`
      const star = Math.floor(position / per)
      const grade = position % per
      return grade ? `${star}★ · ${grade}/${per}` : `${star}★`
    },
    // Duplicates are charged on particular grades within a star, not evenly.
    cost(d, id, from, to, w) {
      const per = d.gradesPerStar
      const chip = d.chips.find((c) => c.id === id)
      const ladder = d.ladders.find((l) => l.colour === chip?.colour) ?? d.ladders[0]
      const steps = []
      for (const s of ladder.stars) {
        let n = 0
        for (const charge of s.charges ?? []) {
          const position = s.from * per + charge.grade
          if (position >= from && position < to) n += charge.chips
        }
        if (!n) continue
        steps.push({
          label: w.span(`${s.from}★`, `${s.to}★`),
          detail: s.exp ? w.t('calc.chip_exp', { amount: w.number(s.exp) }) : '',
          amounts: { dup: n },
        })
      }
      return steps
    },
  },
}

export const calculator = (slug) => (SPECS[slug] ? { slug, ...SPECS[slug] } : null)

/** A new row: the first thing not already on the sheet, at its first step. */
export function newRow(spec, d, rows, w) {
  let id = null
  const list = spec.entities?.(d, w)
  if (list) {
    const taken = new Set(rows.map((r) => r.id))
    id = (list.find((x) => !taken.has(x.value)) ?? list[0]).value
  }
  const { from, to } = spec.levels(d, id)
  return { id, from: from[0], to: to[0] }
}

/** Another thing on the same row keeps its levels where the new ladder has them. */
export function withEntity(spec, d, row, id) {
  const { from, to } = spec.levels(d, id)
  const next = { ...row, id }
  if (!from.includes(next.from)) next.from = from[0]
  if (!to.includes(next.to) || next.to <= next.from) next.to = to[to.length - 1]
  return next
}

/** Raising the start past the target moves the target to the next step. */
export function withFrom(spec, d, row, value) {
  const { to } = spec.levels(d, row.id)
  const next = { ...row, from: value }
  if (next.to <= next.from) next.to = to.find((x) => x > next.from)
  return next
}

/** Rows read back from storage, kept only where they still fit the data. */
export function checkRows(spec, d, rows, w) {
  const list = spec.entities?.(d, w)
  const ids = list && new Set(list.map((x) => x.value))
  const seen = new Set()
  const kept = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === 'object' && (ids ? ids.has(r.id) : true))
    // A thing is on the sheet once.
    .filter((r) => !ids || (!seen.has(r.id) && seen.add(r.id)))
    .map((r) => {
      const id = ids ? r.id : null
      const { from, to } = spec.levels(d, id)
      const row = { id, from: r.from, to: r.to }
      if (!from.includes(row.from)) row.from = from[0]
      if (!to.includes(row.to) || row.to <= row.from) row.to = to.find((x) => x > row.from) ?? to[to.length - 1]
      return row
    })
  // A calculator with nothing to choose has one row.
  const fit = ids ? kept : kept.slice(0, 1)
  return fit.length ? fit : [newRow(spec, d, [], w)]
}

export const stepsOf = (spec, d, row, w) => spec.cost(d, row.id, row.from, row.to, w) || []

export function addUp(steps) {
  const out = {}
  for (const s of steps) for (const [k, n] of Object.entries(s.amounts)) out[k] = (out[k] || 0) + n
  return out
}

export const totals = (spec, d, rows, w) => addUp(rows.flatMap((r) => stepsOf(spec, d, r, w)))
