/*
 * Drawing a laid-out hive onto a canvas: shelters colored by Industry level,
 * names and CP on each, Frankenstein's picture at the center, stick groups
 * outlined in their own colors, and a title and legend round the edge.
 *
 * The look is pou-rocks.github.io's, kept to the pixel, so an exported PNG is
 * the one the alliance has been sharing. The canvas is drawn at twice its CSS
 * size so it stays sharp on a phone and in the download.
 */
import {
  FRANKENSTEIN, LEGEND_HEIGHT, MARGIN, RALLY_SURE, RALLY_TILES, SHELTER, TILE, applySwaps, frame, keyOf, layoutHive,
  rallyReach, restorePlacement, rotateLayout, round1, spareInRange, tilesFromFrankenstein,
} from './layout.js'

export const SCALE = 2
const BACKGROUND = '#f5f3ee'
const INK = '#282828'
const FONT_STACK =
  '"Arial Unicode MS","PingFang SC","Hiragino Sans","Hiragino Kaku Gothic Pro","Apple SD Gothic Neo","Malgun Gothic","Microsoft YaHei","Noto Sans CJK SC",sans-serif'
const font = (px, weight) => `${weight ? `${weight} ` : ''}${px}px ${FONT_STACK}`

// Industry Lv 1 (deep blue) to 8 (red), interpolated through these.
const LEVEL_STOPS = [[30, 60, 150], [40, 160, 200], [70, 190, 110], [240, 210, 60], [210, 80, 50]]
const TOP_LEVEL = 8
const GROUP_COLORS = [
  [225, 25, 225], [20, 130, 255], [255, 130, 0], [20, 180, 70], [210, 40, 40],
  [150, 60, 220], [0, 175, 175], [190, 150, 0], [255, 80, 150], [110, 110, 110],
]

/** The words on the canvas, in English; a page passes its reader's. */
export const ENGLISH_LABELS = {
  title: 'PoU Hive Map',
  shelters: 'shelters',
  frankenstein: 'Frankenstein',
  industryLv: 'Industry Lv',
  lv: 'Lv',
  oneTile: '1 tile',
  shelter3x3: 'shelter 3×3',
  lane: 'lane',
  tiles: 'tiles',
  gapEvery2: '1-tile gap every 2 shelters',
  frank1: 'FRANKEN',
  frank2: 'STEIN',
  shapeName: 'Square',
}

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`

function levelColor(fraction) {
  const at = Math.max(0, Math.min(1, fraction)) * (LEVEL_STOPS.length - 1)
  const i = Math.floor(at)
  const f = at - i
  if (i >= LEVEL_STOPS.length - 1) return LEVEL_STOPS[LEVEL_STOPS.length - 1]
  const a = LEVEL_STOPS[i]
  const b = LEVEL_STOPS[i + 1]
  return [0, 1, 2].map((k) => Math.round(a[k] * (1 - f) + b[k] * f))
}

const colorOfLevel = (level) => levelColor((level - 1) / (TOP_LEVEL - 1))

/** Dark text on a light fill, light on a dark one. */
function inkOn(fill) {
  return 0.299 * fill[0] + 0.587 * fill[1] + 0.114 * fill[2] > 140 ? 'rgb(25,25,25)' : 'rgb(250,250,250)'
}

/** CP as the canvas writes it: 1.69G, 292M, 12K. */
export function shortCp(value) {
  const v = Number(value)
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}G`
  if (v >= 1e6) return `${Math.round(v / 1e6)}M`
  if (v >= 1e3) return `${Math.round(v / 1e3)}K`
  return String(Math.round(v))
}

