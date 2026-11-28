import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import { TEMPLE_IV, blocked, cleanPlacements, gapToZone, sideOf, viewOf } from '../temple/geometry.js'
import { drawExport, drawScreen } from '../temple/draw.js'
import {
  DEFAULT_OPTIONS, GROUP, GROUPS, NO_GROUP_COLOR, SORTS, fillAround, parseVotes, sortMembers, voteColor,
} from '../temple/plan.js'
import '../temple/temple.css'

/**
 * Temple Strife planner: the ground round one Ancient Temple, with the zone no
 * one may teleport into, and our members' shelters placed around it.
 *
 * Admins put members in a group (Temple, Turret 1, Turret 2), mark one of each
 * group as its anchor and place the anchor by hand; "Fill" then packs the rest
 * of the group round the anchor, the strongest nearest (by BGB CP or by CP
 * without troops, as chosen). The poll
 * — who can come when — sits beside each name, typed in or pasted.
 *
 * Plans are kept on the server like the Pass War line-ups: each admin saves
 * their own draft, and publishing a draft makes it the official plan. Members
 * are not shown these. This browser also keeps the work in progress, so a
 * reload loses nothing unsaved; "Copy plan" / "Paste plan" carry a plan as text.
 */

const STORE = 'pou.temple.v2'
const OLD_STORE = 'pou.temple.v1'
const MARGIN_MIN = 6
const MARGIN_MAX = 40
const OFFICIAL = 'official'
const MARGIN_DEFAULT = 15

/** CP without troops: what a shelter brings that a lost fight does not take away. */
const baseCp = (p) => (p.total_cp != null ? p.total_cp - (p.troop_cp || 0) : null)

function shortCp(n) {
  if (n == null) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}G`
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`
  return n.toLocaleString('en-US')
}

function readStore() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (v) return v
    const old = JSON.parse(localStorage.getItem(OLD_STORE) || 'null')   // placements from the first version
    return old ? { margin: old.margin, placed: old.placed } : null
  } catch { return null }
}
const writeStore = (v) => {
  try { localStorage.setItem(STORE, JSON.stringify(v)) } catch { /* private mode: not worth a warning */ }
}

const stamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

/** The margin a set of placements needs, so shrinking the map never drops anyone. */
function marginNeeded(temple, placed) {
  const z = temple.zone
  let m = MARGIN_MIN
  for (const p of placed) {
    m = Math.max(m, z.x0 - (p.x - 1), (p.x + 1) - z.x1, z.y0 - (p.y - 1), (p.y + 1) - z.y1)
  }
  return Math.min(MARGIN_MAX, m)
}

/** Groups as saved, cleaned: each member in one group at most. */
function cleanGroups(g) {
  const out = { temple: [], t1: [], t2: [] }
  const seen = new Set()
  for (const id of Object.keys(out)) {
    for (const k of (g?.[id] || [])) {
      if (typeof k === 'string' && !seen.has(k)) { seen.add(k); out[id].push(k) }
    }
  }
  return out
}

/**
 * A plan document, cleaned, with its keys in one fixed order: two documents
 * are the same plan exactly when their JSON is the same string, which is how
 * the page knows whether there is anything unsaved.
 */
function docOf(v) {
  return {
    margin: Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, Math.round(+v?.margin) || MARGIN_DEFAULT)),
    placed: Array.isArray(v?.placed)
      ? v.placed.filter((p) => p?.key).map((p) => ({ key: p.key, name: p.name, x: Math.round(+p.x), y: Math.round(+p.y) }))
      : [],
    groups: cleanGroups(v?.groups),
    anchors: Object.fromEntries(Object.entries(v?.anchors || {}).filter(([g, k]) => GROUP[g] && typeof k === 'string')),
    votes: Object.fromEntries(Object.entries(v?.votes || {}).filter(([, n]) => Number.isInteger(n) && n > 0)),
    options: Array.isArray(v?.options) && v.options.length ? v.options.map(String) : DEFAULT_OPTIONS,
    fillBy: v?.fillBy === 'base' ? 'base' : 'bgb',
  }
}
const EMPTY_JSON = JSON.stringify(docOf({}))

function VoteBadge({ n, options }) {
  if (!n) return <span className="tp-vote none" title="No vote">–</span>
  return (
    <span className="tp-vote" style={{ background: voteColor(n) }} title={options[n - 1] || `Option ${n}`}>{n}</span>
  )
}

