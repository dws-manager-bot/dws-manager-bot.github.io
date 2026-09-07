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
 * The placement maths is engine.js, untouched from the standalone tool. This
 * is a fresh UI in the backoffice's own components, replacing the ported
 * markup and stylesheet, which never stopped looking like a transplant.
 *
 * The line-up is the centre of it: an ordered priority list that decides who
 * gets the slots nearest the pass. Everything else configures how that order
 * is drawn.
 */

const VERSION_LABELS = {
  1: 'Portal layer under the shelters',
  2: 'Shelters on the border',
  3: 'All portals, no shelters',
  4: 'Four shelter layers on the border',
}

const ORIENTS = [['bottom', 'Bottom'], ['top', 'Top'], ['left', 'Left'], ['right', 'Right']]

const shortCP = (n) => PassWarEngine.shortCP(n)

/* ------------------------------------------------------------------ line-up */

function LineupRow({ member, index, shelters, prioritised, onMove, onRemove, dragging, onDragStart }) {
  const s = index < shelters
  const p = index < prioritised
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
        {s && <span className="pw-badge s">S{index + 1}</span>}
        {p && <span className="pw-badge p">P{index + 1}</span>}
      </div>

      <div className="pw-nudge">
        <button type="button" className="btn small" title="To the top"
                onClick={() => onMove(index, 0)}>⤒</button>
        <button type="button" className="btn small" title="Up"
                onClick={() => onMove(index, index - 1)}>↑</button>
        <button type="button" className="btn small" title="Down"
                onClick={() => onMove(index, index + 1)}>↓</button>
        {member.merc && (
          <button type="button" className="btn small danger" title="Remove mercenary"
                  onClick={() => onRemove(index)}>×</button>
        )}
      </div>
    </li>
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
    } catch (err) {
      setOffline(err.message)
    }
  }, [])

  const openPlan = useCallback(async (which, members) => {
    let saved = null
    try {
      const r = await api.raw(`/lineups/${which}`)
      if (r?.order?.length) { saved = r; setServer(r) } else setServer(null)
      setOffline('')
    } catch (err) {
      setOffline(err.message)
    }
    // The published plan outranks this device's cache; the cache is only there
    // so a reload is not a blank page when the API is unreachable.
    const use = saved || readCache()
    if (use?.opts) setOpts((o) => ({ ...o, ...use.opts }))
    const mercs = (use?.mercs || []).map((m) => makeMerc(m.name, m.bgb))
    setLineup(applyOrder(members, mercs, use?.order || []))
    setDirty(false)
  }, [])

  useEffect(() => {
    let live = true
    ;(async () => {
      setBusy('Loading the roster…')
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

  const shelters = PassWarEngine.shelterCountFor(opts.version)
  const stats = plan?.stats

  /* --------------------------------------------------------------- mutating */

  const edit = (fn) => { fn(); setDirty(true) }
  const setOpt = (k, v) => edit(() => setOpts((o) => ({ ...o, [k]: v })))
  const move = (from, to) => edit(() => setLineup((l) => moveItem(l, from, to)))

  const addMerc = (name, bgb) => {
    if (!String(name).trim()) return setError('Give the mercenary a name.')
    edit(() => setLineup((l) => [...l, makeMerc(name, bgb)]))
    setNotice(`Added ${name}.`)
  }

  const resetOrder = () => edit(() => setLineup((l) => {
    const mercs = l.filter((m) => m.merc)
    return applyOrder(roster, mercs, [])
  }))

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

  const onDragStart = (e, index) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag({ from: index, over: index })
  }

  useEffect(() => {
    if (!drag) return undefined
    const rowAt = (y) => {
      const rows = [...(listRef.current?.querySelectorAll('.pw-row') || [])]
      for (const r of rows) {
        const b = r.getBoundingClientRect()
        if (y < b.top + b.height / 2) return Number(r.dataset.index)
      }
      return rows.length
    }
    const onMove = (e) => setDrag((d) => (d ? { ...d, over: rowAt(e.clientY) } : d))
    const onUp = () => {
      setDrag((d) => {
        if (d && d.over !== d.from) {
          const to = d.over > d.from ? d.over - 1 : d.over
          edit(() => setLineup((l) => moveItem(l, d.from, to)))
        }
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
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

      {/* -------------------------------------------------------- the plan */}
      <div className="card">
        <div className="card-head">
          <strong>Plan</strong>
          {dirty && <span className="pill">unsaved changes</span>}
          {readOnly && <span className="pill">read only</span>}
        </div>

        <div className="grid">
          <label>
            Which plan
            <select value={slug} onChange={(e) => { setSlug(e.target.value); openPlan(e.target.value, roster) }}>
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

      {/* ---------------------------------------------------- map settings */}
      <div className="card">
        <div className="card-head"><strong>Layout</strong></div>
        <div className="grid">
          <label className="pw-version">
            Version
            <select value={opts.version} onChange={(e) => setOpt('version', Number(e.target.value))}>
              {Object.entries(VERSION_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{`v${v} · ${label}`}</option>
              ))}
            </select>
          </label>

          <label>
            Pass at
            <select value={opts.orient} onChange={(e) => setOpt('orient', e.target.value)}>
              {ORIENTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>

          <label>
            Portal layers
            <input type="number" inputMode="numeric" min="0" max="8" value={opts.portalLayers}
                   onChange={(e) => setOpt('portalLayers', Math.max(0, Math.min(8, +e.target.value)))} />
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
            <input type="range" min="0" max="100" step="1" value={opts.portalOwners}
                   onChange={(e) => setOpt('portalOwners', +e.target.value)} />
          </label>

          <label className="inline wide">
            <input type="checkbox" checked={opts.showZones}
                   onChange={(e) => setOpt('showZones', e.target.checked)} />
            Show build-out zones
          </label>
        </div>
      </div>

      {/* ------------------------------------------------------------- map */}
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

      {/* ---------------------------------------------------------- line-up */}
      <div className="card">
        <div className="card-head">
          <strong>Line-up</strong>
          <span className="pill">{lineup.length}</span>
        </div>
        <p className="card-body">
          Order is priority: the top of this list takes the slots nearest the pass —
          currently <b>{shelters} shelters and {opts.portalOwners} portals</b>.
          Drag the number, or nudge with the arrows.
        </p>

        <div className="card-actions">
          <button className="btn small" onClick={resetOrder}>Reset to BGB order</button>
          <MercAdder onAdd={addMerc} onBulk={(text) =>
            edit(() => setLineup((l) => [...l, ...parseBulkMercs(text)]))} />
        </div>

        <ol className="pw-list" ref={listRef}>
          {lineup.map((m, i) => (
            <LineupRow
              key={`${m.name}-${i}`}
              member={m} index={i}
              shelters={shelters} prioritised={opts.portalOwners}
              dragging={drag?.from === i}
              onDragStart={onDragStart}
              onMove={move}
              onRemove={(idx) => edit(() => setLineup((l) => l.filter((_, k) => k !== idx)))}
            />
          ))}
        </ol>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- mercenary */

function MercAdder({ onAdd, onBulk }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [cp, setCp] = useState('')
  const [bulk, setBulk] = useState('')

  if (!open) {
    return <button className="btn small" onClick={() => setOpen(true)}>Add a mercenary</button>
  }
  return (
    <div className="pw-merc wide">
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
        <button className="btn primary small"
                onClick={() => { if (bulk.trim()) { onBulk(bulk); setBulk('') } else { onAdd(name, cp); setName(''); setCp('') } }}>
          Add
        </button>
        <button className="btn small" onClick={() => setOpen(false)}>Done</button>
      </div>
    </div>
  )
}
