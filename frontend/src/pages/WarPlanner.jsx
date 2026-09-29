import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import { save as saveFile } from '../lib/files.js'
import { SERVER_TZ } from '../lib/servertime.js'
import WarMap from '../warplan/WarMap.jsx'
import { loadMap, search } from '../warplan/mapdata.js'
import { holdersWith, standings } from '../warplan/standing.js'
import { newId, shifted } from '../warplan/items.jsx'
import {
  AlliancesCard, CityPanel, ItemPanel, StandingsCard, Swatch, Toolbar, campName,
} from '../warplan/panels.jsx'
import '../warplan/warplan.css'

/**
 * The season war planner.
 *
 * The board is who holds what right now, shared, and edited from any plan.
 * A war day holds one draft per admin and one official plan; a plan holds
 * scenarios, and a scenario holds its planned captures and its drawings.
 * Publishing copies a draft into the official plan, as the Pass War map does.
 *
 * Admins only: this is the alliance's strategy. Members get the PNG.
 */

/* ------------------------------------------------------------------ helpers */

const blankScenario = (name) => ({ id: newId(), name, changes: {}, items: [] })
const blankDoc = () => ({ scenarios: [blankScenario('Plan A')] })

function normalize(doc) {
  const list = (doc?.scenarios || []).map((s) => ({
    id: s.id || newId(), name: s.name || 'Plan', changes: s.changes || {}, items: s.items || [],
    ...(s.notes ? { notes: s.notes } : {}),
  }))
  return { scenarios: list.length ? list : blankDoc().scenarios }
}

/** The name after the last "Plan X": Plan B, Plan C… */
function nextName(scenarios) {
  const used = new Set(scenarios.map((s) => s.name))
  for (let i = 0; i < 26; i += 1) {
    const n = `Plan ${String.fromCharCode(65 + i)}`
    if (!used.has(n)) return n
  }
  return `Plan ${scenarios.length + 1}`
}

/** Today in server time, as YYYY-MM-DD. */
const serverToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: SERVER_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

