import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import { drawBase, paintBase, zoneStyles } from './base.js'
import { FONT, Items, arrowHandles, bounds, makeItem, shifted } from './items.jsx'
import { coords, footprint } from './mapdata.js'
import { darker, inkOn } from './palette.js'

/**
 * The season map, interactive.
 *
 * Two layers share one view. A canvas holds the raster — sand, territories,
 * walls — at one pixel per tile, scaled; an SVG over it holds everything that
 * is tapped or drawn. The view is a center tile and a zoom in pixels per tile,
 * and y runs up the screen as it does on the game's minimap.
 *
 * Gestures: drag to pan, pinch or wheel to zoom. With a drawing tool, a drag
 * draws an arrow and a tap places a pin, sticker, note or stamp.
 */

const ZMAX = 40
const TAP = 6   // px a pointer may wander and still count as a tap

const NEUTRAL = {
  city: { fill: '#fffbeb', stroke: '#b7791f' },
  pass: { fill: '#9a3412', stroke: '#431407' },
  stronghold: { fill: '#475569', stroke: '#1e293b' },
  oasis: { fill: '#0f766e', stroke: '#042f2e' },
}

const HALO = { stroke: '#ffffff', strokeWidth: 3.2, strokeLinejoin: 'round', paintOrder: 'stroke' }

function passLabel(name, z) {
  if (z >= 1.4) return name
  return name.replace('Strife Pass', 'Strife').replace('Temple Fortress', 'Temple').replace('Sands Fortress', 'Sands')
}

/* ------------------------------------------------------------------ markers */

function Cities({ map, board, holders, P, z, W, H, colorOf, allianceOf, selectedCity }) {
  const out = []
  const labels = []
  for (const c of map.cities) {
    const fp = footprint(c)
    const [x0, y0] = P(fp[0], fp[3])
    const px = c.size * z
    const cxs = x0 + px / 2
    const cys = y0 + px / 2
    if (cxs < -60 || cys < -60 || cxs > W + 60 || cys > H + 60) continue
    if (c.kind === 'oasis' && z < 1.1 && selectedCity !== c.id) continue
    if (c.kind === 'stronghold' && z < 0.55 && selectedCity !== c.id) continue

    const holder = holders.get(c.id)
    const planned = holder !== board.get(c.id)
    const color = holder != null ? colorOf(holder) : null
    const look = color ? { fill: color, stroke: darker(color, 0.55) } : NEUTRAL[c.kind]
    const royal = c.kind === 'city' && c.size > 7
    const min = { city: royal ? 13 : 9, pass: 8, stronghold: 8, oasis: 6 }[c.kind]
    const s = Math.max(px, min)
    const dash = planned ? '3 2' : undefined
    const sw = planned ? 2.2 : 1.4
    const hit = Math.max(s, 26)

    let shape
    if (c.kind === 'oasis') {
      shape = <circle cx={cxs} cy={cys} r={s / 2} fill={look.fill} stroke={look.stroke} strokeWidth={sw} strokeDasharray={dash} />
    } else if (c.kind === 'stronghold') {
      const r = s * 0.62
      shape = <polygon points={`${cxs},${cys - r} ${cxs + r},${cys} ${cxs},${cys + r} ${cxs - r},${cys}`}
                       fill={look.fill} stroke={look.stroke} strokeWidth={sw} strokeDasharray={dash} />
    } else {
      shape = <rect x={cxs - s / 2} y={cys - s / 2} width={s} height={s} rx={c.kind === 'pass' ? 1 : 2}
                    fill={look.fill} stroke={look.stroke} strokeWidth={royal ? 2.2 : sw} strokeDasharray={dash} />
    }

    out.push(
      <g key={c.id} data-city={c.id}>
        <rect x={cxs - hit / 2} y={cys - hit / 2} width={hit} height={hit} fill="transparent" />
        {shape}
        {c.kind === 'city' && s >= 13 && (
          <text x={cxs} y={cys + s * 0.19} textAnchor="middle" fontFamily={FONT} fontWeight="700"
                fontSize={Math.min(s * 0.52, 22)} fill={color ? inkOn(color) : '#92400e'}>
            {royal ? '★' : c.level}
          </text>
        )}
      </g>,
    )

    // Names where they help: the Strife Passes always, since they are what
    // Saturday is about; the bigger gates once there is room; the rest close up.
    const big = /Strife|Grand|Fortress/.test(c.name)
    let label = null
    if (c.kind === 'pass' && (/Strife/.test(c.name) || (big && z >= 0.9) || z >= 1.8)) label = passLabel(c.name, z)
    else if (royal && z >= 0.6) label = 'Royal Court'
    else if (c.kind === 'stronghold' && z >= 2.2) label = 'Stronghold'
    const owner = holder != null && z >= 1.3 ? allianceOf(holder) : null
    if (label || owner) {
      const fs = Math.max(10, Math.min(13, 9 + z))
      labels.push(
        <text key={`l${c.id}`} x={cxs} y={cys + s / 2 + fs + 1} textAnchor="middle" fontFamily={FONT}
              fontSize={fs} fontWeight="600" fill="#1c1917" {...HALO}>
          {label}
          {owner && <tspan fill={darker(owner.color, 0.8)} fontWeight="700">{label ? ` · ${owner.tag || owner.name}` : owner.tag || owner.name}</tspan>}
        </text>,
      )
    }
  }
  return <>{out}{labels}</>
}

