import { boxOf } from './geometry.js'

/**
 * Drawing the temple ground on a canvas: the same picture on screen and in the
 * downloaded PNG, which adds a title and the list of coordinates beside it.
 *
 * Tile (x, y) is drawn with X to the right and Y upward, so the zone's top edge
 * (Y933) is at the top of the picture.
 */

export const TILE = 20          // CSS pixels per tile on screen
const AXIS = 30                 // room for the coordinate labels round the map

const C = {
  ground: '#ece8dd',
  grid: 'rgba(60, 50, 30, 0.10)',
  grid5: 'rgba(60, 50, 30, 0.28)',
  axis: '#57534e',
  zone: 'rgba(220, 38, 38, 0.10)',
  zoneLine: '#b91c1c',
  temple: '#a16207',
  turret: '#3f3f46',
  shelter: '#2563eb',
  shelterText: '#ffffff',
  picked: '#f59e0b',
  ok: 'rgba(22, 163, 74, 0.55)',
  bad: 'rgba(220, 38, 38, 0.55)',
  mark: '#7c3aed',
  ink: '#1c1917',
  muted: '#57534e',
}

const font = (px, weight = 600) =>
  `${weight} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans KR", "Noto Sans JP", sans-serif`

/** Where the map sits on the canvas, and how to go between tiles and pixels. */
export function frameOf(view, tile = TILE, at = { left: 0, top: 0 }) {
  const cols = view.x1 - view.x0 + 1
  const rows = view.y1 - view.y0 + 1
  const left = at.left + AXIS
  const top = at.top + AXIS
  return {
    tile, cols, rows, left, top,
    width: cols * tile + AXIS * 2,
    height: rows * tile + AXIS * 2,
    // the top-left pixel of a tile
    px: (x) => left + (x - view.x0) * tile,
    py: (y) => top + (view.y1 - y) * tile,
    // the tile under a pixel, or null off the map
    tileAt(cx, cy) {
      const x = view.x0 + Math.floor((cx - left) / tile)
      const y = view.y1 - Math.floor((cy - top) / tile)
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) return null
      return { x, y }
    },
  }
}

function boxRect(f, b) {
  return { x: f.px(b.x0), y: f.py(b.y1), w: (b.x1 - b.x0 + 1) * f.tile, h: (b.y1 - b.y0 + 1) * f.tile }
}

/**
 * A name in a shelter: one line if it fits at a readable size, else broken over
 * two (at a space when there is one), else shrunk and cut short.
 */
function nameLines(ctx, text, maxW) {
  const one = fitText(ctx, text, maxW, 12, 10)
  if (!one.text.endsWith('…') || one.text === text) return { text: [one.text], size: one.size }
  const chars = [...text]
  let best = null
  for (let i = 1; i < chars.length; i += 1) {
    const a = chars.slice(0, i).join('').trim()
    const b = chars.slice(i).join('').trim()
    if (!a || !b) continue
    ctx.font = font(10, 700)
    const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width)
    const space = chars[i] === ' ' || chars[i - 1] === ' '
    const score = w - (space ? 8 : 0)
    if (!best || score < best.score) best = { a, b, w, score }
  }
  if (best && best.w <= maxW) return { text: [best.a, best.b], size: 10 }
  const small = fitText(ctx, text, maxW, 9.5, 8)
  return { text: [small.text], size: small.size }
}

/** Text in a box: shrinks down to `min` px, then ends in an ellipsis. */
function fitText(ctx, text, maxW, size, min, weight = 700) {
  for (let s = size; s >= min; s -= 0.5) {
    ctx.font = font(s, weight)
    if (ctx.measureText(text).width <= maxW) return { text, size: s }
  }
  ctx.font = font(min, weight)
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return { text: `${t}…`, size: min }
}

