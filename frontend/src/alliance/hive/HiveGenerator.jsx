/*
 * The hive map generator, for admins. It draws the formation from the member
 * table — who asked for the outside, who sticks with whom, and the CP behind the
 * ranking — and "Apply" turns the drawing into the picture members are shown.
 * Members are never sent the table, only that picture.
 *
 * After the layout has placed everyone, an admin can trade two shelters by hand:
 * drag one onto another, or click one and then the other (the way a phone does
 * it, since a drag there scrolls the page). The swaps live only in this page
 * until applied, and changing what the layout is drawn from discards them,
 * after asking: a swap trades two particular cells, and a new layout moves them.
 *
 * Admin pages are in English, and so is what is drawn: the picture is shared.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Banner from '../../components/Banner.jsx'
import english from '../../i18n/messages/hive/en.json'
import { api } from '../../lib/api.js'
import { save } from '../../lib/files.js'
import { utcToZoned } from '../../lib/tz.js'
import { useI18n } from '../../i18n/I18n.jsx'
import { ENGLISH_LABELS, SCALE, drawHive } from './draw.js'
import frankensteinUrl from './frankenstein.jpg'
import { SHAPE_KEYS, SHELTER, VERSIONS, memberAt } from './layout.js'
import './hive.css'

const SHAPE_EMOJI = { 5: '❤️', 6: '🐱', 7: '🖕', 8: '💀', 9: '❄️' }

// How far, in CSS pixels, a press must travel before it is a drag and not a click.
const DRAG_START = 5
const GOLD = 'rgb(212,167,44)'

/** The member table as the layout reads it: only current members with a total CP. */
export function toHiveMembers(players) {
  return players
    .filter((p) => p.active && p.total_cp > 0)
    .map((p, id) => ({
      id,
      name: p.name,
      level: p.industry_level ?? null,
      bgbCp: p.bgb_cp ?? 0,
      cp: p.total_cp,
      // Total CP less troop CP; unknown until a scan has read their troops.
      growth: p.troop_cp != null ? p.total_cp - p.troop_cp : 0,
      outermost: p.hive_outermost,
      group: p.hive_group || null,
    }))
}

function usePicture(src) {
  const [picture, setPicture] = useState(null)
  useEffect(() => {
    const image = new Image()
    image.onload = () => setPicture(image)
    image.src = src
  }, [src])
  return picture
}

