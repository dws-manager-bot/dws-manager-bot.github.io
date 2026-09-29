import dataUrl from './season5.json?url'

/**
 * The season 5 map, as the game ships it (build 1.250.661).
 *
 * season5.json is generated, never edited: dws-wiki/tools/season_map.py reads
 * it out of the APK. Walls and territories arrive as run lengths over the
 * row-major tile index, y*1000 + x, and are unpacked here into one byte per
 * tile. The file is fetched rather than imported so it stays out of the bundle
 * every other tab loads.
 *
 * Coordinates are the game's: x east, y up the minimap. A building at (x, y)
 * covers x-size+1..x and y-size+1..y — the only placement under which every
 * city sits clear of the walls.
 */

let pending = null

export function loadMap() {
  if (!pending) {
    pending = fetch(dataUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load the map (${r.status})`)
        return r.json()
      })
      .then(decode)
      .catch((err) => { pending = null; throw err })
  }
  return pending
}

function decode(raw) {
  const N = raw.size
  const walls = new Uint8Array(N * N)
  for (let i = 0; i < raw.walls.length; i += 2) {
    walls.fill(1, raw.walls[i], raw.walls[i] + raw.walls[i + 1])
  }
  const zone = new Uint8Array(N * N)
  for (let i = 0, p = 0; i < raw.zones.length; i += 2) {
    zone.fill(raw.zones[i], p, p + raw.zones[i + 1])
    p += raw.zones[i + 1]
  }
  // A tile on a territory's edge: its right or upper neighbor is another
  // territory. Worked out once; the board only recolors what is inside.
  const edge = new Uint8Array(N * N)
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = y * N + x
      if (walls[i]) continue
      if ((x + 1 < N && zone[i + 1] !== zone[i]) || (y + 1 < N && zone[i + N] !== zone[i])) edge[i] = 1
    }
  }
  // A wall tile beside open ground: the outline that keeps a wall readable
  // once it is drawn in the ground's own color.
  const wallEdge = new Uint8Array(N * N)
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = y * N + x
      if (!walls[i]) continue
      if ((x > 0 && !walls[i - 1]) || (x + 1 < N && !walls[i + 1])
        || (y > 0 && !walls[i - N]) || (y + 1 < N && !walls[i + N])) wallEdge[i] = 1
    }
  }
  // Each Stronghold's area: 1-based index into sareaCity, 0 for none. A held
  // Stronghold colors its whole area, whoever holds the Pyramid around it.
  const sarea = new Uint8Array(N * N)
  const sareaCity = [0, ...(raw.strongholdAreas?.cities || [])]
  const runs = raw.strongholdAreas?.runs || []
  for (let i = 0, p = 0; i < runs.length; i += 2) {
    if (runs[i]) sarea.fill(runs[i], p, p + runs[i + 1])
    p += runs[i + 1]
  }
  // A Stronghold area's rim, drawn only while it is held, so a held area reads
  // as its own rectangle.
  const sareaEdge = new Uint8Array(N * N)
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = y * N + x
      const a = sarea[i]
      if (!a || walls[i]) continue
      if ((x + 1 < N && sarea[i + 1] !== a) || (x > 0 && sarea[i - 1] !== a)
        || (y + 1 < N && sarea[i + N] !== a) || (y > 0 && sarea[i - N] !== a)) sareaEdge[i] = 1
    }
  }
  const cities = raw.cities.map((c) => ({ ...c, nearBy: c.nearBy || [] }))
  const byId = new Map(cities.map((c) => [c.id, c]))
  // Pyramids and the Royal Court own the territory they stand in; a pass,
  // Stronghold or Oasis is only its own footprint.
  const zoneOwner = new Int32Array(raw.zoneIds.length).fill(0)
  for (const c of cities) if (c.kind === 'city') zoneOwner[c.zone] = c.id

  return {
    N, walls, wallEdge, zone, edge, zoneOwner, sarea, sareaCity, sareaEdge, cities, byId,
    camps: raw.camps, build: raw.build, season: raw.season,
  }
}

export const KIND_LABEL = { city: 'Pyramid', pass: 'Pass', stronghold: 'Stronghold', oasis: 'Oasis' }

/** "Lv.4 Strife Pass (East)", "Lv.1 Pyramid". */
export const cityTitle = (c) => `Lv.${c.level} ${c.name}`

/** The coordinates the game prints and accepts: "X:876 Y:502". */
export const coords = (x, y) => `X:${Math.round(x)} Y:${Math.round(y)}`

/** A footprint in world units: [x0, y0, x1, y1], upper edges exclusive. */
export const footprint = (c) => [c.x - c.size + 1, c.y - c.size + 1, c.x + 1, c.y + 1]

/**
 * Find a territory by name or by coordinates. "876 502", "876,502" and
 * "x876 y502" are coordinates; anything else matches names and ids.
 */
export function search(map, text) {
  const q = text.trim().toLowerCase()
  if (!q) return { cities: [], point: null }
  const nums = q.match(/-?\d+(\.\d+)?/g)
  if (nums && nums.length >= 2 && /^[\sxy:,.\d-]+$/.test(q)) {
    const x = Math.round(+nums[0]); const y = Math.round(+nums[1])
    if (x >= 0 && y >= 0 && x < map.N && y < map.N) {
      const near = map.cities
        .map((c) => ({ c, d: Math.hypot(c.x - x, c.y - y) }))
        .filter((r) => r.d < 12)
        .sort((a, b) => a.d - b.d)
        .map((r) => r.c)
      return { cities: near.slice(0, 5), point: { x, y } }
    }
  }
  const words = q.split(/\s+/)
  const hits = map.cities.filter((c) => {
    const hay = `${c.name} lv.${c.level} lv${c.level} ${c.region || ''} ${c.id}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  // Passes and higher levels first: they are what a search is usually for.
  const rank = { pass: 0, city: 1, stronghold: 2, oasis: 3 }
  hits.sort((a, b) => rank[a.kind] - rank[b.kind] || b.level - a.level || a.id - b.id)
  return { cities: hits.slice(0, 8), point: null }
}
