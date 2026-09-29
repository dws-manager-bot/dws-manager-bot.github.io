import { inkOn, darker } from './palette.js'

/**
 * The drawings on a scenario: arrows, pins, stickers, notes and stamps.
 *
 * Every item keeps its geometry in tiles, in the game's coordinates, so it
 * stays on the ground it was drawn on at any zoom. Pins stay one size on
 * screen, like a map pin; everything else grows and shrinks with the map.
 *
 * All styling is inline attributes rather than CSS classes, because the PNG
 * export serializes this SVG on its own and a stylesheet does not go with it.
 */

export const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export const STICKERS = {
  star: 'Star',
  target: "Bull's-eye",
  swords: 'Attack',
  shield: 'Defend',
  flag: 'Rally',
  warning: 'Warning',
  heart: 'Heart',
  skull: 'Danger',
  cross: 'Avoid',
  check: 'Done',
}

export const STAMPS = { shelter: { size: 3, label: 'Shelter' }, portal: { size: 2, label: 'Portal' } }

/** A new note, in screen pixels: 12px text, and the range the size slider allows. */
export const NOTE = { font: 12, min: 8, max: 40, w: 220, h: 64 }

let seq = 0
export const newId = () => `${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** A new item of this kind at a tile (an arrow: between two), carrying the chosen color. */
export function makeItem(type, at, opts) {
  const base = { id: newId(), type, color: opts.color, alliance: opts.alliance ?? null }
  switch (type) {
    case 'arrow': return { ...base, a: at.a, b: at.b, ...(at.c ? { c: at.c } : {}), width: 1.6 }
    case 'route': return { ...base, points: at.points, width: 1.2 }
    case 'pin': return { ...base, x: at.x, y: at.y, label: '' }
    case 'sticker': return { ...base, x: at.x, y: at.y, symbol: opts.symbol || 'star', size: 14 }
    // Sized in screen pixels (`px`), like a callout pinned to its tile: the
    // text is the size picked at every zoom.
    case 'note': return {
      ...base, x: at.x, y: at.y, px: true, w: NOTE.w, h: NOTE.h, font: NOTE.font, text: '',
      opacity: 0.85, color: opts.noteColor || '#fef3c7',
    }
    case 'stamp': {
      const s = STAMPS[opts.stamp || 'shelter'].size
      // Anchored like a building: (x, y) is the far corner, the rest lies below-left.
      return { ...base, kind: opts.stamp || 'shelter', x: at.x, y: at.y, size: s }
    }
    default: return null
  }
}

/* ------------------------------------------------------------------ symbols */

const STAR = (() => {
  const p = []
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? 4.6 : 11.5
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    p.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r + 1).toFixed(2)}`)
  }
  return p.join(' ')
})()

