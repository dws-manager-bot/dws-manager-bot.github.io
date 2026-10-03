import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import { save } from '../lib/files.js'
import { short } from '../lib/cp.js'

/**
 * The season reward board.
 *
 * The game hands rewards out in four fixed bands and the sizes are its, not
 * ours: one leader, eight backbone, thirty key players, and everybody else a
 * contributor. Only the first three are placed — the fourth is whoever is left,
 * so dragging someone out of a band is how they become a contributor.
 *
 * The standing on the right is a suggestion, not a verdict. It orders candidates
 * by conquests attended and breaks ties on merit standing, but which of two
 * equally present members deserves more is a judgement the page cannot make,
 * which is the whole reason the bands are filled by hand.
 *
 * Online time sits beside them as one more thing to judge by, not a third
 * tiebreak. It is the average minutes of the two-hour war a member was online,
 * and a best case: the screenshots show when someone left, never when they came.
 *
 * Dragging is not the only way in. A touch screen has no HTML5 drag, and this
 * is read on a phone, so a member can be picked with a tap and the bands become
 * buttons — the same two steps, without the pointer.
 */

const TIERS = [
  ['leader', 'Alliance Leader', 'the R5, and only the R5'],
  ['backbone', 'Backbone', 'the eight the alliance rests on'],
  ['key', 'Key Players', 'the thirty who carry the events'],
  ['contributor', 'Contributors', 'everybody else'],
]

const SORTS = [
  ['standing', 'Standing'],
  ['rank', 'Rank'],
  ['attended', 'Attendance'],
  ['online', 'Online time'],
  ['bgb_cp', 'BGB CP'],
  ['total_cp', 'Total CP'],
]

