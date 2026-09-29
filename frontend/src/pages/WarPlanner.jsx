import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, getToken, liveUrl } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import { save as saveFile } from '../lib/files.js'
import { SERVER_TZ } from '../lib/servertime.js'
import WarMap from '../warplan/WarMap.jsx'
import PostPanel from '../warplan/PostPanel.jsx'
import { loadMap, search } from '../warplan/mapdata.js'
import { holdersWith, standings } from '../warplan/standing.js'
import { newId, shifted } from '../warplan/items.jsx'
import { OpError, applyOp, inverseOf, replay } from '../warplan/ops.js'
import { Live } from '../warplan/live.js'
import {
  AlliancesCard, CityPanel, ItemPanel, Legend, StandingsCard, Toolbar, campName,
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
 * Plans are edited live when the connection is up: every edit is an operation
 * (ops.js) sent to the plan's room, which orders them and hands each to
 * everyone on the plan, and saves a moment later. The page keeps the room's
 * confirmed doc and its own edits still on their way, and shows the second
 * replayed over the first. Without a connection it falls back to editing
 * locally and saving with the button, as it always did.
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
const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private or full */ } }
const forget = (key) => { try { localStorage.removeItem(key) } catch { /* ignore */ } }

const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
/** Once the map has drawn what was just set. Animation frames stop in a
    background tab, so a timer finishes the wait if they never come. */
