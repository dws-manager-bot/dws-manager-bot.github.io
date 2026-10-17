import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import ListRow from '../components/ListRow.jsx'

/**
 * Gift codes for the game's own redeem page, and the accounts that want them
 * redeemed for them.
 *
 * Add a code here and it waits. "Redeem now" walks every live code against every
 * account that has a game id, a login token and auto-redeem on, skipping each
 * pair that is already finished, so pressing it twice costs nothing. A run takes
 * about six seconds per call, so it works in the background and this page polls.
 *
 * The login token is a credential: it can be typed in and replaced, and the
 * server never sends it back, so there is nothing here to show.
 */

const fmtWhen = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

const CODE_STATUS = {
  active: ['Live', 'ok'],
  expired: ['Expired', 'off'],
  exhausted: ['Limit reached', 'off'],
}

const RESULT = {
  redeemed: 'Redeemed',
  already: 'Had it already',
  not_found: 'Not found',
  expired: 'Expired',
  exhausted: 'Limit reached',
  error: 'Error',
}

/* The run's counts, in the order a person asks about them. */
const SUMMARY = [
  ['ok', 'redeemed'],
  ['already', 'already had'],
  ['exhausted', 'hit the limit'],
  ['expired', 'expired'],
  ['not_found', 'not found'],
  ['error', 'errors'],
  ['login_refused', 'login refused'],
  ['cooldown', 'rate-limited'],
]

const describeRun = (run) => {
  const parts = SUMMARY.filter(([key]) => run.summary?.[key] > 0)
    .map(([key, label]) => `${run.summary[key]} ${label}`)
  return parts.length ? parts.join(', ') : 'nothing needed redeeming'
}