/** One sticker, drawn in a 24-unit box centered on the origin. */
export function StickerSymbol({ symbol, color }) {
  const halo = { stroke: '#ffffff', strokeWidth: 3.2, strokeLinejoin: 'round', strokeLinecap: 'round' }
  const ink = inkOn(color)
  switch (symbol) {
    case 'star':
      return <polygon points={STAR} fill={color} {...halo} strokeWidth={2.2} paintOrder="stroke" />
    case 'heart':
      return <path d="M0,10 C-11,2 -12.5,-4.5 -8.5,-8.5 C-5.5,-11.5 -1.5,-10.5 0,-6.5 C1.5,-10.5 5.5,-11.5 8.5,-8.5 C12.5,-4.5 11,2 0,10 Z"
                   fill={color} {...halo} strokeWidth={2.2} paintOrder="stroke" />
    case 'target':
      return (
        <g>
          <circle r="11.5" fill="#ffffff" />
          <circle r="10" fill={color} />
          <circle r="6.6" fill="#ffffff" />
          <circle r="3.4" fill={color} />
        </g>
      )
    case 'swords':
      return (
        <g strokeLinecap="round" fill="none">
          <path d="M-9,9 L9,-9 M9,9 L-9,-9 M-9,3 L-3,9 M9,3 L3,9" stroke="#ffffff" strokeWidth="6" />
          <path d="M-9,9 L9,-9 M9,9 L-9,-9 M-9,3 L-3,9 M9,3 L3,9" stroke={color} strokeWidth="3.2" />
        </g>
      )
    case 'shield':
      return <path d="M0,-11.5 L9.5,-7.5 L9.5,0 C9.5,6 5.5,9.8 0,12 C-5.5,9.8 -9.5,6 -9.5,0 L-9.5,-7.5 Z"
                   fill={color} {...halo} strokeWidth={2.2} paintOrder="stroke" />
    case 'flag':
      return (
        <g>
          <path d="M-7,11.5 L-7,-11.5" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
          <path d="M-7,-10.5 L10,-5.5 L-7,-0.5 Z" fill={color} {...halo} strokeWidth={2.2} paintOrder="stroke" />
          <path d="M-7,11.5 L-7,-11.5" stroke={darker(color, 0.5)} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )
    case 'warning':
      return (
        <g>
          <path d="M0,-11 L11.5,9.5 L-11.5,9.5 Z" fill={color} {...halo} strokeWidth={2.4} paintOrder="stroke" />
          <path d="M0,-3.5 L0,3" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
          <circle cy="6.4" r="1.5" fill={ink} />
        </g>
      )
    case 'skull':
      return (
        <g>
          <path d="M-9.5,-1 C-9.5,-7.5 -5,-11 0,-11 C5,-11 9.5,-7.5 9.5,-1 C9.5,2.5 7.5,4 6,5 L6,10 L-6,10 L-6,5 C-7.5,4 -9.5,2.5 -9.5,-1 Z"
                fill={color} {...halo} strokeWidth={2.2} paintOrder="stroke" />
          <circle cx="-3.8" cy="-1" r="2.6" fill={ink} />
          <circle cx="3.8" cy="-1" r="2.6" fill={ink} />
          <path d="M-2,7 L-2,10 M2,7 L2,10" stroke={ink} strokeWidth="1.4" />
        </g>
      )
    case 'cross':
      return (
        <g strokeLinecap="round">
          <path d="M-8.5,-8.5 L8.5,8.5 M8.5,-8.5 L-8.5,8.5" stroke="#ffffff" strokeWidth="8" />
          <path d="M-8.5,-8.5 L8.5,8.5 M8.5,-8.5 L-8.5,8.5" stroke={color} strokeWidth="4.4" />
        </g>
      )
    case 'check':
      return (
        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M-9.5,0.5 L-3,7 L9.5,-7.5" stroke="#ffffff" strokeWidth="8" />
          <path d="M-9.5,0.5 L-3,7 L9.5,-7.5" stroke={color} strokeWidth="4.4" />
        </g>
      )
    default:
      return <circle r="9" fill={color} />
  }
}

/* --------------------------------------------------------------- text wrap */

let measurer = null
function measure(text, px) {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d')
  measurer.font = `500 ${px}px ${FONT}`
  return measurer.measureText(text).width
}

/** Word-wrapped lines that fit `width` px, cut off with an ellipsis at `maxLines`. */
export function wrap(text, width, px, maxLines) {
  const lines = []
  for (const para of String(text || '').split('\n')) {
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      const next = line + word
      if (measure(next, px) <= width || !line.trim()) {
        line = next
        // A single word wider than the box is broken by character.
        while (measure(line, px) > width && line.length > 1) {
          let cut = line.length - 1
          while (cut > 1 && measure(line.slice(0, cut), px) > width) cut -= 1
          lines.push(line.slice(0, cut)); line = line.slice(cut)
        }
      } else {
        lines.push(line.trimEnd()); line = word.trimStart()
      }
    }
    lines.push(line.trimEnd())
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, Math.max(1, maxLines))
    kept[kept.length - 1] = `${kept[kept.length - 1].replace(/\s*\S?$/, '')}…`
    return kept
  }
  return lines
}

