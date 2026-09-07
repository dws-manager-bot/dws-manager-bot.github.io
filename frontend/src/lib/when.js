/**
 * How soon, in as few words as it can be said.
 *
 * A schedule is scanned for what happens next, so anything inside a day reads
 * as a countdown and anything further out falls back to the day it lands on.
 * The exact timestamp is still there once a row is opened — this is the line
 * you read while scrolling past.
 */

const fmt = (d, o) => new Intl.DateTimeFormat(undefined, { hour12: false, ...o }).format(d)

const DAY = 86400000

export function briefWhen(iso) {
  if (!iso) return null
  const then = new Date(iso)
  const ms = then - new Date()
  const timeOnly = { hour: '2-digit', minute: '2-digit' }

  // Already past: the scheduler is between firing and refreshing, so name the
  // moment rather than counting down to something that has happened.
  if (ms <= 0) return fmt(then, { weekday: 'short', ...timeOnly })

  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'any moment'
  if (mins < 60) return `in ${mins} min`
  if (ms < DAY) return `in ${Math.round(mins / 60)}h`
  if (ms < 7 * DAY) return fmt(then, { weekday: 'short', ...timeOnly })
  return fmt(then, { day: 'numeric', month: 'short', ...timeOnly })
}

/** Sort key that puts the soonest first and anything unscheduled last. */
export const soonest = (iso) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY)