/* --------------------------------------------------------------------- map */

const WarMap = forwardRef(function WarMap(props, ref) {
  const {
    map, board, holders, alliances, items, tool, toolOpts, editable,
    selectedItem, selectedCity, onSelectItem, onSelectCity, onCreate, onItem,
  } = props

  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const svgRef = useRef(null)
  const [size, setSize] = useState({ W: 0, H: 0 })
  const [view, setView] = useState(null)
  const [hover, setHover] = useState(null)
  const [draft, setDraft] = useState(null)       // an arrow being drawn
  const gesture = useRef({ pointers: new Map() })

  const N = map.N
  const byAlliance = useMemo(() => new Map(alliances.map((a) => [a.id, a])), [alliances])
  const colorOf = useCallback((id) => byAlliance.get(id)?.color || '#94a3b8', [byAlliance])
  const allianceOf = useCallback((id) => byAlliance.get(id) || null, [byAlliance])
  const itemColor = useCallback(
    (item) => (item.alliance != null && byAlliance.get(item.alliance)?.color) || item.color || '#fbbf24',
    [byAlliance],
  )

  /* ------------------------------------------------------------- the view */

  const fitView = useCallback((W, H) => ({ cx: N / 2, cy: N / 2, z: Math.min(W, H) / N }), [N])

  const clampView = useCallback((v, W = size.W, H = size.H) => {
    const zmin = (Math.min(W, H) / N) * 0.6
    const z = Math.max(zmin, Math.min(ZMAX, v.z))
    return { z, cx: Math.max(0, Math.min(N, v.cx)), cy: Math.max(0, Math.min(N, v.cy)) }
  }, [N, size])

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([entry]) => {
      const W = Math.round(entry.contentRect.width)
      const H = Math.round(entry.contentRect.height)
      setSize({ W, H })
      setView((v) => v || fitView(W, H))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fitView])

  const P = useCallback((wx, wy) => {
    if (!view) return [0, 0]
    return [(wx - view.cx) * view.z + size.W / 2, (view.cy - wy) * view.z + size.H / 2]
  }, [view, size])

  const toTile = useCallback((sx, sy) => {
    const wx = (sx - size.W / 2) / view.z + view.cx
    const wy = view.cy - (sy - size.H / 2) / view.z
    return { x: Math.floor(wx), y: Math.floor(wy), wx, wy }
  }, [view, size])

  /* ----------------------------------------------------------- the raster */

  const image = useMemo(() => {
    const styles = zoneStyles(map, board, holders, colorOf)
    const c = document.createElement('canvas')
    c.width = N; c.height = N
    c.getContext('2d').putImageData(paintBase(map, styles), 0, 0)
    return c
  }, [map, board, holders, colorOf, N])

  const paint = useCallback((canvas, v, W, H, dpr) => {
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawBase(ctx, image, v, W, H, N)
  }, [image, N])

  useLayoutEffect(() => {
    if (!view || !size.W || !canvasRef.current) return
    paint(canvasRef.current, view, size.W, size.H, window.devicePixelRatio || 1)
  }, [view, size, paint])

  /* ------------------------------------------------------------- gestures */

  const zoomAt = useCallback((factor, sx, sy) => {
    setView((v) => {
      if (!v) return v
      const wx = (sx - size.W / 2) / v.z + v.cx
      const wy = v.cy - (sy - size.H / 2) / v.z
      const next = clampView({ ...v, z: v.z * factor })
      // Keep the point under the cursor where it was.
      return clampView({
        z: next.z,
        cx: wx - (sx - size.W / 2) / next.z,
        cy: wy + (sy - size.H / 2) / next.z,
      })
    })
  }, [size, clampView])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      // A trackpad pinch arrives as a wheel with ctrlKey and small deltas.
      const k = e.ctrlKey ? 0.012 : 0.0016
      zoomAt(Math.exp(-e.deltaY * k), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const local = (e) => {
    const r = wrapRef.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  const itemById = useCallback((id) => items.find((i) => i.id === id), [items])

  const onPointerDown = (e) => {
    if (!view || (e.pointerType === 'mouse' && e.button !== 0)) return
    const g = gesture.current
    const [sx, sy] = local(e)
    try { wrapRef.current.setPointerCapture(e.pointerId) } catch { /* a synthetic or vanished pointer */ }
    g.pointers.set(e.pointerId, [sx, sy])

    if (g.pointers.size === 2) {
      // A second finger turns whatever was happening into a pinch.
      if (g.mode === 'move' || g.mode === 'handle') onItem(g.id, g.current || g.orig, 'done')
      setDraft(null)
      const [[ax, ay], [bx, by]] = [...g.pointers.values()]
      Object.assign(g, { mode: 'pinch', dist: Math.hypot(ax - bx, ay - by), view, mid: [(ax + bx) / 2, (ay + by) / 2] })
      return
    }
    if (g.pointers.size > 2) return

    const target = e.target.closest?.('[data-handle],[data-item],[data-city]')
    const t = toTile(sx, sy)
    Object.assign(g, { start: [sx, sy], view, moved: false, current: null })

    if (tool === 'select' || !editable) {
      if (target?.dataset.handle && editable) {
        const it = itemById(selectedItem)
        if (it) Object.assign(g, { mode: 'handle', id: it.id, key: target.dataset.handle, orig: it })
        return
      }
      if (target?.dataset.item) {
        onSelectItem(target.dataset.item)
        const it = itemById(target.dataset.item)
        if (editable && it) Object.assign(g, { mode: 'move', id: it.id, orig: it, tile: t })
        else Object.assign(g, { mode: 'pan' })
        return
      }
      if (target?.dataset.city) {
        Object.assign(g, { mode: 'city', city: Number(target.dataset.city) })
        return
      }
      Object.assign(g, { mode: 'pan', empty: true })
      return
    }
    if (tool === 'arrow' || tool === 'curve') {
      Object.assign(g, { mode: 'draw', a: [t.x, t.y], b: null })
      setDraft({ a: [t.x, t.y], b: [t.x, t.y] })
      return
    }
    Object.assign(g, { mode: 'place', tile: t })
  }

  const onPointerMove = (e) => {
    if (!view) return
    const g = gesture.current
    const [sx, sy] = local(e)
    if (!g.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        const t = toTile(sx, sy)
        setHover((h) => (h && h.x === t.x && h.y === t.y ? h : { x: t.x, y: t.y }))
      }
      return
    }
    g.pointers.set(e.pointerId, [sx, sy])

    if (g.mode === 'pinch') {
      const [[ax, ay], [bx, by]] = [...g.pointers.values()]
      const dist = Math.hypot(ax - bx, ay - by)
      const mid = [(ax + bx) / 2, (ay + by) / 2]
      const v0 = g.view
      const z = clampView({ ...v0, z: v0.z * (dist / g.dist) }).z
      // The world point under the fingers' starting midpoint follows the fingers.
      const wx = (g.mid[0] - size.W / 2) / v0.z + v0.cx
      const wy = v0.cy - (g.mid[1] - size.H / 2) / v0.z
      setView(clampView({ z, cx: wx - (mid[0] - size.W / 2) / z, cy: wy + (mid[1] - size.H / 2) / z }))
      return
    }

    const dx = sx - g.start[0]
    const dy = sy - g.start[1]
    if (!g.moved && Math.hypot(dx, dy) > TAP) g.moved = true
    if (!g.moved) return

    if (g.mode === 'city' || g.mode === 'place') g.mode = 'pan'
    if (g.mode === 'pan') {
      const v0 = g.view
      setView(clampView({ ...v0, cx: v0.cx - dx / v0.z, cy: v0.cy + dy / v0.z }))
    } else if (g.mode === 'move') {
      const t = toTile(sx, sy)
      const next = shifted(g.orig, t.x - g.tile.x, t.y - g.tile.y)
      g.current = next
      onItem(g.id, next, 'live')
    } else if (g.mode === 'handle') {
      const t = toTile(sx, sy)
      const o = g.orig
      let next = o
      if (o.type === 'arrow') next = { ...o, [g.key]: [t.x, t.y] }
      else if (o.type === 'note') {
        next = { ...o, w: Math.max(8, t.x - o.x + 1), h: Math.max(4, o.y - t.y + 1) }
      }
      g.current = next
      onItem(g.id, next, 'live')
    } else if (g.mode === 'draw') {
      const t = toTile(sx, sy)
      g.b = [t.x, t.y]
      setDraft({ a: g.a, b: g.b })
    }
  }

  const onPointerUp = (e) => {
    const g = gesture.current
    if (!g.pointers.has(e.pointerId)) return
    g.pointers.delete(e.pointerId)
    if (g.mode === 'pinch') {
      if (g.pointers.size === 1) {
        // One finger left: carry on as a pan from where it is.
        const [p] = [...g.pointers.values()]
        Object.assign(g, { mode: 'pan', start: p, view, moved: true })
      } else if (!g.pointers.size) g.mode = null
      return
    }
    if (g.pointers.size) return

    if (g.mode === 'move' || g.mode === 'handle') {
      if (g.current) onItem(g.id, g.current, 'done')
    } else if (g.mode === 'draw') {
      const [ax, ay] = g.a
      const b = g.b || g.a
      const len = Math.hypot(b[0] - ax, b[1] - ay)
      if (len >= 2) {
        // A curve starts bowed out to one side by a quarter of its length, so
        // it reads as a curve straight away; its handle bends it further.
        const c = tool === 'curve'
          ? [Math.round((ax + b[0]) / 2 - (b[1] - ay) * 0.25), Math.round((ay + b[1]) / 2 + (b[0] - ax) * 0.25)]
          : null
        onCreate(makeItem('arrow', { a: [ax, ay], b, c }, toolOpts))
      }
      setDraft(null)
    } else if (g.mode === 'place' && !g.moved) {
      const item = makeItem(tool, g.tile, toolOpts)
      if (item) onCreate(item)
    } else if (g.mode === 'city' && !g.moved) {
      onSelectCity(g.city)
    } else if (g.mode === 'pan' && !g.moved && g.empty) {
      // A tap inside a territory picks its Pyramid, which is a much bigger
      // target than the marker; a tap on a wall or open ground picks nothing.
      const t = toTile(...g.start)
      const i = t.y * N + t.x
      const owner = t.x >= 0 && t.y >= 0 && t.x < N && t.y < N && !map.walls[i] ? map.zoneOwner[map.zone[i]] : 0
      onSelectItem(null)
      onSelectCity(owner || null)
    }
    g.mode = null
  }

  /* ---------------------------------------------------------- outside use */

  useImperativeHandle(ref, () => ({
    jumpTo(x, y, z) {
      setView((v) => clampView({ cx: x + 0.5, cy: y + 0.5, z: z ?? Math.max(v?.z || 1, 3.5) }))
    },
    fit() { setView(fitView(size.W, size.H)) },
    zoomBy(f) { zoomAt(f, size.W / 2, size.H / 2) },
    /** The current view as a PNG, drawings included, handles left out. */
    async toPng(caption) {
      const scale = 2
      const { W, H } = size
      const bar = caption ? 34 : 0
      const out = document.createElement('canvas')
      out.width = W * scale
      out.height = (H + bar) * scale
      const ctx = out.getContext('2d')
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      drawBase(ctx, image, view, W, H, N)

      const svg = svgRef.current.cloneNode(true)
      svg.querySelectorAll('[data-noexport]').forEach((n) => n.remove())
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svg.setAttribute('width', W); svg.setAttribute('height', H)
      const xml = new XMLSerializer().serializeToString(svg)
      const img = new Image()
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
      await img.decode()
      ctx.drawImage(img, 0, 0, W, H)

      if (caption) {
        ctx.fillStyle = '#18181b'
        ctx.fillRect(0, H, W, bar)
        ctx.fillStyle = '#fbbf24'
        ctx.font = `700 13px ${FONT}`
        ctx.fillText('[PoU]', 12, H + 22)
        ctx.fillStyle = '#fafafa'
        ctx.font = `500 13px ${FONT}`
        ctx.fillText(caption, 62, H + 22)
      }
      return new Promise((resolve) => out.toBlob(resolve, 'image/png'))
    },
  }), [clampView, fitView, size, zoomAt, image, view, N])

  /* ---------------------------------------------------------------- render */

  const z = view?.z || 1
  const sel = selectedItem ? itemById(selectedItem) : null
  const city = selectedCity ? map.byId.get(selectedCity) : null
  const readout = hover || (view ? { x: Math.floor(view.cx), y: Math.floor(view.cy) } : null)

  const draftArrow = draft && (draft.a[0] !== draft.b[0] || draft.a[1] !== draft.b[1])
    ? { id: '__draft', type: 'arrow', a: draft.a, b: draft.b, width: 1.6, color: toolOpts.color, alliance: toolOpts.alliance }
    : null

  return (
    <div
      ref={wrapRef}
      className={`wp-map tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHover(null)}
    >
      <canvas ref={canvasRef} />
      {view && size.W > 0 && (
        <svg ref={svgRef} width={size.W} height={size.H} viewBox={`0 0 ${size.W} ${size.H}`}>
          {city && (
            <g data-noexport="" pointerEvents="none">
              {city.nearBy.map((id) => map.byId.get(id)).filter(Boolean).map((n) => {
                const [ax, ay] = P(city.x - city.size / 2 + 0.5, city.y - city.size / 2 + 0.5)
                const [bx, by] = P(n.x - n.size / 2 + 0.5, n.y - n.size / 2 + 0.5)
                return <line key={n.id} x1={ax} y1={ay} x2={bx} y2={by} stroke="#fbbf24"
                             strokeWidth="2" strokeDasharray="5 4" strokeOpacity="0.9" />
              })}
            </g>
          )}
          <g pointerEvents={tool === 'select' ? 'auto' : 'none'}>
            <Cities map={map} board={board} holders={holders} P={P} z={z} W={size.W} H={size.H}
                    colorOf={colorOf} allianceOf={allianceOf} selectedCity={selectedCity} />
          </g>
          <g pointerEvents={tool === 'select' ? 'auto' : 'none'}>
            <Items items={items} P={P} z={z} colorOf={itemColor} />
            {draftArrow && <Items items={[draftArrow]} P={P} z={z} colorOf={itemColor} />}
          </g>
          {city && (() => {
            const fp = footprint(city)
            const [x0, y0] = P(fp[0], fp[3])
            const s = Math.max(city.size * z, 12) + 10
            const cx = x0 + (city.size * z) / 2; const cy = y0 + (city.size * z) / 2
            return (
              <g data-noexport="" pointerEvents="none">
                <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx="4" fill="none"
                      stroke="#ffffff" strokeWidth="5" />
                <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx="4" fill="none"
                      stroke="#f59e0b" strokeWidth="2.5" />
              </g>
            )
          })()}
          {sel && (() => {
            const [bx0, by0, bx1, by1] = bounds(sel, P, z)
            const pad = 6
            return (
              <g data-noexport="">
                <rect x={bx0 - pad} y={by0 - pad} width={bx1 - bx0 + pad * 2} height={by1 - by0 + pad * 2}
                      fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5 4" pointerEvents="none" />
                {editable && sel.type === 'arrow' && Object.entries(arrowHandles(sel, P)).map(([k, [hx, hy]]) => (
                  <g key={k} data-handle={k}>
                    <circle cx={hx} cy={hy} r="16" fill="transparent" />
                    <circle cx={hx} cy={hy} r={k === 'c' ? 6 : 7} fill={k === 'c' ? '#ffffff' : '#f59e0b'}
                            stroke={k === 'c' ? '#f59e0b' : '#ffffff'} strokeWidth="2.5" />
                  </g>
                ))}
                {editable && sel.type === 'note' && (
                  <g data-handle="wh">
                    <rect x={bx1 - 10} y={by1 - 10} width="26" height="26" fill="transparent" />
                    <rect x={bx1 - 5} y={by1 - 5} width="11" height="11" rx="2" fill="#f59e0b"
                          stroke="#ffffff" strokeWidth="2" />
                  </g>
                )}
              </g>
            )
          })()}
        </svg>
      )}
      <div className="wp-readout" aria-live="off">{readout ? coords(readout.x, readout.y) : ''}</div>
      <div className="wp-zoom">
        <button type="button" className="wp-zbtn" aria-label="Zoom in"
                onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomAt(1.6, size.W / 2, size.H / 2)}>+</button>
        <button type="button" className="wp-zbtn" aria-label="Zoom out"
                onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomAt(1 / 1.6, size.W / 2, size.H / 2)}>−</button>
        <button type="button" className="wp-zbtn" aria-label="Whole map" title="Whole map"
                onPointerDown={(e) => e.stopPropagation()} onClick={() => setView(fitView(size.W, size.H))}>⤢</button>
      </div>
    </div>
  )
})

export default WarMap
