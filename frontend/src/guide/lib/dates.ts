/**
 * Relative season dates.
 *
 * Server groups (clusters) start the same season on different dates, but the season days are the
 * same for all of them (S6: Kickoff Day 1, Invade Day 16, Altar Day 39, Showdown Day 48, Tally Day 51).
 * Content text therefore says "Day 16" and puts a date token next to it: `{date:16}`.
 * `localizeSeason` replaces each token with the calendar date for a chosen start date.
 *
 * Tokens:
 *   {date:N}   → "Tue Dec 8"         (weekday, month, day of season day N)
 *   {year:N}   → "Tue Dec 8, 2026"   (same, with the year)
 */

const TOKEN = /\{(date|year):(\d+)\}/g

/** Calendar date of season day `day` (Day 1 = `start`). `start` is an ISO date (YYYY-MM-DD). */
export function seasonDayDate(start: string, day: number): Date {
  const d = new Date(`${start}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + day - 1)
  return d
}

export function formatDay(start: string, day: number, withYear = false): string {
  const d = seasonDayDate(start, day)
  const s = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })
  // "Tue, Dec 8" → "Tue Dec 8"; "Tue, Dec 8, 2026" → "Tue Dec 8, 2026"
  return s.replace(/^(\w{3}),/, '$1')
}

export function fillDates(text: string, start: string): string {
  return text.replace(TOKEN, (_, kind: string, n: string) => formatDay(start, Number(n), kind === 'year'))
}

/** Season day of a calendar date (Day 1 = start). Can be < 1 (before the season) or > the last day. */
export function seasonDayOf(start: string, today = new Date()): number {
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.floor((t - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
}

/** Deep copy of any plain data (season objects) with every date token replaced. */
export function localizeSeason<T>(value: T, start: string): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.includes('{') ? fillDates(v, start) : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value) as T
}
