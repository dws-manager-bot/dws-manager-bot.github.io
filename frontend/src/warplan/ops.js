/**
 * Edits to a plan, as operations.
 *
 * Every change to a plan's doc — put a drawing, remove one, plan a territory,
 * add or rename or remove a scenario, replace the lot — is one of these. The
 * live room applies them in the order it receives them and sends each to
 * everyone; applying the same list in the same order is what keeps every
 * admin's copy the same.
 *
 * `applyOp` is backend/src/dwsbot/warlive.py's apply_op in JavaScript. The two
 * must agree on what every operation does, or a client drifts from the room.
 * Limits are checked by the room; here only enough to not corrupt the doc.
 *
 *   { t: 'item',   s, item }                 put a drawing, by id
 *   { t: 'unitem', s, id }                   remove a drawing
 *   { t: 'change', s, city, v }              plan a territory for alliance v (null: neutral)
 *   { t: 'change', s, city, clear: true }    back to the board
 *   { t: 'scen',   scenario, at? }           add a scenario, or change its name/notes
 *   { t: 'unscen', s }                       remove a scenario
 *   { t: 'doc',    doc }                     replace everything
 */

export class OpError extends Error {}

const clone = (v) => JSON.parse(JSON.stringify(v))

export function applyOp(doc, op) {
  const scenarios = [...(doc.scenarios || [])]
  const at = (sid) => {
    const i = scenarios.findIndex((s) => s.id === sid)
    if (i < 0) throw new OpError('that scenario is gone')
    return i
  }
  switch (op?.t) {
    case 'doc':
      if (!op.doc?.scenarios?.length) throw new OpError('a plan must have scenarios')
      return clone(op.doc)
    case 'item': case 'unitem': case 'change': {
      const i = at(op.s)
      const s = { ...scenarios[i] }
      if (op.t === 'item') {
        if (!op.item?.id) throw new OpError('a drawing needs an id')
        const items = [...(s.items || [])]
        const k = items.findIndex((x) => x.id === op.item.id)
        if (k >= 0) items[k] = op.item
        else items.push(op.item)
        s.items = items
      } else if (op.t === 'unitem') {
        s.items = (s.items || []).filter((x) => x.id !== op.id)
      } else {
        const changes = { ...(s.changes || {}) }
        const city = String(op.city)
        if (op.clear) delete changes[city]
        else changes[city] = op.v ?? null
        s.changes = changes
      }
      scenarios[i] = s
      break
    }
    case 'scen': {
      const data = op.scenario || {}
      const i = scenarios.findIndex((s) => s.id === data.id)
      if (i >= 0) {
        const s = { ...scenarios[i] }
        if ('name' in data) s.name = String(data.name).trim().slice(0, 40)
        if ('notes' in data) s.notes = String(data.notes || '').slice(0, 4000)
        if ('changes' in data) s.changes = { ...data.changes }
        if ('items' in data) s.items = [...data.items]
        scenarios[i] = s
      } else {
        const s = {
          id: data.id, name: String(data.name || 'Plan').trim().slice(0, 40),
          changes: { ...(data.changes || {}) }, items: [...(data.items || [])],
          ...(data.notes ? { notes: String(data.notes).slice(0, 4000) } : {}),
        }
        const pos = Number.isInteger(op.at) && op.at >= 0 && op.at <= scenarios.length ? op.at : scenarios.length
        scenarios.splice(pos, 0, s)
      }
      break
    }
    case 'unscen': {
      const i = at(op.s)
      if (scenarios.length <= 1) throw new OpError('a plan keeps at least one scenario')
      scenarios.splice(i, 1)
      break
    }
    default:
      throw new OpError('unknown operation')
  }
  return { ...doc, scenarios }
}

/** The operation that undoes `op`, worked out against the doc before it. */
export function inverseOf(doc, op) {
  const scen = (sid) => doc.scenarios.find((s) => s.id === sid)
  switch (op.t) {
    case 'doc':
      return { t: 'doc', doc: clone(doc) }
    case 'item': {
      const prev = scen(op.s)?.items.find((x) => x.id === op.item.id)
      return prev ? { t: 'item', s: op.s, item: prev } : { t: 'unitem', s: op.s, id: op.item.id }
    }
    case 'unitem': {
      const prev = scen(op.s)?.items.find((x) => x.id === op.id)
      return prev ? { t: 'item', s: op.s, item: prev } : null
    }
    case 'change': {
      const changes = scen(op.s)?.changes || {}
      const key = String(op.city)
      return key in changes
        ? { t: 'change', s: op.s, city: op.city, v: changes[key] }
        : { t: 'change', s: op.s, city: op.city, clear: true }
    }
    case 'scen': {
      const prev = scen(op.scenario.id)
      if (!prev) return { t: 'unscen', s: op.scenario.id }
      const back = { id: prev.id }
      for (const k of ['name', 'notes', 'changes', 'items']) if (k in op.scenario) back[k] = prev[k] ?? ''
      return { t: 'scen', scenario: back }
    }
    case 'unscen': {
      const i = doc.scenarios.findIndex((s) => s.id === op.s)
      return i < 0 ? null : { t: 'scen', scenario: clone(doc.scenarios[i]), at: i }
    }
    default:
      return null
  }
}

/** Apply operations in order, skipping any that no longer apply. */
export function replay(doc, ops) {
  let out = doc
  for (const op of ops) {
    try { out = applyOp(out, op) } catch (err) { if (!(err instanceof OpError)) throw err }
  }
  return out
}
