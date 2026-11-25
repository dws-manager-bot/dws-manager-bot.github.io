/*
 * The hive map generator, for admins. It draws the formation from the member
 * table — who asked for the outside, who sticks with whom, and the CP behind the
 * ranking — and "Apply" turns the drawing into the picture members are shown.
 * Members are never sent the table, only that picture.
 *
 * After the layout has placed everyone, an admin can change it by hand: drag a
 * shelter onto another to trade them, or onto empty ground to move it there,
 * snapped to whole tiles and refused where it would overlap. On a phone, where
 * a drag scrolls the page, it is tap a shelter, then tap the other or the
 * ground. The changes live only in this page until applied, and changing what
 * the layout is drawn from discards them, after asking: they name particular
 * cells, and a new layout moves them.
 *
 * The formation can be turned a quarter at a time about Frankenstein, which
 * stays where it is; nobody's distance to it changes. Apply saves where every
 * member ended up, by player id, and "Load applied map" picks that map up again
 * exactly, to swap from or turn. A map applied before that was saved is
 * redrawn from its settings and swaps instead, and checked against its picture.
 *
 * "Rally range" draws, for the admin only, how far each shelter is from
 * Frankenstein against its 25-tile rally range, and the spare places still in
 * it. Apply always sends the map without it; Download saves what is shown.
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
import {
  ROTATIONS, SHAPE_KEYS, SHELTER, VERSIONS, fitsAt, isMove, memberAt, placementOf, snapToTile, tilesFromFrankenstein, turn,
} from './layout.js'
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
      // The player's own id: what a saved map's placement is keyed by.
      key: p.id,
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

/**
 * Which shelters of the map just drawn have another color in `blob`, the
 * picture that was applied. Only the color is compared, from a patch in each
 * shelter's top-left corner that no text reaches: the picture was drawn on
 * someone else's computer, with other fonts (a Korean Windows font draws "\"
 * as "₩"), so its text never matches pixel for pixel. Null when the two pictures
 * are not the same size, which means the formation is not the same.
 */
async function shelterDifferences(canvas, layout, members, blob) {
  const bitmap = await createImageBitmap(blob)
  const { width, height } = canvas
  if (bitmap.width !== width || bitmap.height !== height) return null
  const scratch = document.createElement('canvas')
  scratch.width = width
  scratch.height = height
  const sctx = scratch.getContext('2d')
  sctx.drawImage(bitmap, 0, 0)
  const applied = sctx.getImageData(0, 0, width, height).data
  const drawn = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const mean = (data, x0, y0, side) => {
    const sum = [0, 0, 0]
    for (let j = y0; j < y0 + side; j += 1) {
      for (let i = x0; i < x0 + side; i += 1) {
        const k = 4 * (j * width + i)
        for (let c = 0; c < 3; c += 1) sum[c] += data[k + c]
      }
    }
    return sum.map((v) => v / (side * side))
  }
  const out = []
  for (const m of members) {
    const [x, y] = layout.toPx(...layout.memberCell.get(m.id))
    const x0 = Math.round((x - SHELTER / 2 + PATCH_INSET) * SCALE)
    const y0 = Math.round((y - SHELTER / 2 + PATCH_INSET) * SCALE)
    const side = PATCH * SCALE
    const a = mean(applied, x0, y0, side)
    const b = mean(drawn, x0, y0, side)
    if (Math.max(...a.map((v, c) => Math.abs(v - b[c]))) > 24) out.push(m.name)
  }
  return out
}
// The color patch: clear of the border, any stick-group outline and the name.
const PATCH_INSET = 7
const PATCH = 6

const shortDate = (iso) => new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(new Date(iso))
const listOf = (names, most = 6) => (names.length > most
  ? `${names.slice(0, most).join(', ')} and ${names.length - most} more`
  : names.join(', '))