const stamp = (zone) => utcToZoned(new Date().toISOString(), zone).replace(/-|:/g, '').replace('T', '_')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function HiveGenerator() {
  const { zone } = useI18n()
  const canvas = useRef(null)
  const overlay = useRef(null)
  const picture = usePicture(frankensteinUrl)
  const [players, setPlayers] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actual, setActual] = useState(false)
  const [drawn, setDrawn] = useState(null)
  const [version, setVersion] = useState(1)
  const [showGroups, setShowGroups] = useState(true)
  const [spreadTop, setSpreadTop] = useState(true)
  const [spreadIndustry, setSpreadIndustry] = useState(true)
  // Pairs of member ids, in the order they were traded.
  const [swaps, setSwaps] = useState([])
  const [selected, setSelected] = useState(null)

  // What the pointer handlers read between renders: the layout as last drawn
  // (swaps applied), the members, the selection, and the press in progress.
  const layoutRef = useRef(null)
  const membersRef = useRef(null)
  const selectedRef = useRef(null)
  const gesture = useRef(null)

  const load = useCallback(() => {
    setPlayers(null)
    api.listPlayers().then(setPlayers).catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const members = players ? toHiveMembers(players) : null
  membersRef.current = members
  const unscanned = members ? members.filter((m) => !m.growth).length : 0
  const nameOf = (id) => members?.find((m) => m.id === id)?.name ?? '?'

  const select = (id) => {
    selectedRef.current = id
    setSelected(id)
  }

  /* The highlight layer over the map: the selected shelter, or, mid-drag, the
     one being moved, the one it would trade with, and a ghost at the pointer.
     It is a canvas of its own so the map itself, which is what gets applied and
     downloaded, never carries a highlight. */
  const paintOverlay = useCallback(() => {
    const el = overlay.current
    const layout = layoutRef.current
    if (!el || !layout) return
    const ctx = el.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
    const half = SHELTER / 2
    const box = (id, width, dash = []) => {
      const cell = layout.memberCell.get(id)
      if (!cell) return
      const [x, y] = layout.toPx(...cell)
      ctx.setLineDash(dash)
      ctx.lineWidth = width + 3
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.strokeRect(x - half + 3, y - half + 3, SHELTER - 6, SHELTER - 6)
      ctx.lineWidth = width
      ctx.strokeStyle = GOLD
      ctx.strokeRect(x - half + 3, y - half + 3, SHELTER - 6, SHELTER - 6)
      ctx.setLineDash([])
    }
    const g = gesture.current
    if (g?.dragging) {
      box(g.from, 3, [7, 5])
      if (g.over !== null && g.over !== g.from) {
        const [x, y] = layout.toPx(...layout.memberCell.get(g.over))
        ctx.fillStyle = 'rgba(212,167,44,0.28)'
        ctx.fillRect(x - half, y - half, SHELTER, SHELTER)
        box(g.over, 5)
      }
      const name = membersRef.current?.find((m) => m.id === g.from)?.name ?? ''
      ctx.globalAlpha = 0.85
      ctx.fillStyle = 'rgb(24,24,27)'
      ctx.fillRect(g.x - half, g.y - half, SHELTER, SHELTER)
      ctx.strokeStyle = GOLD
      ctx.lineWidth = 2
      ctx.strokeRect(g.x - half, g.y - half, SHELTER, SHELTER)
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgb(250,250,250)'
      ctx.font = '600 13px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      let label = name
      while (label.length > 1 && ctx.measureText(label).width > SHELTER - 8) label = label.slice(0, -1)
      ctx.fillText(label === name ? name : `${label.slice(0, -1)}…`, g.x, g.y)
    } else if (selectedRef.current !== null) {
      box(selectedRef.current, 5)
    }
  }, [])

  useEffect(() => {
    if (!members?.length || !canvas.current) return
    try {
      const layout = drawHive(
        canvas.current,
        members,
        {
          version, showGroups, spreadTop, spreadIndustry, swaps, ts: stamp(zone), direction: 'ltr',
          labels: { ...ENGLISH_LABELS, shapeName: english.shape[SHAPE_KEYS[version]] },
        },
        picture,
      )
      layoutRef.current = layout
      if (overlay.current) {
        overlay.current.width = canvas.current.width
        overlay.current.height = canvas.current.height
      }
      paintOverlay()
      setDrawn({ width: layout.W, count: layout.N, farthest: layout.farthest })
    } catch (e) {
      layoutRef.current = null
      setDrawn({ error: e.message })
    }
    // `members` is rebuilt from `players` on every render; the table itself is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, version, showGroups, spreadTop, spreadIndustry, swaps, picture, zone, paintOverlay])

  useEffect(paintOverlay, [selected, paintOverlay])

  useEffect(() => {
    if (selected === null) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const swap = (a, b) => setSwaps((list) => [...list, [a, b]])

  /** True when there are no swaps to lose, or the admin agreed to lose them. */
  function discardSwaps() {
    if (!swaps.length) return true
    if (!window.confirm(`Discard your ${plural(swaps.length, 'manual swap')}?`)) return false
    setSwaps([])
    select(null)
    return true
  }

  function undo() {
    setSwaps((list) => list.slice(0, -1))
    select(null)
  }

  /* ---------- the pointer ----------
     A mouse or pen press on a shelter becomes a drag once it moves; a touch
     never drags (the page has to scroll), so on a phone it is tap, then tap. */
  const toLayout = (e) => {
    const rect = overlay.current.getBoundingClientRect()
    const layout = layoutRef.current
    return [((e.clientX - rect.left) * layout.W) / rect.width, ((e.clientY - rect.top) * layout.H) / rect.height]
  }

  function onPointerDown(e) {
    if (!layoutRef.current || e.button !== 0) return
    const [x, y] = toLayout(e)
    const from = memberAt(layoutRef.current, x, y)
    gesture.current = { pointer: e.pointerId, touch: e.pointerType === 'touch', from, sx: e.clientX, sy: e.clientY, x, y, over: null, dragging: false }
    if (!gesture.current.touch && from !== null) e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    const layout = layoutRef.current
    if (!layout) return
    const [x, y] = toLayout(e)
    const g = gesture.current
    if (g && g.pointer === e.pointerId && !g.touch && g.from !== null) {
      if (!g.dragging && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) >= DRAG_START) {
        g.dragging = true
        select(null)
      }
      if (g.dragging) {
        g.x = x
        g.y = y
        g.over = memberAt(layout, x, y)
        e.currentTarget.style.cursor = 'grabbing'
        paintOverlay()
        return
      }
    }
    e.currentTarget.style.cursor = memberAt(layout, x, y) !== null ? 'grab' : 'default'
  }

  function onPointerUp(e) {
    const g = gesture.current
    gesture.current = null
    if (!g || g.pointer !== e.pointerId || !layoutRef.current) return
    if (g.dragging) {
      if (g.over !== null && g.over !== g.from) swap(g.from, g.over)
      e.currentTarget.style.cursor = 'grab'
      paintOverlay()
      return
    }
    // A touch that wandered was a scroll, not a tap.
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) >= 2 * DRAG_START) return
    const [x, y] = toLayout(e)
    const id = memberAt(layoutRef.current, x, y)
    const current = selectedRef.current
    if (id === null || id === current) select(null)
    else if (current === null) select(id)
    else {
      swap(current, id)
      select(null)
    }
  }

  function onPointerCancel() {
    gesture.current = null
    paintOverlay()
  }

  const png = () => new Promise((resolve) => canvas.current.toBlob(resolve, 'image/png'))

  async function apply() {
    const traded = swaps.length ? `, ${plural(swaps.length, 'manual swap')}` : ''
    if (!window.confirm(
      `Make this the hive map every member sees?\n\n${drawn.count} shelters, layout v${version}${traded}.`,
    )) return
    setBusy(true)
    setError(null)
    try {
      const blob = await png()
      await api.applyHive(blob, drawn.count, {
        version, showGroups, spreadTop, spreadIndustry,
        farthest: Math.round(drawn.farthest * 10) / 10, width: drawn.width,
        swaps: swaps.map(([a, b]) => [nameOf(a), nameOf(b)]),
      })
      setNote(`Applied: ${drawn.count} shelters, layout v${version}${traded}. Members see it now.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    save(await png(), `hive_map_v${version}_${stamp(zone)}.png`)
  }

  const toggle = (on, set, label) => (
    <button type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => discardSwaps() && set(!on)}>
      {label}
    </button>
  )
  const ready = Boolean(drawn?.width)

  return (
    <div className="page hive">
      <div className="hive-head">
        <h2>Hive map</h2>
        <p className="muted small">
          Drawn from the Members tab. Outer shelters go to, in order: who asked for the outside, growth (total
          CP less troop CP), BGB CP, industry level, total CP. Members see only the map you apply.
        </p>
      </div>
      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNote(null)}>{note}</Banner>
      <div className="hive-controls">
        <label className="hive-layout">
          Layout
          <select
            value={version}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (discardSwaps()) setVersion(next)
            }}
          >
            {VERSIONS.map((v) => (
              <option key={v} value={v}>
                {`v${v} · ${english.shape[SHAPE_KEYS[v]]}${SHAPE_EMOJI[v] ? ` ${SHAPE_EMOJI[v]}` : ''}`}
              </option>
            ))}
          </select>
        </label>
        <div className="hive-toggles">
          {toggle(showGroups, setShowGroups, 'Stick groups')}
          {toggle(spreadTop, setSpreadTop, 'Spread Top 10')}
          {toggle(spreadIndustry, setSpreadIndustry, 'Spread Lv8')}
        </div>
      </div>
      <div className="hive-actions">
        <button type="button" className="btn" onClick={() => discardSwaps() && load()} disabled={!players}>
          <span aria-hidden="true">↻</span> Reload members
        </button>
        <button type="button" className="btn" onClick={() => setActual((a) => !a)} disabled={!ready}>
          <span aria-hidden="true">⤢</span> {actual ? 'Fit width' : 'Actual size'}
        </button>
        <button type="button" className="btn" onClick={download} disabled={!ready}>
          <span aria-hidden="true">⬇</span> Download PNG
        </button>
        <button type="button" className="btn primary" onClick={apply} disabled={!ready || busy}>
          {busy ? 'Applying…' : 'Apply this map'}
        </button>
      </div>
      {ready && (
        <div className="hive-swapbar">
          <p className="hive-hint muted" role="status">
            {selected !== null
              ? `${nameOf(selected)} selected. Click another shelter to swap them, or Esc to cancel.`
              : 'Drag a shelter onto another to swap them, or click one and then the other.'}
          </p>
          {/* Always there, so the map does not jump when the first swap is made. */}
          <div className="hive-swaps">
            <span className={swaps.length ? 'hive-swapcount' : 'hive-swapcount none'}>
              {swaps.length ? plural(swaps.length, 'manual swap') : 'No manual swaps'}
            </span>
            <button type="button" className="btn" onClick={undo} disabled={!swaps.length}>
              <span aria-hidden="true">↶</span> Undo
            </button>
            <button type="button" className="btn" onClick={discardSwaps} disabled={!swaps.length}>Reset</button>
          </div>
        </div>
      )}
      <div className={actual ? 'hive-frame actual' : 'hive-frame'} dir="ltr" hidden={!ready}>
        <div className="hive-sheet" style={{ width: drawn?.width }}>
          <canvas ref={canvas} width={400} height={300} role="img" aria-label="Hive map preview" />
          <canvas
            ref={overlay}
            className="hive-overlay"
            width={400}
            height={300}
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
        </div>
      </div>
      {members === null && !error && <p className="muted">Loading members…</p>}
      {members?.length === 0 && <p className="muted">No current member has a total CP yet.</p>}
      {drawn?.error && <p className="error">Render error: {drawn.error}</p>}
      {ready && (
        <p className="hive-status muted small">
          {drawn.count} members · farthest ≈ {drawn.farthest.toFixed(1)} tiles
          {unscanned > 0 && ` · ${unscanned} without a troop CP read count as no growth`}
        </p>
      )}
    </div>
  )
}
