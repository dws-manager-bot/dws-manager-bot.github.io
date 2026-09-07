import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import PassWarEngine from '../passwar/engine.js'
import {
  DEFAULT_OPTS, OFFICIAL, applyOrder, draftSlug, loadRoster, makeMerc,
  moveItem, parseBulkMercs, readCache, snapshot, stamp, writeCache,
} from '../passwar/data.js'

/**
 * Pass Occupation War map.
 *
 * The placement maths is engine.js, untouched from the standalone tool. The
 * line-up is what the screen is really about: an ordered priority list that
 * decides who takes the slots nearest the pass. Everything else configures how
 * that order gets drawn.
 *
 * On a wide screen the map is pinned beside the controls so an edit is visible
 * as it is made; a phone has no room for that, and it stacks.
 */

/* A version is a starting shape, not a fixed layout — the depth and width of
   the shelter block are settings now. That is what retired v4: it was v2 with
   four layers, which these two numbers say plainly. Plans saved under it open
   as the v2 they always were. */
const VERSION_LABELS = {
  1: 'Portal layer under the shelters',
  2: 'Shelters on the border',
  3: 'All portals, no shelters',
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? Math.round(+v) : lo))

const ORIENTS = [['bottom', 'Bottom'], ['top', 'Top'], ['left', 'Left'], ['right', 'Right']]

const shortCP = (n) => PassWarEngine.shortCP(n)

/* ------------------------------------------------------------------ line-up */

function LineupRow({ member, index, shelters, prioritised, onMove, onRemove, dragging, onDragStart }) {
  return (
    <li className={dragging ? 'pw-row dragging' : 'pw-row'} data-index={index}>
      <button
        type="button"
        className="pw-grip"
        aria-label={`Move ${member.name}`}
        onPointerDown={(e) => onDragStart(e, index)}
      >
        <span className="pw-rank">{index + 1}</span>
      </button>

      <div className="pw-who">
        <span className="pw-name">{member.name}</span>
        <span className="muted pw-cp">
          {member.merc ? 'mercenary' : ''}
          {member.bgb ? `${member.merc ? ' · ' : ''}${shortCP(member.bgb)}` : member.merc ? '' : ' —'}
        </span>
      </div>

      <div className="pw-badges">
        {index < shelters && <span className="pw-badge s">S{index + 1}</span>}
        {index < prioritised && <span className="pw-badge p">P{index + 1}</span>}
      </div>

      <div className="pw-nudge">
        <button type="button" className="btn small" title="To the top" onClick={() => onMove(index, 0)}>⤒</button>
        <button type="button" className="btn small" title="Up" onClick={() => onMove(index, index - 1)}>↑</button>
        <button type="button" className="btn small" title="Down" onClick={() => onMove(index, index + 1)}>↓</button>
        {member.merc && (
          <button type="button" className="btn small danger" title="Remove mercenary"
                  onClick={() => onRemove(index)}>×</button>
        )}
      </div>
    </li>
  )
}

