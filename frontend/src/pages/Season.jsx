import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import { save } from '../lib/files.js'
import { short } from '../lib/cp.js'

/**
 * The season's standing, for handing out rewards that cannot be handed out
 * evenly.
 *
 * Attendance sets the order, because it is the thing a member can be held to.
 * Merits break the ties, and there are a great many ties — turning up to
 * everything is the norm, not the distinction. A merit is earned by being there
 * at the first wave with the passes ready, so it reads as preparation.
 *
 * The tier lines are drawn here rather than computed. What the rewards are, and
 * how many of each, is the game's business and changes every season.
 *
 * BGB is not on this page. Only a fifth of the alliance gets a seat, so it
 * cannot be counted alongside an event everyone can join, and it has enough of
 * its own — seats, roles, scores, missed starts — to deserve its own standing
 * rather than one borrowed column here.
 */

const fmtDay = (d) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${d}T00:00:00Z`))

/* A standing is a place in a field, so it reads as a percentage of it. */
const standing = (v) => (v == null ? '—' : `${Math.round(v * 100)}`)

const csv = (rows) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')

export default function Season() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [cuts, setCuts] = useState([4, 3, 2])   // a tier begins at each day count

  useEffect(() => {
    api.season().then(setData).catch((e) => setError(e.message))
  }, [])

  /* Each tier takes everyone at or above its cut who no higher tier has taken;
     whoever is left over falls into the rest. Members arrive already ordered. */
  const tiers = useMemo(() => {
    if (!data) return []
    const out = [...new Set(cuts)].sort((a, b) => b - a).map((cut) => ({ cut, members: [] }))
    const rest = []
    for (const m of data.members) {
      const tier = out.find((t) => m.attended >= t.cut)
      ;(tier ? tier.members : rest).push(m)
    }
    return [...out, { cut: null, members: rest }]
  }, [data, cuts])

  function exportCsv() {
    const head = ['Tier', 'Member', 'Rank', 'Days attended', 'Of', 'Merit standing',
      'Merit days', 'CP']
    const rows = [head]
    tiers.forEach((t, i) => {
      for (const m of t.members) {
        rows.push([t.cut == null ? 'Rest' : `Tier ${i + 1}`, m.name, m.rank ?? '',
          m.attended, m.of, standing(m.merit_standing), m.merit_days, m.bgb_cp ?? ''])
      }
    })
    save(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }),
      `pou-season-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (error) return <div className="page"><Banner tone="error">{error}</Banner></div>
  if (!data) return <div className="page"><p className="muted">Loading…</p></div>

  const events = data.events

  return (
    <div className="page">
      <div className="page-head">
        <h2>Season</h2>
        <button className="btn" onClick={exportCsv} disabled={!data.members.length}>
          Export for hand-out
        </button>
      </div>

      <p className="muted small">
        Ordered by how many of the {events.length} conquests each member turned out for. Where
        that ties — and it ties a great deal — the tiebreak is their average merit standing,
        counted only across the {events.filter((e) => e.has_merits).length} days a ranking was
        captured.
      </p>

      <section className="panel">
        <h3>The conquests counted</h3>
        <div className="card-meta">
          {events.map((e) => (
            <span key={e.id} className={e.has_merits ? '' : 'muted'}>
              {fmtDay(e.held_on)} — {e.present}/{e.recorded} present
              {!e.has_merits && ', no merit ranking'}
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Where the tiers fall</h3>
        <p className="muted small">
          A tier takes everyone who turned out for at least that many. Everybody below the
          last line falls into the rest.
        </p>
        <div className="row wrap">
          {cuts.map((cut, i) => (
            <label className="as-of" key={i}>
              Tier {i + 1} from
              <select
                value={cut}
                onChange={(e) => setCuts((c) =>
                  c.map((x, j) => (j === i ? Number(e.target.value) : x)))}
              >
                {Array.from({ length: events.length }, (_, n) => events.length - n).map((n) => (
                  <option key={n} value={n}>{n} of {events.length}</option>
                ))}
              </select>
            </label>
          ))}
          <button
            className="btn"
            onClick={() => setCuts((c) => [...c, Math.max(1, Math.min(...c) - 1)])}
            disabled={cuts.length >= events.length}
          >
            Add a tier
          </button>
          {cuts.length > 1 && (
            <button className="btn" onClick={() => setCuts((c) => c.slice(0, -1))}>
              One fewer
            </button>
          )}
        </div>
      </section>

      {tiers.map((tier, i) => (
        <section className="panel" key={i}>
          <h3>
            {tier.cut == null ? 'The rest' : `Tier ${i + 1}`}
            <span className="muted small">
              {'  '}{tier.members.length} member{tier.members.length === 1 ? '' : 's'}
              {tier.cut != null && ` · turned out ${tier.cut} of ${events.length} or more`}
            </span>
          </h3>
          {!tier.members.length && <p className="muted">Nobody.</p>}
          {tier.members.length > 0 && (
            <ol className="season-list">
              {tier.members.map((m) => (
                <li key={m.player_id}>
                  <span className="season-name">
                    <b>{m.name}</b>
                    {m.rank && <span className="muted"> R{m.rank}</span>}
                  </span>
                  <span className="season-days" title="conquests attended">
                    {m.days.map((d) => (
                      <i key={d.event_id} className={d.present ? 'on' : 'off'}
                         title={`${fmtDay(d.held_on)}: ${d.present ? 'there' : 'away'}`} />
                    ))}
                    {m.attended}/{m.of}
                  </span>
                  <span className="season-merit" title={
                    m.merit_days
                      ? `average standing over ${m.merit_days} ranked day${m.merit_days === 1 ? '' : 's'}`
                      : 'never in a captured ranking'}>
                    {standing(m.merit_standing)}
                  </span>
                  <span className="season-cp muted">{short(m.bgb_cp)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}