function label(ctx, text, x, y, color, size, weight = 700, align = 'center') {
  ctx.font = font(size, weight)
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

/**
 * Paint the map into `ctx` (already scaled to CSS pixels).
 * `state`: { temple, view, placed: [{ key, name, x, y, sub, color, vote, voteColor, anchor }], selected,
 *            preview: { x, y, ok }, hover: { x, y } }
 */
export function paintMap(ctx, f, state) {
  const { temple, view, placed = [], selected, preview, hover } = state
  const T = f.tile
  const W = f.cols * T
  const H = f.rows * T

  ctx.fillStyle = C.ground
  ctx.fillRect(f.left, f.top, W, H)

  // the zone
  const z = boxRect(f, temple.zone)
  ctx.fillStyle = C.zone
  ctx.fillRect(z.x, z.y, z.w, z.h)

  // grid, with every fifth line stronger
  for (let x = view.x0; x <= view.x1 + 1; x += 1) {
    ctx.strokeStyle = x % 5 === 0 ? C.grid5 : C.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(f.px(x) + 0.5, f.top)
    ctx.lineTo(f.px(x) + 0.5, f.top + H)
    ctx.stroke()
  }
  for (let y = view.y0 - 1; y <= view.y1; y += 1) {
    ctx.strokeStyle = (y + 1) % 5 === 0 ? C.grid5 : C.grid
    ctx.beginPath()
    ctx.moveTo(f.left, f.py(y) + 0.5)
    ctx.lineTo(f.left + W, f.py(y) + 0.5)
    ctx.stroke()
  }

  // zone border
  ctx.setLineDash([6, 4])
  ctx.strokeStyle = C.zoneLine
  ctx.lineWidth = 2
  ctx.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2)
  ctx.setLineDash([])
  label(ctx, 'NO TELEPORT', z.x + 8, z.y + T * 0.8, C.zoneLine, 11, 800, 'left')

  // temple and turrets
  const tb = boxRect(f, boxOf(temple.temple.x, temple.temple.y, temple.temple.size))
  ctx.fillStyle = C.temple
  ctx.fillRect(tb.x + 1, tb.y + 1, tb.w - 2, tb.h - 2)
  ctx.save()
  ctx.fillStyle = '#fff7ed'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(13, 800)
  ctx.fillText('Temple', tb.x + tb.w / 2, tb.y + tb.h / 2 - 8)
  ctx.font = font(11, 600)
  ctx.fillText(`${temple.temple.at[0]}, ${temple.temple.at[1]}`, tb.x + tb.w / 2, tb.y + tb.h / 2 + 9)
  // the white halo `label` draws reads badly on the dark blocks; plain text there
  for (const t of temple.turrets) {
    const r = boxRect(f, t.box)
    ctx.fillStyle = C.turret
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
    ctx.fillStyle = '#fafafa'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = font(11, 800)
    ctx.fillText(t.name.replace('Turret ', 'T'), r.x + r.w / 2, r.y + r.h / 2 - 6)
    ctx.font = font(9, 600)
    ctx.fillText(`${t.at[0]},${t.at[1]}`, r.x + r.w / 2, r.y + r.h / 2 + 8)
  }
  ctx.restore()

  // pass markers, where they fall on the map
  for (const m of temple.marks || []) {
    const [mx, my] = m.at
    if (mx < view.x0 || mx > view.x1 || my < view.y0 || my > view.y1) continue
    const cx = f.px(mx) + T / 2
    const cy = f.py(my) + T / 2
    ctx.fillStyle = C.mark
    ctx.beginPath()
    ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 7, cy)
    ctx.closePath()
    ctx.fill()
    label(ctx, `${m.name} (${mx}, ${my})`, cx, cy - 15, C.mark, 10, 700)
  }

  // shelters
  for (const p of placed) {
    const r = boxRect(f, boxOf(p.x, p.y))
    const isSel = selected && p.key === selected
    ctx.fillStyle = p.color || C.shelter
    ctx.beginPath()
    ctx.roundRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 4)
    ctx.fill()
    if (isSel) {
      ctx.strokeStyle = C.picked
      ctx.lineWidth = 3
      ctx.stroke()
    }
    ctx.fillStyle = C.shelterText
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lines = nameLines(ctx, p.name, r.w - 6)
    const cy = r.y + r.h / 2
    const lh = lines.size + 1
    const subH = p.sub ? 11 : 0
    let y0 = cy - ((lines.text.length - 1) * lh + subH) / 2
    ctx.font = font(lines.size, 700)
    for (const t of lines.text) { ctx.fillText(t, r.x + r.w / 2, y0); y0 += lh }
    if (p.sub) {
      ctx.font = font(9, 500)
      ctx.globalAlpha = 0.85
      ctx.fillText(p.sub, r.x + r.w / 2, y0 - lh / 2 + 6 + subH / 2)
      ctx.globalAlpha = 1
    }
    // the anchor's star, top left; the vote, top right
    if (p.anchor) {
      ctx.font = font(12, 800)
      ctx.fillStyle = '#fde047'
      ctx.fillText('★', r.x + 8, r.y + 9)
    }
    if (p.vote) {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(r.x + r.w - 8, r.y + 8, 6.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = p.voteColor || C.ink
      ctx.beginPath()
      ctx.arc(r.x + r.w - 8, r.y + 8, 5.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = font(8, 800)
      ctx.fillText(String(p.vote), r.x + r.w - 8, r.y + 8.5)
    }
  }

  // where a drag would land
  if (preview) {
    const r = boxRect(f, boxOf(preview.x, preview.y))
    ctx.fillStyle = preview.ok ? C.ok : C.bad
    ctx.fillRect(r.x, r.y, r.w, r.h)
  } else if (hover) {
    const r = boxRect(f, boxOf(hover.x, hover.y, 1))
    ctx.strokeStyle = 'rgba(28, 25, 23, 0.55)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5)
  }

  // coordinates round the edge, every fifth tile
  ctx.fillStyle = C.axis
  ctx.font = font(10, 600)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let x = view.x0; x <= view.x1; x += 1) {
    if (x % 5) continue
    const cx = f.px(x) + T / 2
    ctx.fillText(String(x), cx, f.top - 12)
    ctx.fillText(String(x), cx, f.top + H + 12)
  }
  for (let y = view.y0; y <= view.y1; y += 1) {
    if (y % 5) continue
    const cy = f.py(y) + T / 2
    ctx.textAlign = 'right'
    ctx.fillText(String(y), f.left - 4, cy)
    ctx.textAlign = 'left'
    ctx.fillText(String(y), f.left + W + 4, cy)
  }
  ctx.font = font(10, 800)
  ctx.textAlign = 'left'
  ctx.fillText('X →', f.left, f.top - 24 + 4)
  ctx.textAlign = 'right'
  ctx.fillText('Y ↑', f.left - 4, f.top - 12 - 12)
}

