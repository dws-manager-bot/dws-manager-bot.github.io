import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { SERVER_TZ } from '../lib/servertime.js'
import { campName } from './panels.jsx'
import { standings } from './standing.js'

/**
 * Influence over the season, per alliance or per camp.
 *
 * Nothing new is stored for it: the board's edits come back from the audit
 * log in order (GET /war/board/history), are replayed here from an empty
 * board, and each step is scored with the map's own influence values. The
 * last point is the board as it stands now, so the chart always ends where
 * the Influence card does.
 *
 * Influence only moves when territory changes hands, so it is drawn as steps.
 * Each line is its alliance's own color; text stays in text colors, with the
 * colored mark beside it. Hover anywhere for every value at that moment.
 */

const H = 210
const PAD = { l: 44, r: 12, t: 12, b: 26 }
const SURFACE = '#27272a'
const GRID = '#3f3f46'
const INK = '#fafafa'
const MUTED = '#a1a1aa'
const CAMP_COLORS = { 1: '#3987e5', 2: '#d95926' }

const fmt = (n) => Math.round(n).toLocaleString('en-US')

/** Round tick steps: 1, 2 or 5 times a power of ten, about four of them. */
function ticks(max) {
  if (max <= 0) return [0]
  const raw = max / 4
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw)
  const out = []
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}

const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: SERVER_TZ })
const timeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: SERVER_TZ,
})

function replay(map, alliances, events, board) {
  const score = (holders) => {
    const rows = standings(map, holders, alliances)
    const values = new Map(rows.map((r) => [r.alliance.id, r.influence]))
    const camps = new Map([[1, 0], [2, 0]])
    for (const r of rows) camps.set(r.alliance.camp, camps.get(r.alliance.camp) + r.influence)
    return { values, camps }
  }
  const holders = new Map()
  const steps = []
  for (const e of events) {
    if (!steps.length) steps.push({ t: new Date(e.at), by: null, ...score(holders) })
    for (const c of e.changes) {
      if (c.to == null) holders.delete(Number(c.city))
      else holders.set(Number(c.city), c.to)
    }
    steps.push({ t: new Date(e.at), by: e.by, ...score(holders) })
  }
  if (steps.length) steps.push({ t: new Date(), by: null, now: true, ...score(board) })
  return steps
}

