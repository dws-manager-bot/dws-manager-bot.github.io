import {
  ALTAR_DAY, CHALLENGES_PER_DAY, INVADE_DAY, WARS_PER_DAY, dayOf, isAltarDay, isInvasion,
} from './season.js'

/**
 * Where an alliance may attack, by season 6's rules.
 *
 * - Outposts are taken with a Challenge, 3 a day; Fortresses and Altars with
 *   a War, 1 a day. Passes are gates and Temples are contests: neither is a
 *   target, and neither is ever held.
 * - An alliance that holds nothing may only Challenge a Lv.1 Camp Outpost in
 *   its own Camp Base.
 * - Otherwise: anything bordering ground its camp holds. Territory of every
 *   alliance in a camp connects. Borders are the game's own
 *   (worldcity.nearBy); a pass sits between the two sides and borders both,
 *   so ground beyond a pass is in reach only while the pass is open — on its
 *   opening day or later, and a Camp Pass only to its own camp.
 * - Nothing is a target before its opening day.
 * - Ground another camp holds: Tuesday and Thursday only, from Day 16.
 *   Altars: Thursday only, from Day 39.
 * - A destroyed Fortress is gone for the season: not a target, and it holds
 *   nothing for anyone to border.
 *
 * `when` says on which days a target may be taken: 'any', 'invasion' (another
 * camp's ground) or 'altar'. `today` says whether the day judged is one.
 */

export const attackOf = (c) => (c?.kind === 'outpost' ? 'challenge'
  : c?.kind === 'fortress' || c?.kind === 'altar' ? 'war' : null)

export const holdable = (c) => attackOf(c) != null

/** A pass the camp can go through on a day. */
const passOpen = (p, camp, day) => p.opens <= day && (!p.camp || p.camp === camp)

function reach(map, held, camp, day) {
  const out = new Map()   // id -> { open }
  const passes = new Set()
  const visit = (id) => {
    const c = map.byId.get(id)
    if (!c) return
    if (c.kind === 'pass') {
      if (passes.has(id) || !passOpen(c, camp, day)) return
      passes.add(id)
      for (const n of c.nearBy) visit(n)
      return
    }
    if (holdable(c) && !out.has(id)) out.set(id, c)
  }
  // An id not on this map (a removed territory) borders nothing.
  for (const id of held) for (const n of map.byId.get(id)?.nearBy || []) visit(n)
  return out
}

/**
 * Legal targets for one alliance on one date, given who holds what.
 * `ruins` is the set of destroyed Fortresses.
 * Returns { rule: 'start' | 'border', targets: [{ city, attack, when, today }],
 *           later: [{ city, attack }] } — `later` borders the camp but has not
 * opened yet.
 */
export function legalTargets(map, holders, alliances, allianceId, { iso, ruins = new Set() }) {
  const campOf = new Map(alliances.map((a) => [a.id, a.camp]))
  const camp = campOf.get(allianceId)
  if (camp == null) return { rule: 'border', targets: [], later: [] }
  const day = dayOf(iso)
  const invasion = isInvasion(iso)
  const altarDay = isAltarDay(iso)

  const heldBy = (id) => (ruins.has(id) ? null : holders.get(id))
  const friendly = (id) => heldBy(id) != null && campOf.get(heldBy(id)) === camp
  const ownsAny = [...holders].some(([id, a]) => a === allianceId && !ruins.has(id))
  const target = (c) => {
    const enemy = heldBy(c.id) != null && !friendly(c.id)
    const when = c.kind === 'altar' ? 'altar' : enemy ? 'invasion' : 'any'
    const today = when === 'any' || (when === 'invasion' && invasion) || (when === 'altar' && altarDay)
    return { city: c, attack: attackOf(c), when, today }
  }

  if (!ownsAny) {
    const targets = map.cities
      .filter((c) => c.kind === 'outpost' && c.camp === camp && c.level === 1 && !friendly(c.id))
      .map(target)
    return { rule: 'start', targets, later: [] }
  }

  const held = [...holders].filter(([id, a]) => campOf.get(a) === camp && !ruins.has(id)).map(([id]) => id)
  const near = reach(map, held, camp, day)
  const targets = []
  const later = []
  for (const c of near.values()) {
    if (friendly(c.id) || ruins.has(c.id)) continue
    if (c.opens > day) later.push({ city: c, attack: attackOf(c) })
    else targets.push(target(c))
  }
  const order = (a, b) => Number(b.today) - Number(a.today) || b.city.level - a.city.level || a.city.id - b.city.id
  targets.sort(order)
  later.sort((a, b) => a.city.opens - b.city.opens || a.city.id - b.city.id)
  return { rule: 'border', targets, later }
}