export default function GiftCodes() {
  const [codes, setCodes] = useState(null)
  const [accounts, setAccounts] = useState(null)
  const [run, setRun] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [open, setOpen] = useState(null)
  const [openAccount, setOpenAccount] = useState(null)
  const [form, setForm] = useState({ code: '', note: '' })
  const [adding, setAdding] = useState(false)
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(null)
  const wasRunning = useRef(false)

  const loadCodes = () => api.listGiftCodes().then(setCodes).catch((e) => setError(e.message))
  const loadAccounts = () =>
    api.listGiftAccounts().then(setAccounts).catch((e) => setError(e.message))

  useEffect(() => {
    loadCodes()
    loadAccounts()
    api.giftRun().then(setRun).catch(() => setRun({ running: false, summary: {} }))
  }, [])

  // Poll while a run is going; when it ends, say how it went and refresh the list.
  const running = Boolean(run?.running)
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      api.giftRun().then(setRun).catch((e) => setError(e.message))
    }, 3000)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (wasRunning.current && run && !run.running) {
      if (run.error) setError(run.error)
      else setNote(`Finished: ${describeRun(run)}.`)
      loadCodes()
      loadAccounts()
    }
    wasRunning.current = running
  }, [running, run])

  async function addCode(e) {
    e.preventDefault()
    setAdding(true)
    setError(null)
    try {
      await api.createGiftCode({ code: form.code, note: form.note || null })
      setNote(`Added ${form.code.trim()}.`)
      setForm({ code: '', note: '' })
      await loadCodes()
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function remove(c) {
    if (!window.confirm(`Delete ${c.code}? Its redemption history goes with it.`)) return
    try {
      await api.deleteGiftCode(c.id)
      setOpen(null)
      await loadCodes()
    } catch (err) {
      setError(err.message)
    }
  }

  async function start() {
    setError(null)
    setNote(null)
    try {
      setRun(await api.startGiftRun())
    } catch (err) {
      setError(err.message)
    }
  }

  const editOf = (a) =>
    edits[a.id] ?? { uid: a.game_uid ?? '', token: '', auto: a.auto_redeem }
  const setEdit = (a, patch) =>
    setEdits((all) => ({ ...all, [a.id]: { ...editOf(a), ...patch } }))

  async function saveAccount(e, a, extra = {}) {
    e.preventDefault()
    const f = editOf(a)
    setSaving(a.id)
    setError(null)
    try {
      const body = { game_uid: f.uid, auto_redeem: f.auto }
      if (f.token.trim()) body.game_uuid = f.token
      Object.assign(body, extra)
      const updated = await api.updateGiftAccount(a.id, body)
      setAccounts((all) => all.map((x) => (x.id === a.id ? updated : x)))
      setEdits((all) => {
        const { [a.id]: _gone, ...rest } = all
        return rest
      })
      setNote(`Saved ${a.username ?? 'the account'}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(null)
    }
  }

  const ready = accounts?.filter((a) => a.auto_redeem).length ?? 0
  const live = codes?.filter((c) => c.status === 'active').length ?? 0

  return (
    <div className="page">
      <div className="page-head">
        <h2>Gift codes</h2>
        <div className="row">
          {running && <span className="muted">Redeeming… started {fmtWhen(run.started_at)}</span>}
          <button className="btn primary" onClick={start} disabled={running || !live || !ready}>
            {running ? 'Running…' : 'Redeem now'}
          </button>
        </div>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNote(null)}>{note}</Banner>

      <form className="panel" onSubmit={addCode}>
        <h3>Add a code</h3>
        <div className="row wrap">
          <label>
            Code
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="ZOM8IE"
              maxLength={40}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
          <label>
            Note (optional)
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="where it came from"
              maxLength={500}
            />
          </label>
          <button className="btn primary" type="submit" disabled={adding || !form.code.trim()}>
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        <small className="muted">
          It waits here until you press Redeem now. A code the game calls expired or used up
          is closed for good.
        </small>
      </form>

      <h3>Codes</h3>
      {codes === null && !error && <p className="muted">Loading…</p>}
      {codes?.length === 0 && <p className="muted">No codes yet.</p>}
      <div className="cards rows">
        {codes?.map((c) => {
          const [label, tone] = CODE_STATUS[c.status] ?? [c.status, 'off']
          const people = `${c.redeemed} done` + (c.waiting ? ` · ${c.waiting} waiting` : '')
          return (
            <ListRow
              key={c.id}
              id={`code-${c.id}`}
              enabled={c.status === 'active'}
              title={c.code}
              where={label}
              when={people}
              open={open === c.id}
              onToggle={() => setOpen(open === c.id ? null : c.id)}
            >
              <dl className="when">
                <dt>Status</dt>
                <dd>
                  <span className={`dot ${tone}`} /> {label}
                  {c.closed_at && <span className="muted"> · {fmtWhen(c.closed_at)}</span>}
                </dd>
                {c.closed_response && (<><dt>The game said</dt><dd>{c.closed_response}</dd></>)}
                <dt>Added</dt>
                <dd>
                  {fmtWhen(c.created_at)}
                  {c.created_by_name && <span className="muted"> · {c.created_by_name}</span>}
                </dd>
                <dt>Accounts</dt>
                <dd>
                  {c.results.length === 0 ? (
                    <span className="muted">Not tried on any account yet.</span>
                  ) : (
                    <ul className="names">
                      {c.results.map((r) => (
                        <li key={r.user_id}>
                          <span>{r.username ?? `Account ${r.user_id}`}</span>
                          <span className="muted">
                            {RESULT[r.state] ?? r.state}
                            {r.attempts > 1 && ` · ${r.attempts} tries`}
                            {r.last_attempt_at && ` · ${fmtWhen(r.last_attempt_at)}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </dl>
              {c.note && <p className="card-body">{c.note}</p>}
              <div className="card-actions">
                <button className="btn danger" onClick={() => remove(c)}>Delete</button>
              </div>
            </ListRow>
          )
        })}
      </div>

      <h3>Accounts</h3>
      <p className="muted">
        Anyone who has signed in to this site. An account is redeemed for only when it has
        a game id, a login token and auto-redeem on.
      </p>
      {accounts === null && !error && <p className="muted">Loading…</p>}
      <div className="cards rows">
        {accounts?.map((a) => {
          const f = editOf(a)
          return (
            <ListRow
              key={a.id}
              id={`account-${a.id}`}
              enabled={a.auto_redeem}
              title={a.username ?? `Account ${a.id}`}
              where={a.game_uid ?? 'no game id'}
              warn={a.login_failed_at ? 'login refused' : null}
              when={a.auto_redeem ? 'auto-redeem on' : 'off'}
              open={openAccount === a.id}
              onToggle={() => setOpenAccount(openAccount === a.id ? null : a.id)}
            >
              <form onSubmit={(e) => saveAccount(e, a)}>
                <label>
                  Game id
                  <input
                    value={f.uid}
                    onChange={(e) => setEdit(a, { uid: e.target.value })}
                    inputMode="numeric"
                    placeholder="1234567890123456"
                    autoComplete="off"
                  />
                </label>
                <label>
                  Login token
                  <input
                    type="password"
                    value={f.token}
                    onChange={(e) => setEdit(a, { token: e.target.value })}
                    placeholder={a.has_login ? 'Set. Paste a new one to replace it' : 'Paste the token'}
                    autoComplete="off"
                  />
                </label>
                {a.login_failed_at && (
                  <p className="warn-line">
                    The game refused this token on {fmtWhen(a.login_failed_at)}. Scan the QR
                    code again and paste the new one.
                  </p>
                )}
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={f.auto}
                    onChange={(e) => setEdit(a, { auto: e.target.checked })}
                  />
                  Redeem codes for this account
                </label>
                <div className="card-actions">
                  <button className="btn primary" type="submit" disabled={saving === a.id}>
                    {saving === a.id ? 'Saving…' : 'Save'}
                  </button>
                  {a.has_login && (
                    <button
                      className="btn danger"
                      type="button"
                      disabled={saving === a.id}
                      onClick={(e) => saveAccount(e, a, { game_uuid: '' })}
                    >
                      Remove token
                    </button>
                  )}
                </div>
              </form>
            </ListRow>
          )
        })}
      </div>
    </div>
  )
}
