import { SHELTER, blocked } from './geometry.js'

/**
 * The plan around the map: who is in which group, each group's anchor, the
 * poll, and filling a group's shelters in around its anchor.
 */

/** The three groups a member can be sent with, each with what it marches on. */
export const GROUPS = [
  { id: 'temple', name: 'Temple', color: '#7c3aed', target: (t) => [t.temple.x, t.temple.y] },
  { id: 't1', name: 'Turret 1', color: '#0e7490', target: (t) => centerOf(t.turrets[0].box) },
  { id: 't2', name: 'Turret 2', color: '#15803d', target: (t) => centerOf(t.turrets[1].box) },
]
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]))
export const NO_GROUP_COLOR = '#475569'

const centerOf = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]

/** Today's poll, 28 Nov 2026; admins rename or add options on the page. */
export const DEFAULT_OPTIONS = ['Available from 10 ST', 'Available from 12 ST', 'Late', "Can't participate"]

/** A color per option number, then grey for anything past the fourth. */
export const VOTE_COLORS = ['#16a34a', '#2563eb', '#d97706', '#dc2626', '#9333ea', '#0891b2']
export const voteColor = (n) => VOTE_COLORS[n - 1] || '#71717a'

export const SORTS = {
  bgb: 'BGB CP',
  base: 'CP without troops',
  rank: 'Rank',
  vote: 'Vote',
}

const num = (v) => (v == null ? -1 : v)

/** Sort members by one of SORTS. Ties fall back to CP without troops, then name. */
export function sortMembers(members, by, votes = {}) {
  const tie = (a, b) => num(b.base) - num(a.base) || a.name.localeCompare(b.name)
  const cmp = {
    bgb: (a, b) => num(b.bgb) - num(a.bgb) || tie(a, b),
    base: (a, b) => tie(a, b),
    rank: (a, b) => num(b.rank) - num(a.rank) || tie(a, b),
    // option 1 first; no vote last
    vote: (a, b) => (votes[a.key] || 99) - (votes[b.key] || 99) || tie(a, b),
  }[by] || tie
  return [...members].sort(cmp)
}

/** Lowercase, no accents, no spaces, bullets or decorations: how names are matched loosely. */
export function looseName(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s•·°・∞♡★☥†​-‍\\|.'’-]/g, '')
}

/**
 * Votes pasted as one per line: "<game uid or name> <option>", split by a tab,
 * comma, semicolon or spaces; the option is the last number on the line.
 * A uid matches the member table's game id; otherwise the name, exactly, then
 * loosely — and a loose name that matches two members matches neither.
 */
export function parseVotes(text, members) {
  const byUid = new Map(members.filter((m) => m.uid).map((m) => [String(m.uid), m]))
  const byName = new Map(members.map((m) => [m.name, m]))
  const loose = new Map()
  for (const m of members) {
    const k = looseName(m.name)
    loose.set(k, loose.has(k) ? null : m)
  }
  const votes = {}
  const unmatched = []
  for (const raw of String(text).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(.*?)[\s,;\t]+(\d{1,2})\s*$/)
    if (!m) { unmatched.push(line); continue }
    const who = m[1].replace(/^["']|["']$/g, '').trim()
    const option = Number(m[2])
    const hit = byUid.get(who) || byName.get(who) || loose.get(looseName(who))
    if (!hit || option < 1) { unmatched.push(line); continue }
    votes[hit.key] = option
  }
  return { votes, unmatched }
}

/**
 * Shelters for a group, packed round its anchor.
 *
 * Candidate spots sit on the anchor's own 3-tile lattice, so neighbors touch
 * and no tile between them is wasted. Nearest the anchor first; between spots
 * equally near, the one nearer the group's target. Spots inside the zone, on
 * another shelter or off the map are skipped.
 *
 * `keys` are the members to place, in the order that gets the nearest spots.
 * Returns [{ key, x, y }] for those that found a spot.
 */
export function fillAround(temple, view, placed, anchor, keys, target) {
  const spots = []
  const reach = Math.max(view.x1 - view.x0, view.y1 - view.y0)
  const steps = Math.ceil(reach / SHELTER) + 1
  for (let i = -steps; i <= steps; i += 1) {
    for (let j = -steps; j <= steps; j += 1) {
      if (!i && !j) continue
      const x = anchor.x + i * SHELTER
      const y = anchor.y + j * SHELTER
      spots.push({
        x, y,
        d: Math.hypot(x - anchor.x, y - anchor.y),
        t: Math.hypot(x - target[0], y - target[1]),
      })
    }
  }
  spots.sort((a, b) => a.d - b.d || a.t - b.t || b.y - a.y || a.x - b.x)

  const taken = [...placed]
  const out = []
  let s = 0
  for (const key of keys) {
    while (s < spots.length && blocked(temple, view, taken, key, spots[s].x, spots[s].y)) s += 1
    if (s >= spots.length) break
    const spot = { key, x: spots[s].x, y: spots[s].y, name: key }
    taken.push(spot)
    out.push({ key, x: spot.x, y: spot.y })
    s += 1
  }
  return out
}
