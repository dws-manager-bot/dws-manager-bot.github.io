import { Fragment, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import EditorPanel from '../components/EditorPanel.jsx'
import ListRow from '../components/ListRow.jsx'
import ListSection from '../components/ListSection.jsx'
import RosterImport from '../components/RosterImport.jsx'
import { full, short } from '../lib/cp.js'

/**
 * Every game account the alliance tracks, followed across nickname changes.
 *
 * A player's id never changes; their name does, and often. So a name change
 * has to say which kind it is: a rename keeps the old name in their history,
 * a spelling fix replaces a name that was misread and was never really theirs.
 * Someone who leaves is marked, not deleted, so a return is the same player.
 */

/* Calendar dates, not moments: parsed and printed in UTC so no browser zone
   can move one across midnight. */
const fmtDay = (d) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${d}T00:00:00Z`))
const seen = (n) => {
  if (!n.first_seen) return ''
  return n.first_seen === n.last_seen || !n.last_seen
    ? fmtDay(n.first_seen)
    : `${fmtDay(n.first_seen)} – ${fmtDay(n.last_seen)}`
}

/* Case and accents folded, so "jaina" finds "JAÍNA". */
const fold = (s) => String(s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

/* "54,499,085" pasted from the game, or typed with spaces: digits are all that count. */
const parseCount = (text) => {
  const digits = String(text ?? '').replace(/[\s,._]/g, '')
  if (digits === '') return null
  return /^\d+$/.test(digits) ? Number(digits) : NaN
}

const SORTS = [
  ['bgb', 'BGB CP'],
  ['total', 'Total CP'],
  ['rank', 'Rank'],
  ['name', 'Name'],
]

const EMPTY = {
  name: '', name_change: null, rank: '', industry_level: '', bgb_cp: '', total_cp: '', notes: '',
}

function toForm(p) {
  return {
    id: p.id,
    original: p.name,
    before: {
      rank: p.rank ?? null,
      industry_level: p.industry_level ?? null,
      bgb_cp: p.bgb_cp ?? null,
      total_cp: p.total_cp ?? null,
      notes: p.notes ?? null,
    },
    name: p.name,
    name_change: null,
    rank: p.rank ?? '',
    industry_level: p.industry_level ?? '',
    bgb_cp: p.bgb_cp ?? '',
    total_cp: p.total_cp ?? '',
    notes: p.notes ?? '',
  }
}

/** The form as the API wants it, or a message saying what is wrong with it. */
function toPayload(form) {
  const numbers = {
    industry_level: parseCount(form.industry_level),
    bgb_cp: parseCount(form.bgb_cp),
    total_cp: parseCount(form.total_cp),
  }
  const labels = { industry_level: 'Industry level', bgb_cp: 'BGB CP', total_cp: 'Total CP' }
  const bad = Object.keys(numbers).find((k) => Number.isNaN(numbers[k]))
  if (bad) return { error: `${labels[bad]}: numbers only` }

  const name = form.name.trim()
  const renamed = form.id && name !== form.original
  if (renamed && !form.name_change) {
    return { error: 'Say whether the new name is a new nickname or a spelling fix' }
  }
  const next = {
    rank: form.rank === '' ? null : Number(form.rank),
    ...numbers,
    notes: form.notes.trim() || null,
  }
  if (!form.id) return { payload: { name, ...next } }
  // Only what changed, so History lists the fields someone actually edited.
  const payload = Object.fromEntries(
    Object.entries(next).filter(([k, v]) => v !== form.before[k]),
  )
  if (renamed) Object.assign(payload, { name, name_change: form.name_change })
  return { payload }
}

export default function Members() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('bgb')
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState({})
  const [showLeft, setShowLeft] = useState(false)
  const [importing, setImporting] = useState(false)
  const [note, setNote] = useState(null)

  useEffect(() => {
    api.listPlayers().then(setRows).catch((e) => setError(e.message))
  }, [])

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  /* Search reads every name a player has had, so an old name still finds them;
     when that is how they matched, the row says so. */
  const shown = useMemo(() => {
    if (!rows) return { current: [], left: [] }
    const q = fold(query.trim())
    const matched = rows
      .map((p) => {
        if (!q) return { p, was: null }
        if (fold(p.name).includes(q)) return { p, was: null }
        const old = p.names.find((n) => n.name !== p.name && fold(n.name).includes(q))
        return old ? { p, was: old.name } : null
      })
      .filter(Boolean)
    /* Each sort is a list of keys, applied in turn. By rank that means R5 first
       and the unranked last, and within a rank the strongest first, which is the
       order the game's own member list is read in. */
    const keys = {
      bgb: (x) => [-(x.p.bgb_cp ?? -1)],
      total: (x) => [-(x.p.total_cp ?? -1)],
      rank: (x) => [-(x.p.rank ?? 0), -(x.p.bgb_cp ?? -1)],
      name: () => [0],
    }[sort]
    matched.sort((a, b) => {
      const left = keys(a)
      const right = keys(b)
      for (let i = 0; i < left.length; i += 1) {
        if (left[i] !== right[i]) return left[i] - right[i]
      }
      return a.p.name.localeCompare(b.p.name)
    })
    return {
      current: matched.filter((x) => x.p.active),
      left: matched.filter((x) => !x.p.active),
    }
  }, [rows, query, sort])

  const replace = (saved) => setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)))

  async function save(e) {
    e.preventDefault()
    const { payload, error: invalid } = toPayload(form)
    if (invalid) { setError(invalid); return }
    if (form.id && Object.keys(payload).length === 0) { setForm(null); return }
    setError(null)
    setBusy(true)
    try {
      if (form.id) {
        replace(await api.updatePlayer(form.id, payload))
      } else {
        const saved = await api.createPlayer(payload)
        setRows((rs) => [saved, ...rs])
        setOpen(saved.id)
      }
      setForm(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function run(p, call) {
    setError(null)
    setPending((m) => ({ ...m, [p.id]: true }))
    try {
      await call()
    } catch (err) {
      setError(err.message)
    } finally {
      setPending((m) => {
        const { [p.id]: _drop, ...rest } = m
        return rest
      })
    }
  }

  const setActive = (p, active) =>
    run(p, async () => replace(await api.updatePlayer(p.id, { active })))

  const remove = (p) => {
    if (!confirm(
      `Delete “${p.name}” and their name history?\n\n` +
      'Only for someone added by mistake. If they left the alliance, mark them as left instead.',
    )) return
    run(p, async () => {
      await api.deletePlayer(p.id)
      setRows((rs) => rs.filter((r) => r.id !== p.id))
    })
  }

  const renamed = form?.id && form.name.trim() !== form.original

  const editorFields = form && (
    <div className="grid">
      <label>
        Name
        <input value={form.name} onChange={set('name')} required maxLength={100} />
      </label>
      {renamed && (
        <div className="wide">
          <span className="label">What changed?</span>
          <div className="row wrap">
            {[
              ['rename', 'New nickname'],
              ['correct', 'Spelling fix'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={form.name_change === value ? 'chip on' : 'chip'}
                onClick={() => setForm((f) => ({ ...f, name_change: value }))}
              >
                {label}
              </button>
            ))}
          </div>
          <small className="muted">
            {form.name_change === 'correct'
              ? `Replaces “${form.original}”, which was misread. It is not kept as an old name.`
              : `“${form.original}” stays in their history as an old name.`}
          </small>
        </div>
      )}
      <label>
        Rank
        <select value={form.rank} onChange={set('rank')}>
          <option value="">Not set</option>
          {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>R{r}</option>)}
        </select>
      </label>
      <label>
        Industry level
        <input inputMode="numeric" value={form.industry_level} onChange={set('industry_level')} />
      </label>
      {[
        ['bgb_cp', 'BGB CP'],
        ['total_cp', 'Total CP'],
      ].map(([field, label]) => {
        const n = parseCount(form[field])
        return (
          <label key={field}>
            {label}
            <input inputMode="numeric" value={form[field]} onChange={set(field)} placeholder="54,499,085" />
            {n != null && (
              <small className={Number.isNaN(n) ? 'error' : 'muted'}>
                {Number.isNaN(n) ? 'Numbers only' : `= ${short(n)}`}
              </small>
            )}
          </label>
        )
      })}
      <label className="wide">
        Notes
        <textarea rows="2" value={form.notes} onChange={set('notes')} />
      </label>
    </div>
  )

  const renderRow = ({ p, was }) => (
    <Fragment key={p.id}>
      <ListRow
        id={p.id}
        enabled={p.active}
        title={p.name}
        where={[p.rank && `R${p.rank}`, p.industry_level && `Lv ${p.industry_level}`, was && `was ${was}`]
          .filter(Boolean).join(' · ')}
        when={`BGB ${short(p.bgb_cp)}`}
        whenNote={p.total_cp != null ? `total ${short(p.total_cp)}` : null}
        open={open === p.id}
        onToggle={() => setOpen(open === p.id ? null : p.id)}
      >
        <dl className="when">
          <dt>BGB CP</dt>
          <dd>{full(p.bgb_cp)}</dd>
          <dt>Total CP</dt>
          <dd>{full(p.total_cp)}</dd>
          <dt>Rank</dt>
          <dd>{p.rank ? `R${p.rank}` : <span className="muted">not set</span>}</dd>
          <dt>Industry level</dt>
          <dd>{p.industry_level ?? '—'}</dd>
          <dt>{p.names.length > 1 ? 'Names' : 'Seen'}</dt>
          <dd>
            <ul className="names">
              {[...p.names].reverse().map((n) => (
                <li key={n.name}>
                  {p.names.length > 1 && <span>{n.name}</span>}
                  <span className="muted">{seen(n)}</span>
                </li>
              ))}
            </ul>
          </dd>
        </dl>
        {p.notes && <p className="card-body">{p.notes}</p>}
        <div className="card-actions">
          <button className="btn" onClick={() => setForm(toForm(p))}>Edit</button>
          <button className="btn" disabled={Boolean(pending[p.id])} onClick={() => setActive(p, !p.active)}>
            {p.active ? 'Mark as left' : 'Mark as returned'}
          </button>
          <button className="btn danger" disabled={Boolean(pending[p.id])} onClick={() => remove(p)}>
            Delete
          </button>
        </div>
      </ListRow>
      {form?.id === p.id && (
        <EditorPanel title={`Edit “${p.name}”`} onSubmit={save} onCancel={() => setForm(null)} busy={busy}>
          {editorFields}
        </EditorPanel>
      )}
    </Fragment>
  )

  const searching = query.trim() !== ''

  return (
    <div className="page">
      <div className="page-head">
        <h2>Members</h2>
        <div className="row">
          <button className="btn" onClick={() => { setImporting(!importing); setNote(null) }}>
            {importing ? 'Close import' : 'Import spreadsheet'}
          </button>
          <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>Add member</button>
        </div>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNote(null)}>{note}</Banner>

      {importing && (
        <RosterImport
          onError={setError}
          onApplied={(done) => {
            const counts = [
              [done.updated.length, 'updated'],
              [done.renamed.length, 'renamed'],
              [done.added.length, 'added'],
              [done.left.length, 'marked as left'],
              [done.returning.length, 'back'],
            ].filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`)
            setNote(`Imported, as of ${done.as_of}: ${counts.join(', ') || 'nothing to change'}.`)
            setImporting(false)
            api.listPlayers().then(setRows).catch((e) => setError(e.message))
          }}
        />
      )}

      {form && !form.id && (
        <EditorPanel title="New member" onSubmit={save} onCancel={() => setForm(null)} busy={busy} saveLabel="Add">
          {editorFields}
        </EditorPanel>
      )}

      <div className="members-tools">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names, old ones too"
          aria-label="Search members"
        />
        <div className="row">
          {SORTS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={sort === value ? 'chip on' : 'chip'}
              onClick={() => setSort(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows === null && !error && <p className="muted">Loading…</p>}
      {rows?.length === 0 && <p className="muted">No members yet.</p>}
      {rows?.length > 0 && searching && !shown.current.length && !shown.left.length && (
        <p className="muted">No one matches “{query.trim()}”.</p>
      )}

      <ListSection title="Current" count={shown.current.length}>
        {shown.current.map(renderRow)}
      </ListSection>

      <ListSection
        title="Left"
        count={shown.left.length}
        note="kept with their history"
        open={showLeft || searching}
        onToggle={() => setShowLeft(!showLeft)}
      >
        {shown.left.map(renderRow)}
      </ListSection>
    </div>
  )
}
