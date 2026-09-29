/**
 * Where an alliance may declare war, by the season's rules.
 *
 * - Only territories are targets: Pyramids (and the Royal Court) and passes.
 *   Oases and Strongholds never are.
 * - An alliance that holds nothing may declare only on the Lv.1 Pyramids of
 *   its own camp base.
 * - One that holds anything may declare on any territory bordering ground
 *   its camp holds — any alliance of the camp, not only itself.
 * - Borders are the game's own (worldcity.nearBy). Two Pyramids on either
 *   side of a pass do not border each other; each borders the pass. So the
 *   pass has to be taken first, and nothing here needs to say so.
 * - A territory the other camp holds can be declared on only on Saturday.
 *   One the camp already holds is not a target at all.
 * - Two declarations a day.
 */

export const DECLARATIONS_PER_DAY = 2

const isTerritory = (c) => c && (c.kind === 'city' || c.kind === 'pass')

/** The camp base region's name, as the game data spells it. */
const baseOf = (map, camp) => `${map.camps?.[camp]} Base`

/**
 * Legal targets for one alliance given who holds what.
 * Returns { rule: 'base' | 'border', targets: [{ city, saturday }] }.
 */
export function legalTargets(map, holders, alliances, allianceId) {
  const campOf = new Map(alliances.map((a) => [a.id, a.camp]))
  const camp = campOf.get(allianceId)
  if (camp == null) return { rule: 'border', targets: [] }

  const heldBy = (id) => holders.get(id)
  const ownsAny = [...holders].some(([id, a]) => a === allianceId && isTerritory(map.byId.get(id)))
  const friendly = (id) => heldBy(id) != null && campOf.get(heldBy(id)) === camp
  const target = (c) => ({ city: c, saturday: heldBy(c.id) != null && !friendly(c.id) })

  if (!ownsAny) {
    const base = baseOf(map, camp)
    const targets = map.cities
      .filter((c) => c.kind === 'city' && c.level === 1 && c.region === base && !friendly(c.id))
      .map(target)
    return { rule: 'base', targets }
  }

  const seen = new Set()
  for (const [id, a] of holders) {
    if (campOf.get(a) !== camp) continue
    const c = map.byId.get(id)
    if (!isTerritory(c)) continue
    for (const n of c.nearBy) seen.add(n)
  }
  const targets = [...seen]
    .map((id) => map.byId.get(id))
    .filter((c) => isTerritory(c) && !friendly(c.id))
    .map(target)
    .sort((a, b) => a.saturday - b.saturday || b.city.level - a.city.level || a.city.id - b.city.id)
  return { rule: 'border', targets }
}

/** Every alliance that may declare on this territory, and whether only on Saturday. */
export function declarers(map, holders, alliances, cityId) {
  if (!isTerritory(map.byId.get(cityId))) return []
  return alliances
    .map((a) => {
      const hit = legalTargets(map, holders, alliances, a.id).targets.find((t) => t.city.id === cityId)
      return hit ? { alliance: a, saturday: hit.saturday } : null
    })
    .filter(Boolean)
}

/**
 * What in a scenario the rules would stop: more captures than one day's
 * declarations, and captures of ground not yet reachable from the board.
 * Both are judged against the board — declarations are made before anything
 * that day changes hands.
 */
export function checkScenario(map, board, alliances, scenario) {
  const byId = new Map(alliances.map((a) => [a.id, a]))
  const planned = new Map()
  for (const [key, to] of Object.entries(scenario.changes || {})) {
    const id = Number(key)
    if (to == null || board.get(id) === to || !byId.has(to)) continue
    if (!planned.has(to)) planned.set(to, [])
    planned.get(to).push(id)
  }
  const out = []
  for (const [allianceId, ids] of planned) {
    const a = byId.get(allianceId)
    if (ids.length > DECLARATIONS_PER_DAY) {
      out.push({ kind: 'count', alliance: a,
        text: `${a.name} plans ${ids.length} captures; an alliance declares on ${DECLARATIONS_PER_DAY} a day.` })
    }
    const legal = new Set(legalTargets(map, board, alliances, allianceId).targets.map((t) => t.city.id))
    for (const id of ids) {
      if (legal.has(id)) continue
      const c = map.byId.get(id)
      // A pass that is itself declarable is the step to take first.
      const gate = c.nearBy.map((n) => map.byId.get(n)).find((n) => n?.kind === 'pass' && legal.has(n.id))
      out.push({ kind: 'reach', alliance: a, city: c,
        text: `${a.name} cannot declare on Lv.${c.level} ${c.name} (${c.x}, ${c.y}) from the board yet`
          + (gate && c.kind === 'city' ? ` — ${gate.name} (${gate.x}, ${gate.y}) first.` : '.') })
    }
  }
  return out
}