function MercAdder({ onAdd, onBulk }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cp, setCp] = useState('')
  const [bulk, setBulk] = useState('')

  if (!open) {
    return <button className="btn small" onClick={() => setOpen(true)}>Add a mercenary</button>
  }
  return (
    <div className="pw-merc">
      <div className="grid">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mercenary name" />
        </label>
        <label>
          BGB CP <span className="muted">(optional)</span>
          <input inputMode="numeric" value={cp} onChange={(e) => setCp(e.target.value)} placeholder="0" />
        </label>
        <label className="wide">
          Or paste several — one per line, <span className="muted">name then CP</span>
          <textarea rows="3" value={bulk} onChange={(e) => setBulk(e.target.value)}
                    placeholder={'Mercy 120000000\nAnother 98000000'} />
        </label>
      </div>
      <div className="row">
        <button className="btn primary small" onClick={() => {
          if (bulk.trim()) { onBulk(bulk); setBulk('') } else { onAdd(name, cp); setName(''); setCp('') }
        }}>Add</button>
        <button className="btn small" onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- page */

export default function PassWar({ user }) {
  const [opts, setOpts] = useState(DEFAULT_OPTS)
  const [roster, setRoster] = useState([])
  const [source, setSource] = useState('')
  const [lineup, setLineup] = useState([])
  const [plans, setPlans] = useState([])
  const [slug, setSlug] = useState(OFFICIAL)
  const [server, setServer] = useState(null)
  const [offline, setOffline] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState('')
  const [dirty, setDirty] = useState(false)
  const [actualSize, setActualSize] = useState(false)
  const [drag, setDrag] = useState(null)

  const canvas = useRef(null)
  const listRef = useRef(null)

  const isAdmin = Boolean(user?.is_admin)
  const mySlug = draftSlug(user?.discord_id)

  /* ---------------------------------------------------------------- loading */

  const fetchPlans = useCallback(async () => {
    try {
      setPlans(await api.raw('/lineups'))
      setOffline('')
    } catch (err) { setOffline(err.message) }
  }, [])

  const openPlan = useCallback(async (which, members) => {
    let saved = null
    try {
      const r = await api.raw(`/lineups/${which}`)
      if (r?.order?.length) { saved = r; setServer(r) } else setServer(null)
      setOffline('')
    } catch (err) { setOffline(err.message) }
    // The published plan outranks this device's cache; the cache only exists so
    // a reload is not a blank page when the API is unreachable.
    const use = saved || readCache()
    if (use?.opts) setOpts((o) => PassWarEngine.normalizeOpts({ ...o, ...use.opts }))
    const mercs = (use?.mercs || []).map((m) => makeMerc(m.name, m.bgb))
    setLineup(applyOrder(members, mercs, use?.order || []))
    setDirty(false)
  }, [])

  useEffect(() => {
    let live = true
    ;(async () => {
      setBusy('Loading…')
      const { members, source: src } = await loadRoster()
      if (!live) return
      setRoster(members)
      setSource(src)
      await fetchPlans()
      await openPlan(OFFICIAL, members)
      setBusy('')
    })()
    return () => { live = false }
  }, [fetchPlans, openPlan])

  /* ----------------------------------------------------------------- render */

  const plan = useMemo(() => {
    if (!lineup.length) return null
    const p = PassWarEngine.buildPlan(lineup, opts)
    p.showZones = opts.showZones
    return p
  }, [lineup, opts])

  useEffect(() => {
    if (plan && canvas.current) PassWarEngine.render(canvas.current, plan, roster, stamp())
  }, [plan, roster])

  useEffect(() => {
    if (lineup.length) writeCache(snapshot(opts, lineup))
  }, [opts, lineup])

  // What was actually drawn, which is fewer than rows x cols once the block
  // runs past the edge of the camp.
  const stats = plan?.stats
  const shelters = stats?.shelters ?? 0
  const channels = plan?.g.CHANNELS ?? []
  const evenRows = opts.shelterRows + (opts.shelterRows % 2)
  const evenCols = opts.shelterCols + (opts.shelterCols % 2)
  const maxGateX = Math.max(0, opts.mapW - opts.gateW)
  const gateX = opts.gateX == null ? Math.floor(maxGateX / 2) : Math.min(maxGateX, opts.gateX)

  /* --------------------------------------------------------------- mutating */

  const edit = (fn) => { fn(); setDirty(true) }
  const setOpt = (k, v) => edit(() => setOpts((o) => ({ ...o, [k]: v })))
  const move = (from, to) => edit(() => setLineup((l) => moveItem(l, from, to)))

  /* Picking a version reseeds the grid, so the choice still means something;
     the two controls beside it then adjust that shape freely. */
  const setVersion = (v) => edit(() => setOpts((o) => {
    const spec = PassWarEngine.VERSIONS[v] || PassWarEngine.VERSIONS[1]
    return { ...o, version: v, shelterRows: spec.shelterRows, shelterCols: spec.shelterCols }
  }))

  const addMerc = (name, bgb) => {
    if (!String(name).trim()) return setError('Give the mercenary a name.')
    edit(() => setLineup((l) => [...l, makeMerc(name, bgb)]))
    return setNotice(`Added ${name}.`)
  }

  /* Both counts up to the next even number, which is the whole of the fix: a
     3-tile shelter and a 2-tile portal only ever tile together in pairs. */
  const evenUp = () =>
    edit(() => setOpts((o) => ({ ...o, shelterRows: evenRows, shelterCols: evenCols })))

  const resetOrder = () =>
    edit(() => setLineup((l) => applyOrder(roster, l.filter((m) => m.merc), [])))

  const mercCount = lineup.filter((m) => m.merc).length

  const clearMercs = () => {
    if (!confirm(`Remove all ${mercCount} mercenaries? The member order is kept.`)) return
    edit(() => setLineup((l) => l.filter((m) => !m.merc)))
    setNotice(`Removed ${mercCount} mercenaries.`)
  }

  /* Back to a blank sheet: BGB order, no mercenaries, default layout. It stays
     unsaved until the draft is saved, so this is recoverable by reloading. */
  const resetDraft = () => {
    if (!confirm('Reset everything — layout, order and mercenaries — back to the defaults?\n\nNothing is saved until you press Save.')) return
    edit(() => {
      setOpts(DEFAULT_OPTS)
      setLineup(applyOrder(roster, [], []))
    })
    setNotice('Reset. Save the draft to keep it, or reload to undo.')
  }

  async function saveDraft() {
    setBusy('Saving…'); setError(null)
    try {
      const r = await api.raw(`/lineups/${mySlug}`, {
        method: 'PUT', body: JSON.stringify(snapshot(opts, lineup)),
      })
      setServer(r); setSlug(mySlug); setDirty(false)
      setNotice('Saved to your draft.')
      await fetchPlans()
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function publish() {
    if (!confirm('Publish this as the official plan for the whole alliance?')) return
    setBusy('Publishing…'); setError(null)
    try {
      const r = await api.raw(`/lineups/${slug}/publish`, { method: 'POST' })
      setServer(r); setSlug(OFFICIAL); setDirty(false)
      setNotice('Published. Everyone sees this now.')
      await fetchPlans()
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function refreshRoster() {
    setBusy('Refreshing…')
    const { members, source: src } = await loadRoster()
    setRoster(members); setSource(src)
    setLineup((l) => applyOrder(members, l.filter((m) => m.merc), l.map((m) => m.name)))
    setBusy('')
  }

  function downloadPng() {
    if (!canvas.current) return
    const a = document.createElement('a')
    a.href = canvas.current.toDataURL('image/png')
    a.download = `pass_war_map_v${opts.version}_${opts.orient}_${stamp()}.png`
    a.click()
  }

  /* ------------------------------------------------------------------- drag */

  /* A copy of the row floats under the finger while the list rearranges live
     beneath it, so the drop position is visible before letting go. */
  const onDragStart = (e, index) => {
    if (e.button) return
    e.preventDefault()
    const r = e.currentTarget.closest('.pw-row').getBoundingClientRect()
    setDrag({ index, grabDy: e.clientY - r.top, left: r.left, width: r.width, y: e.clientY })
  }

  useEffect(() => {
    if (!drag) return undefined

    const indexUnder = (y) => {
      const rows = [...(listRef.current?.querySelectorAll('.pw-row') || [])]
      if (!rows.length) return 0
      if (y < rows[0].getBoundingClientRect().top) return 0
      for (let i = 0; i < rows.length; i += 1) {
        if (y <= rows[i].getBoundingClientRect().bottom) return i
      }
      return rows.length - 1
    }

    const onMove = (e) => {
      e.preventDefault()
      const target = indexUnder(e.clientY)
      setDrag((d) => {
        if (!d) return d
        if (target !== d.index) {
          setLineup((l) => moveItem(l, d.index, target))
          setDirty(true)
          return { ...d, index: target, y: e.clientY }
        }
        return { ...d, y: e.clientY }
      })
    }
    const onUp = () => setDrag(null)

    // passive:false so preventDefault can stop the page scrolling under a drag
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag])

  /* ------------------------------------------------------------------- view */

  const planLabel = (p) =>
    p.slug === OFFICIAL
      ? `★ Official plan${p.owner_name ? ` — by ${p.owner_name}` : ''}`
      : p.slug === mySlug
        ? 'My draft'
        : `Draft — ${p.owner_name || p.slug.replace('draft:', '')}`

  const readOnly = slug !== OFFICIAL && slug !== mySlug

  return (
    <div className="page">
      <div className="page-head">
        <h2>Pass War map</h2>
        <button className="btn" onClick={refreshRoster} disabled={Boolean(busy)}>
          {busy === 'Refreshing…' ? 'Refreshing…' : 'Refresh roster'}
        </button>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNotice(null)}>{notice}</Banner>
      {offline && (
        <Banner tone="error" onDismiss={() => setOffline('')}>
          {`Alliance API unavailable (${offline}) — changes stay on this device.`}
        </Banner>
      )}

      {drag && lineup[drag.index] && (
        <div className="pw-float" aria-hidden="true"
             style={{ left: drag.left, top: drag.y - drag.grabDy, width: drag.width }}>
          <span className="pw-grip static"><span className="pw-rank">{drag.index + 1}</span></span>
          <span className="pw-name">{lineup[drag.index].name}</span>
        </div>
      )}

      <div className="pw-layout">
        <div className="pw-map-col">
          <div className="card">
            <div className="card-head">
              <strong>Map</strong>
              {stats && (
                <span className="muted small">
                  {`${stats.shelters} shelters · ${stats.portals} portals `}
                  {`(${stats.owned} prioritised, ${stats.free} free) · ${stats.named} placed`}
                </span>
              )}
            </div>

            <div className={actualSize ? 'pw-map actual' : 'pw-map'}>
              <canvas ref={canvas} />
            </div>

            <div className="card-actions">
              <button className="btn" onClick={() => setActualSize((v) => !v)}>
                {actualSize ? 'Fit to width' : 'Actual size'}
              </button>
              <button className="btn primary" onClick={downloadPng}>Download PNG</button>
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>Roster: {source}</div>
          </div>
        </div>

        <div className="pw-side-col">
          <div className="card">
            <div className="card-head">
              <strong>Plan</strong>
              {dirty && <span className="pill">unsaved</span>}
              {readOnly && <span className="pill">read only</span>}
            </div>

            <div className="grid">
              <label className="wide">
                Which plan
                <select value={slug}
                        onChange={(e) => { setSlug(e.target.value); openPlan(e.target.value, roster) }}>
                  {plans.map((p) => <option key={p.slug} value={p.slug}>{planLabel(p)}</option>)}
                  {isAdmin && !plans.some((p) => p.slug === mySlug) && (
                    <option value={mySlug}>My draft (empty)</option>
                  )}
                </select>
              </label>
            </div>

            <p className="card-body">
              {slug === OFFICIAL
                ? `The plan everyone sees${server?.owner_name ? `, published by ${server.owner_name}` : ''}.`
                : slug === mySlug
                  ? 'Your own draft. No other admin can overwrite it.'
                  : `${server?.owner_name || 'Another admin'}'s draft — open it to copy, but you cannot save over it.`}
              {!isAdmin && ' Admins keep the drafts; you can view and export any of them.'}
            </p>

            <div className="card-actions">
              <button className="btn" onClick={() => openPlan(slug, roster)} disabled={Boolean(busy)}>
                Reload
              </button>
              <button className="btn danger" onClick={resetDraft} disabled={Boolean(busy)}>
                Reset draft
              </button>
              {isAdmin && (
                <>
                  <button className="btn primary" onClick={saveDraft} disabled={Boolean(busy) || readOnly}>
                    {busy === 'Saving…' ? 'Saving…' : 'Save to my draft'}
                  </button>
                  <button className="btn" onClick={publish} disabled={Boolean(busy) || slug === OFFICIAL}>
                    {busy === 'Publishing…' ? 'Publishing…' : 'Publish as official'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><strong>Layout</strong></div>
            <div className="grid">
              <label className="wide">
                Version
                <select value={opts.version} onChange={(e) => setVersion(Number(e.target.value))}>
                  {Object.entries(VERSION_LABELS).map(([v, label]) => (
                    <option key={v} value={v}>{`v${v} · ${label}`}</option>
                  ))}
                </select>
                <small className="muted">Sets a starting shape; adjust it below.</small>
              </label>

              <label>
                Shelter layers
                <input type="number" inputMode="numeric" min="0" max="20" value={opts.shelterRows}
                       onChange={(e) => setOpt('shelterRows', clamp(e.target.value, 0, 20))} />
                <small className="muted">Depth back from the border.</small>
              </label>

              <label>
                Shelters per layer
                <input type="number" inputMode="numeric" min="1" max="20" value={opts.shelterCols}
                       onChange={(e) => setOpt('shelterCols', clamp(e.target.value, 1, 20))} />
                <small className="muted">Width of each layer.</small>
              </label>

              {channels.length > 0 ? (
                <div className="banner note small wide" role="status">
                  <div className="banner-body">
                    A shelter is 3 tiles and a portal 2, so an odd grid never divides:
                    {' '}{channels.map((c) => `${c[2]}×${c[3]}`).join(' and ')} of ground
                    behind the block takes neither, and is drawn as kept clear. Even
                    numbers leave every structure flush.
                  </div>
                  <button className="btn small" onClick={evenUp}>
                    Use {evenRows} × {evenCols}
                  </button>
                </div>
              ) : (
                <p className="card-body wide muted small">
                  {shelters} shelters, every structure flush against its neighbours.
                </p>
              )}

              <label>
                Pass at
                <select value={opts.orient} onChange={(e) => setOpt('orient', e.target.value)}>
                  {ORIENTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </label>

              <label>
                Portals
                <input type="number" inputMode="numeric" min="0" max="400" value={opts.portalCount}
                       onChange={(e) => setOpt('portalCount', clamp(e.target.value, 0, 400))} />
                <small className="muted">
                  {stats ? `${stats.portals} on the map, named and free together.`
                    : 'Named and free together.'}
                </small>
              </label>

              <div>
                <span className="label">Shelters lean</span>
                <div className="row">
                  {['left', 'right'].map((v) => (
                    <button type="button" key={v}
                            className={opts.shelterBias === v ? 'chip on' : 'chip'}
                            onClick={() => setOpt('shelterBias', v)}>
                      {v === 'left' ? 'Left' : 'Right'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="wide">
                <span className="pw-slider-label">
                  Prioritised portals
                  <b>{opts.portalOwners} named</b>
                  <span className="muted">the rest are left free</span>
                </span>
                <input type="range" min="0" max={opts.portalCount} step="1"
                       value={Math.min(opts.portalOwners, opts.portalCount)}
                       onChange={(e) => setOpt('portalOwners', +e.target.value)} />
              </label>

              <label className="inline wide">
                <input type="checkbox" checked={opts.showZones}
                       onChange={(e) => setOpt('showZones', e.target.checked)} />
                Show build-out zones
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><strong>Map &amp; gate</strong></div>
            <p className="card-body">
              The board underneath the formation. Camps differ from map to map, and the
              gate is not always halfway along the border — set these to match the one
              you are fighting on.
            </p>
            <div className="grid">
              <label>
                Camp width
                <input type="number" inputMode="numeric" min="12" max="120" value={opts.mapW}
                       onChange={(e) => setOpt('mapW', clamp(e.target.value, 12, 120))} />
                <small className="muted">Tiles across our territory.</small>
              </label>

              <label>
                Camp depth
                <input type="number" inputMode="numeric" min="12" max="120" value={opts.mapH}
                       onChange={(e) => setOpt('mapH', clamp(e.target.value, 12, 120))} />
                <small className="muted">Rear wall to the border.</small>
              </label>

              <label className="wide">
                <span className="pw-slider-label">
                  Gate along the border
                  <b>tile {gateX}</b>
                  <span className="muted">
                    {opts.gateX == null ? 'centred, and stays centred' : `of ${maxGateX}`}
                  </span>
                </span>
                <input type="range" min="0" max={maxGateX} step="1" value={gateX}
                       onChange={(e) => setOpt('gateX', +e.target.value)} />
              </label>

              <label>
                Gate width
                <input type="number" inputMode="numeric" min="5" max={opts.mapW}
                       value={opts.gateW}
                       onChange={(e) => setOpt('gateW', clamp(e.target.value, 5, opts.mapW))} />
                <small className="muted">The pass is 5 wide.</small>
              </label>

              <label>
                Gate length
                <input type="number" inputMode="numeric" min="12" max="60" value={opts.gateH}
                       onChange={(e) => setOpt('gateH', clamp(e.target.value, 12, 60))} />
                <small className="muted">Our border to theirs.</small>
              </label>

              <label>
                Rival camp depth
                <input type="number" inputMode="numeric" min="1" max="60" value={opts.rivalDepth}
                       onChange={(e) => setOpt('rivalDepth', clamp(e.target.value, 1, 60))} />
                <small className="muted">How much of theirs to draw.</small>
              </label>

              <label>
                Tile size
                <input type="number" inputMode="numeric" min="12" max="60" value={opts.tile}
                       onChange={(e) => setOpt('tile', clamp(e.target.value, 12, 60))} />
                <small className="muted">Pixels per tile in the PNG.</small>
              </label>

              <div className="card-actions wide">
                <button className="btn small" onClick={() => setOpt('gateX', null)}
                        disabled={opts.gateX == null}>
                  Centre the gate
                </button>
                <button className="btn small" onClick={() => edit(() => setOpts((o) => ({
                  ...o, mapW: DEFAULT_OPTS.mapW, mapH: DEFAULT_OPTS.mapH, gateX: null,
                  gateW: DEFAULT_OPTS.gateW, gateH: DEFAULT_OPTS.gateH,
                  rivalDepth: DEFAULT_OPTS.rivalDepth, tile: DEFAULT_OPTS.tile,
                })))}>
                  Standard board
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <strong>Line-up</strong>
              <span className="pill">{lineup.length}</span>
            </div>
            <p className="card-body">
              Order is priority: the top of this list takes the slots nearest the pass —
              currently <b>{shelters} shelters and {stats?.owned ?? opts.portalOwners} portals</b>.
              Drag the number, or nudge with the arrows.
            </p>

            <div className="card-actions">
              <button className="btn small" onClick={resetOrder}>Reset to BGB order</button>
              {mercCount > 0 && (
                <button className="btn small danger" onClick={clearMercs}>
                  Remove {mercCount} mercenaries
                </button>
              )}
              <MercAdder
                onAdd={addMerc}
                onBulk={(text) => edit(() => setLineup((l) => [...l, ...parseBulkMercs(text)]))}
              />
            </div>

            <ol className={drag ? 'pw-list dragging' : 'pw-list'} ref={listRef}>
              {lineup.map((m, i) => (
                <LineupRow
                  key={`${m.name}-${i}`}
                  member={m} index={i}
                  shelters={shelters} prioritised={stats?.owned ?? opts.portalOwners}
                  dragging={drag?.index === i}
                  onDragStart={onDragStart}
                  onMove={move}
                  onRemove={(idx) => edit(() => setLineup((l) => l.filter((_, k) => k !== idx)))}
                />
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
