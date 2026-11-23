/**
 * Who holds what, and what it pays.
 *
 * Season 6 scores Mithril, by camp. On the board only two things pay, and
 * both are the game's own numbers (worldcity.s10_force_grow, s10_force):
 * - each Monday 00:00 ST, a held Fortress pays 20 / 60 / 100 (Lv.3 / 4 / 5)
 *   and a Judgment Altar 300;
 * - destroying an enemy Fortress pays 40 / 120 / 200 once, and it pays nobody
 *   after that.
 * Outposts pay nothing; they are the way to the next Fortress. Temples pay the
 * most, by camp rank, but they are contests: their results are entered by
 * hand and added in the season history. There is no cap on what an alliance
 * holds in season 6.
 */

export const CAMPS = [1, 2, 3, 4, 5, 6, 7, 8]

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

/** One row per alliance: what it holds and what that pays each Monday. */
export function standings(map, holders, alliances, ruins = new Set()) {
  const rows = new Map(alliances.map((a) => [a.id, {
    alliance: a, weekly: 0, outposts: 0, fortresses: 0, altars: 0, destroyed: 0,
  }]))
  for (const [cityId, allianceId] of holders) {
    const row = rows.get(allianceId)
    const c = map.byId.get(cityId)
    if (!row || !c) continue
    if (ruins.has(cityId)) { row.destroyed += 1; continue }
    if (c.kind === 'outpost') row.outposts += 1
    else if (c.kind === 'fortress') row.fortresses += 1
    else if (c.kind === 'altar') row.altars += 1
    row.weekly += c.mithril || 0
  }
  return [...rows.values()]
    .map((r) => ({ ...r, count: r.outposts + r.fortresses + r.altars }))
    .sort((a, b) => b.weekly - a.weekly || b.count - a.count || a.alliance.name.localeCompare(b.alliance.name))
}

export function campTotals(rows) {
  const out = Object.fromEntries(CAMPS.map((c) => [c, 0]))
  for (const r of rows) out[r.alliance.camp] = (out[r.alliance.camp] || 0) + r.weekly
  return out
}

/** "1.2M", "285K", "7,580". */
export function shortNum(n) {
  const v = Math.abs(n)
  if (v >= 1e6) return `${(n / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`
  if (v >= 1e5) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString('en-US')
}

export const fullNum = (n) => n.toLocaleString('en-US')

/** Discord's limit on attachments to one message, which is one map per scenario. */
export const MAX_IMAGES = 10
