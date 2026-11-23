import { useState } from 'react'
import { KIND_LABEL, cityTitle, coords } from './mapdata.js'
import { CAMP_COLORS, INKS, SWATCHES, inkOn, nextColor } from './palette.js'
import { CAMPS, fullNum, shortNum } from './standing.js'
import { ITEM_LABEL, NOTE, PENCIL, STAMPS, STICKERS, StickerSymbol } from './items.jsx'
import { WHEN_TEXT, holdable } from './targets.js'
import { CHALLENGES_PER_DAY, WARS_PER_DAY, dayText } from './season.js'

/* The War planner's side panels. Each is a plain card; the page owns the data
   and passes down what a panel shows and what it may change. */

export const campName = (map, camp) => map?.camps?.[camp] || `Camp ${camp}`

/** An alliance in a list: "[PoU] Path of Unity". */
const allianceName = (a) => (a.tag ? `[${a.tag}] ${a.name}` : a.name)

/** Alliances grouped by camp, for a <select>; camps with none are left out. */
function CampOptions({ map, alliances }) {
  return CAMPS.map((camp) => {
    const list = alliances.filter((a) => a.camp === camp)
    if (!list.length) return null
    return (
      <optgroup key={camp} label={campName(map, camp)}>
        {list.map((a) => <option key={a.id} value={a.id}>{allianceName(a)}</option>)}
      </optgroup>
    )
  })
}

/** What a territory is worth, in a line. */
function worth(c) {
  if (c.kind === 'fortress') return `Pays ${c.mithril} Mithril each Monday · ${c.destroy} if destroyed`
  if (c.kind === 'altar') return `Pays ${c.mithril} Mithril each Monday`
  if (c.kind === 'outpost') return 'No Mithril · the way to the next Fortress'
  if (c.kind === 'pass') return c.camp ? `A gate, open to Camp ${c.camp} only` : 'A gate: never held'
  return 'A contest: results go under Temple results'
}

