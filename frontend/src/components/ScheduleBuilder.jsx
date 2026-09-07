import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import DateTimeField, { nextRoundedNow, toDateTimeStr } from './DateTimeField.jsx'
import TimezoneField from './TimezoneField.jsx'
import { withServerTime } from '../lib/servertime.js'
import { zonedToIso } from '../lib/tz.js'

/**
 * Choosing when an announcement goes out, without writing cron.
 *
 * Cron is where this went wrong before: "0 12 * * 5" reads as Friday to a
 * person and there is no way to check that from the expression alone. So the
 * builder writes the expression, and the live preview shows the actual dates
 * it produces — the answer comes from the same trigger the scheduler uses.
 *
 * Day numbers here are crontab's (0 = Sunday); the row is ordered Monday-first
 * to match the Events form.
 */

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]   // Mon..Sun, in crontab numbering
const DAY_LABELS = (() => {
  const f = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
  // 7 Jan 2024 was a Sunday, so +n gives crontab's numbering directly.
  return Object.fromEntries(
    DAY_ORDER.map((d) => [d, f.format(new Date(2024, 0, 7 + d))]),
  )
})()

const pad = (n) => String(n).padStart(2, '0')

/** Read an existing expression back into builder state, if it fits a mode. */
export function parseCron(expr) {
  const fallback = { mode: 'advanced', time: '09:00', days: [] }
  if (!expr) return { mode: 'daily', time: '09:00', days: [] }
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return fallback

  const [m, h, dom, mon, dow] = parts
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h) || dom !== '*' || mon !== '*') return fallback

  const time = `${pad(Number(h))}:${pad(Number(m))}`
  if (dow === '*') return { mode: 'daily', time, days: [] }
  if (/^[0-7](,[0-7])*$/.test(dow)) {
    const days = [...new Set(dow.split(',').map((d) => Number(d) % 7))]
    return { mode: 'weekly', time, days }
  }
  if (/^[0-7]-[0-7]$/.test(dow)) {
    const [lo, hi] = dow.split('-').map(Number)
    const days = []
    for (let d = lo; d <= hi; d += 1) days.push(d % 7)
    return { mode: 'weekly', time, days }
  }
  return { ...fallback, time }
}

export function buildCron({ mode, time, days }) {
  const [h, m] = (time || '09:00').split(':').map(Number)
  if (mode === 'daily') return `${m} ${h} * * *`
  if (mode === 'weekly') {
    if (!days.length) return null
    return `${m} ${h} * * ${[...days].sort((a, b) => a - b).join(',')}`
  }
  return null
}

/* A fortnight is the case this exists for, and no cron expression can say it:
   cron's day-of-week field repeats every seven days with nothing to carry a
   longer cycle. */
const FORTNIGHT = 14 * 1440

const MODES = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Certain days' },
  { id: 'days', label: 'Every N days' },
  { id: 'interval', label: 'Every N minutes' },
  { id: 'once', label: 'One time' },
  { id: 'event', label: 'Before an event' },
  { id: 'advanced', label: 'Advanced' },
]

