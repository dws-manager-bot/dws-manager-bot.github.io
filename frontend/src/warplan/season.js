/**
 * Season 6 (Ragnarok): the calendar the rules are judged against.
 *
 * Every date here is a server-time (ST) calendar day as YYYY-MM-DD. Day 1 was
 * Monday 23 Nov 2026 ST; every group plays the same season days, so the rest
 * follows from it. The guide's stage days: Invade 16, Altar 39, Showdown 48,
 * Tally 51.
 */

export const SEASON = 6
export const DAY1 = '2026-11-23'
export const INVADE_DAY = 16
export const ALTAR_DAY = 39
export const LAST_DAY = 51

/** Attempts per alliance per day, 12:00–13:00 ST. */
export const CHALLENGES_PER_DAY = 3
export const WARS_PER_DAY = 1

const MS_DAY = 86400e3
const utc = (iso) => Date.parse(`${iso}T00:00:00Z`)

/** The season day of a date: Day 1 is DAY1. */
export const dayOf = (iso) => Math.floor((utc(iso) - utc(DAY1)) / MS_DAY) + 1

/** The date of a season day. */
export const dateOf = (day) => new Date(utc(DAY1) + (day - 1) * MS_DAY).toISOString().slice(0, 10)

/** 0 is Sunday, as Date.getUTCDay counts. */
export const weekdayOf = (iso) => new Date(utc(iso)).getUTCDay()

export const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Tuesday and Thursday from Day 16: enemy camps may be attacked. */
export const isInvasion = (iso) => dayOf(iso) >= INVADE_DAY && [2, 4].includes(weekdayOf(iso))

/** Altars are declared on only on Thursdays, from Day 39. */
export const isAltarDay = (iso) => dayOf(iso) >= ALTAR_DAY && weekdayOf(iso) === 4

/** "Day 9 · Tue 1 Dec". */
export function dayText(iso) {
  const d = new Date(utc(iso))
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
  return `Day ${dayOf(iso)} · ${date}`
}

/**
 * Each Monday 00:00 ST from Day 8 up to `until`: when Fortresses and Altars pay
 * a week of Mithril. ST is UTC−2, so that is Monday 02:00 UTC.
 */
export function paydays(until) {
  const out = []
  for (let day = 8; ; day += 7) {
    const t = new Date(utc(dateOf(day)) + 2 * 3600e3)
    if (t > until) return out
    out.push(t)
  }
}
