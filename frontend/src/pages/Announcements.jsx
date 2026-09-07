import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import ListRow from '../components/ListRow.jsx'
import { briefWhen, soonest } from '../lib/when.js'
import { utcToZoned, zonedToIso } from '../lib/tz.js'
import { withServerTime } from '../lib/servertime.js'
import EmbedPreview from '../components/EmbedPreview.jsx'
import ScheduleBuilder from '../components/ScheduleBuilder.jsx'
import DateTimeField, { nextRoundedNow, toDateTimeStr } from '../components/DateTimeField.jsx'

function blankForm() {
  return { ...EMPTY, run_at: toDateTimeStr(nextRoundedNow()) }
}

const EMPTY = {
  name: '',
  enabled: true,
  channel_id: '',
  kind: 'cron',
  cron_expr: '0 9 * * *',
  interval_minutes: 60,
  run_at: '',   // filled by blankForm() with the next 5-minute mark
  timezone: 'Asia/Seoul',
  title: '',
  body: '',
  use_embed: true,
  embed_color: '#5865F2',
  mention: '',
  event_id: null,
  lead_minutes: 0,
}

/** Compact, locale-aware: "Sat 5 Sep, 21:30" — no seconds, no ambiguity. */
const fmtWhen = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

function toPayload(form) {
  return {
    ...form,
    // Left as a string on purpose. A Discord snowflake exceeds
    // Number.MAX_SAFE_INTEGER, so Number() silently rounds it into a channel
    // that does not exist. The API accepts and returns these as strings.
    channel_id: form.channel_id,
    // A rotation needs both: the period, and the first post it counts from.
    interval_minutes:
      form.kind === 'interval' || form.kind === 'rotation'
        ? Number(form.interval_minutes) : null,
    // Read against the announcement's own timezone, not this browser's, so the
    // same form gives the same moment wherever it is filled in.
    run_at:
      form.kind === 'once' || form.kind === 'rotation'
        ? zonedToIso(form.run_at, form.timezone) : null,
    cron_expr: form.kind === 'cron' ? form.cron_expr : null,
    event_id: form.kind === 'event' ? Number(form.event_id) : null,   // DB serial, not a snowflake
    lead_minutes: Number(form.lead_minutes) || 0,
    title: form.title || null,
    mention: form.mention || null,
  }
}

