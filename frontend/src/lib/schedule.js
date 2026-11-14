/**
 * The shapes a recurring event can take, named once.
 *
 * The wizard and the Events form both offer these, and offering them in a
 * different order or different words on each screen is how two forms for the
 * same object start to feel like two products.
 */
export const REPEATS = [
  ['rotation', 'Every N days'],
  ['weekly', 'Set weekdays'],
  ['fixed', 'Specific dates'],
]

/**
 * When an event starts, in a few words: "23:00 ⇄ 19:00 · Sun 19:00" for runs
 * that take turns and a weekday with its own time, plain "20:30" otherwise.
 * `dayNames` is indexed 0 = Monday, as the API stores weekdays.
 */
export function startTimesText(ev, dayNames) {
  const turns = ev.schedule_type === 'rotation' && ev.alternate_times?.length
    ? [ev.start_time, ...ev.alternate_times].join(' ⇄ ')
    : ev.start_time
  const byDay = Object.entries(ev.weekday_times ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, time]) => `${dayNames[Number(day)]} ${time}`)
  return [turns, ...byDay].filter(Boolean).join(' · ')
}
