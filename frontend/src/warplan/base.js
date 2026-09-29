import { rgb } from './palette.js'

/**
 * The map's raster layer: sand, territories, walls. One pixel per tile, drawn
 * once per change of ownership and then only scaled while panning.
 *
 * Row 0 of the image is the top of the map, which is y = N-1 — the minimap
 * draws y upward, and so does this.
 */

const SAND = [239, 231, 214]
const EDGE = [215, 201, 174]
// Walls are ground-colored with an outline. Drawn dark they were the loudest
// thing on the map, and the passes — dark red, sitting in the walls' gaps —
// disappeared into them. Territory fills stop at a wall, so the walls still
// show as margins between colored ground.
const WALL = [232, 224, 206]
const WALL_EDGE = [176, 158, 126]
export const OUTSIDE = '#d9cfbb'

const mix = (c, a, base = SAND) => [
  base[0] + (c[0] - base[0]) * a,
  base[1] + (c[1] - base[1]) * a,
  base[2] + (c[2] - base[2]) * a,
]

/**
 * What each territory looks like: the holder's color, or for a territory the
 * scenario changes hands, stripes of the new holder over the old — so a plan
 * is visibly a plan and never mistaken for the board.
 */
export function zoneStyles(map, board, holders, colorOf) {
  const styles = new Array(map.zoneOwner.length).fill(null)
  map.zoneOwner.forEach((cityId, z) => {
    if (!cityId) return
    const now = holders.get(cityId)
    const was = board.get(cityId)
    const color = now != null ? colorOf(now) : null
    const before = was != null ? colorOf(was) : null
    if (!color && !before) return
    styles[z] = {
      fill: color ? rgb(color) : null,
      was: before ? rgb(before) : null,
      planned: now !== was,
    }
  })
  return styles
}

export function paintBase(map, styles) {
  const { N, walls, wallEdge, zone, edge } = map
  const img = new ImageData(N, N)
  const d = img.data
  const put = (o, c) => { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255 }
  for (let y = 0; y < N; y += 1) {
    const row = (N - 1 - y) * N
    for (let x = 0; x < N; x += 1) {
      const i = y * N + x
      const o = (row + x) * 4
      if (walls[i]) { put(o, wallEdge[i] ? WALL_EDGE : WALL); continue }
      const s = styles[zone[i]]
      let c = s ? s.fill : null
      if (s && s.planned && ((x + y) & 7) < 4) c = s.was
      if (!c) put(o, edge[i] ? EDGE : SAND)
      else put(o, mix(c, edge[i] ? 0.8 : 0.36))
    }
  }
  return img
}

/** The visible slice of the map, in whole tiles. */
export function visibleTiles(view, W, H, N) {
  const { cx, cy, z } = view
  return {
    x0: Math.max(0, Math.floor(cx - W / 2 / z)),
    x1: Math.min(N, Math.ceil(cx + W / 2 / z)),
    y0: Math.max(0, Math.floor(cy - H / 2 / z)),
    y1: Math.min(N, Math.ceil(cy + H / 2 / z)),
  }
}

export function drawBase(ctx, image, view, W, H, N) {
  const { cx, cy, z } = view
  const sx = (x) => (x - cx) * z + W / 2
  const sy = (y) => (cy - y) * z + H / 2
  ctx.fillStyle = OUTSIDE
  ctx.fillRect(0, 0, W, H)
  const { x0, x1, y0, y1 } = visibleTiles(view, W, H, N)
  if (x1 <= x0 || y1 <= y0) return
  // Smooth only while shrinking: scaled up, a tile should stay a crisp square.
  ctx.imageSmoothingEnabled = z < 1.5
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, x0, N - y1, x1 - x0, y1 - y0, sx(x0), sy(y1), (x1 - x0) * z, (y1 - y0) * z)

  // A tile grid once a tile is big enough to place something on, with every
  // tenth line heavier so a count can be read off it.
  if (z >= 7) {
    ctx.lineWidth = 1
    for (const [every, alpha] of [[1, Math.min(0.1, (z - 7) / 60 + 0.05)], [10, 0.16]]) {
      ctx.strokeStyle = `rgba(60, 48, 30, ${alpha})`
      ctx.beginPath()
      for (let x = Math.ceil(x0 / every) * every; x <= x1; x += every) {
        const px = Math.round(sx(x)) + 0.5
        ctx.moveTo(px, sy(y1)); ctx.lineTo(px, sy(y0))
      }
      for (let y = Math.ceil(y0 / every) * every; y <= y1; y += every) {
        const py = Math.round(sy(y)) + 0.5
        ctx.moveTo(sx(x0), py); ctx.lineTo(sx(x1), py)
      }
      ctx.stroke()
    }
  }
}
