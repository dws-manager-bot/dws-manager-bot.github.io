/**
 * Who holds what, and what it is worth.
 *
 * Influence per territory is the game's own number: the city panel's
 * "Influence +N" is worldcity.s5_force, and it is in season5.json as
 * `influence`. Pyramids and passes score. Strongholds do not — the game says
 * they "do not count as alliance territory". Oases are held but not scored
 * until someone confirms in game that they add to it.
 *
 * The cap is the game's too: 6 cities per alliance, 8 after the Alliance
 * Expansion tech, where "cities" includes passes.
 */

export const SCORED = new Set(['city', 'pass'])
export const CAP = 6
export const CAP_WITH_TECH = 8

/**
 * The board with a scenario's changes laid over it. `changes` maps a
 * territory id (as a string, from JSON) to an alliance id, or null for
 * "goes neutral"; anything not mentioned stays as the board has it.
 */
export function holdersWith(board, changes) {
  const out = new Map(board)
  for (const [id, to] of Object.entries(changes || {})) {
    if (to == null) out.delete(Number(id))
    else out.set(Number(id), to)
  }
  return out
}

/** One row per alliance: what it holds and what that is worth. */
export function standings(map, holders, alliances) {
  const rows = new Map(alliances.map((a) => [a.id, {
    alliance: a, influence: 0, cities: 0, passes: 0, strongholds: 0, oases: 0,
  }]))
  for (const [cityId, allianceId] of holders) {
    const row = rows.get(allianceId)
    const c = map.byId.get(cityId)
    if (!row || !c) continue
    if (c.kind === 'city') row.cities += 1
    else if (c.kind === 'pass') row.passes += 1
    else if (c.kind === 'stronghold') row.strongholds += 1
    else row.oases += 1
    if (SCORED.has(c.kind)) row.influence += c.influence
  }
  return [...rows.values()]
    .map((r) => ({ ...r, count: r.cities + r.passes }))
    .sort((a, b) => b.influence - a.influence || a.alliance.name.localeCompare(b.alliance.name))
}

export function campTotals(rows) {
  const out = { 1: 0, 2: 0 }
  for (const r of rows) out[r.alliance.camp] = (out[r.alliance.camp] || 0) + r.influence
  return out
}

/** "1.2M", "285K" — influence runs to the tens of millions over a season. */
export function shortNum(n) {
  const v = Math.abs(n)
  if (v >= 1e6) return `${(n / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`
  if (v >= 1e3) return `${(n / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(n)
}

export const fullNum = (n) => n.toLocaleString('en-US')