/** The Saturday a war is fought on: today if it is Saturday in ST, else the next. */
function nextSaturday() {
  const d = new Date(`${serverToday()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7))
  return d.toISOString().slice(0, 10)
}

const dayLabel = (iso) => new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
}).format(new Date(`${iso}T00:00:00Z`))

const unsavedKey = (dayId) => `wp.unsaved.${dayId}`
const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }

const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

/* --------------------------------------------------------------------- page */

export default function WarPlanner({ user }) {
  const me = String(user?.discord_id ?? '')

  const [map, setMap] = useState(null)
  const [alliances, setAlliances] = useState([])
  const [holdings, setHoldings] = useState([])
  const [days, setDays] = useState([])
  const [dayId, setDayId] = useState(null)
  const [newDay, setNewDay] = useState(null)
  const [plans, setPlans] = useState([])
  const [planKey, setPlanKey] = useState(null)     // a plan id, or 'mine' for a draft not yet saved
  const [plan, setPlan] = useState(null)           // the loaded plan, null for a new draft
  const [doc, setDoc] = useState(blankDoc)
  const [saved, setSaved] = useState(() => JSON.stringify(normalize(null)))
  const [scenarioId, setScenarioId] = useState(null)
  const [recover, setRecover] = useState(null)

  const [tool, setTool] = useState('select')
  const [ink, setInk] = useState({ alliance: null, color: '#fbbf24' })
  const [symbol, setSymbol] = useState('target')
  const [stamp, setStamp] = useState('shelter')
  const [selItem, setSelItem] = useState(null)
  const [selCity, setSelCity] = useState(null)
  const [query, setQuery] = useState('')

  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState('')

  const mapRef = useRef(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const hist = useRef({ past: [], future: [], key: null, at: 0 })
  const dragBase = useRef(null)

  /* -------------------------------------------------------------- derived */

  const board = useMemo(() => new Map(holdings.map((h) => [h.city_id, h.alliance_id])), [holdings])
  const scenario = doc.scenarios.find((s) => s.id === scenarioId) || doc.scenarios[0]
  const holders = useMemo(() => holdersWith(board, scenario.changes), [board, scenario.changes])
  const isMine = planKey === 'mine' || (plan && plan.owner_id === me)
  const editable = Boolean(isMine)
  const dirty = editable && JSON.stringify(doc) !== saved
  const day = days.find((d) => d.id === dayId) || null
  const mine = plans.find((p) => p.owner_id === me) || null
  const canPublish = !plan?.official && (editable || Boolean(plan))
  const changed = Object.keys(scenario.changes).some((id) => (scenario.changes[id] ?? null) !== (board.get(Number(id)) ?? null))

  const now = useMemo(() => (map ? standings(map, board, alliances) : []), [map, board, alliances])
  const planned = useMemo(() => (map ? standings(map, holders, alliances) : []), [map, holders, alliances])

  const fail = (err) => setError(err?.message || String(err))

  /* -------------------------------------------------------------- loading */

  const fetchPlans = useCallback(async (id) => {
    const list = await api.raw(`/war/days/${id}/plans`)
    setPlans(list)
    return list
  }, [])

  const resetHistory = () => { hist.current = { past: [], future: [], key: null, at: 0 }; dragBase.current = null }

  const showDoc = useCallback((d, baseline) => {
    const n = normalize(d)
    setDoc(n); docRef.current = n
    setSaved(JSON.stringify(baseline === undefined ? n : normalize(baseline)))
    setScenarioId(n.scenarios[0].id)
    setSelItem(null); setSelCity(null)
    resetHistory()
  }, [])

  /** Open a plan: an id, or 'mine' for a draft not saved yet. Work this device
      never saved, made over the same version, is offered back. */
  const openPlan = useCallback(async (key, id, list) => {
    const own = (list || plans).find((p) => p.owner_id === me)
    setRecover(null)
    setPlanKey(key)
    let version = 0
    if (key === 'mine') {
      setPlan(null)
      showDoc(blankDoc())
    } else {
      const p = await api.raw(`/war/plans/${key}`)
      setPlan(p)
      showDoc(p.doc)
      version = p.version
      if (p.owner_id !== me) setTool('select')
    }
    if (key === 'mine' || key === own?.id) {
      const stash = readJson(unsavedKey(id))
      if (stash?.doc && stash.base === version) setRecover(stash)
    }
  }, [plans, me, showDoc])

  /** Open a war day on its official plan, else your draft. */
  const openDay = useCallback(async (id) => {
    setDayId(id)
    try { localStorage.setItem('wp.day', String(id)) } catch { /* private mode */ }
    const list = await fetchPlans(id)
    const official = list.find((p) => p.official)
    const own = list.find((p) => p.owner_id === me)
    await openPlan(official?.id ?? own?.id ?? 'mine', id, list)
  }, [fetchPlans, me, openPlan])

  useEffect(() => {
    let live = true
    ;(async () => {
      setBusy('Loading…')
      try {
        const [m, a, b, d] = await Promise.all([
          loadMap(), api.raw('/war/alliances'), api.raw('/war/board'), api.raw('/war/days'),
        ])
        if (!live) return
        setMap(m); setAlliances(a); setHoldings(b); setDays(d)
        if (d.length) {
          const remembered = Number(localStorage.getItem('wp.day'))
          const upcoming = [...d].reverse().find((x) => x.day >= serverToday())
          await openDay((d.find((x) => x.id === remembered) || upcoming || d[0]).id)
        }
      } catch (err) { if (live) fail(err) } finally { if (live) setBusy('') }
    })()
    return () => { live = false }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------- unsaved guard */

  useEffect(() => {
    if (!dirty || !dayId) return undefined
    const t = setTimeout(() => {
      try {
        localStorage.setItem(unsavedKey(dayId), JSON.stringify({ base: plan?.version ?? 0, doc, at: Date.now() }))
      } catch { /* full or private */ }
    }, 600)
    return () => clearTimeout(t)
  }, [dirty, doc, dayId, plan])

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const leaveOk = () => !dirty || confirm('Your draft has unsaved changes. Leave them?\n\nThey stay on this device and are offered back when you open your draft again.')

  /* -------------------------------------------------------------- editing */

  const push = (snapshot, key) => {
    const h = hist.current
    const merge = key && h.key === key && Date.now() - h.at < 1500
    if (!merge) {
      h.past.push(snapshot)
      if (h.past.length > 150) h.past.shift()
    }
    h.future = []; h.key = key || null; h.at = Date.now()
  }

  /** Change the working doc, remembering the old one for undo. Edits sharing
      a key within a moment (typing, a slider) undo as one. */
  const change = (fn, key) => {
    if (!editable) return
    const cur = docRef.current
    const next = fn(cur)
    if (next === cur) return
    push(cur, key)
    docRef.current = next
    setDoc(next)
  }

  const editScenario = (fn, key) => change((d) => ({
    ...d, scenarios: d.scenarios.map((s) => (s.id === scenario.id ? fn(s) : s)),
  }), key)

  const undo = () => {
    const h = hist.current
    if (!h.past.length) return
    h.future.push(docRef.current)
    const prev = h.past.pop()
    h.key = null
    docRef.current = prev; setDoc(prev)
  }
  const redo = () => {
    const h = hist.current
    if (!h.future.length) return
    h.past.push(docRef.current)
    const next = h.future.pop()
    docRef.current = next; setDoc(next)
  }

  /** Add a drawing and select it. Placing one is nearly always followed by
      adjusting it, so the tool goes back to Select — unless Shift was held,
      for laying down several in a row. */
  const createItem = (item, { keep = false } = {}) => {
    editScenario((s) => ({ ...s, items: [...s.items, item] }))
    setSelItem(item.id); setSelCity(null)
    if (!keep) setTool('select')
  }

  /** From the map: a drag in progress ('live') or finished ('done'). */
  const onItem = (id, next, phase) => {
    if (!editable) return
    if (!dragBase.current) dragBase.current = docRef.current
    const cur = docRef.current
    const upd = {
      ...cur,
      scenarios: cur.scenarios.map((s) => (s.id === scenario.id
        ? { ...s, items: s.items.map((i) => (i.id === id ? next : i)) } : s)),
    }
    docRef.current = upd; setDoc(upd)
    if (phase === 'done') { push(dragBase.current); dragBase.current = null }
  }

  const updateItem = (next, key) => editScenario((s) => ({
    ...s, items: s.items.map((i) => (i.id === next.id ? next : i)),
  }), key)

  const deleteItem = (id) => {
    editScenario((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }))
    setSelItem(null)
  }

  const duplicateItem = (item) => {
    const copy = { ...shifted(item, 6, -6), id: newId() }
    createItem(copy)
  }

  const setPlanned = (cityId, value) => editScenario((s) => {
    const changes = { ...s.changes }
    const boardHas = board.get(cityId) ?? null
    // Planning what the board already says is no plan at all.
    if (value === undefined || (value ?? null) === boardHas) delete changes[cityId]
    else changes[cityId] = value
    return { ...s, changes }
  })

  /* ------------------------------------------------------------ scenarios */

  const addScenario = () => {
    const s = blankScenario(nextName(doc.scenarios))
    change((d) => ({ ...d, scenarios: [...d.scenarios, s] }))
    setScenarioId(s.id); setSelItem(null)
  }
  const duplicateScenario = () => {
    const s = {
      ...scenario, id: newId(), name: `${scenario.name} copy`.slice(0, 40),
      changes: { ...scenario.changes }, items: scenario.items.map((i) => ({ ...i, id: newId() })),
    }
    change((d) => ({ ...d, scenarios: [...d.scenarios, s] }))
    setScenarioId(s.id); setSelItem(null)
  }
  const renameScenario = () => {
    const name = prompt('Scenario name', scenario.name)?.trim()
    if (!name) return
    editScenario((s) => ({ ...s, name: name.slice(0, 40) }))
  }
  const deleteScenario = () => {
    if (doc.scenarios.length < 2) return
    if (!confirm(`Delete ${scenario.name}, with its ${scenario.items.length} drawings?`)) return
    const rest = doc.scenarios.filter((s) => s.id !== scenario.id)
    change((d) => ({ ...d, scenarios: rest }))
    setScenarioId(rest[0].id); setSelItem(null)
  }

  /* ---------------------------------------------------------------- saving */

  async function saveDraft() {
    setBusy('Saving…'); setError(null)
    try {
      const r = await api.raw(`/war/days/${dayId}/mine`, {
        method: 'PUT', body: JSON.stringify({ doc, version: plan?.version ?? null }),
      })
      setPlan(r); setPlanKey(r.id)
      const n = normalize(r.doc)
      setDoc(n); docRef.current = n; setSaved(JSON.stringify(n))
      try { localStorage.removeItem(unsavedKey(dayId)) } catch { /* ignore */ }
      setRecover(null)
      setNotice('Saved to your draft.')
      await fetchPlans(dayId)
      setDays(await api.raw('/war/days'))
      return r
    } catch (err) { fail(err); return null } finally { setBusy('') }
  }

  async function publish() {
    if (!confirm(`Make ${isMine ? 'your draft' : `${plan?.owner_name}'s draft`} the official plan for ${day ? dayLabel(day.day) : 'this day'}?`)) return
    let src = plan
    // Your own draft is published as you see it, so it is saved first.
    if (isMine && (dirty || !plan)) {
      src = await saveDraft()
      if (!src) return
    }
    setBusy('Publishing…'); setError(null)
    try {
      const r = await api.raw(`/war/plans/${src.id}/publish`, { method: 'POST' })
      await fetchPlans(dayId)
      setDays(await api.raw('/war/days'))
      setPlan(r); setPlanKey(r.id); showDoc(r.doc)
      setNotice('Published. This is the official plan now.')
    } catch (err) { fail(err) } finally { setBusy('') }
  }

  /** Take whatever is open — the official plan, someone else's draft — as the
      start of your own. Nothing is saved until you save. */
  async function copyToMine() {
    const copyOf = normalize(docRef.current)
    if (mine && !confirm('Replace what is in your draft with this plan?\n\nNothing changes until you save.')) return
    setBusy('Opening…')
    try {
      if (mine) {
        const p = await api.raw(`/war/plans/${mine.id}`)
        setPlan(p); setPlanKey(p.id)
        showDoc(copyOf, p.doc)
      } else {
        setPlan(null); setPlanKey('mine')
        showDoc(copyOf, blankDoc())
      }
      setRecover(null)
      setNotice('Copied into your draft. Save to keep it.')
    } catch (err) { fail(err) } finally { setBusy('') }
  }

  async function deletePlan() {
    const official = plan?.official
    if (!confirm(official
      ? 'Withdraw the official plan? The draft it came from is kept.'
      : 'Delete your draft for this day?')) return
    setBusy('Deleting…')
    try {
      await api.raw(`/war/plans/${plan.id}`, { method: 'DELETE' })
      if (!official) try { localStorage.removeItem(unsavedKey(dayId)) } catch { /* ignore */ }
      setDays(await api.raw('/war/days'))
      await openDay(dayId)
      setNotice(official ? 'The official plan is withdrawn.' : 'Your draft is deleted.')
    } catch (err) { fail(err) } finally { setBusy('') }
  }

  /* --------------------------------------------------------------- days */

  async function createDay() {
    if (!newDay) return
    setBusy('Creating…'); setError(null)
    try {
      const d = await api.raw('/war/days', { method: 'POST', body: JSON.stringify({ day: newDay }) })
      setDays(await api.raw('/war/days'))
      setNewDay(null)
      await openDay(d.id)
    } catch (err) { fail(err) } finally { setBusy('') }
  }

  async function deleteDay() {
    if (!day) return
    if (!confirm(`Delete ${dayLabel(day.day)} and all ${day.plans} plans drawn for it?`)) return
    setBusy('Deleting…')
    try {
      await api.raw(`/war/days/${day.id}`, { method: 'DELETE' })
      const list = await api.raw('/war/days')
      setDays(list)
      if (list.length) await openDay(list[0].id)
      else { setDayId(null); setPlans([]); setPlan(null); setPlanKey(null); showDoc(blankDoc()) }
    } catch (err) { fail(err) } finally { setBusy('') }
  }

  /* -------------------------------------------------------------- board */

  async function changeBoard(changes, message) {
    setBusy('Updating the board…'); setError(null)
    try {
      setHoldings(await api.raw('/war/board', { method: 'PUT', body: JSON.stringify({ changes }) }))
      if (message) setNotice(message)
      return true
    } catch (err) { fail(err); return false } finally { setBusy('') }
  }

  const applyScenario = async () => {
    const list = Object.entries(scenario.changes)
      .map(([id, to]) => ({ city_id: Number(id), alliance_id: to ?? null }))
      .filter((c) => (board.get(c.city_id) ?? null) !== c.alliance_id)
    if (!list.length) return
    if (!confirm(`Record ${list.length} territory changes from ${scenario.name} on the board?\n\nDo this after the war, with what actually happened. The board is shared with every plan.`)) return
    await changeBoard(list, `The board now shows ${scenario.name}'s outcome.`)
  }

  /* ----------------------------------------------------------- alliances */

  const allianceCall = async (fn, message) => {
    setBusy('Saving…'); setError(null)
    try {
      await fn()
      const [a, b] = await Promise.all([api.raw('/war/alliances'), api.raw('/war/board')])
      setAlliances(a); setHoldings(b)
      if (message) setNotice(message)
      return true
    } catch (err) { fail(err); return false } finally { setBusy('') }
  }
  const allianceBody = (f) => JSON.stringify({
    name: f.name, tag: f.tag || null, camp: Number(f.camp), color: f.color, server: f.server || null, notes: f.notes || null,
  })

  /* ------------------------------------------------------------ keyboard */

  useEffect(() => {
    const onKey = (e) => {
      if (typing(document.activeElement)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selItem && editable) { e.preventDefault(); deleteItem(selItem); return }
      if (e.key === 'Escape') { setSelItem(null); setSelCity(null); setTool('select') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* --------------------------------------------------------------- view */

  const planLabel = (p) => (p.official
    ? `★ Official plan${p.source_name ? ` — from ${p.source_name}'s draft` : ''}`
    : p.owner_id === me ? 'My draft' : `Draft — ${p.owner_name || 'another admin'}`)

  const found = useMemo(() => (map && query ? search(map, query) : null), [map, query])

  const goTo = (c) => {
    mapRef.current?.jumpTo(c.x - (c.size - 1) / 2, c.y - (c.size - 1) / 2)
    setSelCity(c.id); setSelItem(null); setQuery('')
  }

  async function downloadPng() {
    try {
      const caption = [day && dayLabel(day.day), plan ? planLabel(plan) : 'My draft', scenario.name].filter(Boolean).join(' · ')
      const blob = await mapRef.current.toPng(caption)
      saveFile(blob, `war_plan_${day?.day || 'draft'}_${scenario.name.replace(/\W+/g, '_')}.png`)
    } catch (err) { fail(err) }
  }

  const selectedItem = selItem ? scenario.items.find((i) => i.id === selItem) : null
  const selectedCity = selCity && map ? map.byId.get(selCity) : null
  const effectiveTool = editable ? tool : 'select'
  const toolOpts = { color: ink.color, alliance: ink.alliance, symbol, stamp }

  if (!map) {
    return (
      <div className="page">
        <div className="page-head"><h2>War planner</h2></div>
        <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
        {!error && <p className="muted">{busy || 'Loading the map…'}</p>}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h2>War planner</h2>
        <span className="muted small">{`Season ${map.season} · map from build ${map.build}`}</span>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNotice(null)}>{notice}</Banner>
      {recover && editable && (
        <div className="banner note" role="status">
          <div className="banner-body">
            {`This device has unsaved changes to your draft from ${new Date(recover.at).toLocaleString()}.`}
          </div>
          <button className="btn small" onClick={() => {
            change(() => normalize(recover.doc)); setScenarioId(normalize(recover.doc).scenarios[0].id); setRecover(null)
          }}>Restore</button>
          <button className="btn small" onClick={() => {
            try { localStorage.removeItem(unsavedKey(dayId)) } catch { /* ignore */ }
            setRecover(null)
          }}>Discard</button>
        </div>
      )}

      {/* ---------------------------------------------------- which plan */}
      <div className="card wp-planbar">
        <div className="wp-planbar-row">
          <label className="wp-daypick">
            War day
            <select value={newDay != null ? '__new' : dayId ?? ''} disabled={Boolean(busy)}
                    onChange={(e) => {
                      if (e.target.value === '__new') { setNewDay(nextSaturday()); return }
                      if (!leaveOk()) return
                      setNewDay(null); openDay(Number(e.target.value)).catch(fail)
                    }}>
              {!days.length && <option value="">No war days yet</option>}
              {days.map((d) => (
                <option key={d.id} value={d.id}>
                  {`${dayLabel(d.day)}${d.title ? ` — ${d.title}` : ''}${d.official ? ' ★' : ''}`}
                </option>
              ))}
              <option value="__new">+ New war day…</option>
            </select>
          </label>

          {newDay != null ? (
            <div className="wp-newday">
              <label>
                Date (server time)
                <input type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)} />
              </label>
              <button className="btn primary small" onClick={createDay} disabled={!newDay || Boolean(busy)}>Create</button>
              <button className="btn small" onClick={() => setNewDay(null)}>Cancel</button>
            </div>
          ) : day && (
            <label className="wp-planpick">
              Plan
              <select value={planKey ?? ''} disabled={Boolean(busy)}
                      onChange={(e) => {
                        if (!leaveOk()) return
                        const v = e.target.value
                        openPlan(v === 'mine' ? 'mine' : Number(v), dayId).catch(fail)
                      }}>
                {plans.map((p) => <option key={p.id} value={p.id}>{planLabel(p)}</option>)}
                {!mine && <option value="mine">My draft (new)</option>}
              </select>
            </label>
          )}
        </div>

        {day && newDay == null && (
          <>
            <div className="wp-planbar-row wp-status">
              {plan?.official && <span className="tag">Official</span>}
              {editable ? <span className="pill">your draft</span> : <span className="pill">read only</span>}
              {dirty && <span className="pill wp-unsaved">unsaved</span>}
              <span className="muted small">
                {plan?.updated_at
                  ? `Last saved by ${plan.updated_by_name || 'someone'}, ${new Date(plan.updated_at).toLocaleString()}`
                  : 'Not saved yet.'}
              </span>
            </div>
            <div className="card-actions">
              {editable ? (
                <>
                  <button className="btn primary" onClick={saveDraft} disabled={Boolean(busy) || (!dirty && Boolean(plan))}>
                    {busy === 'Saving…' ? 'Saving…' : 'Save to my draft'}
                  </button>
                  <button className="btn small" onClick={undo} disabled={!hist.current.past.length} title="Undo (Ctrl+Z)">Undo</button>
                  <button className="btn small" onClick={redo} disabled={!hist.current.future.length} title="Redo (Ctrl+Shift+Z)">Redo</button>
                </>
              ) : (
                <button className="btn" onClick={copyToMine} disabled={Boolean(busy)}>Copy into my draft</button>
              )}
              {canPublish && (
                <button className="btn" onClick={publish} disabled={Boolean(busy)}>Publish as official</button>
              )}
              <button className="btn" onClick={downloadPng}>Download PNG</button>
              {plan && (plan.official || editable) && (
                <button className="btn danger small" onClick={deletePlan} disabled={Boolean(busy)}>
                  {plan.official ? 'Withdraw official' : 'Delete draft'}
                </button>
              )}
              <button className="btn ghost small" onClick={deleteDay} disabled={Boolean(busy)}>Delete war day</button>
            </div>
          </>
        )}
        {!days.length && newDay == null && (
          <p className="card-body">
            Start with a war day — pick <b>+ New war day…</b> above. The board, influence and alliances below work without one.
          </p>
        )}
      </div>

      <div className="wp-layout">
        {/* ---------------------------------------------------------- map */}
        <div className="wp-map-col">
          <div className="card wp-map-card">
            <div className="wp-scen" role="tablist" aria-label="Scenarios">
              {doc.scenarios.map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === scenario.id}
                        className={s.id === scenario.id ? 'chip on' : 'chip'}
                        onClick={() => { setScenarioId(s.id); setSelItem(null) }}
                        onDoubleClick={() => editable && s.id === scenario.id && renameScenario()}>
                  {s.name}
                  {Object.keys(s.changes).length > 0 && <span className="wp-dot" aria-label="plans captures" />}
                </button>
              ))}
              {editable && doc.scenarios.length < 12 && (
                <button type="button" className="chip" onClick={addScenario}>+ Scenario</button>
              )}
              {editable && (
                <span className="wp-scen-acts">
                  <button type="button" className="btn ghost small" onClick={renameScenario}>Rename</button>
                  <button type="button" className="btn ghost small" onClick={duplicateScenario}
                          disabled={doc.scenarios.length >= 12}>Duplicate</button>
                  <button type="button" className="btn ghost small" onClick={deleteScenario}
                          disabled={doc.scenarios.length < 2}>Delete</button>
                </span>
              )}
            </div>

            <Toolbar tool={effectiveTool} setTool={setTool} editable={editable} ink={ink} setInk={setInk}
                     alliances={alliances} symbol={symbol} setSymbol={setSymbol} stamp={stamp} setStamp={setStamp} />

            <WarMap ref={mapRef} map={map} board={board} holders={holders} alliances={alliances}
                    items={scenario.items} tool={effectiveTool} toolOpts={toolOpts} editable={editable}
                    selectedItem={selItem} selectedCity={selCity}
                    onSelectItem={(id) => { setSelItem(id); if (id) setSelCity(null) }}
                    onSelectCity={(id) => { setSelCity(id); if (id) setSelItem(null) }}
                    onCreate={createItem} onItem={onItem} />

            <div className="wp-find">
              <input type="search" value={query} placeholder="Find: Strife, Lv.6, or 876 502"
                     onChange={(e) => setQuery(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key !== 'Enter' || !found) return
                       if (found.cities[0]) goTo(found.cities[0])
                       else if (found.point) { mapRef.current?.jumpTo(found.point.x, found.point.y); setQuery('') }
                     }} />
              {found && (found.cities.length > 0 || found.point) && (
                <div className="wp-found">
                  {found.point && (
                    <button type="button" onClick={() => { mapRef.current?.jumpTo(found.point.x, found.point.y); setQuery('') }}>
                      {`Go to X:${found.point.x} Y:${found.point.y}`}
                    </button>
                  )}
                  {found.cities.map((c) => (
                    <button key={c.id} type="button" onClick={() => goTo(c)}>
                      {`Lv.${c.level} ${c.name}`}<span className="muted">{` X:${c.x} Y:${c.y}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="wp-legend muted small">
              <span><i className="wp-key city" />Pyramid</span>
              <span><i className="wp-key pass" />Pass</span>
              <span><i className="wp-key stronghold" />Stronghold</span>
              <span><i className="wp-key oasis" />Oasis</span>
              <span><i className="wp-key planned" />Striped: planned change</span>
              {alliances.map((a) => <span key={a.id}><Swatch color={a.color} size={10} />{a.tag || a.name}</span>)}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------- panels */}
        <div className="wp-side-col">
          {selectedItem && (
            <ItemPanel item={selectedItem} alliances={alliances} editable={editable}
                       onChange={updateItem} onDelete={() => deleteItem(selectedItem.id)}
                       onDuplicate={() => duplicateItem(selectedItem)} onClose={() => setSelItem(null)} />
          )}
          {selectedCity && (
            <CityPanel map={map} city={selectedCity} board={board} holders={holders} alliances={alliances}
                       scenario={scenario} editable={editable} busy={busy}
                       onBoard={(id, to) => {
                         const c = map.byId.get(id)
                         changeBoard([{ city_id: id, alliance_id: to }],
                           `${c.name} (${c.x}, ${c.y}) is ${to == null ? 'neutral' : `held by ${alliances.find((a) => a.id === to)?.name}`} on the board.`)
                       }}
                       onPlan={setPlanned} onGo={goTo} onClose={() => setSelCity(null)} />
          )}
          <StandingsCard map={map} now={now} planned={planned} scenario={scenario} changed={changed}
                         onApply={applyScenario} busy={busy} />
          <AlliancesCard map={map} alliances={alliances} now={now} busy={busy}
                         onCreate={(f) => allianceCall(
                           () => api.raw('/war/alliances', { method: 'POST', body: allianceBody(f) }),
                           `Added ${f.name}.`)}
                         onUpdate={(id, f) => allianceCall(
                           () => api.raw(`/war/alliances/${id}`, { method: 'PATCH', body: allianceBody(f) }),
                           `Saved ${f.name}.`)}
                         onDelete={(id) => allianceCall(
                           () => api.raw(`/war/alliances/${id}`, { method: 'DELETE' }), 'Removed.')} />
          <p className="muted small wp-foot">
            {`Camps: 1 is ${campName(map, 1)}, 2 is ${campName(map, 2)}. `}
            Coordinates are the game's; the map is drawn the way the minimap shows it.
          </p>
        </div>
      </div>
    </div>
  )
}
