import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import DateTimeField from '../components/DateTimeField.jsx'
import TimezoneField from '../components/TimezoneField.jsx'
import { zonedToIso } from '../lib/tz.js'
import { REPEATS } from '../lib/schedule.js'
import EmbedPreview from '../components/EmbedPreview.jsx'
import ChannelLink from '../components/ChannelLink.jsx'
import { withServerTime } from '../lib/servertime.js'

/**
 * The guided path for the common case: a recurring game event, and a message
 * the bot posts before each occurrence.
 *
 * The tool is event-first — an announcement's timing is usually derived from
 * an event — but the tabbed UI never said so, leaving newcomers to infer the
 * relationship. This makes the order explicit: define when it happens, then
 * what to say, then confirm.
 *
 * Anything this cannot express is still reachable from the Events and
 * Announcements tabs; this is the front door, not the only door.
 */

const DAY_ORDER = [0, 1, 2, 3, 4, 5, 6]     // Mon..Sun, as the API stores them
const DAY_LABELS = (() => {
  const f = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
  return DAY_ORDER.map((i) => f.format(new Date(2024, 0, 1 + i)))
})()

const fmtWhen = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

/** "Frankenstein Round 1" -> "frankenstein-round-1" */
const slugify = (name) =>
  name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

const STEPS = ['The event', 'The message', 'Check and create']

const BLANK_EVENT = {
  key: '', name: '', description: '', enabled: true,
  schedule_type: 'rotation', weekdays: [], rotation_days: 3,
  reference_date: '', fixed_dates: [],
  start_time: '20:00', duration_minutes: 60,
  timezone: 'Asia/Seoul', signup_enabled: false,
}

const BLANK_ANN = {
  name: '', enabled: true, channel_id: '', kind: 'event',
  cron_expr: null, interval_minutes: null, run_at: null,
  timezone: 'Asia/Seoul', title: '', body: '',
  use_embed: true, embed_color: '#FBBF24', mention: '@everyone',
  event_id: null, lead_minutes: 30,
}

