/*
 * Where every member's shelter goes around Frankenstein.
 *
 * A port of pou-rocks.github.io's hive engine, which grew out of a Python
 * script (draw_hive_map.py); its results are kept exactly, ties included, so a
 * map drawn here is the map the alliance already knows. Coordinates are canvas
 * pixels at 30 px a tile, centered on Frankenstein, with y growing downward.
 *
 * The idea: lay out more candidate cells than needed in the chosen shape, keep
 * the innermost N, rank each kept cell by how exposed it is, and rank members
 * by how much they belong on the outside (asked for it, then BGB CP, Industry
 * level, total CP). Stick groups are placed as touching clusters; spreading
 * pushes the strongest groups and members out toward separate corners.
 */

export const TILE = 30
export const SHELTER = 3 * TILE
export const FRANKENSTEIN = 4 * TILE
const LANE = 2 * TILE
const HALF_GRID = 9

export const MARGIN = 40
export const TITLE_HEIGHT = 72
export const LEGEND_HEIGHT = 64

export const VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const SHAPE_KEYS = {
  1: 'square', 2: 'gap_square', 3: 'diamond', 4: 'circle', 5: 'heart',
  6: 'cat_face', 7: 'middle_finger', 8: 'skull', 9: 'snowflake',
}

const GAP_SQUARE = 2
const DIAMOND = 3
const CIRCLE = 4

// Two cells count as touching within these distances, center to center.
const TOUCHING = (1.5 * SHELTER) ** 2
const EDGE_TO_EDGE = (1.2 * SHELTER) ** 2

/* pou-rocks keeps every shelter within 24 tiles of Frankenstein's center: a
   corner of a plain lattice that reaches past it moves into the spare slots
   of the rows above the formation instead. */
const REACH = 24
const LOWEST_ROW = -1800

const round1 = (v) => Math.round(v * 10) / 10
const keyOf = (c) => `${round1(c[0])},${round1(c[1])}`
const distance2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
const radius2 = (c) => c[0] ** 2 + c[1] ** 2
const chebyshev = (c) => Math.max(Math.abs(c[0]), Math.abs(c[1]))
const manhattan = (c) => Math.abs(c[0]) + Math.abs(c[1])
const tilesOut = (c) => Math.hypot(c[0], c[1]) / TILE + 1.5

/** Arrays compared element by element, ascending. */
export function compareTuples(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  return 0
}

/* ---------- the drawn shapes ----------
   Each takes a point scaled so the shape spans roughly -1..1, y pointing up,
   and says whether it is inside. */

const HEART = (() => {
  const points = Array.from({ length: 144 }, (_, i) => (2 * i * Math.PI) / 144).map((t) => [
    10 * Math.sin(t) ** 3,
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
  ])
  const middle = points.reduce((sum, p) => sum + p[1], 0) / points.length
  return points.map(([x, y]) => [x, y - middle])
})()

function inPolygon(x, y, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inTriangle(x, y, a, b, c) {
  const d1 = (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1])
  const d2 = (x - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1])
  const d3 = (x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])
  const negative = d1 < 0 || d2 < 0 || d3 < 0
  const positive = d1 > 0 || d2 > 0 || d3 > 0
  return !(negative && positive)
}

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r