const nextFrame = () => new Promise((resolve) => {
  let done = false
  const finish = () => { if (!done) { done = true; setTimeout(resolve, 30) } }
  requestAnimationFrame(() => requestAnimationFrame(finish))
  setTimeout(finish, 250)
})

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
  const [hide, setHide] = useState(() => readJson('wp.hide') || {})
  const [extend, setExtend] = useState(null)
  const [posting, setPosting] = useState(false)

  const [liveStatus, setLiveStatus] = useState('connecting')
  const [room, setRoom] = useState(null)           // { plan, editable, seq, saved } once the room has answered
  const [peers, setPeers] = useState([])           // on this plan
  const [people, setPeople] = useState([])         // on this war day, any plan

  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState('')

  const mapRef = useRef(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const hist = useRef({ past: [], future: [], key: null, at: 0 })
  const drag = useRef(null)
  const liveRef = useRef(null)
  const confirmed = useRef(null)                   // the room's doc, every operation it has sent applied
  const pending = useRef([])                       // [{ cid, op }] sent, not yet back
  const dragOp = useRef(null)                      // where a drag is now, not yet sent
  const planIdRef = useRef(null)
  const youRef = useRef(null)
  const cursor = useRef({ t: 0, timer: null, at: null })

  /* -------------------------------------------------------------- derived */

  const board = useMemo(() => new Map(holdings.map((h) => [h.city_id, h.alliance_id])), [holdings])
  const scenario = doc.scenarios.find((s) => s.id === scenarioId) || doc.scenarios[0]
  const holders = useMemo(() => holdersWith(board, scenario.changes), [board, scenario.changes])
  const planId = plan?.id ?? null
  const isMine = planKey === 'mine' || (plan && plan.owner_id === me)
  const liveOn = liveStatus === 'live' && planId != null && room?.plan === planId
  const editable = liveOn ? Boolean(room.editable) : Boolean(isMine) && !plan?.official
  const offlineDirty = !liveOn && editable && JSON.stringify(doc) !== saved
  const unsent = liveOn && (pending.current.length > 0 || room.seq > room.saved)
  const day = days.find((d) => d.id === dayId) || null
  const mine = plans.find((p) => p.owner_id === me) || null
  // Any admin may publish any saved draft; your own, saved or not.
  const canPublish = !plan?.official && (isMine || Boolean(plan))
  const changed = Object.keys(scenario.changes).some((id) => (scenario.changes[id] ?? null) !== (board.get(Number(id)) ?? null))

  const now = useMemo(() => (map ? standings(map, board, alliances) : []), [map, board, alliances])
  const planned = useMemo(() => (map ? standings(map, holders, alliances) : []), [map, holders, alliances])

  const fail = useCallback((err) => setError(err?.message || (err ? String(err) : null)), [])

  const scenarioRef = useRef(scenario.id)
  scenarioRef.current = scenario.id
  const selRef = useRef(selItem)
  selRef.current = selItem

  /* ------------------------------------------------------ the working doc */

  const setView = (next) => { docRef.current = next; setDoc(next) }

  /** The room's doc with this page's own edits on top: what to show. */
  const recompute = () => {
    if (!confirmed.current) return
    const ops = pending.current.map((p) => p.op)
    if (dragOp.current) ops.push(dragOp.current)
    setView(replay(confirmed.current, ops))
  }

  const send = (op) => {
    const cid = newId()
    pending.current.push({ cid, op })
    liveRef.current?.send({ type: 'op', cid, op })
  }

  const resetHistory = () => { hist.current = { past: [], future: [], key: null, at: 0 }; drag.current = null; dragOp.current = null }

  /** Edits sharing a key within a moment (typing, a slider) undo as one. */
  const remember = (entry, key) => {
    const h = hist.current
    const last = h.past[h.past.length - 1]
    if (key && last && h.key === key && Date.now() - h.at < 1500) {
      last.ops = [...last.ops, ...entry.ops]
      last.inv = [...entry.inv, ...last.inv]
    } else {
      h.past.push(entry)
      if (h.past.length > 150) h.past.shift()
    }
    h.future = []
    h.key = key || null
    h.at = Date.now()
  }

  /** Apply operations here, and send them to the room when live. */
  const commit = (ops, { key = null, record = true } = {}) => {
    if (!editable || !ops.length) return false
    let cur = docRef.current
    const inv = []
    try {
      for (const op of ops) {
        const back = inverseOf(cur, op)
        cur = applyOp(cur, op)
        if (back) inv.unshift(back)
      }
    } catch (err) {
      if (err instanceof OpError) { fail(err); return false }
      throw err
    }
    if (record) remember({ ops, inv }, key)
    setView(cur)
    if (liveOn) ops.forEach(send)
    return true
  }

  const undo = () => {
    const h = hist.current
    const entry = h.past.pop()
    if (!entry) return
    h.key = null
    if (commit(entry.inv, { record: false })) h.future.push(entry)
  }
  const redo = () => {
    const h = hist.current
    const entry = h.future.pop()
    if (!entry) return
    if (commit(entry.ops, { record: false })) h.past.push(entry)
  }

  const showDoc = useCallback((d, baseline) => {
    const n = normalize(d)
    setView(n)
    setSaved(JSON.stringify(baseline === undefined ? n : normalize(baseline)))
    setScenarioId(n.scenarios[0].id)
    setSelItem(null); setSelCity(null)
    resetHistory()
  }, [])

  /* ------------------------------------------------------------- the room */

  const onMessage = (m) => {
    switch (m.type) {
      case 'welcome':
        youRef.current = m.you
        break
      case 'state': {
        if (m.plan !== planIdRef.current) return
        const wasDirty = offlineDirty
        confirmed.current = m.doc
        setRoom({ plan: m.plan, editable: m.editable, seq: m.seq, saved: m.seq })
        setPeers(m.peers || [])
        if (pending.current.length) {
          // Back after a drop: what never arrived goes again.
          pending.current.forEach((p) => liveRef.current?.send({ type: 'op', cid: p.cid, op: p.op }))
        } else if (wasDirty && m.editable && m.version === plan?.version) {
          // Edits made before the connection came up go as one replacement.
          send({ t: 'doc', doc: docRef.current })
        }
        setSaved(JSON.stringify(m.doc))
        recompute()
        break
      }
      case 'op': {
        if (m.plan !== planIdRef.current || !confirmed.current) return
        const k = pending.current.findIndex((p) => p.cid === m.cid)
        if (k >= 0) pending.current.splice(k, 1)
        try {
          confirmed.current = applyOp(confirmed.current, m.op)
        } catch {
          // Out of step with the room: ask for its doc again.
          liveRef.current?.join(m.plan)
          return
        }
        setRoom((r) => (r ? { ...r, seq: m.seq } : r))
        recompute()
        break
      }
      case 'reject': {
        const k = pending.current.findIndex((p) => p.cid === m.cid)
        if (k >= 0) pending.current.splice(k, 1)
        recompute()
        setError(`That change was not saved: ${m.reason}`)
        break
      }
      case 'saved':
        if (m.plan !== planIdRef.current) return
        setRoom((r) => (r ? { ...r, saved: Math.max(r.saved, m.seq) } : r))
        setPlan((p) => (p && p.id === m.plan ? { ...p, version: m.version, updated_at: new Date().toISOString() } : p))
        break
      case 'reset':
        if (m.plan !== planIdRef.current) return
        confirmed.current = m.doc
        pending.current = []
        resetHistory()
        setRoom((r) => (r ? { ...r, editable: m.editable, seq: m.seq, saved: m.seq } : r))
        setPlan((p) => (p ? { ...p, version: m.version } : p))
        setSaved(JSON.stringify(m.doc))
        recompute()
        if (m.reason) setNotice(m.reason)
        break
      case 'editable':
        if (m.plan !== planIdRef.current) return
        setRoom((r) => (r ? { ...r, editable: m.editable } : r))
        setPlan((p) => (p ? { ...p, shared: m.shared } : p))
        if (!m.editable) setTool('select')
        break
      case 'joined':
        if (m.plan === planIdRef.current) setPeers((ps) => [...ps.filter((p) => p.sid !== m.peer.sid), m.peer])
        break
      case 'left':
        setPeers((ps) => ps.filter((p) => p.sid !== m.sid))
        break
      case 'cursor':
        if (m.plan !== planIdRef.current) return
        setPeers((ps) => (ps.some((p) => p.sid === m.sid)
          ? ps.map((p) => (p.sid === m.sid ? { ...p, ...m } : p)) : [...ps, m]))
        break
      case 'here':
        setPeople(m.people || [])
        break
      case 'gone':
        if (m.plan === planIdRef.current && dayId) {
          setNotice('That plan was deleted.')
          openDay(dayId).catch(fail)
        }
        break
      default:
    }
  }
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    const url = liveUrl('/war/live')
    const token = getToken()
    if (!url || !token) { setLiveStatus('offline'); return undefined }
    const live = new Live({
      url, token,
      onMessage: (m) => onMessageRef.current(m),
      onStatus: (s) => setLiveStatus(s),
    })
    liveRef.current = live
    return () => { live.close(); liveRef.current = null }
  }, [])

  // One room at a time: the plan on screen.
  useEffect(() => {
    planIdRef.current = planId
    pending.current = []
    confirmed.current = null
    setRoom(null)
    setPeers([])
    liveRef.current?.join(planId)
  }, [planId])

  /** Tell the room where this admin is pointing, at most twenty times a second. */
  const sendCursor = useCallback((x, y) => {
    const c = cursor.current
    if (x !== undefined) c.at = x == null ? null : [x, y]
    const go = () => {
      c.t = performance.now(); c.timer = null
      liveRef.current?.send({
        type: 'cursor', x: c.at?.[0] ?? null, y: c.at?.[1] ?? null,
        scenario: scenarioRef.current, sel: selRef.current,
      })
    }
    if (performance.now() - c.t > 50) go()
    else if (!c.timer) c.timer = setTimeout(go, 50)
  }, [])

  useEffect(() => { if (liveOn) sendCursor() }, [liveOn, scenario.id, selItem, sendCursor])

  /* -------------------------------------------------------------- loading */

  const fetchPlans = useCallback(async (id) => {
    const list = await api.raw(`/war/days/${id}/plans`)
    setPlans(list)
    return list
  }, [])

  /** Open a plan: an id, or 'mine' for a draft not saved yet. Unsaved work on
      this device, made over the same version, is offered back. */
  const openPlan = useCallback(async (key, id, list) => {
    const own = (list || plans).find((p) => p.owner_id === me)
    setRecover(null)
    setPosting(false)
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
    }
    setTool('select')
    if (key === 'mine' || key === own?.id) {
      const stash = readJson(unsavedKey(id))
      if (stash?.doc && stash.base === version) setRecover(stash)
    }
  }, [plans, me, showDoc])

  /** Open a war day on its official plan, else your draft. */
  const openDay = useCallback(async (id) => {
    setDayId(id)
    writeJson('wp.day', id)
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
          const remembered = Number(readJson('wp.day'))
          const upcoming = [...d].reverse().find((x) => x.day >= serverToday())
          await openDay((d.find((x) => x.id === remembered) || upcoming || d[0]).id)
        }
      } catch (err) { if (live) fail(err) } finally { if (live) setBusy('') }
    })()
    return () => { live = false }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { writeJson('wp.hide', hide) }, [hide])

  /* ------------------------------------------------------- unsaved guard */

  useEffect(() => {
    if (!offlineDirty || !dayId) return undefined
    const t = setTimeout(() => writeJson(unsavedKey(dayId), { base: plan?.version ?? 0, doc, at: Date.now() }), 600)
    return () => clearTimeout(t)
  }, [offlineDirty, doc, dayId, plan])

  useEffect(() => {
    if (!offlineDirty && !unsent) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [offlineDirty, unsent])

  const leaveOk = () => !offlineDirty || confirm('Your draft has unsaved changes. Leave them?\n\nThey stay on this device and are offered back when you open your draft again.')

  /* ------------------------------------------------------------ drawings */

  const S = scenario.id

  const createItem = (item, { keep = false } = {}) => {
    if (!commit([{ t: 'item', s: S, item }])) return
    setSelItem(item.id); setSelCity(null)
    // Placing one is nearly always followed by adjusting it, so the tool goes
    // back to Select — unless Shift was held, for laying down several.
    if (!keep) setTool('select')
  }

  /** From the map: a drag in progress ('live') or finished ('done'). */
  const onItem = (id, next, phase) => {
    if (!editable) return
    const op = { t: 'item', s: S, item: next }
    if (!drag.current) drag.current = { before: scenario.items.find((i) => i.id === id), sentAt: 0 }
    const d = drag.current
    if (phase === 'live') {
      dragOp.current = op
      setView(applyOp(docRef.current, op))
      // Others see a drag as it happens, a few frames at a time.
      if (liveOn && performance.now() - d.sentAt > 80) { d.sentAt = performance.now(); send(op); dragOp.current = null }
      return
    }
    dragOp.current = null
    drag.current = null
    if (d.before) remember({ ops: [op], inv: [{ t: 'item', s: S, item: d.before }] })
    setView(applyOp(docRef.current, op))
    if (liveOn) send(op)
  }

  const updateItem = (next, key) => commit([{ t: 'item', s: S, item: next }], { key })

  const deleteItem = (id) => {
    commit([{ t: 'unitem', s: S, id }])
    setSelItem(null)
  }

  const duplicateItem = (item) => createItem({ ...shifted(item, 6, -6), id: newId() })

  const setPlanned = (cityId, value) => {
    const has = String(cityId) in scenario.changes
    const boardHas = board.get(cityId) ?? null
    // Planning what the board already says is no plan at all.
    if (value === undefined || (value ?? null) === boardHas) {
      if (has) commit([{ t: 'change', s: S, city: cityId, clear: true }])
    } else {
      commit([{ t: 'change', s: S, city: cityId, v: value }])
    }
  }

  /* ------------------------------------------------------------ scenarios */

  const addScenario = () => {
    const s = blankScenario(nextName(doc.scenarios))
    if (commit([{ t: 'scen', scenario: s }])) { setScenarioId(s.id); setSelItem(null) }
  }
  const duplicateScenario = () => {
    const s = {
      ...scenario, id: newId(), name: `${scenario.name} copy`.slice(0, 40),
      changes: { ...scenario.changes }, items: scenario.items.map((i) => ({ ...i, id: newId() })),
    }
    const at = doc.scenarios.findIndex((x) => x.id === scenario.id) + 1
    if (commit([{ t: 'scen', scenario: s, at }])) { setScenarioId(s.id); setSelItem(null) }
  }
  const renameScenario = () => {
    const name = prompt('Scenario name', scenario.name)?.trim()
    if (!name) return
    commit([{ t: 'scen', scenario: { id: scenario.id, name: name.slice(0, 40) } }])
  }
  const deleteScenario = () => {
    if (doc.scenarios.length < 2) return
    if (!confirm(`Delete ${scenario.name}, with its ${scenario.items.length} drawings?`)) return
    const rest = doc.scenarios.filter((s) => s.id !== scenario.id)
    if (commit([{ t: 'unscen', s: scenario.id }])) { setScenarioId(rest[0].id); setSelItem(null) }
  }

  /* ---------------------------------------------------------------- saving */

  /** The button, for when there is no live connection or no draft yet. */
  async function saveDraft() {
    setBusy('Saving…'); setError(null)
    try {
      const r = await api.raw(`/war/days/${dayId}/mine`, {
        method: 'PUT', body: JSON.stringify({ doc, version: plan?.version ?? null }),
      })
      setPlan(r); setPlanKey(r.id)
      const n = normalize(r.doc)
      setView(n); setSaved(JSON.stringify(n))
      forget(unsavedKey(dayId))
      setRecover(null)
      setNotice(plan ? 'Saved to your draft.' : 'Your draft is saved. From here on it saves as you draw.')
      await fetchPlans(dayId)
      setDays(await api.raw('/war/days'))
      return r
    } catch (err) { fail(err); return null } finally { setBusy('') }
  }

  async function publish() {
    if (!confirm(`Make ${isMine ? 'your draft' : `${plan?.owner_name}'s draft`} the official plan for ${day ? dayLabel(day.day) : 'this day'}?`)) return
    let src = plan
    // Your own draft is published as you see it, so offline edits are saved first.
    if (isMine && !liveOn && (offlineDirty || !plan)) {
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

  /** Take whatever is open — the official plan, someone else's draft — as
      your own draft. It replaces what your draft held, so it asks first. */
  async function copyToMine() {
    const copyOf = normalize(docRef.current)
    if (mine && !confirm('Replace what is in your draft with this plan?')) return
    setBusy('Copying…'); setError(null)
    try {
      const cur = mine ? await api.raw(`/war/plans/${mine.id}`) : null
      const r = await api.raw(`/war/days/${dayId}/mine`, {
        method: 'PUT', body: JSON.stringify({ doc: copyOf, version: cur?.version ?? null }),
      })
      const list = await fetchPlans(dayId)
      await openPlan(r.id, dayId, list)
      setNotice('Copied into your draft.')
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
      if (!official) forget(unsavedKey(dayId))
      setDays(await api.raw('/war/days'))
      await openDay(dayId)
      setNotice(official ? 'The official plan is withdrawn.' : 'Your draft is deleted.')
    } catch (err) { fail(err) } finally { setBusy('') }
  }

  async function toggleShare() {
    setBusy('Saving…'); setError(null)
    try {
      const r = await api.raw(`/war/plans/${plan.id}/share`, {
        method: 'PATCH', body: JSON.stringify({ shared: !plan.shared }),
      })
      setPlan((p) => ({ ...p, shared: r.shared }))
      setNotice(r.shared ? 'Every admin can now edit this draft with you, live.' : 'Only you can edit this draft again.')
      await fetchPlans(dayId)
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

  const hereOn = (id) => new Set(people.filter((p) => p.plan === id && p.id !== me).map((p) => p.name)).size
  const planLabel = (p) => {
    const base = p.official
      ? `★ Official plan${p.source_name ? ` — from ${p.source_name}'s draft` : ''}`
      : p.owner_id === me ? 'My draft' : `Draft — ${p.owner_name || 'another admin'}${p.shared ? ' (shared)' : ''}`
    const n = hereOn(p.id)
    return n ? `${base} · ${n} here` : base
  }

  const found = useMemo(() => (map && query ? search(map, query) : null), [map, query])

  const goTo = (c) => {
    mapRef.current?.jumpTo(c.x - (c.size - 1) / 2, c.y - (c.size - 1) / 2)
    setSelCity(c.id); setSelItem(null); setQuery('')
  }

  const caption = (name) => [day && dayLabel(day.day), plan ? planLabel({ ...plan, id: -1 }) : 'My draft', name]
    .filter(Boolean).join(' · ')

  async function downloadPng() {
    try {
      const blob = await mapRef.current.toPng(caption(scenario.name))
      saveFile(blob, `war_plan_${day?.day || 'draft'}_${scenario.name.replace(/\W+/g, '_')}.png`)
    } catch (err) { fail(err) }
  }

  /** One scenario's map as the view stands, for the Discord post. */
  const renderScenario = async (sid) => {
    const back = scenarioRef.current
    setScenarioId(sid); setSelItem(null); setSelCity(null)
    await nextFrame()
    const s = docRef.current.scenarios.find((x) => x.id === sid)
    const blob = await mapRef.current.toPng(caption(s?.name))
    setScenarioId(back)
    return blob
  }

  const selectedItem = selItem ? scenario.items.find((i) => i.id === selItem) : null
  const selectedCity = selCity && map ? map.byId.get(selCity) : null
  const effectiveTool = editable ? tool : 'select'
  const toolOpts = { color: ink.color, alliance: ink.alliance, symbol, stamp }
  const onScenarioPeers = peers.filter((p) => p.scenario === scenario.id)
  const others = people.filter((p) => p.sid !== youRef.current)

  const pickTool = (t) => {
    setTool(t)
    // A drawing tool with drawings hidden would draw into nothing visible.
    if (t !== 'select' && hide.drawings) setHide((h) => ({ ...h, drawings: false }))
  }

  if (!map) {
    return (
      <div className="page">
        <div className="page-head"><h2>War planner</h2></div>
        <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
        {!error && <p className="muted">{busy || 'Loading the map…'}</p>}
      </div>
    )
  }

  const status = liveOn
    ? (unsent ? 'Saving…' : 'Saved')
    : liveStatus === 'connecting' ? 'Connecting…' : null

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
            const n = normalize(recover.doc)
            if (commit([{ t: 'doc', doc: n }])) setScenarioId(n.scenarios[0].id)
            setRecover(null)
          }}>Restore</button>
          <button className="btn small" onClick={() => { forget(unsavedKey(dayId)); setRecover(null) }}>Discard</button>
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
              {isMine ? <span className="pill">your draft</span>
                : editable ? <span className="pill wp-shared">{`shared by ${plan?.owner_name}`}</span>
                  : <span className="pill">read only</span>}
              {plan?.shared && isMine && <span className="pill wp-shared">shared</span>}
              <span className={`wp-live ${liveOn ? 'on' : liveStatus}`}
                    title={liveOn ? 'Edits reach everyone on this plan as they are made' : 'Not connected live'}>
                <i />{liveOn ? 'Live' : liveStatus === 'connecting' ? 'Connecting' : 'Offline'}
              </span>
              {status && <span className="muted small">{status}</span>}
              {offlineDirty && <span className="pill wp-unsaved">unsaved</span>}
              {others.length > 0 && (
                <span className="wp-people" aria-label="Also on this war day">
                  {others.map((p) => (
                    <span key={p.sid} className="wp-person" title={p.plan === planId ? `${p.name} is on this plan` : `${p.name} is on another plan`}>
                      <i style={{ background: p.color }} />{p.name}{p.plan !== planId && <span className="muted"> · elsewhere</span>}
                    </span>
                  ))}
                </span>
              )}
              {!liveOn && (
                <span className="muted small">
                  {plan?.updated_at
                    ? `Last saved by ${plan.updated_by_name || 'someone'}, ${new Date(plan.updated_at).toLocaleString()}`
                    : 'Not saved yet.'}
                </span>
              )}
            </div>
            <div className="card-actions">
              {isMine && (!liveOn || !plan) && (
                <button className="btn primary" onClick={saveDraft} disabled={Boolean(busy) || (!offlineDirty && Boolean(plan))}>
                  {busy === 'Saving…' ? 'Saving…' : plan ? 'Save to my draft' : 'Create my draft'}
                </button>
              )}
              {editable && (
                <>
                  <button className="btn small" onClick={undo} disabled={!hist.current.past.length} title="Undo (Ctrl+Z)">Undo</button>
                  <button className="btn small" onClick={redo} disabled={!hist.current.future.length} title="Redo (Ctrl+Shift+Z)">Redo</button>
                </>
              )}
              {!isMine && (
                <button className="btn" onClick={copyToMine} disabled={Boolean(busy)}>Copy into my draft</button>
              )}
              {isMine && plan && (
                <button className="btn" onClick={toggleShare} disabled={Boolean(busy)}
                        title="Let every admin edit this draft with you, live">
                  {plan.shared ? 'Stop sharing' : 'Let other admins edit'}
                </button>
              )}
              {canPublish && (
                <button className="btn" onClick={publish} disabled={Boolean(busy)}>Publish as official</button>
              )}
              {plan?.official && (
                <button className="btn" onClick={() => setPosting(true)} disabled={Boolean(busy)}>
                  {plan.posted_at ? 'Post to Discord again' : 'Post to Discord'}
                </button>
              )}
              <button className="btn" onClick={downloadPng}>Download PNG</button>
              {plan && (plan.official || isMine) && (
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
              {doc.scenarios.map((s) => {
                const on = peers.filter((p) => p.scenario === s.id)
                return (
                  <button key={s.id} type="button" role="tab" aria-selected={s.id === scenario.id}
                          className={s.id === scenario.id ? 'chip on' : 'chip'}
                          onClick={() => { setScenarioId(s.id); setSelItem(null) }}
                          onDoubleClick={() => editable && s.id === scenario.id && renameScenario()}>
                    {s.name}
                    {Object.keys(s.changes).length > 0 && <span className="wp-dot" aria-label="plans captures" />}
                    {on.map((p) => <i key={p.sid} className="wp-peer-dot" style={{ background: p.color }} title={p.name} />)}
                  </button>
                )
              })}
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

            <Toolbar tool={effectiveTool} setTool={pickTool} editable={editable} ink={ink} setInk={setInk}
                     alliances={alliances} symbol={symbol} setSymbol={setSymbol} stamp={stamp} setStamp={setStamp} />

            <WarMap ref={mapRef} map={map} board={board} holders={holders} alliances={alliances}
                    items={scenario.items} tool={effectiveTool} toolOpts={toolOpts} editable={editable}
                    selectedItem={selItem} selectedCity={selCity}
                    onSelectItem={(id) => { setSelItem(id); if (id) setSelCity(null) }}
                    onSelectCity={(id) => { setSelCity(id); if (id) setSelItem(null) }}
                    onCreate={createItem} onItem={onItem}
                    hide={hide} peers={liveOn ? onScenarioPeers : []}
                    onCursor={liveOn ? sendCursor : undefined}
                    extend={extend} onExtended={() => { setExtend(null); setTool('select') }} />

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

            <Legend hide={hide} setHide={setHide} alliances={alliances} />
          </div>
        </div>

        {/* ------------------------------------------------------- panels */}
        <div className="wp-side-col">
          {posting && plan?.official && (
            <PostPanel plan={plan} day={day} dayText={day ? dayLabel(day.day) : ''} scenarios={doc.scenarios}
                       render={renderScenario} onError={fail} onClose={() => setPosting(false)}
                       onPosted={(r) => {
                         setPlan((p) => ({ ...p, posted_at: r.posted_at, posted_url: r.url }))
                         setPosting(false)
                         setNotice(`Posted ${r.images} map${r.images === 1 ? '' : 's'} to Discord.`)
                       }} />
          )}
          {selectedItem && (
            <ItemPanel item={selectedItem} alliances={alliances} editable={editable}
                       onChange={updateItem} onDelete={() => deleteItem(selectedItem.id)}
                       onDuplicate={() => duplicateItem(selectedItem)} onClose={() => setSelItem(null)}
                       onExtend={(id) => { setSelItem(null); setTool('route'); setExtend(id) }} />
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
