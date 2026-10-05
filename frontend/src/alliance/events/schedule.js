/*
 * The members' Events page, as plain functions of the API's list: which day an
 * occurrence falls on in the reader's zone, whether it is on now, and how far
 * off it is in words the reader's language already has (Intl writes "in 3
 * hours" in all sixteen).
 */
import { utcToZoned } from '../../lib/tz.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const endsAt = (item) => new Date(item.starts_at).getTime() + item.duration_minutes * MINUTE

export const isOn = (item, now) => new Date(item.starts_at).getTime() <= now && now < endsAt(item)

/** "2026-10-05", the calendar day `instant` falls on in `zone`. */
export const dayIn = (instant, zone) => utcToZoned(instant, zone).slice(0, 10)

/** Days from `today` to `day`, both "YYYY-MM-DD". */
export function daysBetween(today, day) {
  const [a, b] = [today, day].map((d) => Date.UTC(...d.split('-').map((n, i) => (i === 1 ? n - 1 : +n))))
  return Math.round((b - a) / (24 * HOUR))
}

/** The items still to finish, grouped by day in `zone`, in order. */
export function byDay(items, zone, now) {
  const groups = []
  for (const item of items) {
    if (endsAt(item) <= now) continue
    const day = dayIn(item.starts_at, zone)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}

/** "in 25 minutes", "in 3 hours", "in 2 days", in the reader's language. */
export function startsIn(item, now, locale) {
  const ms = new Date(item.starts_at).getTime() - now
  const words = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (ms < HOUR) return words.format(Math.max(1, Math.ceil(ms / MINUTE)), 'minute')
  if (ms < 36 * HOUR) return words.format(Math.round(ms / HOUR), 'hour')
  return words.format(Math.round(ms / (24 * HOUR)), 'day')
}

/** "1 hr", "90 min": a length of time in the reader's language. */
export function duration(minutes, locale) {
  const hours = minutes % 60 === 0
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: hours ? 'hour' : 'minute',
    unitDisplay: 'short',
  }).format(hours ? minutes / 60 : minutes)
}
