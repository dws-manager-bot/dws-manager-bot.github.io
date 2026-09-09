import { Fragment, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import ListRow from '../components/ListRow.jsx'
import Occurrences from '../components/Occurrences.jsx'
import { briefWhen } from '../lib/when.js'
import { withServerTime } from '../lib/servertime.js'
import DateTimeField from '../components/DateTimeField.jsx'
import TimezoneField from '../components/TimezoneField.jsx'
import { zonedToIso } from '../lib/tz.js'
import ListSection from '../components/ListSection.jsx'
import EditorPanel from '../components/EditorPanel.jsx'
import { copyKey, copyName, groupRows } from '../lib/grouping.js'
import { REPEATS } from '../lib/schedule.js'

// Weekday names in the viewer's language; the indices stay 0 = Monday, which
// is what the API stores.
/** Matches the announcement cards: no seconds, no year, weekday included. */
const fmtWhen = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

const DAYS = (() => {
  const f = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)))
})()

const EMPTY = {
  key: '',
  name: '',
  description: '',
  enabled: true,
  schedule_type: 'weekly',
  weekdays: [],
  rotation_days: 5,
  reference_date: '',
  fixed_dates: [],
  start_time: '20:00',
  duration_minutes: 60,
  timezone: 'Asia/Seoul',
  signup_enabled: true,
}

function toPayload(form) {
  return {
    ...form,
    weekdays: form.schedule_type === 'weekly' ? form.weekdays.map(Number) : null,
    rotation_days: form.schedule_type === 'rotation' ? Number(form.rotation_days) : null,
    /* Midnight in the event's own zone, not this browser's. Stored as an
       instant but read back as a calendar date in that zone, so a browser-local
       midnight landed a day early for any zone behind UTC — server time
       included, which is exactly where a rotation is most likely set. */
    reference_date:
      form.schedule_type === 'rotation' && form.reference_date
        ? zonedToIso(`${String(form.reference_date).slice(0, 10)}T00:00`, form.timezone)
        : null,
    fixed_dates: form.schedule_type === 'fixed' ? form.fixed_dates : null,
    duration_minutes: Number(form.duration_minutes),
    description: form.description || null,
  }
}