export default function Announcements() {
  const [rows, setRows] = useState([])
  const [channels, setChannels] = useState([])
  const [events, setEvents] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  // Per-row in-flight state, so a slow link still gives immediate feedback.
  const [pending, setPending] = useState({})
  // Which card's Discord preview is open, by id, or 'form' for the editor.
  const [preview, setPreview] = useState(null)
  const [open, setOpen] = useState(null)
  const [hideOff, setHideOff] = useState(false)

  const refresh = () =>
    api
      .listAnnouncements()
      .then(setRows)
      .catch((e) => setError(e.message))

  useEffect(() => {
    refresh()
    api.channels().then(setChannels).catch(() => setChannels([]))
    api.listEvents().then(setEvents).catch(() => setEvents([]))
  }, [])

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload = toPayload(form)
      // Both endpoints return the saved row, so re-listing the collection
      // would be a second round trip for data we already hold.
      if (form.id) {
        const saved = await api.updateAnnouncement(form.id, payload)
        setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)))
      } else {
        const saved = await api.createAnnouncement(payload)
        setRows((rs) => [...rs, saved])
      }
      setForm(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function sendTest(row) {
    setError(null)
    setNotice(null)
    setPending((p) => ({ ...p, [row.id]: 'sending' }))
    try {
      await api.testAnnouncement(row.id)
      setNotice(`Sent "${row.name}" to Discord.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setPending((p) => {
        const { [row.id]: _drop, ...rest } = p
        return rest
      })
    }
  }

  async function remove(row) {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return
    setError(null)
    setPending((p) => ({ ...p, [row.id]: 'deleting' }))
    try {
      await api.deleteAnnouncement(row.id)
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

  // Both sides are strings now; === on mixed types would never match.
  const channelName = (id) =>
    channels.find((c) => String(c.id) === String(id))?.name ?? id

  /* Soonest first: the question this page answers is "what goes out next", and
     the answer should be at the top rather than wherever it happened to be
     created. Anything unscheduled sinks to the bottom. */
  const offCount = rows.filter((r) => !r.enabled).length
  const visible = rows
    .filter((r) => !hideOff || r.enabled)
    .slice()
    .sort((a, b) => soonest(a.next_run_at) - soonest(b.next_run_at) || a.name.localeCompare(b.name))

  return (
    <div className="page">
      <div className="page-head">
        <h2>Scheduled announcements</h2>
        <div className="row">
          {offCount > 0 && (
            <button
              type="button"
              className={hideOff ? 'chip on' : 'chip'}
              onClick={() => setHideOff(!hideOff)}
            >
              {hideOff ? `${offCount} off hidden` : `Hide ${offCount} off`}
            </button>
          )}
          <button className="btn primary" onClick={() => setForm(blankForm())}>
            New announcement
          </button>
        </div>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNotice(null)}>{notice}</Banner>

      {rows.length === 0 && !form && (
        <p className="muted">Nothing scheduled yet. Create one to get started.</p>
      )}

      {rows.length > 0 && visible.length === 0 && (
        <p className="muted">Every announcement is switched off. Show them to edit one.</p>
      )}

      <div className="cards rows">
        {visible.map((row) => (
          <ListRow
            key={row.id}
            id={row.id}
            enabled={row.enabled}
            title={row.name}
            where={`#${channelName(row.channel_id)}`}
            warn={row.last_error ? 'last send failed' : null}
            when={briefWhen(row.next_run_at) ?? 'not scheduled'}
            whenNote={row.next_run_at ? withServerTime(row.next_run_at) : null}
            open={open === row.id}
            onToggle={() => setOpen(open === row.id ? null : row.id)}
          >
            <div className="card-meta">
              <span className="pill">{row.kind}</span>
              {row.kind === 'cron' && <code>{row.cron_expr}</code>}
              {row.kind === 'interval' && <code>every {row.interval_minutes}m</code>}
              {row.kind === 'rotation' && (
                <code>every {Math.round((row.interval_minutes ?? 1440) / 1440)} days</code>
              )}
              <span className="muted">{row.timezone}</span>
            </div>
            <p className="card-body">{row.body.slice(0, 160)}</p>
            {(row.created_by_name || row.updated_by_name) && (
              <div className="byline muted">
                {row.created_by_name && <>Added by <b>{row.created_by_name}</b></>}
                {row.updated_by_name && row.updated_by_name !== row.created_by_name && (
                  <> · last edited by <b>{row.updated_by_name}</b></>
                )}
              </div>
            )}

            <dl className="when">
              <dt>Posts</dt>
              <dd>
                {row.next_run_at ? (
                  <>
                    {fmtWhen(row.next_run_at)}{' '}
                    <span className="muted">· {withServerTime(row.next_run_at)}</span>
                  </>
                ) : (
                  <span className="muted">Not scheduled</span>
                )}
              </dd>

              {/* Only event-linked rows have a second time. Without it a lone
                  "21:30" reads as the event's own start, which is 22:00. */}
              {row.event_starts_at && (
                <>
                  <dt>Event starts</dt>
                  <dd>
                    {fmtWhen(row.event_starts_at)}{' '}
                    <span className="muted">· {withServerTime(row.event_starts_at)}</span>
                    <span className="muted lead">
                      {row.lead_minutes} min after this posts
                    </span>
                  </dd>
                </>
              )}

              {row.last_fired_at && (
                <>
                  <dt>Last sent</dt>
                  <dd className="muted">
                    {fmtWhen(row.last_fired_at)} ({row.fire_count}×)
                  </dd>
                </>
              )}
            </dl>
            {row.last_error && <div className="banner error small"><div className="banner-body">{row.last_error}</div></div>}

            {preview === row.id && (
              <EmbedPreview announcement={row} />
            )}
            <div className="card-actions">
              <button
                className="btn"
                onClick={() =>
                  setForm({
                    ...EMPTY,
                    ...row,
                    channel_id: String(row.channel_id),
                    run_at: utcToZoned(row.run_at, row.timezone),
                  })
                }
              >
                Edit
              </button>
              <button
                className="btn"
                onClick={() => setPreview(preview === row.id ? null : row.id)}
              >
                {preview === row.id ? 'Hide preview' : 'Preview'}
              </button>
              <button
                className="btn"
                onClick={() => sendTest(row)}
                disabled={Boolean(pending[row.id])}
              >
                {pending[row.id] === 'sending' ? 'Sending…' : 'Send test'}
              </button>
              <button
                className="btn danger"
                onClick={() => remove(row)}
                disabled={Boolean(pending[row.id])}
              >
                {pending[row.id] === 'deleting' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </ListRow>
        ))}
      </div>

      {form && (
        <form className="panel" onSubmit={save}>
          <h3>{form.id ? `Edit "${form.name}"` : 'New announcement'}</h3>

          <div className="grid">
            <label>
              Name
              <input value={form.name} onChange={set('name')} required />
            </label>

            <label>
              Channel
              <select value={form.channel_id} onChange={set('channel_id')} required>
                <option value="">Select a channel…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                    {c.category ? ` (${c.category})` : ''}
                  </option>
                ))}
              </select>
              {channels.length === 0 && (
                <small className="muted">
                  No channels loaded — the bot may not be connected yet.
                </small>
              )}
            </label>

            <ScheduleBuilder form={form} setForm={setForm} events={events} />

            <label>
              Title
              <input value={form.title ?? ''} onChange={set('title')} />
            </label>

            <label>
              Mention
              <select value={form.mention ?? ''} onChange={set('mention')}>
                <option value="">No ping</option>
                <option value="@everyone">@everyone</option>
                <option value="@here">@here</option>
              </select>
            </label>

            <label className="wide">
              Message
              <textarea rows="6" value={form.body} onChange={set('body')} required />
              <small className="muted">Discord markdown works: **bold**, *italic*, `code`.</small>
            </label>

            <label className="inline">
              <input type="checkbox" checked={form.use_embed} onChange={set('use_embed')} />
              Send as embed
            </label>

            {form.use_embed && (
              <label>
                Embed color
                <input type="color" value={form.embed_color ?? '#5865F2'} onChange={set('embed_color')} />
              </label>
            )}

            <label className="inline">
              <input type="checkbox" checked={form.enabled} onChange={set('enabled')} />
              Enabled
            </label>
          </div>

          <div className="wiz-preview form-preview">
            <div className="preview-label muted small">How it will look in Discord</div>
            <EmbedPreview announcement={form} />
          </div>

          <div className="card-actions">
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>

            <button className="btn" type="button" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