const SHAPES = {
  5: (x, y) => inPolygon(x, y, HEART),
  6: (x, y) =>
    x * x + y * y <= 1 ||
    inTriangle(x, y, [-0.8, 0.25], [-1, 1.3], [-0.15, 0.8]) ||
    inTriangle(x, y, [0.8, 0.25], [1, 1.3], [0.15, 0.8]),
  7: (x, y) =>
    (x >= -0.25 && x <= 0.25 && y >= 0.05 && y <= 1) || // the finger
    inCircle(x, y, 0, 1, 0.25) || // its tip
    (x >= -0.72 && x <= 0.72 && y >= -0.95 && y <= 0.12) || // the fist
    inCircle(x, y, -0.44, 0.2, 0.3) ||
    inCircle(x, y, 0.44, 0.2, 0.3) ||
    inCircle(x, y, 0.74, 0, 0.24) ||
    inCircle(x, y, -0.74, -0.14, 0.3), // the thumb
  8: (x, y) => {
    const eye = inCircle(x, y, 0.34, 0.28, 0.24) || inCircle(x, y, -0.34, 0.28, 0.24)
    const nose = inTriangle(x, y, [0, -0.06], [-0.11, 0.16], [0.11, 0.16])
    if (eye || nose) return false
    if (y >= -0.25) return (x * x) / 0.8464 + (y - 0.1) ** 2 / 1.1025 <= 1 // the cranium
    const jaw = y >= -1 && y <= -0.25 && Math.abs(x) <= 0.62
    const toothGap = y <= -0.62 && Math.abs(Math.abs(x) - 0.21) <= 0.05
    return jaw && !toothGap
  },
  9: (x, y) => {
    const r = Math.hypot(x, y)
    if (r <= 0.26) return true
    if (r > 0.92) return false
    // Six arms: how far, in degrees, this point is from the nearest one.
    const angle = ((((180 * Math.atan2(y, x)) / Math.PI) % 60) + 60) % 60
    const off = Math.min(angle, 60 - angle)
    return off <= 13 * (1 - 0.35 * r) ||
      (r >= 0.34 && r <= 0.58 && off <= 27) ||
      (r >= 0.64 && r <= 0.84 && off <= 18)
  },
}

/** How far out a cell sits relative to the shape's edge along its own ray: 1 is on it. */
function gauge(cell, inside) {
  const x = cell[0]
  const y = -cell[1]
  const r = Math.hypot(x, y)
  if (r < 1e-9) return 0
  const ux = x / r
  const uy = y / r
  let lo = 0
  let hi = 64
  for (let i = 0; i < 30; i += 1) {
    const mid = (lo + hi) / 2
    if (inside(mid * ux, mid * uy)) lo = mid
    else hi = mid
  }
  return r / Math.max(lo, 1e-6)
}

/* ---------- candidate cells ---------- */

/** Every place a shelter could stand, in the order ties are later broken. */
function candidateCells(version) {
  const cells = []
  if (version === GAP_SQUARE) {
    // A one-tile gap after every second shelter, mirrored about the center.
    const steps = [SHELTER + TILE, SHELTER]
    const along = []
    for (let at = 1.5 * TILE, k = 0; at < HALF_GRID * (SHELTER + TILE); k += 1) {
      along.push(at)
      at += steps[k % 2]
    }
    const axis = along.map((p) => -p).concat(along).sort((a, b) => a - b)
    for (const x of axis) for (const y of axis) cells.push([x, y])
  } else {
    // Four quadrants of shelters packed edge to edge, with a two-tile lane
    // along each axis.
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (let kx = 0; kx < HALF_GRID; kx += 1) {
          for (let ky = 0; ky < HALF_GRID; ky += 1) {
            cells.push([sx * (LANE / 2 + (kx + 0.5) * SHELTER), sy * (LANE / 2 + (ky + 0.5) * SHELTER)])
          }
        }
      }
    }
  }
  const clear = FRANKENSTEIN / 2 + SHELTER / 2 + 4
  return cells.filter((c) => !(Math.abs(c[0]) < clear && Math.abs(c[1]) < clear))
}

/**
 * The `count` cells the formation is made of, innermost first, and how far
 * out each sits on the shape's own scale (empty unless the shape is drawn).
 */