export default function HistoryCard({ map, alliances, board, holdings }) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)
  const [by, setBy] = useState('alliances')
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState(null)
  const [width, setWidth] = useState(360)
  const box = useRef(null)

  useEffect(() => {
    let live = true
    api.raw('/war/board/history')
      .then((e) => { if (live) { setEvents(e); setError(null) } })
      .catch((err) => { if (live) setError(err.message) })
    return () => { live = false }
  }, [holdings])

  useLayoutEffect(() => {
    if (!box.current) return undefined
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const steps = useMemo(
    () => (events ? replay(map, alliances, events, board) : []), [map, alliances, events, board])

  const series = by === 'camps'
    ? [1, 2].map((camp) => ({ key: `c${camp}`, name: campName(map, camp), color: CAMP_COLORS[camp], get: (s) => s.camps.get(camp) }))
    : alliances.map((a) => ({ key: `a${a.id}`, name: a.tag ? `[${a.tag}] ${a.name}` : a.name, short: a.tag || a.name, color: a.color, get: (s) => s.values.get(a.id) || 0 }))

  if (error) return <div className="card"><div className="card-head"><strong>Season history</strong></div><p className="card-body error">{error}</p></div>

  const W = width
  const t0 = steps[0]?.t.getTime() || 0
  const t1 = steps[steps.length - 1]?.t.getTime() || 1
  const span = Math.max(1, t1 - t0)
  const x = (t) => PAD.l + ((t.getTime() - t0) / span) * (W - PAD.l - PAD.r)
  const max = Math.max(1, ...steps.flatMap((s) => series.map((se) => se.get(s))))
  const yt = ticks(max)
  const top = yt[yt.length - 1]
  const y = (v) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b)

  const path = (se) => steps.map((s, i) => {
    const px = x(s.t); const py = y(se.get(s))
    if (!i) return `M${px},${py}`
    return `H${px}V${py}`
  }).join('')

  const last = steps[steps.length - 1]
  // Direct labels at the line ends, when there are few lines and they do not
  // collide; otherwise the legend and the tooltip carry identity alone.
  const ends = last ? series.map((se) => ({ se, v: se.get(last), py: y(se.get(last)) })).sort((a, b) => a.py - b.py) : []
  const labelled = ends.length <= 4 && ends.every((e, i) => !i || e.py - ends[i - 1].py >= 13)

  const xTicks = steps.length ? Array.from({ length: 4 }, (_, i) => new Date(t0 + (span * i) / 3)) : []
  const xFmt = span < 36 * 3600e3 ? timeFmt : dayFmt

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    let best = 0
    steps.forEach((s, i) => { if (Math.abs(x(s.t) - px) < Math.abs(x(steps[best].t) - px)) best = i })
    setHover(best)
  }
  const hs = hover != null ? steps[hover] : null

  // One row per day in server time: the day's last step.
  const days = []
  for (const s of steps) {
    const d = dayFmt.format(s.t)
    if (days.length && days[days.length - 1].d === d) days[days.length - 1].s = s
    else days.push({ d, s })
  }

  return (
    <div className="card">
      <div className="card-head">
        <strong>Season history</strong>
        <span className="muted small">influence on the board</span>
      </div>
      <div className="row wp-hist-controls">
        <button type="button" className={by === 'alliances' ? 'chip on' : 'chip'} onClick={() => setBy('alliances')}>Alliances</button>
        <button type="button" className={by === 'camps' ? 'chip on' : 'chip'} onClick={() => setBy('camps')}>Camps</button>
        <button type="button" className={table ? 'chip on' : 'chip'} onClick={() => setTable((t) => !t)}>Table</button>
      </div>

      {series.length > 1 && (
        <div className="wp-hist-legend">
          {series.map((se) => (
            <span key={se.key}><i style={{ background: se.color }} />{se.name}</span>
          ))}
        </div>
      )}

      <div ref={box} className="wp-hist">
        {events === null ? <p className="muted small">Loading…</p> : !events.length ? (
          <p className="card-body">No board changes recorded yet. Every change made under Held now draws the next step here.</p>
        ) : table ? (
          <div className="wp-table-wrap">
            <table className="wp-table">
              <thead><tr><th>Day (ST)</th>{series.map((se) => <th key={se.key} className="num">{se.short || se.name}</th>)}</tr></thead>
              <tbody>
                {days.map(({ d, s }) => (
                  <tr key={d}><td>{d}</td>{series.map((se) => <td key={se.key} className="num">{fmt(se.get(s))}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="wp-hist-plot">
            <svg width={W} height={H} role="img" aria-label="Influence over the season">
              {yt.map((v) => (
                <g key={v}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
                  <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={MUTED}>{fmt(v)}</text>
                </g>
              ))}
              {xTicks.map((t, i) => (
                <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
                      fontSize="11" fill={MUTED}>{xFmt.format(t)}</text>
              ))}
              {series.map((se) => (
                <path key={se.key} d={path(se)} fill="none" stroke={se.color} strokeWidth="2"
                      strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {last && series.map((se) => (
                <circle key={`e${se.key}`} cx={x(last.t)} cy={y(se.get(last))} r="4" fill={se.color}
                        stroke={SURFACE} strokeWidth="2" />
              ))}
              {hs && (
                <g pointerEvents="none">
                  <line x1={x(hs.t)} x2={x(hs.t)} y1={PAD.t} y2={H - PAD.b} stroke={MUTED} strokeWidth="1" />
                  {series.map((se) => (
                    <circle key={`h${se.key}`} cx={x(hs.t)} cy={y(se.get(hs))} r="4" fill={se.color}
                            stroke={SURFACE} strokeWidth="2" />
                  ))}
                </g>
              )}
              <rect x={PAD.l} y={0} width={W - PAD.l - PAD.r} height={H} fill="transparent"
                    onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
            </svg>
            {labelled && ends.map(({ se, v, py }) => (
              <span key={se.key} className="wp-hist-end" style={{ top: py - 9 }}>
                <i style={{ background: se.color }} />{fmt(v)}
              </span>
            ))}
            {hs && (
              <div className="wp-hist-tip" style={{ left: Math.min(Math.max(x(hs.t) - 90, 0), W - 180) }}>
                <div className="muted small">{hs.now ? 'Now' : `${timeFmt.format(hs.t)} ST${hs.by ? ` · ${hs.by}` : ''}`}</div>
                {[...series].sort((a, b) => b.get(hs) - a.get(hs)).map((se) => (
                  <div key={se.key} className="wp-hist-tip-row">
                    <i style={{ background: se.color }} /><span>{se.short || se.name}</span><b>{fmt(se.get(hs))}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