export default function TempleStrife({ user }) {
  const temple = TEMPLE_IV
  const saved = useMemo(readStore, [])
  const start = useMemo(() => docOf(saved), [saved])
  const mySlug = `draft:${user?.discord_id}`
  const [members, setMembers] = useState([])
  const [margin, setMargin] = useState(start.margin)
  const [placed, setPlaced] = useState(start.placed)
  const [groups, setGroups] = useState(start.groups)
  const [anchors, setAnchors] = useState(start.anchors)
  const [votes, setVotes] = useState(start.votes)
  const [options, setOptions] = useState(start.options)
  // Server plans: the list, which one is open, and the JSON of what was last
  // loaded or saved there (null: nothing yet), to tell what is unsaved.
  const [plans, setPlans] = useState([])
  const [slug, setSlug] = useState(saved?.slug || mySlug)
  const [baseline, setBaseline] = useState(saved?.baseline ?? null)
  const [offline, setOffline] = useState('')
  const [busy, setBusy] = useState('')
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [hover, setHover] = useState(null)
  const [drag, setDrag] = useState(null)      // { key, name, from: 'list'|'map', cx, cy, tile, ok }
  const [tab, setTab] = useState('members')
  const [sortBy, setSortBy] = useState('bgb')
  // who sits nearest an anchor: the strongest by BGB CP, or by CP without troops
  const [fillBy, setFillBy] = useState(start.fillBy)
  const [groupFilter, setGroupFilter] = useState('all')
  const [voteFilter, setVoteFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [hidePlaced, setHidePlaced] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [said, setSaid] = useState(null)      // the last action's outcome, shown under the map
  const [paste, setPaste] = useState(null)    // the plan paste box's text, or null when closed
  const [votePaste, setVotePaste] = useState('')
  const [loading, setLoading] = useState(true)

  const canvas = useRef(null)
  const frame = useRef(null)

  const view = useMemo(() => viewOf(temple, margin), [temple, margin])

  /* -------------------------------------------------------------- members */

  const loadMembers = useCallback(async () => {
    try {
      const rows = await api.listPlayers()
      setMembers(rows
        .filter((p) => p.active)
        .map((p) => ({
          key: p.id, name: p.name, rank: p.rank, uid: p.game_uid,
          base: baseCp(p), bgb: p.bgb_cp ?? null,
        })))
      setError(null)
    } catch (err) {
      setError(`Could not read the member table: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  const byKey = useMemo(() => new Map(members.map((m) => [m.key, m])), [members])
  const groupOf = useMemo(() => {
    const out = {}
    for (const g of GROUPS) for (const k of groups[g.id]) out[k] = g.id
    return out
  }, [groups])
  const placedAt = useMemo(() => new Map(placed.map((p) => [p.key, p])), [placed])

  /* The name on a shelter follows the member table: a rename since the plan was
     made shows the new name. Someone no longer in the alliance keeps the name
     the plan was saved with. */
  const shown = useMemo(() => placed.map((p) => {
    const m = byKey.get(p.key)
    const g = groupOf[p.key]
    return {
      ...p,
      name: m?.name || p.name,
      sub: m ? shortCp(sortBy === 'bgb' ? m.bgb : m.base) : 'left?',
      color: g ? GROUP[g].color : NO_GROUP_COLOR,
      group: g ? GROUP[g].name : null,
      vote: votes[p.key] || null,
      voteColor: votes[p.key] ? voteColor(votes[p.key]) : null,
      anchor: g && anchors[g] === p.key,
    }
  }), [placed, byKey, groupOf, votes, anchors, sortBy])

  const doc = useMemo(() => docOf({ margin, placed, groups, anchors, votes, options, fillBy }),
    [margin, placed, groups, anchors, votes, options, fillBy])
  const docJson = useMemo(() => JSON.stringify(doc), [doc])
  const dirty = docJson !== (baseline ?? EMPTY_JSON)

  useEffect(() => { writeStore({ v: 2, ...doc, slug, baseline }) }, [doc, slug, baseline])

  /** Show a plan document: every part of it, and nothing to undo into the last one. */
  const applyDoc = (d) => {
    setMargin(d.margin); setPlaced(d.placed); setGroups(d.groups); setAnchors(d.anchors)
    setVotes(d.votes); setOptions(d.options); setFillBy(d.fillBy)
    setHistory([]); setSelected(null); setSaid(null)
  }

  /* ---------------------------------------------------------- server plans */

  const fetchPlans = useCallback(async () => {
    try {
      const list = await api.raw('/temple-plans')
      setPlans(Array.isArray(list) ? list : [])
      setOffline('')
      return list
    } catch (err) {
      setOffline(err.message)
      return null
    }
  }, [])

  async function openPlan(which, { ask = true } = {}) {
    if (ask && dirty && !confirm('Open another plan? Your unsaved changes on this one will be lost.')) return
    setBusy('Opening…')
    try {
      const r = await api.raw(`/temple-plans/${which}`)
      const d = docOf(r?.plan)
      applyDoc(d)
      setSlug(which)
      setBaseline(r?.plan && Object.keys(r.plan).length ? JSON.stringify(d) : null)
      setOffline('')
    } catch (err) { setOffline(err.message) } finally { setBusy('') }
  }

  /* On arrival: unsaved work left in this browser stays on screen; otherwise
     the official plan opens, or failing that this admin's own draft. */
  useEffect(() => {
    ;(async () => {
      const list = await fetchPlans()
      if (!list) return
      if (JSON.stringify(start) !== (saved?.baseline ?? EMPTY_JSON)) {
        if (start.placed.length || Object.keys(start.votes).length) {
          setNotice('Showing the unsaved changes kept in this browser. Save them to your draft, or open a plan to discard them.')
        }
        return
      }
      const first = list.some((p) => p.slug === OFFICIAL) ? OFFICIAL : list.some((p) => p.slug === mySlug) ? mySlug : null
      if (first) await openPlan(first, { ask: false })
    })()
    // once, on arrival
  }, [])

  async function saveDraft() {
    setBusy('Saving…'); setError(null)
    try {
      await api.raw(`/temple-plans/${mySlug}`, { method: 'PUT', body: JSON.stringify({ plan: doc }) })
      setSlug(mySlug)
      setBaseline(docJson)
      setNotice('Saved to your draft.')
      await fetchPlans()
      return true
    } catch (err) { setError(err.message); return false } finally { setBusy('') }
  }

  async function publish() {
    if (!placed.length) { setError('There is nothing on the map to publish.'); return }
    if (!confirm('Make this the official Temple Strife plan? It is saved to your draft first.')) return
    if (!(await saveDraft())) return
    setBusy('Publishing…')
    try {
      await api.raw(`/temple-plans/${mySlug}/publish`, { method: 'POST' })
      setSlug(OFFICIAL)
      setNotice('Published. This is now the official plan; your draft stays as it is.')
      await fetchPlans()
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  async function deleteDraft() {
    if (!confirm('Delete your saved draft? What is on screen stays, unsaved.')) return
    setBusy('Deleting…')
    try {
      await api.raw(`/temple-plans/${mySlug}`, { method: 'DELETE' })
      if (slug === mySlug) setBaseline(null)
      setNotice('Your draft is deleted.')
      await fetchPlans()
    } catch (err) { setError(err.message) } finally { setBusy('') }
  }

  /* ------------------------------------------------------------- changing */

  const commit = (next) => {
    setHistory((h) => [...h.slice(-49), placed])
    setPlaced(next)
  }

  const undo = () => {
    if (!history.length) return
    setPlaced(history[history.length - 1])
    setHistory((h) => h.slice(0, -1))
    setSaid('Undone.')
  }

  const removeKey = (key) => {
    commit(placed.filter((p) => p.key !== key))
    if (selected === key) setSelected(null)
  }

  const clearAll = () => {
    if (!placed.length) return
    if (!confirm(`Take all ${placed.length} shelters off the map? Groups, anchors and votes stay. Undo brings them back.`)) return
    commit([])
    setSelected(null)
  }

  const setMarginSafe = (v) => {
    const need = marginNeeded(temple, placed)
    setMargin(Math.max(need, Math.min(MARGIN_MAX, v)))
  }

  /** Put a member in a group (or none), at the end of its order. */
  const setGroup = (key, id) => {
    setGroups((g) => {
      const out = { temple: g.temple.filter((k) => k !== key), t1: g.t1.filter((k) => k !== key), t2: g.t2.filter((k) => k !== key) }
      if (id && out[id]) out[id].push(key)
      return out
    })
    setAnchors((a) => {
      const out = { ...a }
      for (const g of GROUPS) if (out[g.id] === key && g.id !== id) delete out[g.id]
      return out
    })
  }

  const setVote = (key, n) => setVotes((v) => {
    const out = { ...v }
    if (n) out[key] = n
    else delete out[key]
    return out
  })

  /** A group's members, strongest first by the chosen measure: the order Fill places them in. */
  const groupOrder = (id) => sortMembers(groups[id].map((k) => byKey.get(k)).filter(Boolean), fillBy, votes).map((m) => m.key)

  /* Fill a group round its anchor: everyone in it not yet on the map takes the
     nearest free spot, strongest first. The map grows if it must. */
  function fillGroup(id) {
    const g = GROUP[id]
    const a = anchors[id] && placedAt.get(anchors[id])
    if (!a) { setSaid(`${g.name}: place the anchor on the map first.`); return }
    const keys = groupOrder(id).filter((k) => !placedAt.has(k))
    if (!keys.length) { setSaid(`${g.name}: everyone is already on the map.`); return }
    const wide = viewOf(temple, MARGIN_MAX)
    const got = fillAround(temple, wide, placed, a, keys, g.target(temple))
    const next = [...placed, ...got.map((p) => ({ ...p, name: byKey.get(p.key)?.name || p.key }))]
    commit(next)
    setMargin((m) => Math.max(m, marginNeeded(temple, next)))
    setSaid(got.length === keys.length
      ? `${g.name}: placed ${got.length} round ${byKey.get(a.key)?.name || 'the anchor'}, strongest nearest by ${SORTS[fillBy]}.`
      : `${g.name}: placed ${got.length} of ${keys.length}; no room left for the rest.`)
  }

  /** Take a group's shelters off the map, all but its anchor. */
  function clearGroup(id) {
    const keep = anchors[id]
    const inGroup = new Set(groups[id])
    const next = placed.filter((p) => !inGroup.has(p.key) || p.key === keep)
    if (next.length === placed.length) return
    commit(next)
    setSaid(`${GROUP[id].name}: taken off the map${keep ? ', anchor kept' : ''}. Undo puts them back.`)
  }

  /* ---------------------------------------------------------------- draw */

  useEffect(() => {
    if (!canvas.current) return
    const preview = drag?.tile ? { ...drag.tile, ok: drag.ok } : null
    frame.current = drawScreen(canvas.current, view, {
      temple, view, placed: shown, selected, preview, hover: drag ? null : hover,
    })
  }, [view, temple, shown, selected, hover, drag])

  /** The tile under a pointer, in the map's own coordinates, or null. */
  const tileAt = (e) => {
    const c = canvas.current
    const f = frame.current
    if (!c || !f) return null
    const r = c.getBoundingClientRect()
    const sx = f.width / r.width
    return f.tileAt((e.clientX - r.left) * sx, (e.clientY - r.top) * sx)
  }

  const shelterAt = (t) => (t ? placed.find((p) => Math.abs(p.x - t.x) <= 1 && Math.abs(p.y - t.y) <= 1) : null)

  /* ----------------------------------------------------------------- drag */

  /* The drag lives in a ref as well as in state: the window handlers read the
     ref, so they always see the latest landing without re-binding per move. */
  const dragRef = useRef(null)
  const setDragBoth = (d) => { dragRef.current = d; setDrag(d) }

  /* One drag for both sources. The landing is the shelter's center on the tile
     under the pointer, less where on the shelter it was picked up. */
  const startDrag = (e, d) => {
    e.preventDefault()
    setSelected(d.key)
    setSaid(null)
    setDragBoth({ ...d, cx: e.clientX, cy: e.clientY, tile: null, ok: false, moved: false })
  }

  useEffect(() => {
    if (!drag) return undefined
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      const t = tileAt(e)
      const moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4
      if (!t) { setDragBoth({ ...d, cx: e.clientX, cy: e.clientY, tile: null, ok: false, moved }); return }
      const x = t.x - (d.dx || 0)
      const y = t.y - (d.dy || 0)
      const why = blocked(temple, view, placed, d.key, x, y)
      setDragBoth({ ...d, cx: e.clientX, cy: e.clientY, tile: { x, y }, ok: !why, why, moved })
    }
    const onUp = () => {
      const d = dragRef.current
      setDragBoth(null)
      if (!d || !d.moved) return                       // a click: selection only
      if (d.tile && d.ok) {
        const rest = placed.filter((p) => p.key !== d.key)
        commit([...rest, { key: d.key, name: d.name, x: d.tile.x, y: d.tile.y }])
        setSaid(`${d.name} at X${d.tile.x} Y${d.tile.y}.`)
      } else if (d.tile) {
        setSaid(`${d.name}: ${d.why}. ${d.from === 'map' ? 'Left where it was.' : 'Not placed.'}`)
      } else if (d.from === 'map') {
        removeKey(d.key)                                // dropped off the map: back to the list
        setSaid(`${d.name} taken off the map. Undo puts it back.`)
      }
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // rebinds when a drag starts or the board changes; the drag itself is read from the ref
  }, [drag != null, placed, view])

  const onMapDown = (e) => {
    const t = tileAt(e)
    const hit = shelterAt(t)
    if (!hit) { setSelected(null); setSaid(null); return }
    const m = byKey.get(hit.key)
    startDrag(e, {
      key: hit.key, name: m?.name || hit.name, from: 'map',
      dx: t.x - hit.x, dy: t.y - hit.y, sx: e.clientX, sy: e.clientY,
    })
  }

  const onRowDown = (e, m) => {
    if (e.button !== 0 || e.target.closest('button, select, input')) return
    startDrag(e, { key: m.key, name: m.name, from: 'list', dx: 0, dy: 0, sx: e.clientX, sy: e.clientY })
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && placedAt.has(selected)) {
        e.preventDefault()
        removeKey(selected)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ------------------------------------------------------- copy and paste */

  const planText = () => JSON.stringify({
    temple: temple.name,
    margin,
    options,
    placed: placed.map((p) => ({ key: p.key, name: byKey.get(p.key)?.name || p.name, x: p.x, y: p.y })),
    groups,
    anchors,
    votes,
    fillBy,
    // names beside the ids, so the plan can be read (and matched) without the member table
    names: Object.fromEntries([...new Set([...placed.map((p) => p.key), ...Object.values(groups).flat(), ...Object.keys(votes)])]
      .map((k) => [k, byKey.get(k)?.name || placed.find((p) => p.key === k)?.name || k])),
  })

  async function copyPlan() {
    const text = planText()
    try {
      await navigator.clipboard.writeText(text)
      setNotice(`Copied the plan (${placed.length} shelters). Paste it back here, or anywhere else.`)
    } catch {
      setPaste(text)
      setNotice('The browser would not copy. The plan is in the box below: select it and copy.')
    }
  }

  function applyPaste() {
    let v
    try { v = JSON.parse(paste) } catch { setError('That is not a plan: it does not read as JSON.'); return }
    if (!Array.isArray(v?.placed)) { setError('That is not a plan: it has no "placed" list.'); return }
    // An id from another device matches the member table by id first, then by the name saved beside it.
    const byName = new Map(members.map((m) => [m.name, m]))
    const names = v.names || {}
    const remap = (k) => (byKey.has(k) ? k : byName.get(names[k])?.key || k)
    const rows = v.placed.map((p) => {
      const key = byKey.has(p.key) ? p.key : byName.get(p.name)?.key || p.key || `name:${p.name}`
      return { key, name: byKey.get(key)?.name || p.name, x: Math.round(+p.x), y: Math.round(+p.y) }
    })
    const m = Math.max(marginNeeded(temple, rows), Math.min(MARGIN_MAX, +v.margin || margin))
    const kept = cleanPlacements(temple, viewOf(temple, m), rows)
    commit(kept)
    setMargin(m)
    if (v.groups) setGroups(cleanGroups(Object.fromEntries(Object.entries(v.groups).map(([g, ks]) => [g, (ks || []).map(remap)]))))
    if (v.anchors) setAnchors(Object.fromEntries(Object.entries(v.anchors).map(([g, k]) => [g, remap(k)])))
    if (v.votes) setVotes(Object.fromEntries(Object.entries(v.votes).map(([k, n]) => [remap(k), n])))
    if (Array.isArray(v.options) && v.options.length) setOptions(v.options.map(String))
    if (v.fillBy === 'bgb' || v.fillBy === 'base') setFillBy(v.fillBy)
    setPaste(null)
    setError(null)
    setNotice(kept.length === rows.length
      ? `Loaded the plan: ${kept.length} shelters.`
      : `Loaded ${kept.length} of ${rows.length} shelters; ${rows.length - kept.length} overlapped the zone or another shelter and were left out.`)
  }

  function loadVotes() {
    const { votes: got, unmatched } = parseVotes(votePaste, members)
    const n = Object.keys(got).length
    if (!n) { setError(`No votes read.${unmatched.length ? ` Not matched: ${unmatched.slice(0, 5).join(' | ')}` : ''}`); return }
    setVotes(got)
    setVotePaste('')
    setError(unmatched.length ? `${unmatched.length} line(s) matched no member: ${unmatched.slice(0, 8).join(' | ')}` : null)
    setNotice(`Loaded ${n} votes. Members not in the list have no vote.`)
  }

  function download() {
    const out = drawExport(view, { temple, view, placed: shown, voteColors: options.map((_, i) => voteColor(i + 1)) }, {
      title: `${temple.name} · X${temple.temple.at[0]} Y${temple.temple.at[1]}`,
      subtitle: `${placed.length} shelters · no teleporting inside the red zone · ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      groups: GROUPS,
      options,
    })
    const a = document.createElement('a')
    a.href = out.toDataURL('image/png')
    a.download = `temple_plan_${stamp()}.png`
    a.click()
  }

  /* ----------------------------------------------------------------- view */

  const q = query.trim().toLowerCase()
  const listed = sortMembers(members, sortBy, votes).filter((m) => {
    if (hidePlaced && placedAt.has(m.key)) return false
    if (q && !m.name.toLowerCase().includes(q)) return false
    if (groupFilter === 'none' && groupOf[m.key]) return false
    if (groupFilter !== 'all' && groupFilter !== 'none' && groupOf[m.key] !== groupFilter) return false
    if (voteFilter === 'none' && votes[m.key]) return false
    if (voteFilter !== 'all' && voteFilter !== 'none' && votes[m.key] !== Number(voteFilter)) return false
    return true
  })
  const sel = selected ? shown.find((p) => p.key === selected) : null
  const gone = shown.filter((p) => !byKey.has(p.key))
  const voteCount = (n) => members.filter((m) => votes[m.key] === n).length
  const noVote = members.filter((m) => !votes[m.key]).length

  const when = (t) => (t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
  const planLabel = (p) => (p.slug === OFFICIAL
    ? `★ Official plan · ${p.shelters} shelters · ${when(p.updated_at)}`
    : p.slug === mySlug
      ? `My draft · ${p.shelters} shelters · ${when(p.updated_at)}`
      : `${p.owner_name || 'An admin'}'s draft · ${p.shelters} shelters · ${when(p.updated_at)}`)
  const openRow = plans.find((p) => p.slug === slug)
  const planNote = slug === OFFICIAL
    ? `The official plan${openRow?.updated_by_name ? `, published by ${openRow.updated_by_name}` : ''}. Changes you make are saved to your own draft; publish it to replace this one.`
    : slug === mySlug
      ? 'Your own draft: no other admin can overwrite it. Publish it to make it the official plan.'
      : `${openRow?.owner_name || 'Another admin'}'s draft. Saving puts a copy in your own draft; theirs stays as it is.`

  /* Under the map: what just happened (or what is selected) on the left, the
     tile under the pointer on the right. */
  let status
  if (drag?.tile) status = drag.ok ? `Drop at X${drag.tile.x} Y${drag.tile.y}` : `${drag.why} (X${drag.tile.x} Y${drag.tile.y})`
  else if (drag) status = drag.from === 'map' ? 'Drop off the map to take it back' : 'Drop on the map'
  else if (said) status = said
  else if (sel) {
    status = `${sel.name}${sel.group ? ` · ${sel.group}${sel.anchor ? ' anchor' : ''}` : ''} · X${sel.x} Y${sel.y} · `
      + `${gapToZone(temple, sel.x, sel.y)} tiles from the zone · ${sideOf(temple, sel.x, sel.y) || 'corner'}`
  } else status = 'Drag a member onto the map. Drag a shelter to move it, or off the map to take it back.'

  const groupSelect = (m) => (
    <select className="tp-gsel" value={groupOf[m.key] || ''} onChange={(e) => setGroup(m.key, e.target.value || null)}
            style={{ borderColor: groupOf[m.key] ? GROUP[groupOf[m.key]].color : undefined }} aria-label={`Group for ${m.name}`}>
      <option value="">No group</option>
      {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
  )

  const voteSelect = (m) => (
    <span className="tp-vpick" title={votes[m.key] ? `${votes[m.key]}. ${options[votes[m.key] - 1] || ''}` : 'No vote'}>
      <VoteBadge n={votes[m.key]} options={options} />
      <select value={votes[m.key] || ''} onChange={(e) => setVote(m.key, Number(e.target.value) || null)}
              aria-label={`Vote of ${m.name}`}>
        <option value="">No vote</option>
        {options.map((o, i) => <option key={i} value={i + 1}>{`${i + 1}. ${o}`}</option>)}
      </select>
    </span>
  )

  return (
    <div className="page tp">
      <div className="page-head">
        <h2>Temple Strife</h2>
        <button className="btn" onClick={loadMembers}>Refresh members</button>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNotice(null)}>{notice}</Banner>

      {drag?.moved && (
        <div className="tp-float" aria-hidden="true"
             style={{ left: drag.cx + 12, top: drag.cy + 12, background: groupOf[drag.key] ? GROUP[groupOf[drag.key]].color : NO_GROUP_COLOR }}>
          {drag.name}
        </div>
      )}

      <div className="tp-layout">
        <div className="tp-map-col">
          <div className="card tp-plans">
            <div className="card-head">
              <strong>Plan</strong>
              {dirty && <span className="pill">unsaved</span>}
              {offline && <span className="pill">offline</span>}
            </div>
            <div className="tp-planbar">
              <select value={slug} onChange={(e) => openPlan(e.target.value)} disabled={Boolean(busy)} aria-label="Which plan">
                {plans.map((p) => <option key={p.slug} value={p.slug}>{planLabel(p)}</option>)}
                {!plans.some((p) => p.slug === mySlug) && <option value={mySlug}>My draft (not saved yet)</option>}
                {slug !== mySlug && !plans.some((p) => p.slug === slug) && <option value={slug}>{slug === OFFICIAL ? '★ Official plan' : slug}</option>}
              </select>
              <button className="btn" onClick={() => openPlan(slug)} disabled={Boolean(busy)}>Reload</button>
              <button className="btn primary" onClick={saveDraft} disabled={Boolean(busy)}>
                {busy === 'Saving…' ? 'Saving…' : 'Save to my draft'}
              </button>
              <button className="btn" onClick={publish} disabled={Boolean(busy)}>
                {busy === 'Publishing…' ? 'Publishing…' : 'Publish as official'}
              </button>
              {plans.some((p) => p.slug === mySlug) && (
                <button className="btn danger" onClick={deleteDraft} disabled={Boolean(busy)}>Delete my draft</button>
              )}
            </div>
            <p className="muted small tp-note">
              {planNote}
              {offline ? ` The plan server is not answering (${offline}); work stays in this browser.` : ''}
            </p>
          </div>

          <div className="card">
            <div className="card-head">
              <strong>{temple.name} · X{temple.temple.at[0]} Y{temple.temple.at[1]}</strong>
              <span className="muted small">
                {placed.length} placed
                {GROUPS.map((g) => ` · ${g.name} ${placed.filter((p) => groupOf[p.key] === g.id).length}/${groups[g.id].length}`).join('')}
              </span>
            </div>

            <div className="tp-map">
              <canvas
                ref={canvas}
                onPointerDown={onMapDown}
                onPointerMove={(e) => { if (!drag) setHover(tileAt(e)) }}
                onPointerLeave={() => setHover(null)}
              />
            </div>
            <div className="tp-status small">
              <span aria-live="polite">{status}</span>
              <span className="tp-tile">{hover && !drag ? `X${hover.x} Y${hover.y}` : ''}</span>
            </div>

            <div className="card-actions">
              <button className="btn" onClick={undo} disabled={!history.length}>Undo</button>
              {sel && <button className="btn" onClick={() => removeKey(sel.key)}>Take {sel.name} off</button>}
              <button className="btn danger" onClick={clearAll} disabled={!placed.length}>Clear map</button>
              <span className="tp-spacer" />
              <button className="btn" onClick={copyPlan}>Copy plan</button>
              <button className="btn" onClick={() => setPaste(paste == null ? '' : null)}>Paste plan</button>
              <button className="btn primary" onClick={download}>Download PNG</button>
            </div>

            {paste != null && (
              <div className="tp-paste">
                <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6}
                          placeholder="Paste a copied plan here" spellCheck={false} />
                <div className="card-actions">
                  <button className="btn" onClick={() => setPaste(null)}>Cancel</button>
                  <button className="btn primary" onClick={applyPaste} disabled={!paste.trim()}>Load this plan</button>
                </div>
              </div>
            )}

            <label className="tp-field">
              <span className="tp-label">Ground shown round the zone: {margin} tiles</span>
              <input type="range" min={MARGIN_MIN} max={MARGIN_MAX} value={margin}
                     onChange={(e) => setMarginSafe(+e.target.value)} />
            </label>
            <p className="muted small tp-note">
              The red zone is X{temple.zone.x0}–{temple.zone.x1}, Y{temple.zone.y0}–{temple.zone.y1}: no teleporting in.
              Shelters are 3×3 and named by their center tile; ★ marks a group&apos;s anchor and the small badge its vote.
              The temple and turret labels are the game&apos;s own coordinates. The passes are markers only.
            </p>
          </div>
        </div>

        <div className="tp-side-col">
          <div className="card tp-side">
            <div className="tp-tabs" role="tablist">
              {[['members', `Members ${members.length}`], ['groups', 'Groups'], ['poll', 'Poll']].map(([id, text]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id}
                        className={tab === id ? 'tp-tab on' : 'tp-tab'} onClick={() => setTab(id)}>{text}</button>
              ))}
            </div>

            {tab === 'members' && (
              <>
                <div className="tp-sorts">
                  <span className="tp-label">Sort</span>
                  {Object.entries(SORTS).map(([id, text]) => (
                    <button key={id} type="button" className={sortBy === id ? 'chip on' : 'chip'} onClick={() => setSortBy(id)}>{text}</button>
                  ))}
                </div>
                <div className="tp-filter">
                  <input type="search" placeholder="Search a name" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Show group">
                    <option value="all">All groups</option>
                    <option value="none">No group</option>
                    {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <select value={voteFilter} onChange={(e) => setVoteFilter(e.target.value)} aria-label="Show vote">
                    <option value="all">Any vote</option>
                    {options.map((o, i) => <option key={i} value={i + 1}>{`${i + 1}. ${o}`}</option>)}
                    <option value="none">No vote</option>
                  </select>
                </div>
                <label className="tp-check">
                  <input type="checkbox" checked={hidePlaced} onChange={(e) => setHidePlaced(e.target.checked)} />
                  Hide members already on the map
                </label>
                {loading && <p className="muted small">Loading…</p>}
                <ul className="tp-list">
                  {listed.map((m) => {
                    const at = placedAt.get(m.key)
                    const g = groupOf[m.key]
                    return (
                      <li key={m.key} className={`${at ? 'placed' : ''} ${selected === m.key ? 'sel' : ''}`}
                          style={g ? { boxShadow: `inset 3px 0 0 ${GROUP[g].color}` } : undefined}
                          onPointerDown={(e) => onRowDown(e, m)}>
                        <div className="tp-row1">
                          <span className="tp-name">{g && anchors[g] === m.key ? '★ ' : ''}{m.name}</span>
                          {at ? (
                            <span className="tp-at">
                              X{at.x} Y{at.y}
                              <button type="button" className="tp-x" title="Take off the map" onClick={() => removeKey(m.key)}>×</button>
                            </span>
                          ) : <span className="tp-at muted">not placed</span>}
                        </div>
                        <div className="tp-row2">
                          <span className="tp-rank">R{m.rank ?? '?'}</span>
                          <span className={sortBy === 'bgb' ? 'tp-num on' : 'tp-num'} title="BGB CP">BGB {shortCp(m.bgb)}</span>
                          <span className={sortBy === 'base' ? 'tp-num on' : 'tp-num'} title="CP without troops">CP {shortCp(m.base)}</span>
                          {voteSelect(m)}
                          {groupSelect(m)}
                        </div>
                      </li>
                    )
                  })}
                  {!loading && !listed.length && <li className="tp-empty muted">No one matches.</li>}
                </ul>
                {gone.length > 0 && (
                  <p className="muted small">On the map but no longer active: {gone.map((p) => p.name).join(', ')}.</p>
                )}
              </>
            )}

            {tab === 'groups' && (
              <div className="tp-groups">
                <p className="muted small tp-note">
                  Pick each group&apos;s anchor and place them on the map by hand. Fill then places the rest of the
                  group round the anchor: the strongest gets the nearest spot.
                </p>
                <div className="tp-sorts">
                  <span className="tp-label">Strongest by</span>
                  {['bgb', 'base'].map((id) => (
                    <button key={id} type="button" className={fillBy === id ? 'chip on' : 'chip'} onClick={() => setFillBy(id)}>{SORTS[id]}</button>
                  ))}
                </div>
                {GROUPS.map((g) => {
                  const list = groupOrder(g.id)
                  const anchor = anchors[g.id]
                  const anchorAt = anchor && placedAt.get(anchor)
                  const unplaced = list.filter((k) => !placedAt.has(k)).length
                  return (
                    <section key={g.id} className="tp-group" style={{ borderColor: g.color }}>
                      <div className="tp-group-head">
                        <span className="tp-swatch" style={{ background: g.color }} />
                        <strong>{g.name}</strong>
                        <span className="muted small">{list.length} members · {list.length - unplaced} placed</span>
                      </div>
                      <label className="tp-anchor">
                        <span className="tp-label">Anchor</span>
                        <select value={anchor || ''} onChange={(e) => setAnchors((a) => ({ ...a, [g.id]: e.target.value || undefined }))}>
                          <option value="">None</option>
                          {list.map((k) => <option key={k} value={k}>{byKey.get(k)?.name || k}</option>)}
                        </select>
                        <span className="small muted">
                          {!anchor ? '' : anchorAt ? `at X${anchorAt.x} Y${anchorAt.y}` : 'not on the map yet'}
                        </span>
                      </label>
                      {list.length > 0 ? (
                        <ol className="tp-glist">
                          {list.map((k, i) => {
                            const m = byKey.get(k)
                            const at = placedAt.get(k)
                            return (
                              <li key={k} className={selected === k ? 'sel' : ''} onClick={() => setSelected(k)}>
                                <span className="tp-gi">{i + 1}</span>
                                <span className="tp-name">{k === anchor ? '★ ' : ''}{m?.name || k}</span>
                                <span className="tp-num">{shortCp(fillBy === 'bgb' ? m?.bgb : m?.base)}</span>
                                <VoteBadge n={votes[k]} options={options} />
                                <span className="tp-at">{at ? `X${at.x} Y${at.y}` : '—'}</span>
                                <button type="button" className="tp-x" title="Out of the group" onClick={() => setGroup(k, null)}>×</button>
                              </li>
                            )
                          })}
                        </ol>
                      ) : <p className="muted small">No one yet. Choose the group on the Members tab.</p>}
                      <div className="card-actions">
                        <button className="btn small primary" onClick={() => fillGroup(g.id)} disabled={!anchorAt || !unplaced}>
                          Fill round the anchor{unplaced ? ` (${unplaced})` : ''}
                        </button>
                        <button className="btn small" onClick={() => clearGroup(g.id)}
                                disabled={!list.some((k) => placedAt.has(k) && k !== anchor)}>Take group off the map</button>
                      </div>
                    </section>
                  )
                })}
              </div>
            )}

            {tab === 'poll' && (
              <div className="tp-poll">
                <div className="tp-label">What each option means</div>
                <ol className="tp-options">
                  {options.map((o, i) => (
                    <li key={i}>
                      <span className="tp-vote" style={{ background: voteColor(i + 1) }}>{i + 1}</span>
                      <input value={o} onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))}
                             aria-label={`Option ${i + 1}`} />
                      <span className="tp-count">{voteCount(i + 1)}</span>
                    </li>
                  ))}
                  <li>
                    <span className="tp-vote none">–</span>
                    <span className="muted small tp-novote">No vote</span>
                    <span className="tp-count">{noVote}</span>
                  </li>
                </ol>
                <div className="card-actions">
                  <button className="btn small" onClick={() => setOptions((os) => [...os, `Option ${os.length + 1}`])}
                          disabled={options.length >= 6}>Add an option</button>
                  <button className="btn small" disabled={options.length <= 1 || members.some((m) => votes[m.key] === options.length)}
                          title="Only when no one voted for it" onClick={() => setOptions((os) => os.slice(0, -1))}>Remove the last</button>
                  <button className="btn small" onClick={() => setOptions(DEFAULT_OPTIONS)}>Reset to today&apos;s</button>
                </div>

                <div className="tp-label tp-gap">Load votes</div>
                <p className="muted small tp-note">
                  One member per line: their game id or name, then the option number — for example
                  <code> 1431868299000413 1</code> or <code>Anya Forger☥, 2</code>. Loading replaces every vote.
                  Each member&apos;s vote can also be set on the Members tab.
                </p>
                <textarea className="tp-votes" rows={6} value={votePaste} onChange={(e) => setVotePaste(e.target.value)}
                          placeholder={'1431868299000413 1\n1616080508000418 2'} spellCheck={false} />
                <div className="card-actions">
                  <button className="btn small primary" onClick={loadVotes} disabled={!votePaste.trim()}>Load votes</button>
                  <button className="btn small danger" disabled={!Object.keys(votes).length}
                          onClick={() => { if (confirm('Clear every vote?')) setVotes({}) }}>Clear votes</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