function chooseCells(version, count) {
  let cells = candidateCells(version)
  const shapeGauge = new Map()
  const inside = SHAPES[version]
  if (version === DIAMOND) {
    cells.sort((a, b) => compareTuples([manhattan(a), -radius2(a)], [manhattan(b), -radius2(b)]))
  } else if (version === CIRCLE) {
    cells.sort((a, b) => radius2(a) - radius2(b))
  } else if (inside) {
    // Grow the shape until it holds everyone, then fill from its middle out.
    const holds = (scale) => cells.reduce((n, c) => n + (inside(c[0] / scale, -c[1] / scale) ? 1 : 0), 0)
    let lo = 1
    let hi = 2 * Math.max(...cells.map(chebyshev)) + 1
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2
      if (holds(mid) >= count) hi = mid
      else lo = mid
    }
    const within = cells.filter((c) => inside(c[0] / hi, -c[1] / hi))
    const without = cells.filter((c) => !inside(c[0] / hi, -c[1] / hi))
    const byGauge = (a, b) => gauge(a, inside) - gauge(b, inside)
    within.sort(byGauge)
    without.sort(byGauge)
    cells = within.concat(without).slice(0, count)
    for (const c of cells) shapeGauge.set(keyOf(c), gauge(c, inside))
  } else {
    cells.sort((a, b) => compareTuples([chebyshev(a), -radius2(a)], [chebyshev(b), -radius2(b)]))
  }
  // A drawn shape has no spare cells: its outline is the point of it.
  const spare = inside ? [] : cells.slice(count)
  return { chosen: cells.slice(0, count), spare, shapeGauge }
}

/** Moves cells past REACH into spare slots above the formation, in place. */
function pullInFarCells(chosen, spare) {
  const far = chosen.filter((c) => tilesOut(c) > REACH)
  if (!far.length) return
  const topRows = chosen.filter((c) => c[1] < 0 && tilesOut(c) <= REACH).map((c) => c[1])
  let rowY = (topRows.length ? Math.min(...topRows) : 0) - SHELTER
  // Spare slots above the center, by row, nearest the middle first.
  const rows = new Map()
  for (const c of spare) {
    if (c[1] < 0 && tilesOut(c) <= REACH) {
      const y = round1(c[1])
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y).push(c)
    }
  }
  for (const row of rows.values()) row.sort((a, b) => Math.abs(a[0]) - Math.abs(b[0]))
  for (const cell of far) {
    for (;;) {
      const row = rows.get(round1(rowY))
      if (row && row.length) {
        chosen.splice(chosen.indexOf(cell), 1)
        chosen.push(row.shift())
        break
      }
      if (rowY < LOWEST_ROW) break
      rowY -= SHELTER
    }
  }
}

/* ---------- members ---------- */

// Ascending: the member with the weakest claim to the outside comes first.
const outerClaim = (m) => [m.outermost ? 1 : 0, m.bgbCp, m.level || 0, m.cp]
const byOuterClaim = (a, b) => compareTuples(outerClaim(a), outerClaim(b))

/**
 * Every member's cell, with what drawing it needs: the canvas size in CSS
 * pixels (W × H), the formation's bounds, `toPx` from formation to canvas,
 * and the farthest shelter in tiles.
 */