const fmtDay = (d) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${d}T00:00:00Z`))

/* A standing is a place in a field, so it reads as a number out of a hundred. */
const standing = (v) => (v == null ? '—' : String(Math.round(v * 100)))

/* Minutes of the 120-minute war window. */
const minutes = (v) => (v == null ? '—' : `${v}m`)

const csv = (rows) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')

export default function Season() {
  const [data, setData] = useState(null)
  const [caps, setCaps] = useState({})
  const [placed, setPlaced] = useState({})      // player id -> tier
  const [saved, setSaved] = useState({})        // what the server last confirmed
  const [sort, setSort] = useState('standing')
  const [held, setHeld] = useState(null)        // the member picked up, or tapped
  const [over, setOver] = useState(null)        // the band a drag is hovering
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.season(), api.seasonAwards()])
      .then(([standing, awards]) => {
        setData(standing)
        setCaps(awards.caps)
        setPlaced(awards.awards)
        setSaved(awards.awards)
      })
      .catch((e) => setError(e.message))
  }, [])

  const byTier = useMemo(() => {
    const out = { leader: [], backbone: [], key: [], contributor: [] }
    if (!data) return out
    for (const m of data.members) out[placed[m.player_id] ?? 'contributor'].push(m)
    return out
  }, [data, placed])

  const candidates = useMemo(() => {
    const rest = byTier.contributor
    const key = {
      standing: (m) => [-m.attended, -(m.merit_standing ?? -1)],
      rank: (m) => [-(m.rank ?? 0), -m.attended],
      attended: (m) => [-m.attended, -(m.merit_standing ?? -1)],
      online: (m) => [-(m.online_minutes ?? -1), -m.attended],
      bgb_cp: (m) => [-(m.bgb_cp ?? -1)],
      total_cp: (m) => [-(m.total_cp ?? -1)],
    }[sort]
    return [...rest].sort((a, b) => {
      const l = key(a)
      const r = key(b)
      for (let i = 0; i < l.length; i += 1) if (l[i] !== r[i]) return l[i] - r[i]
      return a.name.localeCompare(b.name)
    })
  }, [byTier, sort])

  const dirty = useMemo(() => {
    const a = Object.entries(placed).filter(([, t]) => t !== 'contributor')
    const b = Object.entries(saved)
    return a.length !== b.length || a.some(([id, t]) => saved[id] !== t)
  }, [placed, saved])

  const place = useCallback((memberId, tier) => {
    setNote(null)
    setPlaced((p) => {
      const next = { ...p }
      if (tier === 'contributor') delete next[memberId]
      else next[memberId] = tier
      return next
    })
    setHeld(null)
  }, [])

  const full = (tier) =>
    tier !== 'contributor' && byTier[tier].length >= (caps[tier] ?? Infinity)

  /* R5 is the leader by the game's own rule, so offer it rather than make them
     hunt for it in a list of ninety-five. */
  function autoLeader() {
    const r5 = data.members.find((m) => m.rank === 5)
    if (!r5) { setError('Nobody is recorded as R5 on the Members tab.'); return }
    place(r5.player_id, 'leader')
  }

  function fillFromStanding() {
    const leader = data.members.find((m) => m.rank === 5)
    const next = {}
    if (leader) next[leader.player_id] = 'leader'
    const rest = data.members.filter((m) => m.player_id !== leader?.player_id)
    rest.slice(0, caps.backbone).forEach((m) => { next[m.player_id] = 'backbone' })
    rest.slice(caps.backbone, caps.backbone + caps.key)
      .forEach((m) => { next[m.player_id] = 'key' })
    setPlaced(next)
    setNote('Filled from the standing. Drag anyone who belongs elsewhere.')
  }

  async function saveBoard() {
    setError(null)
    setBusy(true)
    try {
      const awards = Object.entries(placed)
        .filter(([, tier]) => tier !== 'contributor')
        .map(([player_id, tier]) => ({ player_id, tier }))
      const done = await api.setSeasonAwards({ season: '5', awards })
      setSaved(done.awards)
      setPlaced(done.awards)
      setNote('Board saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function exportCsv() {
    const head = ['Tier', 'Member', 'Rank', 'Days attended', 'Of', 'Merit standing',
      'Merit days', 'Avg online minutes', 'Online days', 'BGB CP', 'Total CP']
    const rows = [head]
    for (const [id, label] of TIERS) {
      for (const m of byTier[id]) {
        rows.push([label, m.name, m.rank ?? '', m.attended, m.of,
          standing(m.merit_standing), m.merit_days, m.online_minutes ?? '', m.online_days ?? 0,
          m.bgb_cp ?? '', m.total_cp ?? ''])
      }
    }
    save(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }),
      `pou-season-rewards-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (error && !data) return <div className="page"><Banner tone="error">{error}</Banner></div>
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>

  const events = data.events

  const Member = ({ m, from }) => (
    <li
      className={held?.player_id === m.player_id ? 'picked' : ''}
      draggable
      onDragStart={(e) => { setHeld(m); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={() => { setHeld(null); setOver(null) }}
      onClick={() => setHeld(held?.player_id === m.player_id ? null : m)}
      title={from === 'contributor' ? 'Tap or drag into a band' : 'Tap or drag to move'}
    >
      <span className="season-name">
        <b>{m.name}</b>{m.rank && <span className="muted"> R{m.rank}</span>}
      </span>
      <span className="season-days">
        {m.days.map((d) => (
          <i key={d.event_id} className={d.present ? 'on' : 'off'}
             title={`${fmtDay(d.held_on)}: ${d.present ? 'there' : 'away'}${
               d.online_minutes == null ? '' : `, online ${d.online_minutes} of 120 min`}`} />
        ))}
        {m.attended}/{m.of}
      </span>
      <span className="season-online muted"
            title={m.online_minutes == null ? 'Online time not worked out'
              : `Online ${m.online_minutes} of 120 min on average, over ${m.online_days} conquest${
                m.online_days === 1 ? '' : 's'}`}>
        {minutes(m.online_minutes)}
      </span>
      <span className="season-merit">{standing(m.merit_standing)}</span>
      <span className="season-cp muted">{short(sort === 'total_cp' ? m.total_cp : m.bgb_cp)}</span>
    </li>
  )

  return (
    <div className="page">
      <div className="page-head">
        <h2>Season rewards</h2>
        <div className="row">
          <button className="btn" onClick={fillFromStanding} disabled={busy}>
            Fill from the standing
          </button>
          <button className="btn" onClick={exportCsv}>Export</button>
          <button className="btn primary" onClick={saveBoard} disabled={busy || !dirty}>
            {busy ? 'Saving…' : dirty ? 'Save the board' : 'Saved'}
          </button>
        </div>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNote(null)}>{note}</Banner>

      <p className="muted small">
        Four bands, and the sizes are the game's. Only the first three are filled — everybody
        left over is a contributor. Candidates are ordered by how many of the {events.length}{' '}
        conquests they attended, ties broken on merit standing, but the placing is yours.
        The minutes are how long of the two-hour war each was online, on average.
        {held && <b> Holding {held.name} — choose a band.</b>}
      </p>

      <div className="season-board">
        <div className="season-bands">
          {TIERS.map(([id, label, blurb]) => {
            const members = byTier[id]
            const cap = caps[id]
            return (
              <section
                key={id}
                className={`panel band${over === id ? ' over' : ''}${full(id) ? ' full' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(id) }}
                onDragLeave={() => setOver((o) => (o === id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(null)
                  if (held && !(full(id) && placed[held.player_id] !== id)) place(held.player_id, id)
                }}
              >
                <h3>
                  {label}
                  <span className="muted small">
                    {'  '}{members.length}{cap ? ` / ${cap}` : ''} · {blurb}
                  </span>
                  {id === 'leader' && !members.length && (
                    <button className="btn small" onClick={autoLeader}>Use the R5</button>
                  )}
                  {held && id !== placed[held.player_id] && !(full(id) && id !== 'contributor') && (
                    <button className="btn small primary" onClick={() => place(held.player_id, id)}>
                      Put {held.name} here
                    </button>
                  )}
                </h3>
                {id === 'contributor' ? (
                  <p className="muted small">
                    {members.length} members, everyone not placed above. They need no dragging;
                    drop somebody here to take them out of a band.
                  </p>
                ) : members.length === 0 ? (
                  <p className="muted small">Empty. Drag a candidate in, or tap one and press
                    the button.</p>
                ) : (
                  <ol className="season-list">
                    {members.map((m) => <Member key={m.player_id} m={m} from={id} />)}
                  </ol>
                )}
              </section>
            )
          })}
        </div>

        <section className="panel season-pool">
          <h3>
            Candidates
            <span className="muted small">{'  '}{candidates.length} unplaced</span>
          </h3>
          <div className="row wrap">
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
          <ol className="season-list">
            {candidates.map((m) => <Member key={m.player_id} m={m} from="contributor" />)}
          </ol>
        </section>
      </div>
    </div>
  )
}