/* ------------------------------------------------------------------ drawing */

/** Point of a tile's center on screen. */
const center = (P, x, y) => P(x + 0.5, y + 0.5)

function arrowPath(item, P) {
  const [ax, ay] = center(P, ...item.a)
  const [bx, by] = center(P, ...item.b)
  if (item.c) {
    const [qx, qy] = center(P, ...item.c)
    // The handle sits on the curve at its middle; the control point that puts
    // it there is twice as far out.
    const cx = 2 * qx - (ax + bx) / 2
    const cy = 2 * qy - (ay + by) / 2
    return { d: `M${ax},${ay} Q${cx},${cy} ${bx},${by}`, tail: [cx, cy], a: [ax, ay], b: [bx, by] }
  }
  return { d: `M${ax},${ay} L${bx},${by}`, tail: [ax, ay], a: [ax, ay], b: [bx, by] }
}

export function strokeWidth(item, z) {
  return Math.max(2.5, Math.min(16, (item.width || 1.6) * z))
}

function head([tx, ty], [bx, by], w) {
  const ang = Math.atan2(by - ty, bx - tx)
  const len = w * 3.4 + 4
  const spread = 0.46
  const p1 = [bx - len * Math.cos(ang - spread), by - len * Math.sin(ang - spread)]
  const p2 = [bx - len * Math.cos(ang + spread), by - len * Math.sin(ang + spread)]
  return `${bx},${by} ${p1.join(',')} ${p2.join(',')}`
}

function Arrow({ item, P, z, color }) {
  const { d, tail, a, b } = arrowPath(item, P)
  const w = strokeWidth(item, z)
  const dash = item.dash ? `${w * 2.2} ${w * 1.6}` : undefined
  const heads = [head(tail, b, w)]
  if (item.both) {
    const t2 = item.c ? tail : b
    heads.push(head(t2, a, w))
  }
  return (
    <g data-item={item.id}>
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth={w + 3.5}
            strokeLinecap="round" strokeDasharray={dash} />
      {heads.map((h) => <polygon key={h} points={h} fill="#ffffff" stroke="#ffffff"
                                 strokeWidth="3.5" strokeLinejoin="round" />)}
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round"
            strokeDasharray={dash} />
      {heads.map((h) => <polygon key={`c${h}`} points={h} fill={color} />)}
      {/* A wide invisible stroke, so a thin arrow is still easy to tap. */}
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(22, w + 12)} />
    </g>
  )
}

/**
 * A waypoint route, like PUBG's map markers: numbered stops joined in order.
 * The stops stay one size on screen, like pins; the line follows the map.
 */
export function Route({ item, P, z, color, draft }) {
  const pts = item.points.map(([x, y]) => center(P, x, y))
  if (!pts.length) return null
  const w = Math.max(2, Math.min(10, (item.width || 1.2) * z))
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')
  const dash = item.dash ? `${w * 2.2} ${w * 1.8}` : undefined
  const ink = inkOn(color)
  const last = pts.length - 1
  return (
    <g data-item={draft ? undefined : item.id}>
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth={w + 3.5}
            strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dash} />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinejoin="round"
            strokeLinecap="round" strokeDasharray={dash} />
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(20, w + 12)} />
      {pts.map(([x, y], i) => {
        const r = i === last && !draft ? 11 : 9
        return (
          <g key={i} transform={`translate(${x},${y})`}>
            {i === last && !draft && <circle r={r + 4} fill="none" stroke={color} strokeWidth="2" />}
            <circle r={r} fill={color} stroke="#ffffff" strokeWidth="2.2" />
            <text y="4" textAnchor="middle" fontFamily={FONT} fontSize={i >= 9 ? 9.5 : 11}
                  fontWeight="700" fill={ink}>{i + 1}</text>
          </g>
        )
      })}
    </g>
  )
}