export default function Events() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(null)
  const [preview, setPreview] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState({})
  const [openDates, setOpenDates] = useState(null)
  const [open, setOpen] = useState(null)
  const [showOff, setShowOff] = useState(false)

  const refresh = () => api.listEvents().then(setRows).catch((e) => setError(e.message))
  useEffect(() => { refresh() }, [])

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: value }))
  }

  const toggleDay = (index) =>
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(index)
        ? f.weekdays.filter((d) => d !== index)
        : [...f.weekdays, index].sort(),
    }))

  // Ask the API what this schedule would actually produce, so a rotation can be
  // sanity-checked before it is saved.
  // Live: a rotation cannot be checked by reading its settings, so the dates
  // it produces have to be on screen while they are being chosen.
  useEffect(() => {
    if (!form) { setPreview([]); return undefined }
    const id = setTimeout(() => {
      api.previewEvent(toPayload(form))
        .then(setPreview)
        .catch(() => setPreview([]))
    }, 300)
    return () => clearTimeout(id)
  }, [form])

  async function save(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const payload = toPayload(form)
      // The endpoints return the saved row; re-listing would be another
      // round trip for data already in hand.
      if (form.id) {
        const saved = await api.updateEvent(form.id, payload)
        setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)))
      } else {
        const saved = await api.createEvent(payload)
        setRows((rs) => [...rs, saved])
      }
      setForm(null)
      setPreview([])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(row) {
    if (!confirm(`Delete event "${row.name}"?`)) return
    setError(null)
    setPending((p) => ({ ...p, [row.id]: true }))
    try {
      await api.deleteEvent(row.id)
      setRows((rs) => rs.filter((r) => r.id !== row.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setPending((p) => {
        const { [row.id]: _drop, ...rest } = p
        return rest
      })
    }
  }

  /* The recurrence in a few words, for the line you read while scrolling. */
  const scheduleOf = (row) =>
    row.schedule_type === 'weekly'
      ? (row.weekdays ?? []).map((d) => DAYS[d]).join(', ') || 'no days'
      : row.schedule_type === 'rotation'
        ? `every ${row.rotation_days} days`
        : row.schedule_type

  /* The same three groups the announcements list uses: what is coming, what is
     on but has no dates left, and what is switched off. */
  const { live, stuck, off } = groupRows(rows, (r) => r.upcoming?.[0])

  const whenOf = (row) => {
    if (row.upcoming?.[0]) return { when: briefWhen(row.upcoming[0]) }
    if (row.enabled) return { when: 'no dates left — add or change the rule', tone: 'bad' }
    return { when: 'off' }
  }

  const editing = (row) => form && form.id === row.id

  const startEdit = (row) => {
    setForm({ ...EMPTY, ...row, weekdays: row.weekdays ?? [] })
    setPreview([])
  }

  /* A copy is a filled-in new form, not a duplicated row: nothing exists until
     it is saved. The key has to differ, since it is what /events post takes. */
  const startCopy = (row) => {
    setForm({
      ...EMPTY, ...row,
      id: undefined,
      key: copyKey(row.key, rows.map((r) => r.key)),
      name: copyName(row.name, rows.map((r) => r.name)),
      weekdays: row.weekdays ?? [],
      enabled: true,
      upcoming: undefined, created_by_name: undefined, updated_by_name: undefined,
    })
    setPreview([])
    setOpen(null)
  }

  /* One set of fields, new or existing alike. Guarded: it is built on every
     render, and every field here reads `form`. */
  const editorFields = form && (
    <>
            <div className="grid">
              <label>
                Key
                <input value={form.key} onChange={set('key')} required placeholder="alliance-duel" />
                <small className="muted">Lowercase, no spaces. Used by /events post.</small>
              </label>
              <label>
                Name
                <input value={form.name} onChange={set('name')} required />
              </label>
              <label className="wide">
                Description
                <textarea rows="2" value={form.description ?? ''} onChange={set('description')} />
              </label>

              <div>
                <span className="label">Repeats</span>
                <div className="row wrap">
                  {REPEATS.map(([value, label]) => (
                    <button
                      type="button" key={value}
                      className={form.schedule_type === value ? 'chip on' : 'chip'}
                      onClick={() => setForm((f) => ({ ...f, schedule_type: value }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label>
                Start time
                <input type="time" value={form.start_time ?? ''} onChange={set('start_time')} />
              </label>

              {form.schedule_type === 'weekly' && (
                <div className="wide">
                  <span className="label">Days</span>
                  <div className="row wrap">
                    {DAYS.map((day, i) => (
                      <button
                        type="button"
                        key={day}
                        className={form.weekdays.includes(i) ? 'chip on' : 'chip'}
                        onClick={() => toggleDay(i)}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {form.schedule_type === 'rotation' && (
                <>
                  <label>
                    Every N days
                    <input type="number" min="1" value={form.rotation_days} onChange={set('rotation_days')} />
                  </label>
                  <label>
                    Counting from
                    <DateTimeField
                      mode="date"
                      value={(form.reference_date ?? '').slice(0, 10)}
                      onChange={(v) => setForm((f) => ({ ...f, reference_date: v }))}
                      placeholder="Pick a known event day…"
                    />
                    <small className="muted">A day the event is known to run.</small>
                  </label>
                </>
              )}

              {form.schedule_type === 'fixed' && (
                <label className="wide">
                  Dates
                  <DateTimeField
                    mode="multi"
                    values={form.fixed_dates ?? []}
                    onChange={(v) => setForm((f) => ({ ...f, fixed_dates: v }))}
                    placeholder="Pick one or more days…"
                  />
                  {(form.fixed_dates ?? []).length > 0 && (
                    <div className="row wrap" style={{ marginTop: 6 }}>
                      {form.fixed_dates.map((d) => (
                        <button
                          type="button"
                          key={d}
                          className="chip on"
                          title="Remove"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              fixed_dates: f.fixed_dates.filter((x) => x !== d),
                            }))
                          }
                        >
                          {d} ×
                        </button>
                      ))}
                    </div>
                  )}
                </label>
              )}

              <label>
                Duration (minutes)
                <input type="number" min="1" value={form.duration_minutes} onChange={set('duration_minutes')} />
              </label>
              <TimezoneField
                value={form.timezone}
                onChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
              />
              <label className="inline">
                <input type="checkbox" checked={form.signup_enabled} onChange={set('signup_enabled')} />
                Allow signups
              </label>
              <label className="inline">
                <input type="checkbox" checked={form.enabled} onChange={set('enabled')} />
                Enabled
              </label>
            </div>

            {preview.length > 0 && (
              <div className="sched-preview">
                <strong>So it happens on</strong>
                <ul>
                  {preview.slice(0, 6).map((iso) => (
                    <li key={iso}>
                      {fmtWhen(iso)}{' '}
                      <span className="muted">· {withServerTime(iso)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
    </>
  )

  const rowActions = (row) => (
    <div className="card-actions">
      <button className="btn" onClick={() => startEdit(row)}>Edit</button>
      <button className="btn" onClick={() => startCopy(row)}>Copy</button>
      <button
        className="btn"
        onClick={() => setOpenDates(openDates === row.id ? null : row.id)}
      >
        {openDates === row.id ? 'Hide dates' : 'Manage dates'}
      </button>
      <button
        className="btn danger"
        onClick={() => remove(row)}
        disabled={Boolean(pending[row.id])}
      >
        {pending[row.id] ? 'Deleting…' : 'Delete'}
      </button>
    </div>
  )

  /* The row, and its form directly beneath when it is the one being edited. */
  const renderRow = (row) => {
    const w = whenOf(row)
    return (
      <Fragment key={row.id}>
        <ListRow
          id={row.id}
          enabled={row.enabled}
          title={row.name}
          where={scheduleOf(row)}
          when={w.when}
          whenTone={w.tone}
          whenNote={row.upcoming?.[0] ? withServerTime(row.upcoming[0]) : null}
          open={open === row.id}
          onToggle={() => setOpen(open === row.id ? null : row.id)}
        >
          <div className="card-meta">
            <span className="pill">{row.schedule_type}</span>
            <code className="muted">{row.key}</code>
            <span>{row.start_time}</span>
            <span className="muted">{row.timezone}</span>
          </div>
          {row.description && <p className="card-body">{row.description}</p>}
          {row.upcoming?.length > 0 && (
            <dl className="when">
              <dt>Next</dt>
              <dd>
                {fmtWhen(row.upcoming[0])}{' '}
                <span className="muted">· {withServerTime(row.upcoming[0])}</span>
              </dd>
            </dl>
          )}
          {(row.created_by_name || row.updated_by_name) && (
            <div className="byline muted">
              {row.created_by_name && <>Added by <b>{row.created_by_name}</b></>}
              {row.updated_by_name && row.updated_by_name !== row.created_by_name && (
                <> · last edited by <b>{row.updated_by_name}</b></>
              )}
            </div>
          )}

          {rowActions(row)}

          {openDates === row.id && (
            <Occurrences eventId={row.id} timezone={row.timezone} onError={setError} />
          )}
        </ListRow>
        {editing(row) && (
          <EditorPanel
            title={`Edit “${row.name}”`}
            onSubmit={save}
            onCancel={() => { setForm(null); setPreview([]) }}
            busy={busy}
          >
            {editorFields}
          </EditorPanel>
        )}
      </Fragment>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>Event schedule</h2>
        <button className="btn primary" onClick={() => { setForm({ ...EMPTY }); setPreview([]) }}>
          New event
        </button>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      {rows.length === 0 && !form && (
        <p className="muted">
          No events yet. Define recurring game events here, then attach an announcement to one.
        </p>
      )}

      {form && !form.id && (
        <EditorPanel
          title="New event"
          onSubmit={save}
          onCancel={() => { setForm(null); setPreview([]) }}
          busy={busy}
        >
          {editorFields}
        </EditorPanel>
      )}

      <ListSection title="Scheduled" count={live.length}>
        {live.map((row) => renderRow(row))}
      </ListSection>

      <ListSection
        title="Needs attention"
        tone="warn"
        count={stuck.length}
        note="enabled, but no dates left"
      >
        {stuck.map((row) => renderRow(row))}
      </ListSection>

      <ListSection
        title="Off"
        count={off.length}
        note="switched off"
        open={showOff}
        onToggle={() => setShowOff(!showOff)}
      >
        {off.map((row) => renderRow(row))}
      </ListSection>
    </div>
  )
}
