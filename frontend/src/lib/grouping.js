/**
 * A schedule list splits three ways, and the split is the whole point.
 *
 * What will happen, what was meant to happen and now never will, and what is
 * switched off. Mixed together they are just rows; separated, the middle group
 * is the only one that ever needs acting on — and it is usually empty.
 */
import { soonest } from './when.js'

export function groupRows(rows, nextOf) {
  const live = []
  const stuck = []
  const off = []
  for (const r of rows) {
    if (!r.enabled) off.push(r)
    else if (nextOf(r)) live.push(r)
    else stuck.push(r)
  }
  const bySoonest = (a, b) =>
    soonest(nextOf(a)) - soonest(nextOf(b)) || a.name.localeCompare(b.name)
  const byName = (a, b) => a.name.localeCompare(b.name)
  return { live: live.sort(bySoonest), stuck: stuck.sort(byName), off: off.sort(byName) }
}

/** A name that does not collide with one already in the list. */
export function copyName(name, taken) {
  const base = `${name} (copy)`
  if (!taken.includes(base)) return base
  for (let n = 2; n < 100; n += 1) {
    const next = `${name} (copy ${n})`
    if (!taken.includes(next)) return next
  }
  return base
}

/** The same, for the url-safe key an event is addressed by. */
export function copyKey(key, taken) {
  const base = `${key}-copy`.slice(0, 64)
  if (!taken.includes(base)) return base
  for (let n = 2; n < 100; n += 1) {
    const next = `${key}-copy-${n}`.slice(0, 64)
    if (!taken.includes(next)) return next
  }
  return base
}