const stamp = (zone) => utcToZoned(new Date().toISOString(), zone).replace(/-|:/g, '').replace('T', '_')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "2 swaps and 1 move". */
function editsText(edits) {
  const moves = edits.filter(isMove).length
  const swaps = edits.length - moves
  return [swaps && plural(swaps, 'swap'), moves && plural(moves, 'move')].filter(Boolean).join(' and ')
}

/**
 * Where member `id`'s shelter would land with the pointer at canvas point
 * (x, y): the nearest whole-tile place, and whether it fits there.
 */
function landing(layout, id, x, y) {
  const cell = snapToTile(...layout.fromPx(x, y))
  return { cell, ok: fitsAt(layout.memberCell, id, cell) }
}

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
  // Degrees clockwise about Frankenstein.
  const [rotation, setRotation] = useState(0)
  // Draw Frankenstein's rally range over the map (never applied).
  const [range, setRange] = useState(false)
  // An applied map loaded back: its saved cells, by player id, and its caption.
  const [pinned, setPinned] = useState(null)
  // A map loaded back from its settings, waiting to be checked against its picture.
  const [check, setCheck] = useState(null)
  // Changes by hand, in order: a swap is a pair of member ids, a move
  // { move: id, to: [x, y] } with the cell unturned (see applySwaps).
  const [swaps, setSwaps] = useState([])
  // Why the last tap could not move the selected shelter.
  const [blocked, setBlocked] = useState(false)
  const [selected, setSelected] = useState(null)

  // What the pointer handlers read between renders: the layout as last drawn
  // (swaps applied), the members, the selection, and the press in progress.
  const layoutRef = useRef(null)
  const membersRef = useRef(null)
  const selectedRef = useRef(null)
  const gesture = useRef(null)
  // Where the selected shelter would land, while the mouse is over empty ground.
  const hover = useRef(null)
  const rotationRef = useRef(0)
  // What to say once a loaded map has been drawn.
  const announce = useRef(null)

  const load = useCallback(() => {
    setPlayers(null)
    api.listPlayers().then(setPlayers).catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const members = players ? toHiveMembers(players) : null
  membersRef.current = members
  const unscanned = members ? members.filter((m) => !m.growth).length : 0
  const nameOf = (id) => members?.find((m) => m.id === id)?.name ?? '?'

  rotationRef.current = rotation

  const select = (id) => {
    selectedRef.current = id
    hover.current = null
    setSelected(id)
    setBlocked(false)
  }

  /* The highlight layer over the map: the selected shelter, or, mid-drag, the
     one being moved, the one it would trade with or the place it would land,
     and a ghost at the pointer.
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
    // The place a shelter would land: green where it fits, red where it does
    // not, with its distance to Frankenstein in tiles.
    const spot = ({ cell, ok }) => {
      const [x, y] = layout.toPx(...cell)
      const ink = ok ? 'rgb(25,140,60)' : 'rgb(210,40,40)'
      ctx.fillStyle = ok ? 'rgba(46,160,67,0.25)' : 'rgba(220,40,40,0.22)'
      ctx.fillRect(x - half, y - half, SHELTER, SHELTER)
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 3
      ctx.strokeStyle = ink
      ctx.strokeRect(x - half + 1.5, y - half + 1.5, SHELTER - 3, SHELTER - 3)
      ctx.setLineDash([])
      ctx.fillStyle = ink
      ctx.font = '700 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(ok ? `${tilesFromFrankenstein(cell).toFixed(1)} tiles` : 'No room', x, y + half - 12)
    }
    const g = gesture.current
    if (g?.dragging) {
      box(g.from, 3, [7, 5])
      if (g.spot) spot(g.spot)
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
      if (hover.current) spot(hover.current)
      box(selectedRef.current, 5)
    }
  }, [])

  const drawOptions = (withRange) => ({
    version, showGroups, spreadTop, spreadIndustry, swaps, rotation, placement: pinned?.placement, range: withRange,
    ts: stamp(zone), direction: 'ltr',
    labels: { ...ENGLISH_LABELS, shapeName: english.shape[SHAPE_KEYS[version]] },
  })

  /** The map as members get it: drawn again, off screen, without the rally range. */
  const cleanDraw = () => {
    if (!range) return { el: canvas.current, layout: layoutRef.current }
    const el = document.createElement('canvas')
    return { el, layout: drawHive(el, members, drawOptions(false), picture) }
  }

  useEffect(() => {
    if (!members?.length || !canvas.current) return
    try {
      const layout = drawHive(canvas.current, members, drawOptions(range), picture)
      layoutRef.current = layout
      if (overlay.current) {
        overlay.current.width = canvas.current.width
        overlay.current.height = canvas.current.height
      }
      paintOverlay()
      setDrawn({
        width: layout.W, count: layout.N, farthest: layout.farthest, restored: layout.restored, range: layout.range,
      })
    } catch (e) {
      layoutRef.current = null
      setDrawn({ error: e.message })
    }
    // `members` is rebuilt from `players` on every render; the table itself is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, version, showGroups, spreadTop, spreadIndustry, swaps, rotation, pinned, range, picture, zone, paintOverlay])

  /* A map loaded back from its settings is only as faithful as the member
     table it was redrawn from, so say how close it came to the picture. */
  useEffect(() => {
    if (!check || !drawn?.width || !layoutRef.current || !membersRef.current) return
    const { blob, intro, lost } = check
    setCheck(null)
    const lostText = lost ? ` ${plural(lost, 'swap')} named someone no longer on the member table and ${lost === 1 ? 'was' : 'were'} skipped.` : ''
    const clean = cleanDraw()
    shelterDifferences(clean.el, clean.layout, membersRef.current, blob)
      .then((diff) => {
        let verdict
        if (diff === null) verdict = 'The formation is not the same size as the applied picture: the member table has changed since, so this is not the same map.'
        else if (!diff.length) verdict = 'The formation and the color of every shelter match the applied picture. Two members of the same industry level look alike in a picture, so glance over the names.'
        else verdict = `${plural(diff.length, 'shelter')} of ${membersRef.current.length} ${diff.length === 1 ? 'has' : 'have'} another color than in the applied picture, so someone there moved or changed industry level: ${listOf(diff)}.`
        setNote(`${intro} It was applied before maps kept their shelters, so it was redrawn from its settings and swaps.${lostText} ${verdict}`)
      })
      .catch(() => setNote(`${intro} It was redrawn from its settings and swaps.${lostText} Could not compare it with the applied picture.`))
  }, [check, drawn])

  useEffect(() => {
    const r = drawn?.restored
    const intro = announce.current
    if (!r || !intro) return
    announce.current = null
    const parts = [intro]
    if (r.added.length) parts.push(`${plural(r.added.length, 'member')} joined since and took ${r.added.length === 1 ? 'a free shelter' : 'free shelters'}: ${listOf(r.added.map((m) => m.name))}.`)
    if (r.empty) parts.push(`${plural(r.empty, 'shelter')} of members who left ${r.empty === 1 ? 'is' : 'are'} empty.`)
    if (!r.added.length && !r.empty) parts.push('Everyone is where they were.')
    setNote(parts.join(' '))
  }, [drawn])

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
  // The map may be turned; a move is kept in the layout's own, unturned cells.
  const move = (id, cell) => setSwaps((list) => [...list, { move: id, to: turn(cell, (360 - rotationRef.current) % 360) }])

  /**
   * True when there is nothing to lose, or the admin agreed to lose it: the
   * swaps, and, unless `keepLoaded`, the applied map loaded back.
   */
  function discardSwaps({ keepLoaded = false } = {}) {
    const loaded = Boolean(pinned) && !keepLoaded
    if (!swaps.length && !loaded) return true
    const lose = [loaded && 'the loaded map', swaps.length && `your ${editsText(swaps)}`].filter(Boolean)
    const ask = loaded && !swaps.length
      ? 'Leave the loaded map? The layout will be drawn afresh from the member table.'
      : `Discard ${lose.join(' and ')}?`
    if (!window.confirm(ask)) return false
    setSwaps([])
    if (loaded) setPinned(null)
    select(null)
    return true
  }

  async function loadApplied() {
    if (!discardSwaps()) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const info = await api.hiveApplied()
      const o = info.options || {}
      if (!VERSIONS.includes(o.version)) throw new Error('The applied map does not say which layout it was drawn with.')
      const intro = `Loaded the map ${info.applied_by_name || 'an admin'} applied on ${shortDate(info.applied_at)} (layout v${o.version}).`
      setVersion(o.version)
      setShowGroups(o.showGroups !== false)
      setSpreadTop(Boolean(o.spreadTop))
      setSpreadIndustry(Boolean(o.spreadIndustry))
      setRotation(ROTATIONS.includes(o.rotation) ? o.rotation : 0)
      select(null)
      if (Array.isArray(o.placement) && o.placement.length) {
        setSwaps([])
        announce.current = intro
        setPinned({ placement: o.placement })
      } else {
        // Saved before placements were: replay its swaps, by name, on today's table.
        const idOf = new Map()
        for (const m of members) if (!idOf.has(m.name)) idOf.set(m.name, m.id)
        const pairs = (o.swaps || []).map((e) => (Array.isArray(e)
          ? [idOf.get(e[0]), idOf.get(e[1])]
          : { move: idOf.get(e.move), to: e.to }))
        const kept = pairs.filter((e) => (Array.isArray(e) ? e[0] != null && e[1] != null : e.move != null))
        const { blob } = await api.hiveAppliedImage()
        setPinned(null)
        setSwaps(kept)
        setCheck({ blob, intro, lost: pairs.length - kept.length })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
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
        g.spot = g.over === null || g.over === g.from ? landing(layout, g.from, x, y) : null
        e.currentTarget.style.cursor = 'grabbing'
        paintOverlay()
        return
      }
    }
    const under = memberAt(layout, x, y)
    // With a shelter selected, show where a click on empty ground would put it.
    if (selectedRef.current !== null && e.pointerType === 'mouse') {
      hover.current = under === null ? landing(layout, selectedRef.current, x, y) : null
      paintOverlay()
    }
    e.currentTarget.style.cursor = under !== null ? 'grab' : selectedRef.current !== null ? 'crosshair' : 'default'
  }

  function onPointerLeave() {
    if (!hover.current) return
    hover.current = null
    paintOverlay()
  }

  function onPointerUp(e) {
    const g = gesture.current
    gesture.current = null
    if (!g || g.pointer !== e.pointerId || !layoutRef.current) return
    if (g.dragging) {
      if (g.over !== null && g.over !== g.from) swap(g.from, g.over)
      else if (g.spot?.ok && !sameCell(g.spot.cell, layoutRef.current.memberCell.get(g.from))) move(g.from, g.spot.cell)
      e.currentTarget.style.cursor = 'grab'
      paintOverlay()
      return
    }
    // A touch that wandered was a scroll, not a tap.
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) >= 2 * DRAG_START) return
    const [x, y] = toLayout(e)
    const id = memberAt(layoutRef.current, x, y)
    const current = selectedRef.current
    if (id === current || (id === null && current === null)) select(null)
    else if (current === null) select(id)
    else if (id !== null) {
      swap(current, id)
      select(null)
    } else {
      const spot = landing(layoutRef.current, current, x, y)
      if (spot.ok) {
        move(current, spot.cell)
        select(null)
      } else {
        setBlocked(true)
      }
    }
  }

  const sameCell = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01

  function onPointerCancel() {
    gesture.current = null
    paintOverlay()
  }

  const png = (el = canvas.current) => new Promise((resolve) => el.toBlob(resolve, 'image/png'))

  async function apply() {
    const traded = swaps.length ? `, ${editsText(swaps)} by hand` : ''
    const turned = rotation ? `, turned ${rotation}°` : ''
    if (!window.confirm(
      `Make this the hive map every member sees?\n\n${drawn.count} shelters, layout v${version}${turned}${traded}.`,
    )) return
    setBusy(true)
    setError(null)
    try {
      const clean = cleanDraw()
      const blob = await png(clean.el)
      await api.applyHive(blob, drawn.count, {
        version, showGroups, spreadTop, spreadIndustry,
        farthest: Math.round(clean.layout.farthest * 10) / 10, width: clean.layout.W,
        rotation,
        swaps: swaps.map((e) => (isMove(e) ? { move: nameOf(e.move), to: e.to } : [nameOf(e[0]), nameOf(e[1])])),
        placement: placementOf(layoutRef.current.base, members),
      })
      setNote(`Applied: ${drawn.count} shelters, layout v${version}${turned}${traded}. Members see it now.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    save(await png(), `hive_map_v${version}${rotation ? `_r${rotation}` : ''}${range ? '_range' : ''}_${stamp(zone)}.png`)
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
          {/* A view, not a setting of the layout: it keeps the swaps. */}
          <button
            type="button"
            className={range ? 'chip on' : 'chip'}
            aria-pressed={range}
            title="Show each shelter's distance to Frankenstein, and the spare places still in its 25-tile rally range. Not applied."
            onClick={() => setRange(!range)}
          >
            Rally range
          </button>
        </div>
        {/* Turning keeps everyone in their shelter, so it never discards anything. */}
        <div className="hive-turn" role="group" aria-label="Turn the formation clockwise about Frankenstein">
          <span className="hive-turn-label">Turn</span>
          {ROTATIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={rotation === r ? 'chip on' : 'chip'}
              aria-pressed={rotation === r}
              onClick={() => setRotation(r)}
            >
              {r}°
            </button>
          ))}
        </div>
      </div>
      <div className="hive-actions">
        <button type="button" className="btn" onClick={loadApplied} disabled={!members?.length || busy}>
          <span aria-hidden="true">⤓</span> Load applied map
        </button>
        <button type="button" className="btn" onClick={() => discardSwaps({ keepLoaded: true }) && load()} disabled={!players}>
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
              ? (blocked
                ? `No room there for ${nameOf(selected)}: it would overlap a shelter or Frankenstein. Pick another place, or Esc to cancel.`
                : `${nameOf(selected)} selected. Click another shelter to swap them, or empty ground to move it there; Esc cancels.`)
              : 'Drag a shelter onto another to swap them, or onto empty ground to move it. Or click one, then the other or the ground. Rally range makes room further out.'}
          </p>
          {/* Always there, so the map does not jump when the first swap is made. */}
          <div className="hive-swaps">
            <span className={swaps.length ? 'hive-swapcount' : 'hive-swapcount none'}>
              {swaps.length ? `${editsText(swaps)} by hand` : 'No changes by hand'}
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
            onPointerLeave={onPointerLeave}
          />
        </div>
      </div>
      {members === null && !error && <p className="muted">Loading members…</p>}
      {members?.length === 0 && <p className="muted">No current member has a total CP yet.</p>}
      {drawn?.error && <p className="error">Render error: {drawn.error}</p>}
      {ready && (
        <p className="hive-status muted small">
          {drawn.count} members · farthest ≈ {drawn.farthest.toFixed(1)} tiles
          {rotation ? ` · turned ${rotation}° clockwise` : ''}
          {pinned ? ' · loaded from the applied map' : ''}
          {drawn.range && ` · rally range: ${drawn.range.members.sure} sure, ${drawn.range.members.likely} likely`}
          {drawn.range?.members.out ? `, ${drawn.range.members.out} out` : ''}
          {unscanned > 0 && ` · ${unscanned} without a troop CP read count as no growth`}
        </p>
      )}
    </div>
  )
}
