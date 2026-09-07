/**
 * Reading a wall-clock time against a chosen zone.
 *
 * Every time in this app is a wall-clock time — "Wednesday at 00:00" — read
 * against the timezone stored on the row it belongs to. The browser's own zone
 * is not that zone: two officers in different places must get the same post,
 * and the game's clock is neither of theirs. Left to `new Date(str)`, a picker
 * silently means "wherever this laptop is", which is why the same 09:00 could
 * land at three different moments across three forms.
 *
 * Intl is the whole toolkit. `Date` builds instants only from UTC or from the
 * browser's zone, so a wall-clock time in a third zone is found by guessing an
 * instant and correcting by the offset that zone reports there.
 */

const pad = (n) => String(n).padStart(2, '0')

const partsIn = (date, timeZone, extra) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      ...extra,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  )

/** How far `timeZone` is from UTC at a given instant, in milliseconds. */
function offsetMs(date, timeZone) {
  const p = partsIn(date, timeZone, { second: '2-digit' })
  // Some engines render midnight as hour 24.
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asIfUTC - date.getTime()
}

/* The zone is a free-text field, so every one of these runs against a value
   that is still being typed. Intl throws on a partial zone name; none of these
   may, because they run during render. */

/** "2026-09-09T11:00", read in `timeZone` — the instant it names. */
export function zonedToUtc(wall, timeZone) {
  if (!wall) return null
  const [datePart, timePart = '00:00'] = String(wall).split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh = 0, mm = 0] = timePart.split(':').map(Number)
  if (!y || !m || !d) return null
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  try {
    // Corrected twice: the offset at the corrected instant can differ from the
    // offset at the guess, which is what a single pass gets wrong on the day a
    // zone springs forward.
    const once = guess - offsetMs(new Date(guess), timeZone)
    return new Date(guess - offsetMs(new Date(once), timeZone))
  } catch {
    return null
  }
}

/** The inverse: an instant, as the wall clock reads it in `timeZone`. */
export function utcToZoned(iso, timeZone) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    const p = partsIn(d, timeZone)
    return `${p.year}-${p.month}-${p.day}T${pad(+p.hour % 24)}:${p.minute}`
  } catch {
    return ''
  }
}

/** ISO for the API, or null while the field is still being typed into. */
export const zonedToIso = (wall, timeZone) => {
  const d = zonedToUtc(wall, timeZone)
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
}

/** "UTC+9" — shown beside a field so the zone is never left to be guessed. */
export function zoneLabel(timeZone, at = new Date()) {
  try {
    const mins = Math.round(offsetMs(at, timeZone) / 60000)
    const h = Math.floor(Math.abs(mins) / 60)
    const m = Math.abs(mins) % 60
    return `UTC${mins < 0 ? '−' : '+'}${h}${m ? `:${pad(m)}` : ''}`
  } catch {
    return ''                     // an unknown zone: the API will say so
  }
}