/** Size a canvas for a frame at device resolution, and paint the map into it. */
export function drawScreen(canvas, view, state, scale = window.devicePixelRatio || 1) {
  const f = frameOf(view)
  canvas.width = Math.round(f.width * scale)
  canvas.height = Math.round(f.height * scale)
  canvas.style.aspectRatio = `${f.width} / ${f.height}`
  const ctx = canvas.getContext('2d')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = '#f5f3ee'
  ctx.fillRect(0, 0, f.width, f.height)
  paintMap(ctx, f, state)
  return f
}

/**
 * The PNG to download: a title, the map, and every placed shelter's coordinate
 * by group (Temple, Turret 1, Turret 2, then the rest), anchor first and then
 * nearest the anchor, so members can read off where to teleport.
 */
export function drawExport(view, state, { title, subtitle, groups: kinds = [], options = [] }) {
  const scale = 2
  const listW = 300
  const head = 64
  const f0 = frameOf(view)
  const rowH = 18
  const named = new Set(kinds.map((k) => k.name))
  const groups = [...kinds.map((k) => ({ name: k.name, color: k.color })), { name: 'No group', color: null }]
    .map((g) => {
      const rows = state.placed.filter((p) => (g.color ? p.group === g.name : !named.has(p.group)))
      const a = rows.find((p) => p.anchor)
      const d = (p) => (a ? Math.hypot(p.x - a.x, p.y - a.y) : -p.y * 1000 + p.x)
      return { ...g, rows: rows.sort((p, q) => Number(q.anchor) - Number(p.anchor) || d(p) - d(q)) }
    })
    .filter((g) => g.rows.length)
  const legend = options.length ? 24 + options.length * rowH : 0
  const listH = groups.reduce((n, g) => n + 30 + g.rows.length * rowH, 0) + 20 + legend
  const width = f0.width + 16 + listW
  const height = head + Math.max(f0.height, listH) + 12

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = '#f5f3ee'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = C.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = font(20, 800)
  ctx.fillText(title, 16, 30)
  ctx.font = font(12, 500)
  ctx.fillStyle = C.muted
  ctx.fillText(subtitle, 16, 50)

  const f = frameOf(view, TILE, { left: 0, top: head })
  paintMap(ctx, f, { ...state, selected: null, preview: null, hover: null })

  let y = head + 24
  const x = f0.width + 16
  ctx.textAlign = 'left'
  for (const g of groups) {
    ctx.fillStyle = g.color || C.ink
    ctx.font = font(13, 800)
    ctx.fillText(`${g.name} · ${g.rows.length}`, x, y)
    y += 18
    for (const p of g.rows) {
      ctx.fillStyle = p.color || C.shelter
      ctx.fillRect(x, y - 9, 10, 10)
      if (p.vote) {
        ctx.fillStyle = p.voteColor || C.ink
        ctx.beginPath()
        ctx.arc(x + 22, y - 4, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = font(8, 800)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(p.vote), x + 22, y - 3.5)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
      }
      ctx.fillStyle = C.ink
      ctx.font = font(12, 600)
      const label = `${p.anchor ? '★ ' : ''}${p.name}`
      const nm = fitText(ctx, label, listW - 124, 12, 9, 600)
      ctx.font = font(nm.size, 600)
      ctx.fillText(nm.text, x + 32, y)
      ctx.font = font(12, 700)
      ctx.textAlign = 'right'
      ctx.fillText(`X${p.x} Y${p.y}`, x + listW - 12, y)
      ctx.textAlign = 'left'
      y += rowH
    }
    y += 12
  }
  if (!groups.length) {
    ctx.fillStyle = C.muted
    ctx.font = font(12, 500)
    ctx.fillText('No shelters placed yet.', x, y)
    y += 24
  }
  if (options.length) {
    ctx.fillStyle = C.ink
    ctx.font = font(13, 800)
    ctx.fillText('Poll', x, y)
    y += 18
    options.forEach((o, i) => {
      ctx.fillStyle = state.voteColors?.[i] || C.ink
      ctx.beginPath()
      ctx.arc(x + 6, y - 4, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = font(8, 800)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), x + 6, y - 3.5)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = C.ink
      ctx.font = font(12, 500)
      ctx.fillText(o, x + 18, y)
      y += rowH
    })
  }
  return canvas
}