/** Every alliance that may take this territory on this date. */
export function declarers(map, holders, alliances, cityId, opts) {
  if (!holdable(map.byId.get(cityId))) return []
  return alliances
    .map((a) => {
      const hit = legalTargets(map, holders, alliances, a.id, opts).targets.find((t) => t.city.id === cityId)
      return hit ? { alliance: a, today: hit.today, when: hit.when } : null
    })
    .filter(Boolean)
}

/**
 * Fortresses a scenario destroys: it hands one the other camp holds to an
 * alliance. In the game that capture destroys it for the season.
 */
export function plannedRuins(map, board, ruins, alliances, changes) {
  const campOf = new Map(alliances.map((a) => [a.id, a.camp]))
  const out = new Map()   // id -> the alliance that destroys it
  for (const [key, to] of Object.entries(changes || {})) {
    const id = Number(key)
    const c = map.byId.get(id)
    if (c?.kind !== 'fortress' || to == null || ruins.has(id)) continue
    const was = board.get(id)
    if (was != null && campOf.get(was) !== campOf.get(to)) out.set(id, to)
  }
  return out
}

export const WHEN_TEXT = {
  invasion: `Tue/Thu from Day ${INVADE_DAY}`,
  altar: `Thursday from Day ${ALTAR_DAY}`,
}

/**
 * What in a scenario the rules would stop: more than 3 Challenges or 1 War
 * for one alliance, a target not in reach from the board, one not open yet,
 * and one that may not be taken on that weekday. Judged against the board:
 * attacks are planned before anything that day changes hands.
 */
export function checkScenario(map, board, alliances, scenario, { iso, ruins = new Set() }) {
  const byId = new Map(alliances.map((a) => [a.id, a]))
  const planned = new Map()
  for (const [key, to] of Object.entries(scenario.changes || {})) {
    const id = Number(key)
    if (to == null || board.get(id) === to || !byId.has(to)) continue
    if (!holdable(map.byId.get(id))) continue
    if (!planned.has(to)) planned.set(to, [])
    planned.get(to).push(id)
  }
  const day = dayOf(iso)
  const out = []
  for (const [allianceId, ids] of planned) {
    const a = byId.get(allianceId)
    const n = (kind) => ids.filter((id) => attackOf(map.byId.get(id)) === kind).length
    if (n('challenge') > CHALLENGES_PER_DAY) {
      out.push({ kind: 'count', alliance: a,
        text: `${a.name} plans ${n('challenge')} Outposts; an alliance has ${CHALLENGES_PER_DAY} Challenges a day.` })
    }
    if (n('war') > WARS_PER_DAY) {
      out.push({ kind: 'count', alliance: a,
        text: `${a.name} plans ${n('war')} Fortresses or Altars; an alliance has ${WARS_PER_DAY} War a day.` })
    }
    const legal = legalTargets(map, board, alliances, allianceId, { iso, ruins })
    const hit = new Map(legal.targets.map((t) => [t.city.id, t]))
    const soon = new Set(legal.later.map((t) => t.city.id))
    for (const id of ids) {
      const c = map.byId.get(id)
      const where = `Lv.${c.level} ${c.name} (${c.x}, ${c.y})`
      const t = hit.get(id)
      if (t && t.today) continue
      let text
      if (t) text = `${a.name} can take ${where} only ${WHEN_TEXT[t.when]}.`
      else if (soon.has(id) || c.opens > day) text = `${where} opens on Day ${c.opens}; this is Day ${day}.`
      else text = `${a.name} cannot reach ${where} from the board yet.`
      out.push({ kind: t ? 'day' : 'reach', alliance: a, city: c, text })
    }
  }
  return out
}