/** The largest size from 16 px down to 8 at which a name fits; past that, cut short. */
function fitName(ctx, name, width) {
  for (let px = 16; px >= 8; px -= 1) {
    ctx.font = font(px)
    if (ctx.measureText(name).width <= width) return [px, name]
  }
  ctx.font = font(8)
  let cut = name
  while (cut && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return [8, `${cut}…`]
}

/**
 * Lays out `members` and draws them on `canvas`, sized to fit. Options:
 * version (1–9), showGroups, spreadTop, spreadIndustry, ts (the stamp under
 * the title), labels (see ENGLISH_LABELS), direction, the labels' ('rtl'
 * for Arabic), placement (a saved map's cells by player id, which replace
 * the layout's own: see restorePlacement), swaps, pairs of member ids an
 * admin traded by hand, and rotation (0, 90, 180 or 270, clockwise about
 * Frankenstein), and range, which draws Frankenstein's rally range over it:
 * each shelter's distance, the spare places still in range and the circles
 * (for the admin's eyes; Apply draws without it). `picture` is
 * Frankenstein's, drawn once it has loaded.
 * Returns the layout, all of that applied, with `base`, the cells before the
 * turn (what Apply saves), and `restored` when a placement was given.
 */
export function drawHive(canvas, members, options, picture) {
  const layout = layoutHive(members, options)
  if (options.placement) layout.restored = restorePlacement(layout, members, options.placement)
  applySwaps(layout.memberCell, options.swaps)
  layout.base = new Map(layout.memberCell)
  rotateLayout(layout, options.rotation)
  if (options.range) {
    const spots = spareInRange(layout)
    const { farthest } = layout
    // Room for the spare places too; the farthest shelter is still a member's.
    Object.assign(layout, frame([...layout.memberCell.values(), ...spots.map((s) => s.cell)]), { farthest })
    layout.range = { spots, ...reachCounts(layout, members) }
  }
  canvas.width = SCALE * layout.W
  canvas.height = SCALE * layout.H
  const ctx = canvas.getContext('2d')
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
  paint(ctx, layout, members, options, picture)
  return layout
}

/** How many members are sure, likely and out of rally range. */
function reachCounts(layout, members) {
  const counts = { sure: 0, likely: 0, out: 0 }
  for (const m of members) counts[rallyReach(layout.memberCell.get(m.id))] += 1
  return { members: counts }
}

const REACH_INK = { sure: 'rgb(25,120,50)', likely: 'rgb(180,110,0)', out: 'rgb(200,30,30)' }
const REACH_FILL = { sure: 'rgba(46,160,67,0.22)', likely: 'rgba(230,160,20,0.22)' }

/* Under the shelters: the two circles and the spare places, each with its
   distance in tiles from its middle to Frankenstein's. */
function paintRangeUnder(ctx, layout) {
  const [fx, fy] = layout.toPx(0, 0)
  const half = SHELTER / 2 - 3
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.direction = 'ltr'
  for (const { cell, tiles, reach } of layout.range.spots) {
    const [x, y] = layout.toPx(...cell)
    ctx.fillStyle = REACH_FILL[reach]
    ctx.fillRect(x - half, y - half, 2 * half, 2 * half)
    ctx.strokeStyle = REACH_INK[reach]
    ctx.lineWidth = 2
    ctx.setLineDash(reach === 'sure' ? [] : [6, 4])
    ctx.strokeRect(x - half, y - half, 2 * half, 2 * half)
    ctx.fillStyle = REACH_INK[reach]
    ctx.font = font(15, 700)
    ctx.fillText(tiles.toFixed(1), x, y)
  }
  ctx.lineWidth = 2
  for (const [r, dash, reach] of [[RALLY_SURE, [], 'sure'], [RALLY_TILES, [10, 7], 'likely']]) {
    ctx.beginPath()
    ctx.setLineDash(dash)
    ctx.strokeStyle = REACH_INK[reach]
    ctx.arc(fx, fy, r * TILE, 0, 2 * Math.PI)
    ctx.stroke()
  }
  ctx.setLineDash([])
}

/* Over the shelters: each member's distance, in a tag in the top-left corner. */
function paintRangeOver(ctx, layout, members) {
  const half = SHELTER / 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.direction = 'ltr'
  ctx.font = font(10, 700)
  for (const m of members) {
    const cell = layout.memberCell.get(m.id)
    const [x, y] = layout.toPx(...cell)
    const text = tilesFromFrankenstein(cell).toFixed(1)
    const w = Math.ceil(ctx.measureText(text).width) + 6
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillRect(x - half + 2, y - half + 2, w, 12)
    ctx.fillStyle = REACH_INK[rallyReach(cell)]
    ctx.fillText(text, x - half + 5, y - half + 8.5)
  }
}

/* The key, on the stamp's line at the right. */
function paintRangeKey(ctx, layout) {
  const { spots, members } = layout.range
  const sure = spots.filter((s) => s.reach === 'sure').length
  const parts = [
    [`Rally range ${RALLY_TILES} tiles (march fixed at 3 s): `, 'rgb(90,90,90)'],
    [`■ sure ≤ ${RALLY_SURE.toFixed(1)}  `, REACH_INK.sure],
    [`■ likely ≤ ${RALLY_TILES}  `, REACH_INK.likely],
    members.out ? [`${members.out} out  `, REACH_INK.out] : null,
    [`· spare places: ${sure} sure, ${spots.length - sure} likely`, 'rgb(90,90,90)'],
  ].filter(Boolean)
  ctx.font = font(13)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.direction = 'ltr'
  let x = layout.W - MARGIN - parts.reduce((w, [t]) => w + ctx.measureText(t).width, 0)
  for (const [text, color] of parts) {
    ctx.fillStyle = color
    ctx.fillText(text, x, 58)
    x += ctx.measureText(text).width
  }
}

function paint(ctx, layout, members, options, picture) {
  const { version } = options
  const { memberCell, groups, W, H, minx, maxx, miny, maxy, toPx } = layout
  const label = { ...ENGLISH_LABELS, ...options.labels }
  // Names, numbers and the stamp read left to right in every language; only
  // the labels take the reader's direction. Drawn right to left, "• Crami"
  // came out as "Crami •".
  const readerDirection = options.direction || 'inherit'
  const half = SHELTER / 2
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  ctx.fillStyle = BACKGROUND
  ctx.fillRect(0, 0, W, H)
  if (layout.range) paintRangeUnder(ctx, layout)

  const shelters = []
  for (const m of members) {
    const [x, y] = toPx(...memberCell.get(m.id))
    const fill = m.level ? colorOfLevel(m.level) : [150, 150, 150]
    ctx.fillStyle = rgb(fill)
    ctx.fillRect(x - half, y - half, SHELTER, SHELTER)
    ctx.strokeStyle = 'rgb(255,255,255)'
    ctx.lineWidth = 2
    ctx.strokeRect(x - half, y - half, SHELTER, SHELTER)
    shelters.push([m, x, y, fill])
  }

  const [fx, fy] = toPx(0, 0)
  const frankHalf = FRANKENSTEIN / 2
  ctx.fillStyle = 'rgb(60,45,80)'
  ctx.fillRect(fx - frankHalf, fy - frankHalf, FRANKENSTEIN, FRANKENSTEIN)

  // The tile grid, faint, over the shelters and under their words.
  const left = toPx(minx, 0)[0]
  const right = toPx(maxx, 0)[0]
  const top = toPx(0, miny)[1]
  const bottom = toPx(0, maxy)[1]
  ctx.strokeStyle = 'rgba(60,60,60,0.215)'
  ctx.lineWidth = 1
  for (let k = Math.floor((left - fx) / TILE); k <= Math.ceil((right - fx) / TILE); k += 1) {
    const x = fx + TILE * k
    line(x, top, x, bottom)
  }
  for (let k = Math.floor((top - fy) / TILE); k <= Math.ceil((bottom - fy) / TILE); k += 1) {
    const y = fy + TILE * k
    line(left, y, right, y)
  }

  ctx.direction = 'ltr'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const [m, x, y, fill] of shelters) {
    ctx.fillStyle = inkOn(fill)
    const [px, name] = fitName(ctx, m.name, SHELTER - 6)
    ctx.font = font(px)
    ctx.fillText(name, x, y - SHELTER * 0.27)
    ctx.font = font(14)
    ctx.fillText(`${label.lv} ${m.level ? m.level : '?'}`, x, y)
    ctx.fillText(shortCp(m.cp), x, y + SHELTER * 0.27)
    if (m.outermost) {
      // A black dot in the corner: this member asked for the outside.
      const r = 7
      ctx.beginPath()
      ctx.arc(x + half - r - 3, y + half - r - 3, r, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgb(0,0,0)'
      ctx.fill()
      ctx.strokeStyle = 'rgb(255,255,255)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  if (picture && picture.complete && picture.naturalWidth) {
    const side = Math.min(picture.naturalWidth, picture.naturalHeight)
    const sx = (picture.naturalWidth - side) / 2
    const sy = (picture.naturalHeight - side) / 2
    ctx.drawImage(picture, sx, sy, side, side, fx - frankHalf, fy - frankHalf, FRANKENSTEIN, FRANKENSTEIN)
  } else {
    ctx.fillStyle = 'rgb(245,240,220)'
    ctx.font = font(15)
    ctx.direction = readerDirection
    ctx.fillText(label.frank1, fx, fy - 11)
    ctx.fillText(label.frank2, fx, fy + 11)
    ctx.direction = 'ltr'
  }
  ctx.strokeStyle = 'rgb(230,210,120)'
  ctx.lineWidth = 3
  ctx.strokeRect(fx - frankHalf, fy - frankHalf, FRANKENSTEIN, FRANKENSTEIN)

  if (options.showGroups !== false) drawGroups(ctx, groups, memberCell, toPx, line)
  if (layout.range) paintRangeOver(ctx, layout, members)

  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = font(30)
  ctx.direction = readerDirection
  ctx.fillText(`${label.title}  ·  v${version}`, MARGIN, 30)
  ctx.fillStyle = 'rgb(140,140,140)'
  ctx.font = font(14)
  ctx.direction = 'ltr'
  ctx.fillText(options.ts || '', MARGIN, 58)
  if (layout.range) paintRangeKey(ctx, layout)
  ctx.direction = readerDirection
  ctx.fillStyle = 'rgb(90,90,90)'
  ctx.textAlign = 'right'
  ctx.font = font(20)
  ctx.fillText(
    `${layout.N} ${label.shelters}  +  ${label.frankenstein}     Σ CP ${shortCp(layout.total)}`,
    W - MARGIN,
    30,
  )

  const legendY = H - LEGEND_HEIGHT + 30
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.font = font(16)
  ctx.fillText(label.industryLv, MARGIN, legendY)
  let x = MARGIN + Math.ceil(ctx.measureText(label.industryLv).width) + 16
  for (let level = 1; level <= TOP_LEVEL; level += 1) {
    const fill = colorOfLevel(level)
    ctx.fillStyle = rgb(fill)
    ctx.fillRect(x, legendY - 13, 26, 26)
    ctx.strokeStyle = 'rgb(255,255,255)'
    ctx.lineWidth = 1
    ctx.strokeRect(x, legendY - 13, 26, 26)
    ctx.fillStyle = inkOn(fill)
    ctx.textAlign = 'center'
    ctx.font = font(13)
    ctx.fillText(String(level), x + 13, legendY)
    ctx.textAlign = 'left'
    x += 36
  }
  const spacing = version === 2 ? label.gapEvery2 : `${label.lane} 2 ${label.tiles}`
  ctx.fillStyle = 'rgb(120,120,120)'
  ctx.textAlign = 'right'
  ctx.font = font(13)
  ctx.fillText(
    `v${version} (${label.shapeName}) · ${label.oneTile} = ${TILE}px · ${label.shelter3x3} · ${spacing}`,
    W - MARGIN,
    legendY,
  )
}

/* Each stick group's outer edge in its color, bridging the one-tile gaps of
   the gap square, with the group's name over its top-left shelter. */
function drawGroups(ctx, groups, memberCell, toPx, line) {
  const names = [...groups.keys()].sort()
  const colorOf = new Map(names.map((name, i) => [name, GROUP_COLORS[i % GROUP_COLORS.length]]))
  const half = SHELTER / 2
  const across = SHELTER + TILE
  ctx.lineWidth = 3
  for (const [name, group] of groups) {
    const color = rgb(colorOf.get(name))
    ctx.strokeStyle = color
    ctx.fillStyle = color
    const cells = group.map((m) => memberCell.get(m.id))
    const own = new Set(cells.map(keyOf))
    const inGroup = (x, y) => own.has(`${round1(x)},${round1(y)}`)
    let corner = null
    for (const [cx, cy] of cells) {
      const [px, py] = toPx(cx, cy)
      const l = px - half
      const r = px + half
      const t = py - half
      const b = py + half
      if (!inGroup(cx, cy - SHELTER)) line(l, t, r, t)
      if (!inGroup(cx, cy + SHELTER)) line(l, b, r, b)
      if (!inGroup(cx - SHELTER, cy)) line(l, t, l, b)
      if (!inGroup(cx + SHELTER, cy)) line(r, t, r, b)
      if (corner === null || py < corner.py || (py === corner.py && px < corner.px)) corner = { py, px, l, t }
    }
    for (let i = 0; i < cells.length; i += 1) {
      const [ax, ay] = cells[i]
      const [apx, apy] = toPx(ax, ay)
      for (let j = i + 1; j < cells.length; j += 1) {
        const [bx, by] = cells[j]
        const [bpx, bpy] = toPx(bx, by)
        if (Math.abs(ay - by) < 1 && Math.abs(Math.abs(ax - bx) - across) < 1) {
          const x1 = Math.min(apx, bpx) + half
          const x2 = Math.max(apx, bpx) - half
          line(x1, apy - half, x2, apy - half)
          line(x1, apy + half, x2, apy + half)
        } else if (Math.abs(ax - bx) < 1 && Math.abs(Math.abs(ay - by) - across) < 1) {
          const y1 = Math.min(apy, bpy) + half
          const y2 = Math.max(apy, bpy) - half
          line(apx - half, y1, apx - half, y2)
          line(apx + half, y1, apx + half, y2)
        }
      }
    }
    if (corner) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.font = font(13)
      ctx.fillText(name, corner.l - 1, corner.t - 5)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
    }
  }
}