export function layoutHive(members, options) {
  const { version } = options
  const spreadTop = !!options.spreadTop
  const spreadIndustry = !!options.spreadIndustry
  const topCount = options.spreadTopN || 10
  const spreadLevel = options.spreadIndustryLvl || 8
  const count = members.length

  const { chosen: cells, spare, shapeGauge } = chooseCells(version, count)
  pullInFarCells(cells, spare)

  // How exposed a cell is: on the rim (no neighbor farther out along its own
  // axis), then how far out its ring is, then plain distance.
  const occupied = new Set(cells.map(keyOf))
  const lattice = [...new Set(cells.flatMap((c) => [round1(c[0]), round1(c[1])]))].sort((a, b) => a - b)
  function stepOut(v) {
    const beyond = lattice.filter((u) => Math.abs(u) > Math.abs(v) + 0.01 && u >= 0 === v >= 0)
    return beyond.length ? beyond.reduce((m, u) => (Math.abs(u) < Math.abs(m) ? u : m)) : null
  }
  function onRim(c) {
    const x = round1(c[0])
    const y = round1(c[1])
    const nx = stepOut(x)
    const ny = stepOut(y)
    const coveredX = Math.abs(x) >= Math.abs(y) && nx !== null && occupied.has(`${nx},${y}`)
    const coveredY = Math.abs(y) >= Math.abs(x) && ny !== null && occupied.has(`${x},${ny}`)
    return !(coveredX || coveredY)
  }
  function ring(c) {
    if (version === DIAMOND) return manhattan(c)
    if (version === CIRCLE) return radius2(c)
    if (SHAPES[version]) return shapeGauge.get(keyOf(c)) || 0
    return chebyshev(c)
  }
  const exposure = new Map()
  cells.forEach((c) => exposure.set(keyOf(c), [onRim(c) ? 1 : 0, ring(c), radius2(c)]))
  const exposureOf = (c) => exposure.get(keyOf(c))
  const byExposure = (a, b) => compareTuples(exposureOf(a), exposureOf(b))

  const innermostFirst = [...cells].sort(byExposure)
  const cellRanks = new Map()
  innermostFirst.forEach((c, i) => cellRanks.set(keyOf(c), i))
  const cellRank = (c) => cellRanks.get(keyOf(c))
  const memberRank = new Map()
  ;[...members].sort(byOuterClaim).forEach((m, i) => memberRank.set(m.id, i))

  const groups = new Map()
  const singles = []
  for (const m of members) {
    if (m.group) {
      if (!groups.has(m.group)) groups.set(m.group, [])
      groups.get(m.group).push(m)
    } else {
      singles.push(m)
    }
  }

  const free = cells.slice()
  const memberCell = new Map()
  const take = (c) => {
    const i = free.indexOf(c)
    if (i >= 0) free.splice(i, 1)
  }

  /* Cells that touch edge to edge, grown from a seed, each picked to sit as
     near as it can to the exposure rank its member would have had alone. */
  function findCluster(ranks, near) {
    const size = ranks.length
    const seeds = free.slice()
    const fromRank = (c) => Math.abs(cellRank(c) - ranks[0])
    if (near) seeds.sort((a, b) => distance2(a, near) - distance2(b, near) || fromRank(a) - fromRank(b))
    else seeds.sort((a, b) => fromRank(a) - fromRank(b))
    for (const seed of seeds) {
      const cluster = [seed]
      while (cluster.length < size) {
        const want = ranks[cluster.length]
        const next = free.filter((c) => !cluster.includes(c) && cluster.some((x) => distance2(c, x) <= EDGE_TO_EDGE))
        if (!next.length) break
        next.sort((a, b) => Math.abs(cellRank(a) - want) - Math.abs(cellRank(b) - want))
        cluster.push(next[0])
      }
      if (cluster.length === size) return cluster
    }
    return null
  }

  function placeGroup(group, near) {
    const strongestFirst = [...group].sort((a, b) => byOuterClaim(b, a))
    const ranks = strongestFirst.map((m) => memberRank.get(m.id))
    let cluster = findCluster(ranks, near || null)
    if (!cluster) {
      // No edge-to-edge cluster left: the nearest cells that still touch at a
      // corner, or failing that simply the nearest.
      const target = near || innermostFirst[ranks[0]]
      const nearest = free.slice().sort((a, b) => distance2(a, target) - distance2(b, target))
      cluster = []
      for (const c of nearest) {
        if (!cluster.length || Math.min(...cluster.map((x) => distance2(c, x))) <= TOUCHING) cluster.push(c)
        if (cluster.length === group.length) break
      }
      if (cluster.length < group.length) cluster = nearest.slice(0, group.length)
    }
    const outermostFirst = cluster.slice().sort((a, b) => cellRank(b) - cellRank(a))
    strongestFirst.forEach((m, i) => {
      memberCell.set(m.id, outermostFirst[i])
      take(outermostFirst[i])
    })
  }

  const spreadGroups = new Set()
  const spreadSingles = new Set()

  if (spreadTop || spreadIndustry) {
    // A unit is a stick group or a member on their own: [best BGB CP, holds
    // someone at the spread level, members, group name or null].
    const units = []
    for (const [name, group] of groups) {
      units.push([Math.max(...group.map((m) => m.bgbCp)), group.some((m) => m.level === spreadLevel), group, name])
    }
    for (const m of singles) units.push([m.bgbCp, m.level === spreadLevel, [m], null])
    const seen = new Set()
    const spread = []
    const add = (unit) => {
      if (seen.has(unit[2])) return
      seen.add(unit[2])
      spread.push(unit)
    }
    if (spreadTop) [...units].sort((a, b) => b[0] - a[0]).slice(0, topCount).forEach(add)
    if (spreadIndustry) units.filter((u) => u[1]).forEach(add)
    spread.sort((a, b) => b[0] - a[0])

    if (spread.length) {
      // The first four go to the corners (the points, for a diamond), the
      // rest evenly round the circle between them.
      const corners = version === DIAMOND ? [0, 90, 180, 270] : version === CIRCLE ? [] : [45, 135, 225, 315]
      let bearings
      if (corners.length) {
        const cornered = Math.min(spread.length, corners.length)
        bearings = corners.slice(0, cornered)
        const rest = spread.length - cornered
        for (let i = 0; i < rest; i += 1) bearings.push((corners[0] + 45 + (360 * i) / rest) % 360)
      } else {
        bearings = Array.from({ length: spread.length }, (_, i) => (90 + (360 * i) / spread.length) % 360)
      }
      const far = 3 * Math.max(...cells.map(chebyshev))
      spread.forEach(([, , group, name], i) => {
        const rad = (bearings[i] * Math.PI) / 180
        const toward = [far * Math.cos(rad), -far * Math.sin(rad)]
        if (name !== null) {
          placeGroup(group, toward)
          spreadGroups.add(name)
        } else {
          let rim = free.filter((c) => exposure.get(keyOf(c))[0] === 1)
          if (!rim.length) rim = free
          const cell = rim.reduce((best, c) => (distance2(c, toward) < distance2(best, toward) ? c : best))
          memberCell.set(group[0].id, cell)
          take(cell)
          spreadSingles.add(group[0].id)
        }
      })
    }
  }

  // The rest of the groups, the one with the strongest member first; then
  // everyone else, the weakest claim on the innermost cell.
  const strongest = (group) => group.reduce((best, m) => (byOuterClaim(m, best) > 0 ? m : best))
  ;[...groups.entries()]
    .sort((a, b) => memberRank.get(strongest(b[1]).id) - memberRank.get(strongest(a[1]).id))
    .forEach(([name, group]) => {
      if (!spreadGroups.has(name)) placeGroup(group, null)
    })
  const remaining = singles.filter((m) => !spreadSingles.has(m.id)).sort(byOuterClaim)
  const freeInnermostFirst = free.slice().sort(byExposure)
  remaining.forEach((m, i) => memberCell.set(m.id, freeInnermostFirst[i]))

  const placed = members.map((m) => memberCell.get(m.id))
  const xs = placed.map((c) => c[0])
  const ys = placed.map((c) => c[1])
  const minx = Math.min(Math.min(...xs) - SHELTER / 2, -FRANKENSTEIN / 2)
  const maxx = Math.max(Math.max(...xs) + SHELTER / 2, FRANKENSTEIN / 2)
  const miny = Math.min(Math.min(...ys) - SHELTER / 2, -FRANKENSTEIN / 2)
  const maxy = Math.max(Math.max(...ys) + SHELTER / 2, FRANKENSTEIN / 2)

  return {
    memberCell,
    groups,
    W: Math.round(maxx - minx) + 2 * MARGIN,
    H: Math.round(maxy - miny) + 2 * MARGIN + TITLE_HEIGHT + LEGEND_HEIGHT,
    minx,
    maxx,
    miny,
    maxy,
    toPx: (x, y) => [x - minx + MARGIN, y - miny + MARGIN + TITLE_HEIGHT],
    farthest: Math.max(...cells.map((c) => Math.hypot(c[0], c[1]))) / TILE + 1.5,
    version,
    N: count,
    total: members.reduce((sum, m) => sum + m.cp, 0),
  }
}

export { keyOf, round1 }