export default function Setup({ onDone }) {
  const [step, setStep] = useState(0)
  const [ev, setEv] = useState({ ...BLANK_EVENT })
  const [ann, setAnn] = useState({ ...BLANK_ANN })
  const [channels, setChannels] = useState([])
  const bodyRef = useRef(null)
  const [dates, setDates] = useState([])
  const [dateError, setDateError] = useState(null)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.channels().then(setChannels).catch(() => setChannels([])) }, [])

  // The key and the announcement's label are derived, so two fields a newcomer
  // does not care about fill themselves in. The heading is left alone: seeding
  // it would freeze at the first letter typed, since it would then be truthy.
  function setEventName(name) {
    setEv((e) => ({ ...e, name, key: slugify(name) }))
    setAnn((a) => ({ ...a, name }))
  }

  const eventPayload = () => ({
    ...ev,
    weekdays: ev.schedule_type === 'weekly' ? ev.weekdays.map(Number) : null,
    rotation_days: ev.schedule_type === 'rotation' ? Number(ev.rotation_days) : null,
    // Midnight in the event's own zone: read back as a calendar date there,
    // a browser-local midnight lands a day early for any zone behind UTC.
    reference_date:
      ev.schedule_type === 'rotation' && ev.reference_date
        ? zonedToIso(`${String(ev.reference_date).slice(0, 10)}T00:00`, ev.timezone)
        : null,
    fixed_dates: ev.schedule_type === 'fixed' ? ev.fixed_dates : null,
    duration_minutes: Number(ev.duration_minutes),
    description: ev.description || null,
  })

  /** What the chosen repeat mode still needs before a preview means anything. */
  const missing = (() => {
    if (!ev.name) return 'Give it a name to get started.'
    if (ev.schedule_type === 'rotation' && !ev.reference_date)
      return 'Pick a day you know it runs, and the rest of the dates follow.'
    if (ev.schedule_type === 'weekly' && ev.weekdays.length === 0)
      return 'Choose at least one day of the week.'
    if (ev.schedule_type === 'fixed' && ev.fixed_dates.length === 0)
      return 'Pick at least one date.'
    return null
  })()

  // Live, because a rotation cannot be checked by reading its settings.
  useEffect(() => {
    if (step !== 0 || missing) { setDates([]); setDateError(null); return undefined }
    const id = setTimeout(() => {
      api.previewEvent(eventPayload())
        .then((d) => { setDates(d); setDateError(null) })
        .catch((e) => { setDates([]); setDateError(e.message) })
    }, 300)
    return () => clearTimeout(id)
  }, [step, ev, missing])

  const step1Ready = ev.name && ev.key && dates.length > 0
  const step2Ready = ann.channel_id && ann.body

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const result = await api.guidedSetup({
        event: eventPayload(),
        announcement: {
          ...ann,
          channel_id: ann.channel_id,
          lead_minutes: Number(ann.lead_minutes) || 0,
          title: ann.title || null,
          mention: ann.mention || null,
          event_id: null,
          kind: 'event',
        },
      })
      setDone(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="page">
        <div className="wiz-done">
          <div className="wiz-tick" aria-hidden="true">✓</div>
          <h2>{ev.name} is set up</h2>
          <p className="muted">
            The bot will post {ann.lead_minutes} minutes before every occurrence.
            You do not need to do anything else.
          </p>
          {done.event?.upcoming?.length > 0 && (
            <div className="sched-preview">
              <strong>Next posts</strong>
              <ul>
                {done.event.upcoming.slice(0, 3).map((iso) => {
                  const at = new Date(new Date(iso).getTime() - (Number(ann.lead_minutes) || 0) * 60000)
                  return (
                    <li key={iso}>
                      {fmtWhen(at.toISOString())}
                      <span className="muted"> · {withServerTime(at.toISOString())}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
            <button className="btn primary" onClick={() => {
              setDone(null); setStep(0); setEv({ ...BLANK_EVENT }); setAnn({ ...BLANK_ANN })
            }}>
              Set up another
            </button>
            <button className="btn" onClick={() => onDone?.('announcements')}>
              See all announcements
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="wiz-intro">
        <h2>Set up a recurring announcement</h2>
        <p className="muted">
          Two things make one automatic announcement: an <strong>event</strong>, which is when
          something happens in the game, and a <strong>message</strong>, which is what the bot
          posts before it. Define the event once and the message repeats with it forever.
        </p>
      </div>

      <ol className="wiz-rail">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'on' : i < step ? 'past' : ''}>
            <span className="wiz-num">{i < step ? '✓' : i + 1}</span>
            <span className="wiz-label">{label}</span>
          </li>
        ))}
      </ol>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>

      {step === 0 && (
        <div className="panel">
          <h3>Step 1 · When does it happen in the game?</h3>

          <div className="grid">
            <label className="wide">
              What is it called?
              <input
                value={ev.name}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Frankenstein Round 1"
                autoFocus
              />
              {ev.key && <small className="muted">Members will refer to it as <code>{ev.key}</code></small>}
            </label>

            <div className="wide">
              <span className="label">How often does it come round?</span>
              <div className="row wrap">
                {REPEATS.map(([value, label]) => (
                  <button
                    type="button" key={value}
                    className={ev.schedule_type === value ? 'chip on' : 'chip'}
                    onClick={() => setEv((e) => ({ ...e, schedule_type: value }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <small className="muted">
                Most Dark War Survival events drift through the week, which is “every N days”.
              </small>
            </div>

            {ev.schedule_type === 'rotation' && (
              <>
                <label>
                  Every how many days?
                  <input
                    type="number" inputMode="numeric" min="1"
                    value={ev.rotation_days}
                    onChange={(e) => setEv((s) => ({ ...s, rotation_days: e.target.value }))}
                  />
                </label>
                <label>
                  A day you know it runs
                  <DateTimeField
                    mode="date"
                    value={(ev.reference_date ?? '').slice(0, 10)}
                    onChange={(v) => setEv((s) => ({ ...s, reference_date: v }))}
                    placeholder="Pick any known day…"
                  />
                </label>
              </>
            )}

            {ev.schedule_type === 'weekly' && (
              <div className="wide">
                <span className="label">Which days?</span>
                <div className="row wrap">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      type="button" key={label}
                      className={ev.weekdays.includes(i) ? 'chip on' : 'chip'}
                      onClick={() => setEv((s) => ({
                        ...s,
                        weekdays: s.weekdays.includes(i)
                          ? s.weekdays.filter((d) => d !== i)
                          : [...s.weekdays, i].sort(),
                      }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ev.schedule_type === 'fixed' && (
              <div className="wide">
                <span className="label">Which dates?</span>
                <DateTimeField
                  mode="multi"
                  values={ev.fixed_dates}
                  onChange={(v) => setEv((s) => ({ ...s, fixed_dates: v }))}
                  placeholder="Pick one or more days…"
                />
              </div>
            )}

            <label>
              What time does it start?
              <input
                type="time" value={ev.start_time ?? ''}
                onChange={(e) => setEv((s) => ({ ...s, start_time: e.target.value }))}
              />
            </label>
            <TimezoneField
              value={ev.timezone}
              onChange={(v) => setEv((s) => ({ ...s, timezone: v }))}
            />
          </div>

          <div className={dateError ? 'sched-preview bad' : 'sched-preview'}>
            {missing ? <span className="muted">{missing}</span>
              : dateError ? <span>{dateError}</span>
              : dates.length > 0 ? (
                <>
                  <strong>So it happens on</strong>
                  <ul>
                    {dates.slice(0, 4).map((iso) => (
                      <li key={iso}>
                        {fmtWhen(iso)}<span className="muted"> · {withServerTime(iso)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <span className="muted">Working out the dates…</span>}
          </div>

          <div className="card-actions">
            <button className="btn primary" disabled={!step1Ready} onClick={() => setStep(1)}>
              Next · the message
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="panel">
          <h3>Step 2 · What should the bot post?</h3>

          <div className="wiz-split">
            <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                Which channel?
                <select
                  value={ann.channel_id}
                  onChange={(e) => setAnn((a) => ({ ...a, channel_id: e.target.value }))}
                >
                  <option value="">Select a channel…</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </label>

              <label>
                How long before it starts?
                <div className="row">
                  {[10, 30, 60].map((m) => (
                    <button
                      type="button" key={m}
                      className={Number(ann.lead_minutes) === m ? 'chip on' : 'chip'}
                      onClick={() => setAnn((a) => ({ ...a, lead_minutes: m }))}
                    >
                      {m} min
                    </button>
                  ))}
                  <input
                    type="number" inputMode="numeric" min="0" style={{ maxWidth: 90 }}
                    value={ann.lead_minutes}
                    onChange={(e) => setAnn((a) => ({ ...a, lead_minutes: e.target.value }))}
                  />
                </div>
              </label>

              <label>
                Heading
                <input
                  value={ann.title ?? ''}
                  onChange={(e) => setAnn((a) => ({ ...a, title: e.target.value }))}
                  placeholder={ev.name}
                />
              </label>

              <label>
                <span className="label-row">
                  Message
                  <ChannelLink
                    channels={channels}
                    textareaRef={bodyRef}
                    value={ann.body}
                    onChange={(v) => setAnn((a) => ({ ...a, body: v }))}
                  />
                </span>
                <textarea
                  ref={bodyRef}
                  rows="5" value={ann.body}
                  onChange={(e) => setAnn((a) => ({ ...a, body: e.target.value }))}
                  placeholder={`${ev.name} starts in ${ann.lead_minutes} minutes — rally up!`}
                />
                <small className="muted">
                  **bold**, *italic*, `code` all work, and a linked channel posts as a
                  clickable #name.
                </small>
              </label>

              <label>
                Who gets notified?
                <select
                  value={ann.mention ?? ''}
                  onChange={(e) => setAnn((a) => ({ ...a, mention: e.target.value }))}
                >
                  <option value="@everyone">Everyone</option>
                  <option value="@here">Only people online</option>
                  <option value="">Nobody — post quietly</option>
                </select>
              </label>

              <label>
                Accent color
                <input
                  type="color" value={ann.embed_color ?? '#FBBF24'}
                  onChange={(e) => setAnn((a) => ({ ...a, embed_color: e.target.value }))}
                />
              </label>
            </div>

            {/* Live, beside the inputs — the point is to see it while writing. */}
            <div className="wiz-preview">
              <div className="preview-label muted small">In Discord, this will look like</div>
              <EmbedPreview
                announcement={{ ...ann, body: ann.body || `${ev.name} starts soon!` }}
                channels={channels}
              />
            </div>
          </div>

          <div className="card-actions">
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            <button className="btn primary" disabled={!step2Ready} onClick={() => setStep(2)}>
              Next · check it
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="panel">
          <h3>Step 3 · Does this look right?</h3>

          <dl className="when wiz-review">
            <dt>Event</dt><dd>{ev.name}</dd>
            <dt>Happens</dt>
            <dd>
              {ev.schedule_type === 'rotation' && `Every ${ev.rotation_days} days at ${ev.start_time}`}
              {ev.schedule_type === 'weekly' &&
                `${ev.weekdays.map((d) => DAY_LABELS[d]).join(', ')} at ${ev.start_time}`}
              {ev.schedule_type === 'fixed' && `${ev.fixed_dates.length} set dates at ${ev.start_time}`}
              {' '}({ev.timezone === 'Etc/GMT+2' ? 'server time' : ev.timezone})
            </dd>
            <dt>Posts to</dt>
            <dd>#{channels.find((c) => String(c.id) === String(ann.channel_id))?.name ?? ann.channel_id}</dd>
            <dt>How early</dt><dd>{ann.lead_minutes} minutes before</dd>
            <dt>Next posts</dt>
            <dd>
              {dates.slice(0, 3).map((iso) => {
                const at = new Date(new Date(iso).getTime() - (Number(ann.lead_minutes) || 0) * 60000)
                return <div key={iso}>{fmtWhen(at.toISOString())} · {withServerTime(at.toISOString())}</div>
              })}
            </dd>
          </dl>

          <div className="wiz-preview" style={{ marginTop: 16 }}>
            <div className="preview-label muted small">The post itself</div>
            <EmbedPreview announcement={ann} channels={channels} />
          </div>

          <div className="card-actions">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary" disabled={busy} onClick={create}>
              {busy ? 'Creating…' : 'Create it'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