export default function ScheduleBuilder({ form, setForm, events }) {
  // The stored shape is (kind, cron_expr); the builder's mode is finer, so it
  // is derived from both rather than stored separately.
  const derived =
    form.kind === 'interval' ? { mode: 'interval' }
      : form.kind === 'rotation' ? { mode: 'days' }
        : form.kind === 'once' ? { mode: 'once' }
          : form.kind === 'event' ? { mode: 'event' }
            : parseCron(form.cron_expr)

  const [mode, setMode] = useState(derived.mode)
  const [time, setTime] = useState(derived.time ?? '09:00')
  const [days, setDays] = useState(derived.days ?? [])
  const [preview, setPreview] = useState(null)

  const apply = (next) => {
    const m = next.mode ?? mode
    const t = next.time ?? time
    const d = next.days ?? days
    if (next.mode !== undefined) setMode(next.mode)
    if (next.time !== undefined) setTime(next.time)
    if (next.days !== undefined) setDays(next.days)

    if (m === 'interval') setForm((f) => ({ ...f, kind: 'interval' }))
    else if (m === 'days') setForm((f) => ({
      ...f,
      kind: 'rotation',
      // A period left over from another mode is rarely whole days; a fortnight
      // is the sensible thing to land on rather than "every 0 days".
      interval_minutes: f.interval_minutes && f.interval_minutes % 1440 === 0
        ? f.interval_minutes : FORTNIGHT,
      run_at: f.run_at || toDateTimeStr(nextRoundedNow()),
    }))
    else if (m === 'once') setForm((f) => ({ ...f, kind: 'once' }))
    else if (m === 'event') setForm((f) => ({ ...f, kind: 'event' }))
    else if (m === 'advanced') setForm((f) => ({ ...f, kind: 'cron' }))
    else {
      const expr = buildCron({ mode: m, time: t, days: d })
      setForm((f) => ({ ...f, kind: 'cron', cron_expr: expr ?? f.cron_expr }))
    }
  }

  // Ask the API what this actually produces. Debounced, because it runs while
  // the officer is still choosing.
  useEffect(() => {
    if (mode === 'event') { setPreview(null); return undefined }
    const id = setTimeout(() => {
      api
        .previewSchedule({
          kind: form.kind,
          cron_expr: form.cron_expr,
          interval_minutes: Number(form.interval_minutes) || null,
          run_at: zonedToIso(form.run_at, form.timezone),
          timezone: form.timezone,
        })
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 250)
    return () => clearTimeout(id)
  }, [form.kind, form.cron_expr, form.interval_minutes, form.run_at, form.timezone, mode])

  // Null while the field is still half-typed, which is most keystrokes.
  const runAtIso = zonedToIso(form.run_at, form.timezone)

  const toggleDay = (d) =>
    apply({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] })

  return (
    <div className="sched wide">
      <span className="label">When should it post?</span>
      <div className="row wrap sched-modes">
        {MODES.map((m) => (
          <button
            type="button"
            key={m.id}
            className={mode === m.id ? 'chip on' : 'chip'}
            onClick={() => apply({ mode: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="sched-body">
        {/* First, because it settles what every field under it means. Shown for
            anything that reads a clock — not for an interval, which counts
            elapsed minutes, nor an event-linked post, which takes the event's
            own zone. */}
        {mode !== 'interval' && mode !== 'event' && (
          <TimezoneField
            value={form.timezone}
            onChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
          />
        )}

        {(mode === 'daily' || mode === 'weekly') && (
          <>
            {mode === 'weekly' && (
              <div>
                <span className="label">On these days</span>
                <div className="row wrap">
                  {DAY_ORDER.map((d) => (
                    <button
                      type="button"
                      key={d}
                      className={days.includes(d) ? 'chip on' : 'chip'}
                      onClick={() => toggleDay(d)}
                    >
                      {DAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="sched-time">
              At
              <input type="time" value={time} onChange={(e) => apply({ time: e.target.value })} />
            </label>
          </>
        )}

        {mode === 'days' && (
          <>
            <label>
              Every (days)
              <input
                type="number" inputMode="numeric" min="1" max="365"
                value={Math.max(1, Math.round((form.interval_minutes || 1440) / 1440))}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  interval_minutes: Math.min(365, Math.max(1, Number(e.target.value) || 1)) * 1440,
                }))}
              />
            </label>
            <label>
              First post
              <DateTimeField
                mode="datetime"
                value={form.run_at}
                onChange={(v) => setForm((f) => ({ ...f, run_at: v }))}
                placeholder="Pick the first date and time…"
              />
              <small className="muted">
                Every repeat counts from here
                {runAtIso ? ` — ${withServerTime(runAtIso)}` : ''}.
              </small>
            </label>
          </>
        )}

        {mode === 'interval' && (
          <label>
            Every (minutes)
            <input
              type="number" inputMode="numeric" min="1"
              value={form.interval_minutes ?? 60}
              onChange={(e) => setForm((f) => ({ ...f, interval_minutes: e.target.value }))}
            />
          </label>
        )}

        {mode === 'once' && (
          <label>
            Run at
            <DateTimeField
              mode="datetime"
              value={form.run_at}
              onChange={(v) => setForm((f) => ({ ...f, run_at: v }))}
              minToday
              placeholder="Pick a date and time…"
            />
          </label>
        )}

        {mode === 'event' && (
          <>
            <label>
              Event
              <select
                value={form.event_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, event_id: e.target.value }))}
                required
              >
                <option value="">Select an event…</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </label>
            <label>
              Minutes before it starts
              <input
                type="number" inputMode="numeric" min="0"
                value={form.lead_minutes}
                onChange={(e) => setForm((f) => ({ ...f, lead_minutes: e.target.value }))}
              />
            </label>
          </>
        )}

        {mode === 'advanced' && (
          <label>
            Cron expression
            <input
              value={form.cron_expr ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, cron_expr: e.target.value }))}
              placeholder="0 12 * * 5"
            />
            <small className="muted">
              minute hour day-of-month month day-of-week · day 0 is Sunday
            </small>
          </label>
        )}
      </div>

      {mode !== 'event' && (
        <div className={preview?.error ? 'sched-preview bad' : 'sched-preview'}>
          {preview?.error ? (
            <span>{preview.error}</span>
          ) : preview ? (
            <>
              <strong>{preview.description}</strong>
              {preview.next_runs?.length > 0 && (
                <ul>
                  {preview.next_runs.slice(0, 3).map((iso) => (
                    <li key={iso}>
                      {new Intl.DateTimeFormat(undefined, {
                        weekday: 'short', day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      }).format(new Date(iso))}
                      <span className="muted"> · {withServerTime(iso)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <span className="muted">Choose a schedule to see when it will post.</span>
          )}
        </div>
      )}
    </div>
  )
}
