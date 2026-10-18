import { api } from '../lib/api.js'

/**
 * Loading and shaping the Pass War data, kept apart from the UI.
 *
 * The line-up is the thing that matters: an explicit priority order, seeded
 * from BGB CP, that officers reorder and mix mercenaries into. Placement reads
 * that order, so position in this list *is* rank — which is the only rank a
 * mercenary has, since they carry no CP.
 */

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
  /* The board, measured outward from the pass: our ground to its left, to its
     right, and behind the border. The camp's width is what they add up to, so
     changing one side no longer moves the pass. */
  leftOfPass: 17,
  rightOfPass: 18,
  mapH: 40,
  rivalDepth: 2,
}

/**
 * The roster, from the member table: current members with a total CP, strongest
 * BGB CP first. Throws when the table cannot be read — there is no older copy to
 * fall back on, and a stale one would be taken for the real thing.
 */
export async function loadRoster() {
  const players = await api.listPlayers()
  const members = players
    .filter((p) => p.active && p.total_cp > 0)
    .map((p) => ({
      name: p.name,
      lvl: p.industry_level ?? null,
      bgb: p.bgb_cp ?? 0,
      cp: p.total_cp,
      merc: false,
    }))
    .sort((a, b) => b.bgb - a.bgb)
  return { members, source: 'member table' }
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