function Pin({ item, P, color }) {
  const [x, y] = center(P, item.x, item.y)
  const ink = inkOn(color)
  return (
    <g data-item={item.id} transform={`translate(${x},${y})`}>
      <path d="M0,0 C-3,-8 -11,-13 -11,-21 A11,11 0 1 1 11,-21 C11,-13 3,-8 0,0 Z"
            fill={color} stroke="#ffffff" strokeWidth="2.2" />
      <circle cy="-21" r="4.2" fill={ink} />
      {item.label && (
        <text x="14" y="-17" fontFamily={FONT} fontSize="13" fontWeight="600" fill="#18181b"
              stroke="#ffffff" strokeWidth="3.5" strokeLinejoin="round" paintOrder="stroke">
          {item.label}
        </text>
      )}
    </g>
  )
}

export function stickerPx(item, z) {
  return Math.max(20, Math.min(180, (item.size || 14) * z))
}

function Sticker({ item, P, z, color }) {
  const [x, y] = center(P, item.x, item.y)
  const s = stickerPx(item, z) / 24
  return (
    <g data-item={item.id} transform={`translate(${x},${y}) scale(${s})`}>
      <circle r="13" fill="transparent" />
      <StickerSymbol symbol={item.symbol} color={color} />
    </g>
  )
}

/**
 * Where a note sits on screen and what it shows. A pixel note (`px`) keeps its
 * size at every zoom and grows downward to fit its text, so a larger font
 * never cuts the text off. A note from before that kept its size in tiles,
 * growing and shrinking with the map, and still draws that way until its text
 * size is changed.
 */
export function noteBox(item, P, z) {
  const [x, y] = P(item.x, item.y + 1)          // top-left corner of the note
  if (item.px) {
    const font = item.font || NOTE.font
    const pad = Math.max(6, font * 0.5)
    const w = item.w || NOTE.w
    const lines = wrap(item.text || 'Note', w - pad * 2, font, 200)
    const h = Math.max(item.h || NOTE.h, pad * 2 + lines.length * font * 1.3)
    return { x, y, w, h, font, pad, lines, legible: true }
  }
  const w = item.w * z
  const h = item.h * z
  const font = (item.font || 4) * z
  const pad = Math.max(3, font * 0.45)
  const legible = font >= 6.5
  const lines = legible ? wrap(item.text, w - pad * 2, font, Math.max(1, Math.floor((h - pad * 2) / (font * 1.25)))) : []
  return { x, y, w, h, font, pad, lines, legible }
}

function Note({ item, P, z }) {
  const { x, y, w, h, font: px, pad, lines: all, legible } = noteBox(item, P, z)
  const ink = inkOn(item.color)
  const lines = item.text ? all : []
  const step = item.px ? 1.3 : 1.25
  return (
    <g data-item={item.id}>
      <rect x={x} y={y} width={w} height={h} rx={Math.min(6, px * 0.5)}
            fill={item.color} fillOpacity={item.opacity ?? 0.85}
            stroke={darker(item.color, 0.7)} strokeOpacity={Math.min(1, (item.opacity ?? 0.85) + 0.15)}
            strokeWidth="1.2" />
      {lines.map((line, i) => (
        <text key={i} x={x + pad} y={y + pad + px * (i + 0.9) * step - px * 0.25}
              fontFamily={FONT} fontSize={px} fontWeight="500" fill={ink}>
          {line}
        </text>
      ))}
      {legible && !item.text && (
        <text x={x + pad} y={y + pad + px} fontFamily={FONT} fontSize={px} fill={ink} fillOpacity="0.45">
          Note
        </text>
      )}
    </g>
  )
}

