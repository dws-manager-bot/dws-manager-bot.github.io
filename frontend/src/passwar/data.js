import PassWar from './engine.js'

/**
 * Loading and shaping the Pass War data, kept apart from the UI.
 *
 * The line-up is the thing that matters: an explicit priority order, seeded
 * from BGB CP, that officers reorder and mix mercenaries into. Placement reads
 * that order, so position in this list *is* rank — which is the only rank a
 * mercenary has, since they carry no CP.
 */

const SHEET =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9nTYasjEgPo-Mb7Qtu' +
  'AoLxUf1PBmiRKMIa46L7wruZZY2zXNxTGJrzb_YkJbyng/pub?output=csv'

const STORE = 'pouwar.state.v1'

export const OFFICIAL = 'official'
export const draftSlug = (discordId) => `draft:${discordId}`

export const DEFAULT_OPTS = {
  version: 1,
  // How deep the shelter block is, and how wide each layer is. A version
  // supplies the starting shape; these are what the officer then adjusts.
  shelterRows: 2,
  shelterCols: 4,
  orient: 'bottom',
  portalOwners: 24,
  // How many portals the formation holds in total, named and free together.
  // Rings grow outward until it is met, so this replaces counting layers.
  portalCount: 100,
  shelterBias: 'left',
  showZones: true,
  tile: 30,
  // The board itself. Camps differ from map to map and the gate is not always
  // halfway along the border, so both are the officer's to set. A null gateX
  // means "keep it centred", so resizing the camp carries the gate with it.
  mapW: 40,
  mapH: 40,
  gateX: null,
  gateW: 5,
  gateH: 12,
  rivalDepth: 6,
}

/** The roster, live from the published sheet, falling back to the bundled copy. */
export async function loadRoster() {
  try {
    const r = await fetch(SHEET, { cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const text = await r.text()
    // A sign-in page comes back as HTML, which parses into a plausible-looking
    // empty roster rather than failing, so check before trusting it.
    if (/^\s*</.test(text)) throw new Error('the sheet is not published')
    return { members: PassWar.parseMembers(text), source: 'live Google Sheet' }
  } catch (err) {
    const text = await fetch('passwar-members.csv', { cache: 'no-store' }).then((r) => r.text())
    return {
      members: PassWar.parseMembers(text),
      source: `bundled snapshot — ${err.message}`,
    }
  }
}

/**
 * Merge a saved order over the current roster.
 *
 * Anyone named in the order keeps their position; anyone new lands at the end
 * in roster order, so a member who joined since the plan was saved appears
 * rather than vanishing.
 */
export function applyOrder(roster, mercs, order) {
  const rank = new Map((order || []).map((name, i) => [name, i]))
  const pool = [...roster, ...mercs]
  return pool
    .map((m, i) => ({ m, seed: rank.has(m.name) ? rank.get(m.name) : 1e6 + i }))
    .sort((a, b) => a.seed - b.seed)
    .map((x) => x.m)
}

export const makeMerc = (name, bgb) => ({
  name: String(name).trim(),
  bgb: Math.max(0, Math.round(Number(bgb) || 0)),
  cp: 0,
  lvl: null,
  merc: true,
})

/** "Name 123456" or "Name,123456" per line. */
export function parseBulkMercs(text) {
  const out = []
  for (const line of String(text).split('\n')) {
    const t = line.trim()
    if (!t) continue
    const m = t.match(/^(.*?)[\s,]+(\d[\d,._]*)\s*$/)
    if (m) out.push(makeMerc(m[1], m[2].replace(/[,._]/g, '')))
    else out.push(makeMerc(t, 0))
  }
  return out
}

export const snapshot = (opts, lineup) => ({
  opts,
  order: lineup.map((m) => m.name),
  mercs: lineup.filter((m) => m.merc).map((m) => ({ name: m.name, bgb: m.bgb })),
})

/** This device's cache, so a reload is not a blank page when the API is down. */
export const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(STORE) || 'null')
  } catch {
    return null
  }
}

export const writeCache = (plan) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(plan))
  } catch {
    /* private browsing, a full quota — not worth interrupting the user for */
  }
}

/** Move one entry of a list to another index, without mutating it. */
export function moveItem(list, from, to) {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item)
  return next
}

export const stamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
