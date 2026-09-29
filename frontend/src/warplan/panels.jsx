import { useState } from 'react'
import { KIND_LABEL, cityTitle, coords } from './mapdata.js'
import { INKS, SWATCHES, inkOn, nextColor } from './palette.js'
import { CAP, CAP_WITH_TECH, SCORED, fullNum, shortNum } from './standing.js'
import { ITEM_LABEL, STAMPS, STICKERS, StickerSymbol } from './items.jsx'

/* The War planner's side panels. Each is a plain card; the page owns the data
   and passes down what a panel shows and what it may change. */

export const campName = (map, camp) => map?.camps?.[camp] || `Camp ${camp}`

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
  ['pin', 'Pin', <path key="p" d="M10 18s-5.5-5.2-5.5-9.5a5.5 5.5 0 0 1 11 0C15.5 12.8 10 18 10 18zm0-7.3a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />],
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
          {(a.tag || a.name).slice(0, 4)}
        </button>
      ))}
      {INKS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={ink.alliance == null && ink.color === c}
                title={c} className={ink.alliance == null && ink.color === c ? 'wp-ink dot on' : 'wp-ink dot'}
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
  map, city, board, holders, alliances, scenario, editable, onBoard, onPlan, onGo, busy, onClose,
}) {
  const held = board.get(city.id)
  const planned = scenario.changes?.[city.id]
  const planValue = planned === undefined ? 'same' : planned === null ? 'none' : String(planned)
  const willHold = holders.get(city.id)
  const byId = new Map(alliances.map((a) => [a.id, a]))
  const options = (
    <>
      <option value="none">Neutral</option>
      {[1, 2].map((camp) => (
        <optgroup key={camp} label={campName(map, camp)}>
          {alliances.filter((a) => a.camp === camp).map((a) => (
            <option key={a.id} value={a.id}>{a.tag ? `[${a.tag}] ${a.name}` : a.name}</option>
          ))}
        </optgroup>
      ))}
    </>
  )
  return (
    <div className="card wp-inspect">
      <div className="card-head">
        <strong>{cityTitle(city)}</strong>
        <span className="pill">{KIND_LABEL[city.kind]}</span>
        <button type="button" className="btn ghost small wp-close" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="wp-facts">
        <button type="button" className="wp-coord" onClick={() => copy(`${city.x} ${city.y}`)} title="Copy coordinates">
          {coords(city.x, city.y)}
        </button>
        <span>
          {SCORED.has(city.kind) ? `Influence ${fullNum(city.influence)}` : 'No influence'}
        </span>
        {city.region && <span className="muted">{city.region}</span>}
      </div>

      <div className="grid wp-owner">
        <label>
          Held now
          <select value={held == null ? 'none' : String(held)} disabled={Boolean(busy)}
                  onChange={(e) => onBoard(city.id, e.target.value === 'none' ? null : Number(e.target.value))}>
            {options}
          </select>
          <small className="muted">The board — every plan is drawn over it.</small>
        </label>
        <label>
          In {scenario.name}
          <select value={planValue} disabled={!editable}
                  onChange={(e) => {
                    const v = e.target.value
                    onPlan(city.id, v === 'same' ? undefined : v === 'none' ? null : Number(v))
                  }}>
            <option value="same">No change</option>
            {options}
          </select>
          <small className="muted">
            {planValue === 'same' ? 'Stays as the board has it.'
              : willHold != null ? `Planned: ${byId.get(willHold)?.name || 'removed alliance'} takes it.`
                : 'Planned: goes neutral.'}
          </small>
        </label>
      </div>

      {city.nearBy.length > 0 && (
        <>
          <div className="wp-sub">Borders</div>
          <div className="wp-near">
            {city.nearBy.map((id) => map.byId.get(id)).filter(Boolean).map((n) => {
              const h = holders.get(n.id)
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

export function ItemPanel({ item, alliances, editable, onChange, onDelete, onDuplicate, onClose }) {
  const set = (patch, key) => onChange({ ...item, ...patch }, key)
  const ink = { alliance: item.alliance ?? null, color: item.color || '#fbbf24' }
  const shown = alliances.find((a) => a.id === item.alliance)?.color || ink.color
  const where = item.type === 'arrow' ? `${coords(...item.a)} → ${coords(...item.b)}` : coords(item.x, item.y)
  return (
    <div className="card wp-inspect">
      <div className="card-head">
        <strong>{ITEM_LABEL[item.type]}</strong>
        <button type="button" className="wp-coord" onClick={() => copy(item.type === 'arrow' ? where : `${item.x} ${item.y}`)}
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
                <span className="pw-slider-label">Text size <b>{item.font || 4}</b></span>
                <input type="range" min="1.5" max="12" step="0.5" value={item.font || 4}
                       onChange={(e) => set({ font: +e.target.value }, `font:${item.id}`)} />
              </label>
              <div className="wide">
                <span className="label">Paper</span>
                <div className="wp-inks">
                  {NOTE_COLORS.map((c) => (
                    <button key={c} type="button" className={item.color === c ? 'wp-ink dot on' : 'wp-ink dot'}
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
          {item.type === 'arrow' && (
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
                  <button type="button" className={item.both ? 'chip on' : 'chip'} onClick={() => set({ both: !item.both })}>Both ends</button>
                </div>
              </div>
              <label className="wide">
                <span className="pw-slider-label">Width <b>{item.width || 1.6}</b></span>
                <input type="range" min="0.4" max="6" step="0.2" value={item.width || 1.6}
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

export function StandingsCard({ map, now, planned, scenario, changed, onApply, busy }) {
  const plannedById = new Map(planned.map((r) => [r.alliance.id, r]))
  const totals = (rows) => rows.reduce((t, r) => ({ ...t, [r.alliance.camp]: (t[r.alliance.camp] || 0) + r.influence }), { 1: 0, 2: 0 })
  const tNow = totals(now)
  const tPlan = totals(planned)
  const delta = (a, b) => {
    const d = b - a
    if (!d) return null
    return <span className={d > 0 ? 'wp-up' : 'wp-down'}>{d > 0 ? '+' : '−'}{shortNum(Math.abs(d))}</span>
  }
  return (
    <div className="card">
      <div className="card-head">
        <strong>Influence</strong>
        <span className="muted small">{changed ? `now → ${scenario.name}` : 'now'}</span>
      </div>
      {!now.length ? (
        <p className="card-body">Add the alliances on the map to rank them.</p>
      ) : (
        <div className="wp-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>#</th><th>Alliance</th><th title={`Cities and passes held; the cap is ${CAP}, ${CAP_WITH_TECH} with Alliance Expansion`}>Held</th>
                <th className="num">Influence</th>
                {changed && <th className="num">{scenario.name}</th>}
              </tr>
            </thead>
            <tbody>
              {now.map((r, i) => {
                const p = plannedById.get(r.alliance.id) || r
                const over = Math.max(r.count, p.count)
                return (
                  <tr key={r.alliance.id}>
                    <td className="muted">{i + 1}</td>
                    <td>
                      <span className="wp-who"><Swatch color={r.alliance.color} />
                        <span className="wp-name">{r.alliance.tag ? `[${r.alliance.tag}] ` : ''}{r.alliance.name}</span>
                      </span>
                    </td>
                    <td className={over > CAP_WITH_TECH ? 'wp-over' : over > CAP ? 'wp-warn' : ''}
                        title={`${r.cities} Pyramids, ${r.passes} passes, ${r.strongholds} Strongholds, ${r.oases} Oases`}>
                      {changed && p.count !== r.count ? `${r.count}→${p.count}` : r.count}
                    </td>
                    <td className="num">{shortNum(r.influence)}</td>
                    {changed && <td className="num">{shortNum(p.influence)} {delta(r.influence, p.influence)}</td>}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {[1, 2].map((camp) => (
                <tr key={camp}>
                  <td />
                  <td colSpan="2">{campName(map, camp)}</td>
                  <td className="num">{shortNum(tNow[camp])}</td>
                  {changed && <td className="num">{shortNum(tPlan[camp])} {delta(tNow[camp], tPlan[camp])}</td>}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}
      <p className="card-body small">
        Pyramids and passes score. Held counts both against the cap of {CAP} ({CAP_WITH_TECH} with Alliance Expansion);
        amber is over {CAP}, red over {CAP_WITH_TECH}.
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
  const [f, setF] = useState(() => ({
    ...EMPTY, ...initial,
    color: initial?.color || nextColor(initial?.camp || 1, alliances),
  }))
  const others = alliances.filter((a) => a.id !== initial?.id)
  const taken = new Map(others.map((a) => [a.color.toLowerCase(), a.name]))
  const clash = taken.get(f.color.toLowerCase())
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }))
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
            setF((o) => ({ ...o, camp, color: initial?.id ? o.color : nextColor(camp, others) }))
          }}>
            <option value={1}>{campName(map, 1)}</option>
            <option value={2}>{campName(map, 2)}</option>
          </select>
        </label>
        <label>
          State <span className="muted">(optional)</span>
          <input value={f.server || ''} maxLength={16} inputMode="numeric" placeholder="413" onChange={(e) => set('server', e.target.value)} />
        </label>
        <div className="wide">
          <span className="label">Color</span>
          <div className="wp-inks">
            {[...SWATCHES[f.camp], ...SWATCHES[f.camp === 1 ? 2 : 1]].map((c) => (
              <button key={c} type="button" disabled={taken.has(c)} title={taken.get(c) || c}
                      className={f.color.toLowerCase() === c ? 'wp-ink dot on' : 'wp-ink dot'}
                      style={{ background: c }} onClick={() => set('color', c)} aria-label={c} />
            ))}
            <label className="wp-ink custom" title="Any color">
              <input type="color" value={f.color} onChange={(e) => set('color', e.target.value)} />
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
  const held = new Map(now.map((r) => [r.alliance.id, r]))
  return (
    <div className="card">
      <div className="card-head">
        <strong>Alliances</strong>
        <span className="pill">{alliances.length}</span>
      </div>
      <p className="card-body">Both camps, each alliance in its own color. The map colors what each one holds.</p>
      {[1, 2].map((camp) => {
        const list = alliances.filter((a) => a.camp === camp)
        return (
          <div key={camp} className="wp-camp">
            <div className="wp-sub">{campName(map, camp)}</div>
            {!list.length && <div className="muted small">None yet.</div>}
            {list.map((a) => (editing === a.id ? (
              <AllianceForm key={a.id} initial={a} alliances={alliances} map={map} busy={busy}
                            onSave={async (f) => { if (await onUpdate(a.id, f)) setEditing(null) }}
                            onCancel={() => setEditing(null)}
                            onDelete={async () => {
                              const r = held.get(a.id)
                              const n = r ? r.count + r.strongholds + r.oases : 0
                              if (!confirm(`Remove ${a.name}?${n ? `\n\nThe ${n} territories it holds go neutral on the board.` : ''}`)) return
                              if (await onDelete(a.id)) setEditing(null)
                            }} />
            ) : (
              <button key={a.id} type="button" className="wp-arow" onClick={() => setEditing(a.id)}>
                <Swatch color={a.color} size={14} />
                <span className="wp-name">{a.tag ? <b>[{a.tag}] </b> : null}{a.name}</span>
                <span className="muted small">{[a.server && `#${a.server}`, held.get(a.id)?.count ? `${held.get(a.id).count} held` : null].filter(Boolean).join(' · ')}</span>
              </button>
            )))}
          </div>
        )
      })}
      {editing === 'new' ? (
        <AllianceForm alliances={alliances} map={map} busy={busy}
                      onSave={async (f) => { if (await onCreate(f)) setEditing(null) }}
                      onCancel={() => setEditing(null)} />
      ) : (
        <div className="card-actions">
          <button type="button" className="btn small" onClick={() => setEditing('new')}>Add an alliance</button>
        </div>
      )}
    </div>
  )
}