function copy(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

/** A small colored square, the key to who holds what. */
export function Swatch({ color, size = 12 }) {
  return <span className="wp-swatch" style={{ background: color, width: size, height: size }} />
}

/* ------------------------------------------------------------------- tools */

const TOOLS = [
  ['select', 'Select', <path key="s" d="M5 3l12 6.5-5.2 1.6L9.4 17z" />],
  ['arrow', 'Arrow', <path key="a" d="M3 17L16 4M9 4h7v7" fill="none" />],
  ['curve', 'Curve', <path key="c" d="M3 17C4 8 10 4 16 4M10.5 3.5l5.5.5-1 5.4" fill="none" />],
  ['line', 'Line', <path key="l" d="M3.5 16.5L16.5 3.5" fill="none" />],
  ['pencil', 'Pencil', <path key="e" d="M3.5 16.5l.9-3.6 9.2-9.2 2.7 2.7-9.2 9.2zM11.9 5.4l2.7 2.7" fill="none" />],
  ['pin', 'Pin', <path key="p" d="M10 18s-5.5-5.2-5.5-9.5a5.5 5.5 0 0 1 11 0C15.5 12.8 10 18 10 18zm0-7.3a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />],
  ['route', 'Route', (
    <g key="r">
      <path d="M4.5 15.5L9 8.5l5 4 2.5-8" fill="none" />
      <circle cx="4.5" cy="15.5" r="2.2" /><circle cx="9" cy="8.5" r="2.2" />
      <circle cx="14" cy="12.5" r="2.2" /><circle cx="16.5" cy="4.5" r="2.2" />
    </g>
  )],
  ['sticker', 'Sticker', <path key="k" d="M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z" />],
  ['note', 'Note', <path key="n" d="M3.5 3.5h13v9l-4 4h-9zM12.5 16.5v-4h4M6.5 7.5h7M6.5 10.5h4" fill="none" />],
  ['stamp', 'Stamp', <path key="t" d="M3 3h6v6H3zM11 11h6v6h-6zM11 3h6v6h-6z" />],
]

export function Toolbar({ tool, setTool, editable, ink, setInk, alliances, symbol, setSymbol, stamp, setStamp }) {
  return (
    <div className="wp-tools" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map(([id, label, glyph]) => (
        <button key={id} type="button" title={label} aria-pressed={tool === id}
                className={tool === id ? 'wp-tool on' : 'wp-tool'}
                disabled={!editable && id !== 'select'} onClick={() => setTool(id)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">{glyph}</svg>
          <span>{label}</span>
        </button>
      ))}
      {editable && tool !== 'select' && (
        <div className="wp-tool-opts">
          {tool === 'sticker' && (
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Sticker">
              {Object.entries(STICKERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          {tool === 'stamp' && (
            <select value={stamp} onChange={(e) => setStamp(e.target.value)} aria-label="Stamp">
              {Object.entries(STAMPS).map(([k, v]) => <option key={k} value={k}>{`${v.label} ${v.size}×${v.size}`}</option>)}
            </select>
          )}
          {tool !== 'note' && <InkPicker ink={ink} setInk={setInk} alliances={alliances} />}
        </div>
      )}
    </div>
  )
}

/** Pick a drawing's color: an alliance's (which follows the alliance if it is
    recolored later), or a plain ink. */
export function InkPicker({ ink, setInk, alliances }) {
  return (
    <div className="wp-inks" role="radiogroup" aria-label="Color">
      {alliances.map((a) => (
        <button key={a.id} type="button" role="radio" aria-checked={ink.alliance === a.id}
                title={a.name} className={ink.alliance === a.id ? 'wp-ink on' : 'wp-ink'}
                style={{ background: a.color, color: inkOn(a.color) }}
                onClick={() => setInk({ alliance: a.id, color: a.color })}>
          {(a.tag || a.name).slice(0, 3)}
        </button>
      ))}
      {alliances.length > 0 && <span className="wp-ink-sep" aria-hidden="true" />}
      {INKS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={ink.alliance == null && ink.color === c}
                title={c} className={ink.alliance == null && ink.color === c ? 'wp-ink on' : 'wp-ink'}
                style={{ background: c }} onClick={() => setInk({ alliance: null, color: c })} />
      ))}
      <label className="wp-ink custom" title="Any color">
        <input type="color" value={ink.color} aria-label="Any color"
               onChange={(e) => setInk({ alliance: null, color: e.target.value })} />
      </label>
    </div>
  )
}

/* ------------------------------------------------------- territory inspector */

export function CityPanel({
  map, city, board, ruins, holders, ruinsPlanned, alliances, scenario, editable, onBoard, onPlan, onGo, busy, onClose,
  declarers = [], iso,
}) {
  const held = board.get(city.id)
  const ruin = ruins.has(city.id)
  const planned = scenario.changes?.[city.id]
  const planValue = planned === undefined ? 'same' : planned === null ? 'none' : String(planned)
  const willHold = holders.get(city.id)
  const byId = new Map(alliances.map((a) => [a.id, a]))
  const canHold = holdable(city)
  const options = (
    <>
      <option value="none">Neutral</option>
      <CampOptions map={map} alliances={alliances} />
    </>
  )
  return (
    <div className="card wp-inspect">
      <div className="card-head">
        <strong>{cityTitle(city)}</strong>
        <span className="pill">{city.camp && city.kind === 'outpost' ? 'Camp Outpost' : KIND_LABEL[city.kind]}</span>
        <button type="button" className="btn ghost small wp-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="wp-facts">
        <button type="button" className="wp-coord" onClick={() => copy(`${city.x} ${city.y}`)} title="Copy coordinates">
          {coords(city.x, city.y)}
        </button>
        <span>{worth(city)}</span>
        <span className="muted">{`Opens Day ${city.opens}`}</span>
        {city.region && <span className="muted">{city.region}</span>}
      </div>

      {canHold && (
        <div className="grid wp-owner">
          <label>
            Held now
            <select value={held == null ? 'none' : ruin ? `d${held}` : String(held)} disabled={Boolean(busy)}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === 'none') onBoard(city.id, null, false)
                      else if (v[0] === 'd') onBoard(city.id, Number(v.slice(1)), true)
                      else onBoard(city.id, Number(v), false)
                    }}>
              {options}
              {city.kind === 'fortress' && alliances.length > 0 && (
                <optgroup label="Destroyed by">
                  {alliances.map((a) => <option key={`d${a.id}`} value={`d${a.id}`}>{`Destroyed by ${allianceName(a)}`}</option>)}
                </optgroup>
              )}
            </select>
            <small className="muted">
              {ruin ? 'Destroyed for the season: it pays nobody now.' : 'The board — every plan is drawn over it.'}
            </small>
          </label>
          <label>
            In {scenario.name}
            <select value={planValue} disabled={!editable || ruin}
                    onChange={(e) => {
                      const v = e.target.value
                      onPlan(city.id, v === 'same' ? undefined : v === 'none' ? null : Number(v))
                    }}>
              <option value="same">No change</option>
              {options}
            </select>
            <small className="muted">
              {planValue === 'same' ? 'Stays as the board has it.'
                : ruinsPlanned.has(city.id) ? `Planned: ${byId.get(willHold)?.name || 'removed alliance'} destroys it (+${city.destroy} Mithril).`
                  : willHold != null ? `Planned: ${byId.get(willHold)?.name || 'removed alliance'} takes it.`
                    : 'Planned: goes neutral.'}
            </small>
          </label>
        </div>
      )}

      {canHold && !ruin && (
        <>
          <div className="wp-sub">{`Can take it · ${dayText(iso)}`}</div>
          {declarers.length ? (
            <div className="wp-near">
              {declarers.map(({ alliance, today, when }) => (
                <span key={alliance.id} className="wp-near-btn static">
                  <Swatch color={alliance.color} size={10} />
                  {alliance.tag || alliance.name}{!today && <span className="muted">{` · ${WHEN_TEXT[when]}`}</span>}
                </span>
              ))}
            </div>
          ) : <div className="muted small">No alliance on the board reaches it on this day.</div>}
        </>
      )}

      {city.nearBy.length > 0 && (
        <>
          <div className="wp-sub">Borders</div>
          <div className="wp-near">
            {city.nearBy.map((id) => map.byId.get(id)).filter(Boolean).map((n) => {
              const h = ruinsPlanned.has(n.id) ? null : holders.get(n.id)
              return (
                <button key={n.id} type="button" className="wp-near-btn" onClick={() => onGo(n)}>
                  <Swatch color={h != null ? byId.get(h)?.color || '#94a3b8' : 'transparent'} size={10} />
                  {cityTitle(n)}
                  <span className="muted">{`${n.x},${n.y}`}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ item inspector */

const NOTE_COLORS = ['#fef3c7', '#ffffff', '#fecdd3', '#bfdbfe', '#bbf7d0', '#18181b']

export function ItemPanel({ item, alliances, editable, onChange, onDelete, onDuplicate, onClose, onExtend }) {
  const set = (patch, key) => onChange({ ...item, ...patch }, key)
  const ink = { alliance: item.alliance ?? null, color: item.color || '#fbbf24' }
  const shown = alliances.find((a) => a.id === item.alliance)?.color || ink.color
  const at = ([x, y]) => coords(Math.floor(x), Math.floor(y))
  const where = item.type === 'arrow' || item.type === 'line' ? `${coords(...item.a)} → ${coords(...item.b)}`
    : item.type === 'route' || item.type === 'pencil' ? `${at(item.points[0])} → ${at(item.points[item.points.length - 1])}`
      : coords(item.x, item.y)
  return (
    <div className="card wp-inspect">
      <div className="card-head">
        <strong>{ITEM_LABEL[item.type]}</strong>
        <button type="button" className="wp-coord" onClick={() => copy('x' in item ? `${item.x} ${item.y}` : where)}
                title="Copy coordinates">{where}</button>
        <button type="button" className="btn ghost small wp-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      {!editable ? (
        <p className="card-body">{item.label || item.text || STICKERS[item.symbol] || STAMPS[item.kind]?.label || ''}</p>
      ) : (
        <div className="grid">
          {item.type === 'pin' && (
            <label className="wide">
              Label
              <input value={item.label || ''} maxLength={60} placeholder="Rally here"
                     onChange={(e) => set({ label: e.target.value }, `label:${item.id}`)} />
            </label>
          )}
          {item.type === 'note' && (
            <>
              <label className="wide">
                Text
                <textarea rows="4" value={item.text || ''} maxLength={1000} placeholder="Write the note"
                          onChange={(e) => set({ text: e.target.value }, `text:${item.id}`)} />
              </label>
              <label>
                <span className="pw-slider-label">Opacity <b>{Math.round((item.opacity ?? 0.85) * 100)}%</b></span>
                <input type="range" min="0.15" max="1" step="0.05" value={item.opacity ?? 0.85}
                       onChange={(e) => set({ opacity: +e.target.value }, `opacity:${item.id}`)} />
              </label>
              <label>
                <span className="pw-slider-label">Text size <b>{item.px ? `${item.font}px` : 'map-sized'}</b></span>
                <input type="range" min={NOTE.min} max={NOTE.max} step="1" value={item.px ? item.font : NOTE.font}
                       onChange={(e) => set(item.px ? { font: +e.target.value }
                         // A note from before sized itself in tiles; this makes it a pixel note.
                         : { px: true, font: +e.target.value, w: NOTE.w, h: NOTE.h }, `font:${item.id}`)} />
              </label>
              <div className="wide">
                <span className="label">Paper</span>
                <div className="wp-inks">
                  {NOTE_COLORS.map((c) => (
                    <button key={c} type="button" className={item.color === c ? 'wp-ink on' : 'wp-ink'}
                            style={{ background: c }} aria-label={c} onClick={() => set({ color: c })} />
                  ))}
                  <label className="wp-ink custom" title="Any color">
                    <input type="color" value={item.color} onChange={(e) => set({ color: e.target.value }, `paper:${item.id}`)} />
                  </label>
                </div>
              </div>
            </>
          )}
          {item.type === 'sticker' && (
            <>
              <div className="wide">
                <span className="label">Symbol</span>
                <div className="wp-symbols">
                  {Object.entries(STICKERS).map(([k, v]) => (
                    <button key={k} type="button" title={v} aria-label={v}
                            className={item.symbol === k ? 'wp-symbol on' : 'wp-symbol'}
                            onClick={() => set({ symbol: k })}>
                      <svg viewBox="-13 -13 26 26" aria-hidden="true"><StickerSymbol symbol={k} color={shown} /></svg>
                    </button>
                  ))}
                </div>
              </div>
              <label className="wide">
                <span className="pw-slider-label">Size <b>{item.size || 14}</b></span>
                <input type="range" min="4" max="80" step="1" value={item.size || 14}
                       onChange={(e) => set({ size: +e.target.value }, `size:${item.id}`)} />
              </label>
            </>
          )}
          {(item.type === 'arrow' || item.type === 'line') && (
            <>
              <div>
                <span className="label">Shape</span>
                <div className="row">
                  <button type="button" className={item.c ? 'chip' : 'chip on'}
                          onClick={() => { const { c: _c, ...rest } = item; onChange(rest) }}>Straight</button>
                  <button type="button" className={item.c ? 'chip on' : 'chip'}
                          onClick={() => item.c || set({ c: [Math.round((item.a[0] + item.b[0]) / 2 - (item.b[1] - item.a[1]) * 0.25), Math.round((item.a[1] + item.b[1]) / 2 + (item.b[0] - item.a[0]) * 0.25)] })}>
                    Curved
                  </button>
                </div>
              </div>
              <div>
                <span className="label">Line</span>
                <div className="row">
                  <button type="button" className={item.dash ? 'chip on' : 'chip'} onClick={() => set({ dash: !item.dash })}>Dashed</button>
                  {item.type === 'arrow' && (
                    <button type="button" className={item.both ? 'chip on' : 'chip'} onClick={() => set({ both: !item.both })}>Both ends</button>
                  )}
                </div>
              </div>
              <label className="wide">
                <span className="pw-slider-label">Width <b>{item.width || 1.6}</b></span>
                <input type="range" min="0.4" max="6" step="0.2" value={item.width || 1.6}
                       onChange={(e) => set({ width: +e.target.value }, `width:${item.id}`)} />
              </label>
            </>
          )}
          {item.type === 'pencil' && (
            <>
              <div>
                <span className="label">Line</span>
                <div className="row">
                  <button type="button" className={item.dash ? 'chip on' : 'chip'} onClick={() => set({ dash: !item.dash })}>Dashed</button>
                </div>
              </div>
              <label>
                <span className="pw-slider-label">Width <b>{item.width || PENCIL.width}</b></span>
                <input type="range" min="0.2" max="4" step="0.2" value={item.width || PENCIL.width}
                       onChange={(e) => set({ width: +e.target.value }, `width:${item.id}`)} />
              </label>
            </>
          )}
          {item.type === 'route' && (
            <>
              <div className="wide">
                <span className="label">{`Waypoints · ${item.points.length}`}</span>
                <ol className="wp-stops">
                  {item.points.map(([x, y], i) => (
                    <li key={`${i}:${x}:${y}`}>
                      <span className="wp-stop-n">{i + 1}</span>
                      <button type="button" className="wp-coord" title="Copy coordinates"
                              onClick={() => copy(`${x} ${y}`)}>{coords(x, y)}</button>
                      <button type="button" className="btn ghost small wp-stop-x" aria-label={`Remove waypoint ${i + 1}`}
                              disabled={item.points.length <= 2}
                              onClick={() => set({ points: item.points.filter((_, k) => k !== i) })}>×</button>
                    </li>
                  ))}
                </ol>
                <div className="row">
                  <button type="button" className="btn small" onClick={() => onExtend?.(item.id)}>Add stops from the end</button>
                  <button type="button" className="btn small"
                          onClick={() => set({ points: [...item.points].reverse() })}>Reverse</button>
                </div>
              </div>
              <div>
                <span className="label">Line</span>
                <div className="row">
                  <button type="button" className={item.dash ? 'chip on' : 'chip'} onClick={() => set({ dash: !item.dash })}>Dashed</button>
                </div>
              </div>
              <label>
                <span className="pw-slider-label">Width <b>{item.width || 1.2}</b></span>
                <input type="range" min="0.4" max="5" step="0.2" value={item.width || 1.2}
                       onChange={(e) => set({ width: +e.target.value }, `width:${item.id}`)} />
              </label>
            </>
          )}
          {item.type === 'stamp' && (
            <div className="wide">
              <span className="label">Structure</span>
              <div className="row">
                {Object.entries(STAMPS).map(([k, v]) => (
                  <button key={k} type="button" className={item.kind === k ? 'chip on' : 'chip'}
                          onClick={() => set({ kind: k, size: v.size })}>{`${v.label} ${v.size}×${v.size}`}</button>
                ))}
              </div>
            </div>
          )}
          {item.type !== 'note' && (
            <div className="wide">
              <span className="label">Color</span>
              <InkPicker ink={ink} alliances={alliances}
                         setInk={(v) => set({ alliance: v.alliance, color: v.color }, `ink:${item.id}`)} />
            </div>
          )}
        </div>
      )}
      {editable && (
        <div className="card-actions">
          <button type="button" className="btn small" onClick={onDuplicate}>Duplicate</button>
          <button type="button" className="btn small danger" onClick={onDelete}>Delete</button>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- standings */

/**
 * What the board pays each Monday, by alliance and by camp, and what the open
 * scenario would change. The season's running total, Temples included, is the
 * Season history card's.
 */
export function StandingsCard({ map, now, planned, scenario, changed, onApply, busy, warnings = [], destroys = [] }) {
  const plannedById = new Map(planned.map((r) => [r.alliance.id, r]))
  const totals = (rows) => rows.reduce((t, r) => ({ ...t, [r.alliance.camp]: (t[r.alliance.camp] || 0) + r.weekly }), {})
  const tNow = totals(now)
  const tPlan = totals(planned)
  const camps = CAMPS.filter((c) => now.some((r) => r.alliance.camp === c))
  const delta = (a, b) => {
    const d = (b || 0) - (a || 0)
    if (!d) return null
    return <span className={d > 0 ? 'wp-up' : 'wp-down'}>{d > 0 ? '+' : '−'}{shortNum(Math.abs(d))}</span>
  }
  const held = (r) => `${r.outposts} Outposts, ${r.fortresses} Fortresses, ${r.altars} Altars${r.destroyed ? `; destroyed ${r.destroyed}` : ''}`
  return (
    <div className="card">
      <div className="card-head">
        <strong>Mithril each Monday</strong>
        <span className="muted small">{changed ? `now → ${scenario.name}` : 'now'}</span>
      </div>
      {!now.length ? (
        <p className="card-body">Add the alliances on the map to rank them.</p>
      ) : (
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>#</th><th>Alliance</th><th title="Outposts + Fortresses + Altars held">Held</th>
                <th className="num">Weekly</th>
                {changed && <th className="num">{scenario.name}</th>}
              </tr>
            </thead>
            <tbody>
              {now.map((r, i) => {
                const p = plannedById.get(r.alliance.id) || r
                return (
                  <tr key={r.alliance.id}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <span className="wp-who"><Swatch color={r.alliance.color} />
                        <span className="wp-name">{allianceName(r.alliance)}</span>
                        <span className="muted small">{` C${r.alliance.camp}`}</span>
                      </span>
                    </td>
                    <td title={held(r)}>{changed && p.count !== r.count ? `${r.count}→${p.count}` : r.count}</td>
                    <td className="num">{fullNum(r.weekly)}</td>
                    {changed && <td className="num">{fullNum(p.weekly)} {delta(r.weekly, p.weekly)}</td>}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {camps.map((camp) => (
                <tr key={camp}>
                  <td><Swatch color={CAMP_COLORS[camp]} size={10} /></td>
                  <td colSpan="2">{campName(map, camp)}</td>
                  <td className="num">{fullNum(tNow[camp] || 0)}</td>
                  {changed && <td className="num">{fullNum(tPlan[camp] || 0)} {delta(tNow[camp], tPlan[camp])}</td>}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
      {destroys.length > 0 && (
        <ul className="wp-warnings ok" aria-label={`Fortresses ${scenario.name} destroys`}>
          {destroys.map((d) => <li key={d.city.id}>{d.text}</li>)}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="wp-warnings" aria-label={`What the rules would stop in ${scenario.name}`}>
          {warnings.map((w) => <li key={w.text}>{w.text}</li>)}
        </ul>
      )}
      <p className="card-body small">
        Fortresses pay 20 / 60 / 100 (Lv.3 / 4 / 5) and Altars 300 every Monday 00:00 ST. Outposts pay nothing.
        Taking another camp’s Fortress destroys it: once 200%, then nothing.
      </p>
      {changed && (
        <div className="card-actions">
          <button type="button" className="btn small" onClick={onApply} disabled={Boolean(busy)}>
            Record {scenario.name} on the board
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- alliances */

const EMPTY = { name: '', tag: '', camp: 1, color: '', server: '', notes: '' }

function AllianceForm({ initial, alliances, map, onSave, onCancel, onDelete, busy }) {
  const others = alliances.filter((a) => a.id !== initial?.id)
  const [f, setF] = useState(() => ({
    ...EMPTY, ...initial,
    color: initial?.color || nextColor(others, initial?.camp || EMPTY.camp),
  }))
  const [picked, setPicked] = useState(Boolean(initial?.color))
  const taken = new Map(others.map((a) => [a.color.toLowerCase(), a.name]))
  const clash = taken.get(f.color.toLowerCase())
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))
  const pick = (c) => { setPicked(true); set('color', c) }
  const suggestions = [...new Set([nextColor(others, f.camp), ...SWATCHES])]
  return (
    <form className="wp-aform" onSubmit={(e) => { e.preventDefault(); if (!clash) onSave(f) }}>
      <div className="grid">
        <label>
          Name
          <input value={f.name} maxLength={64} required placeholder="Path of Unity" onChange={(e) => set('name', e.target.value)} />
        </label>
        <label>
          Tag <span className="muted">(optional)</span>
          <input value={f.tag || ''} maxLength={16} placeholder="PoU" onChange={(e) => set('tag', e.target.value)} />
        </label>
        <label>
          Camp
          <select value={f.camp} onChange={(e) => {
            const camp = Number(e.target.value)
            setF((o) => ({ ...o, camp, color: picked ? o.color : nextColor(others, camp) }))
          }}>
            {CAMPS.map((c) => <option key={c} value={c}>{campName(map, c)}</option>)}
          </select>
        </label>
        <label>
          State <span className="muted">(optional)</span>
          <input value={f.server || ''} maxLength={16} inputMode="numeric" placeholder="413" onChange={(e) => set('server', e.target.value)} />
        </label>
        <div className="wide">
          <span className="label">Color</span>
          <div className="wp-inks">
            {suggestions.map((c) => (
              <button key={c} type="button" disabled={taken.has(c)} title={taken.get(c) || c}
                      className={f.color.toLowerCase() === c ? 'wp-ink on' : 'wp-ink'}
                      style={{ background: c }} onClick={() => pick(c)} aria-label={c} />
            ))}
            <label className="wp-ink custom" title="Any color">
              <input type="color" value={f.color} onChange={(e) => pick(e.target.value)} />
            </label>
          </div>
          {clash && <small className="error">{`${clash} already uses this color.`}</small>}
        </div>
        <label className="wide">
          Notes <span className="muted">(optional)</span>
          <textarea rows="2" value={f.notes || ''} maxLength={2000} placeholder="Strength, leaders, habits"
                    onChange={(e) => set('notes', e.target.value)} />
        </label>
      </div>
      <div className="card-actions">
        <button className="btn primary small" disabled={Boolean(busy) || !f.name.trim() || Boolean(clash)}>
          {initial?.id ? 'Save' : 'Add alliance'}
        </button>
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
        {onDelete && <button type="button" className="btn small danger" onClick={onDelete}>Remove</button>}
      </div>
    </form>
  )
}

export function AlliancesCard({ map, alliances, now, onCreate, onUpdate, onDelete, busy }) {
  const [editing, setEditing] = useState(null)   // an alliance id, or 'new'
  const [newCamp, setNewCamp] = useState(1)
  const held = new Map(now.map((r) => [r.alliance.id, r]))
  return (
    <div className="card">
      <div className="card-head">
        <strong>Alliances</strong>
        <span className="pill">{alliances.length}</span>
      </div>
      <p className="card-body">Every alliance in all eight camps, each in its own color. A new one starts in a shade of its camp’s.</p>
      {CAMPS.map((camp) => {
        const list = alliances.filter((a) => a.camp === camp)
        return (
          <div key={camp} className="wp-camp">
            <div className="wp-sub wp-camp-head">
              <Swatch color={CAMP_COLORS[camp]} size={10} />{campName(map, camp)}
              <span className="muted">{list.length ? ` · ${list.length}` : ''}</span>
              <button type="button" className="btn ghost small" disabled={editing === 'new'}
                      onClick={() => { setNewCamp(camp); setEditing('new') }}>Add</button>
            </div>
            {list.map((a) => (editing === a.id ? (
              <AllianceForm key={a.id} initial={a} alliances={alliances} map={map} busy={busy}
                            onSave={async (f) => { if (await onUpdate(a.id, f)) setEditing(null) }}
                            onCancel={() => setEditing(null)}
                            onDelete={async () => {
                              const r = held.get(a.id)
                              const n = r ? r.count + r.destroyed : 0
                              if (!confirm(`Remove ${a.name}?${n ? `\n\nThe ${n} territories on the board under its name go neutral.` : ''}`)) return
                              if (await onDelete(a.id)) setEditing(null)
                            }} />
            ) : (
              <button key={a.id} type="button" className="wp-arow" onClick={() => setEditing(a.id)}>
                <Swatch color={a.color} size={14} />
                <span className="wp-name">{a.tag ? <b>[{a.tag}] </b> : null}{a.name}</span>
                <span className="muted small">{[a.server && `#${a.server}`, held.get(a.id)?.count ? `${held.get(a.id).count} held` : null].filter(Boolean).join(' · ')}</span>
              </button>
            )))}
            {editing === 'new' && newCamp === camp && (
              <AllianceForm initial={{ camp }} alliances={alliances} map={map} busy={busy}
                            onSave={async (f) => { if (await onCreate(f)) setEditing(null) }}
                            onCancel={() => setEditing(null)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- legend */

export const LAYERS = [
  ['outpost', 'Outposts'], ['fortress', 'Fortresses'], ['altar', 'Altars'], ['temple', 'Temples'], ['pass', 'Passes'],
  ['fills', 'Territory colors'], ['drawings', 'Drawings'], ['names', 'Names'],
]

/**
 * The legend is also the layer switch: each entry shows or hides what it names.
 * Ahead of it, whether held ground is colored by alliance or by camp; the
 * swatches at the end follow that choice.
 */
export function Legend({ map, hide, setHide, alliances, colorBy, setColorBy }) {
  const camps = colorBy === 'camp'
  const inUse = CAMPS.filter((c) => alliances.some((a) => a.camp === c))
  return (
    <div className={camps ? 'wp-legend small camps' : 'wp-legend small'} role="group" aria-label="Show or hide">
      <span className="wp-colorby" role="group" aria-label="Color held ground by">
        <button type="button" className={camps ? 'chip' : 'chip on'} aria-pressed={!camps}
                title="Each alliance in its own color" onClick={() => setColorBy('alliance')}>Alliances</button>
        <button type="button" className={camps ? 'chip on' : 'chip'} aria-pressed={camps}
                title="Each camp in its own color" onClick={() => setColorBy('camp')}>Camps</button>
      </span>
      {LAYERS.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={!hide[key]}
                className={hide[key] ? 'wp-layer off' : 'wp-layer'}
                title={hide[key] ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
                onClick={() => setHide({ ...hide, [key]: !hide[key] })}>
          <i className={`wp-key ${key}`} />{label}
        </button>
      ))}
      <span className="wp-legend-note"><i className="wp-key planned" />Striped: planned change</span>
      <span className="wp-legend-note"><i className="wp-key ruin" />Destroyed</span>
      {camps
        ? (inUse.length ? inUse : CAMPS).map((camp) => (
          <span key={camp} className="wp-legend-note"><Swatch color={CAMP_COLORS[camp]} size={10} />{campName(map, camp)}</span>
        ))
        : alliances.map((a) => <span key={a.id} className="wp-legend-note"><Swatch color={a.color} size={10} />{a.tag || a.name}</span>)}
    </div>
  )
}

/* ------------------------------------------------------------------ targets */

/**
 * Where one alliance may attack on the war day. Judged on the board by
 * default — the ground as it stands before anything changes hands that day —
 * or on the open scenario, to look a step further ahead.
 */
export function TargetsCard({ map, alliances, allianceId, setAllianceId, result, basis, setBasis, scenario,
  canUseScenario, show, setShow, onGo, byId, iso }) {
  const today = result?.targets.filter((t) => t.today) || []
  const challenges = today.filter((t) => t.attack === 'challenge')
  const wars = today.filter((t) => t.attack === 'war')
  const notToday = result?.targets.filter((t) => !t.today) || []
  const later = result?.later || []
  const alliance = byId.get(allianceId)
  const row = ({ city, when, today: ok }) => {
    const h = result.holders.get(city.id)
    const holder = h != null && !result.ruins.has(city.id) ? byId.get(h) : null
    return (
      <li key={city.id}>
        <button type="button" className="wp-target" onClick={() => onGo(city)}>
          <span className={ok === false ? 'wp-ring sat' : ok === undefined ? 'wp-ring later' : 'wp-ring'} />
          <span className="wp-name">{cityTitle(city)}</span>
          {holder && <span className="muted small">{holder.tag || holder.name}</span>}
          {ok === false && <span className="muted small">{WHEN_TEXT[when]}</span>}
          {ok === undefined && <span className="muted small">{`Day ${city.opens}`}</span>}
          <span className="muted small wp-target-at">{`${city.x}, ${city.y}`}</span>
          <span className="small wp-target-inf">{city.mithril || ''}</span>
        </button>
      </li>
    )
  }
  return (
    <div className="card">
      <div className="card-head">
        <strong>Targets</strong>
        <span className="muted small">{dayText(iso)}</span>
      </div>
      {!alliances.length ? (
        <p className="card-body">Add the alliances on the map first.</p>
      ) : (
        <>
          <div className="grid">
            <label>
              For
              <select value={allianceId ?? ''} onChange={(e) => setAllianceId(Number(e.target.value))}>
                <CampOptions map={map} alliances={alliances} />
              </select>
            </label>
            <div>
              <span className="label">Judged on</span>
              <div className="row">
                <button type="button" className={basis === 'board' ? 'chip on' : 'chip'} onClick={() => setBasis('board')}>The board</button>
                <button type="button" className={basis === 'scenario' ? 'chip on' : 'chip'} disabled={!canUseScenario}
                        title={canUseScenario ? '' : `${scenario.name} changes nothing`}
                        onClick={() => setBasis('scenario')}>{`After ${scenario.name}`}</button>
              </div>
            </div>
          </div>
          <p className="card-body small">
            {result?.rule === 'start'
              ? `${alliance?.name} holds nothing${basis === 'scenario' ? ` after ${scenario.name}` : ''}, so its first target is a Lv.1 Camp Outpost in ${campName(map, alliance?.camp)}.`
              : 'Anything bordering ground its camp holds, through passes open to the camp on this day.'}
          </p>
          <label className="inline">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Ring them on the map
          </label>
          <div className="wp-sub">{`Challenge · Outposts · ${CHALLENGES_PER_DAY} a day · ${challenges.length}`}</div>
          <ul className="wp-targets">{challenges.map(row)}</ul>
          <div className="wp-sub">{`War · Fortresses and Altars · ${WARS_PER_DAY} a day · ${wars.length}`}</div>
          <ul className="wp-targets">{wars.map(row)}</ul>
          {notToday.length > 0 && <div className="wp-sub">{`Not on this day · ${notToday.length}`}</div>}
          <ul className="wp-targets">{notToday.map(row)}</ul>
          {later.length > 0 && <div className="wp-sub">{`Opens later · ${later.length}`}</div>}
          <ul className="wp-targets">{later.map((t) => row({ ...t, today: undefined }))}</ul>
          {!today.length && !notToday.length && !later.length && <p className="muted small">Nothing in reach.</p>}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ temple results */

/**
 * Temple Contests pay the most Mithril, by camp rank, and nothing on the board
 * shows them: an admin enters each camp's result from the game. They count in
 * the Season history's camp totals.
 */
export function TemplesCard({ map, results, onAdd, onDelete, busy, today }) {
  const temples = map.cities.filter((c) => c.kind === 'temple').sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))
  const blank = { day: today, city_id: temples[0]?.id || '', camp: 1, rank: '', mithril: '', notes: '' }
  const [f, setF] = useState(blank)
  const [open, setOpen] = useState(false)
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))
  const byCamp = CAMPS.map((c) => [c, results.filter((r) => r.camp === c).reduce((t, r) => t + r.mithril, 0)])
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return (
    <div className="card">
      <div className="card-head">
        <strong>Temple results</strong>
        <span className="pill">{results.length}</span>
      </div>
      {byCamp.length > 0 && (
        <div className="wp-near">
          {byCamp.map(([camp, n]) => (
            <span key={camp} className="wp-near-btn static"><Swatch color={CAMP_COLORS[camp]} size={10} />{`Camp ${camp} · ${fullNum(n)}`}</span>
          ))}
        </div>
      )}
      {results.length > 0 && (
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead><tr><th>Day</th><th>Temple</th><th>Camp</th><th className="num">Mithril</th><th /></tr></thead>
            <tbody>
              {[...results].reverse().map((r) => (
                <tr key={r.id} title={[r.notes, r.created_by_name && `by ${r.created_by_name}`].filter(Boolean).join(' · ')}>
                  <td>{dayText(r.day).replace(/ · .*/, '')}</td>
                  <td className="wp-name">{map.byId.get(r.city_id) ? cityTitle(map.byId.get(r.city_id)) : r.city_id}</td>
                  <td>{`${r.camp}${r.rank ? ` · #${r.rank}` : ''}`}</td>
                  <td className="num">{fullNum(r.mithril)}</td>
                  <td><button type="button" className="btn ghost small" disabled={Boolean(busy)} aria-label="Remove"
                              onClick={() => { if (confirm('Remove this result?')) onDelete(r.id) }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open ? (
        <form className="wp-aform" onSubmit={async (e) => {
          e.preventDefault()
          const ok = await onAdd({
            day: f.day, city_id: Number(f.city_id), camp: Number(f.camp),
            rank: f.rank ? Number(f.rank) : null, mithril: Number(f.mithril), notes: f.notes || null,
          })
          if (ok) setF((o) => ({ ...blank, day: o.day, city_id: o.city_id }))
        }}>
          <div className="grid">
            <label>Day<input type="date" value={f.day} required onChange={(e) => set('day', e.target.value)} /></label>
            <label>
              Temple
              <select value={f.city_id} onChange={(e) => set('city_id', e.target.value)}>
                {temples.map((t) => <option key={t.id} value={t.id}>{cityTitle(t)}</option>)}
              </select>
            </label>
            <label>
              Camp
              <select value={f.camp} onChange={(e) => set('camp', e.target.value)}>
                {CAMPS.map((c) => <option key={c} value={c}>{campName(map, c)}</option>)}
              </select>
            </label>
            <label>
              Rank <span className="muted">(optional)</span>
              <input type="number" min="1" max="8" value={f.rank} onChange={(e) => set('rank', e.target.value)} />
            </label>
            <label>
              Mithril
              <input type="number" min="0" max="100000" required value={f.mithril} onChange={(e) => set('mithril', e.target.value)} />
            </label>
            <label>
              Notes <span className="muted">(optional)</span>
              <input value={f.notes} maxLength={200} onChange={(e) => set('notes', e.target.value)} />
            </label>
          </div>
          <div className="card-actions">
            <button className="btn primary small" disabled={Boolean(busy) || f.mithril === ''}>Add result</button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>Done</button>
          </div>
        </form>
      ) : (
        <div className="card-actions">
          <button type="button" className="btn small" onClick={() => setOpen(true)}>Add a result</button>
        </div>
      )}
      <p className="card-body small">One row per camp paid, as the game’s result shows it. Lv.3 Temple rank 1 pays 900; the Supreme Temple 2,500 down to 200.</p>
    </div>
  )
}