function Stamp({ item, P, z, color }) {
  const s = STAMPS[item.kind]?.size || item.size || 3
  const [x0, y0] = P(item.x - s + 1, item.y + 1)
  const px = s * z
  return (
    <g data-item={item.id}>
      <rect x={x0} y={y0} width={Math.max(px, 4)} height={Math.max(px, 4)}
            fill={color} fillOpacity="0.85" stroke={darker(color)} strokeWidth={Math.max(1, z * 0.12)} />
      {px >= 16 && (
        <text x={x0 + px / 2} y={y0 + px / 2 + px * 0.16} textAnchor="middle" fontFamily={FONT}
              fontSize={px * 0.44} fontWeight="700" fill={inkOn(color)}>
          {item.kind === 'portal' ? 'P' : 'S'}
        </text>
      )}
    </g>
  )
}

const ORDER = { note: 0, stamp: 1, arrow: 2, route: 3, sticker: 4, pin: 5 }

/** Every item, bottom to top: notes under everything, pins over everything. */
export function Items({ items, P, z, colorOf }) {
  const sorted = [...items].sort((a, b) => ORDER[a.type] - ORDER[b.type])
  return sorted.map((item) => {
    const color = colorOf(item)
    switch (item.type) {
      case 'arrow': return <Arrow key={item.id} item={item} P={P} z={z} color={color} />
      case 'pin': return <Pin key={item.id} item={item} P={P} color={color} />
      case 'route': return <Route key={item.id} item={item} P={P} z={z} color={color} />
      case 'sticker': return <Sticker key={item.id} item={item} P={P} z={z} color={color} />
      case 'note': return <Note key={item.id} item={item} P={P} z={z} />
      case 'stamp': return <Stamp key={item.id} item={item} P={P} z={z} color={color} />
      default: return null
    }
  })
}

/** The screen box around an item, for its selection outline. */
export function bounds(item, P, z) {
  switch (item.type) {
    case 'arrow': {
      const pts = [item.a, item.b, item.c].filter(Boolean).map(([x, y]) => center(P, x, y))
      const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1])
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    }
    case 'pin': {
      const [x, y] = center(P, item.x, item.y)
      return [x - 12, y - 33, x + 12, y + 1]
    }
    case 'route': {
      const pts = item.points.map(([x, y]) => center(P, x, y))
      const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1])
      return [Math.min(...xs) - 11, Math.min(...ys) - 11, Math.max(...xs) + 11, Math.max(...ys) + 11]
    }
    case 'sticker': {
      const [x, y] = center(P, item.x, item.y)
      const r = stickerPx(item, z) / 2
      return [x - r, y - r, x + r, y + r]
    }
    case 'note': {
      const { x, y, w, h } = noteBox(item, P, z)
      return [x, y, x + w, y + h]
    }
    case 'stamp': {
      const s = STAMPS[item.kind]?.size || 3
      const [x, y] = P(item.x - s + 1, item.y + 1)
      return [x, y, x + s * z, y + s * z]
    }
    default: return [0, 0, 0, 0]
  }
}

/** Where an arrow's handles sit on screen. */
export function arrowHandles(item, P) {
  const out = { a: center(P, ...item.a), b: center(P, ...item.b) }
  out.c = item.c
    ? center(P, ...item.c)
    : [(out.a[0] + out.b[0]) / 2, (out.a[1] + out.b[1]) / 2]
  return out
}

/** Where a route's waypoints sit on screen, as handles p0, p1, … */
export function routeHandles(item, P) {
  return Object.fromEntries(item.points.map(([x, y], i) => [`p${i}`, center(P, x, y)]))
}

/** Move an item by whole tiles. */
export function shifted(item, dx, dy) {
  const mv = ([x, y]) => [x + dx, y + dy]
  if (item.type === 'arrow') {
    return { ...item, a: mv(item.a), b: mv(item.b), ...(item.c ? { c: mv(item.c) } : {}) }
  }
  if (item.type === 'route') return { ...item, points: item.points.map(mv) }
  return { ...item, x: item.x + dx, y: item.y + dy }
}

export const ITEM_LABEL = {
  arrow: 'Arrow', pin: 'Pin', route: 'Waypoint route', sticker: 'Sticker', note: 'Note', stamp: 'Stamp',
}
