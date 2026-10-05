/*
 * The planner's arithmetic, kept free of React and of the reader's clock so it
 * can be tested at any instant. Instants are UTC milliseconds throughout.
 *
 * A server day starts at 00:00 server time and holds six 4-hour SP slots.
 * Server time is Etc/GMT+2: UTC−2 all year with no daylight saving, so every
 * server day is exactly 24 hours and starts at 02:00 UTC. Weekdays count from
 * Monday as 0, as the game's week does.
 */
import { AD_WEEK, OFFICIALS, SP_ROTATION } from './data.js'

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const SLOT = 4 * HOUR
export const SLOTS = 6
const SERVER_OFFSET = -2 * HOUR

const mod = (n, m) => ((n % m) + m) % m

/** The SP theme of slot `slot` (0–5) on server weekday `weekday`. */
export const spTheme = (weekday, slot) => SP_ROTATION[mod(SLOTS * weekday + slot, SP_ROTATION.length)]

/** The AD theme of a server weekday, or null on Sunday. */
export const adTheme = (weekday) => AD_WEEK[mod(weekday, 7)]

export const officialsFor = (themeKey) => OFFICIALS[themeKey] ?? { best: [], also: [] }

/** The server day an instant falls in: when it starts, and its weekday. */
export function serverDay(instant) {
  const day = Math.floor((instant + SERVER_OFFSET) / DAY)
  // Day 0 of the epoch, 1 January 1970, was a Thursday.
  return { start: day * DAY - SERVER_OFFSET, weekday: mod(day + 3, 7) }
}

/** The start of the server day with this weekday: today's, or the next one. */
export function dayStartOn(weekday, now) {
  const today = serverDay(now)
  return today.start + mod(weekday - today.weekday, 7) * DAY
}

/** A server day's six slots, each with the actions that score in SP only,
    in both events (dual), or in AD only. Lists keep their theme's order. */
export function daySlots(weekday, dayStart) {
  const ad = adTheme(weekday)
  const inAd = new Set(ad ? ad.actions : [])
  return Array.from({ length: SLOTS }, (_, slot) => {
    const theme = spTheme(weekday, slot)
    const inSp = new Set(theme.actions)
    return {
      weekday,
      slot,
      theme: theme.key,
      start: dayStart + slot * SLOT,
      end: dayStart + (slot + 1) * SLOT,
      dual: theme.actions.filter((a) => inAd.has(a)),
      spOnly: theme.actions.filter((a) => !inAd.has(a)),
      adOnly: ad ? ad.actions.filter((a) => !inSp.has(a)) : [],
    }
  })
}

/** The slot an instant falls in. */
export function slotAt(instant) {
  const { start, weekday } = serverDay(instant)
  const slot = Math.floor((instant - start) / SLOT)
  return daySlots(weekday, start)[slot]
}

/** The first dual slot after the one `now` is in, or null if the next
    `days` days hold none. */
export function nextDual(now, days = 7) {
  const from = slotAt(now).end
  for (let at = from; at < from + days * DAY; at += SLOT) {
    const slot = slotAt(at)
    if (slot.dual.length) return slot
  }
  return null
}

const WEEKDAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** An instant as the wall clock reads it in `zone`. */
export function wallClock(instant, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday],
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  }
}

/** A window read in `zone`: its two ends on the wall clock there, and whether
    it ends on a later date than it starts. A slot is four hours long, but in
    the reader's zone it can run past midnight, or across a clock change. */
export function windowIn(start, end, zone) {
  const from = wallClock(start, zone)
  // The end is exclusive: a slot ending at midnight still ends on its own day.
  const to = wallClock(end - 1, zone)
  return { from, to: wallClock(end, zone), crossesDate: from.date !== to.date }
}
