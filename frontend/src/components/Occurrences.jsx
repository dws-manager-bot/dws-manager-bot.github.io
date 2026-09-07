import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { withServerTime } from '../lib/servertime.js'
import DateTimeField from './DateTimeField.jsx'
import { utcToZoned, zonedToIso } from '../lib/tz.js'

/**
 * The upcoming dates for one event, each moveable or skippable on its own.
 *
 * This exists so a single night can be postponed without editing the
 * recurrence rule, which would drag every future occurrence along with it.
 */

const fmtLocal = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

export default function Occurrences({ eventId, timezone = 'Asia/Seoul', onError }) {
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)   // original_starts_at being moved
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api
      .listOccurrences(eventId)
      .then((r) => live && setRows(r))
      .catch((e) => onError?.(e.message))
    return () => { live = false }
  }, [eventId])

  const run = async (fn) => {
    setBusy(true)
    try {
      setRows(await fn())
      setEditing(null)
      setNote('')
    } catch (e) {
      onError?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  const startMove = (o) => {
    setEditing(o.original_starts_at)
    // Seed the picker with the current time so it is a nudge, not a re-entry.
    // The event's clock, not this browser's — the same clock the row shows.
    setDraft(utcToZoned(o.starts_at, timezone))
    setNote(o.note ?? '')
  }

  if (rows === null) return <p className="muted small">Loading dates…</p>
  if (rows.length === 0) return <p className="muted small">No upcoming dates.</p>

  return (
    <div className="occ">
      <div className="occ-head">Upcoming dates</div>
      {rows.map((o) => {
        const isEditing = editing === o.original_starts_at
        return (
          <div key={o.original_starts_at} className={o.moved ? 'occ-row moved' : 'occ-row'}>
            <div className="occ-when">
              {o.moved && (
                <s className="muted">{fmtLocal(o.original_starts_at)}</s>
              )}
              <strong>{fmtLocal(o.starts_at)}</strong>
              <span className="muted">{withServerTime(o.starts_at)}</span>
              {o.moved && <span className="tag">moved</span>}
              {o.note && <span className="muted occ-note">{o.note}</span>}
            </div>

            {!isEditing && (
              <div className="occ-actions">
                <button type="button" className="btn small" disabled={busy}
                        onClick={() => startMove(o)}>
                  {o.moved ? 'Change' : 'Move'}
                </button>
                {o.moved ? (
                  <button type="button" className="btn small" disabled={busy}
                          onClick={() => run(() => api.clearOccurrence(eventId, o.original_starts_at))}>
                    Restore
                  </button>
                ) : (
                  <button type="button" className="btn small danger" disabled={busy}
                          onClick={() => {
                            if (!confirm(`Skip ${fmtLocal(o.starts_at)}? The rest of the schedule is unaffected.`)) return
                            run(() => api.overrideOccurrence(eventId, {
                              original_starts_at: o.original_starts_at,
                              starts_at: null,
                              note: 'skipped',
                            }))
                          }}>
                    Skip
                  </button>
                )}
              </div>
            )}

            {isEditing && (
              <div className="occ-edit">
                <DateTimeField
                  mode="datetime"
                  value={draft}
                  onChange={setDraft}
                  placeholder="New date and time…"
                />
                {zonedToIso(draft, timezone) && (
                  <div className="muted small">
                    {withServerTime(zonedToIso(draft, timezone))} in server time
                  </div>
                )}
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why (optional) — e.g. clashes with SvS"
                />
                <div className="row">
                  <button type="button" className="btn primary small" disabled={busy || !draft}
                          onClick={() => run(() => api.overrideOccurrence(eventId, {
                            original_starts_at: o.original_starts_at,
                            starts_at: zonedToIso(draft, timezone),
                            note: note || null,
                          }))}>
                    {busy ? 'Saving…' : 'Save this date'}
                  </button>
                  <button type="button" className="btn small" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <p className="muted small occ-foot">
        Changing one date never moves the others — the repeat rule is untouched.
      </p>
    </div>
  )
}
