/**
 * The ground around one Ancient Temple, in the game's own tile coordinates.
 *
 * Everything is whole tiles. A box is { x0, x1, y0, y1 }, inclusive on both
 * ends, so the zone X414–434 is 21 tiles across. A shelter is 3×3 and is named
 * by its center tile, which is what the game shows as its coordinate.
 *
 * On the drawing, X grows to the right and Y grows upward: the zone's top edge
 * is Y933, where Turret 1 sits, and its bottom edge Y913, where Turret 2 sits.
 */

export const SHELTER = 3

/** Today's temple (28 Nov 2026), as read in game. */
export const TEMPLE_IV = {
  name: 'Lv.1 Ancient Temple Ⅳ',
  // No teleporting into it: the corners are X414 Y913 and X434 Y933.
  zone: { x0: 414, x1: 434, y0: 913, y1: 933 },
  // The temple sits at the zone's center and both turrets in line with it, the
  // way the game draws them. The game's own coordinates for them (`at`) do not
  // line up with the zone's corners, so they are shown as labels only: the
  // zone, read from its corners, is what decides where a shelter may stand.
  // The temple's size is a guess (4×4 or 5×5 in game); it is inside the zone
  // either way, so it never decides where a shelter can go.
  temple: { x: 424, y: 923, size: 5, at: [428, 926] },
  // 3×3 each, inside the zone and against its top and bottom edges.
  turrets: [
    { name: 'Turret 1', at: [425, 933], box: { x0: 423, x1: 425, y0: 931, y1: 933 } },
    { name: 'Turret 2', at: [425, 913], box: { x0: 423, x1: 425, y0: 913, y1: 915 } },
  ],
  // The Camp Passes on the same row, from the season map. Their size is not
  // known, so they are drawn as markers and block nothing.
  marks: [
    { name: 'Camp 1 Pass', at: [402, 926] },
    { name: 'Camp 2 Pass', at: [452, 926] },
  ],
}

export const EDGES = {
  top: 'Top (Y933)',
  bottom: 'Bottom (Y913)',
  left: 'Left (X414)',
  right: 'Right (X434)',
}

export const boxOf = (x, y, size = SHELTER) => {
  const h = (size - 1) / 2
  return { x0: x - Math.floor(h), x1: x + Math.ceil(h), y0: y - Math.floor(h), y1: y + Math.ceil(h) }
}

export const overlaps = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

/** The tiles shown: the zone and `margin` tiles of ground on every side. */
export function viewOf(temple, margin) {
  const z = temple.zone
  return { x0: z.x0 - margin, x1: z.x1 + margin, y0: z.y0 - margin, y1: z.y1 + margin }
}

export const inside = (box, view) =>
  box.x0 >= view.x0 && box.x1 <= view.x1 && box.y0 >= view.y0 && box.y1 <= view.y1

/**
 * Whether a shelter fits with its center on (x, y): clear of the zone, of every
 * other shelter, and on the ground shown. `others` is [{ key, x, y }]; `key` is
 * left out, so a shelter never blocks itself while it moves.
 * Returns null when it fits, or a short reason when it does not.
 */
export function blocked(temple, view, others, key, x, y) {
  const b = boxOf(x, y)
  if (!inside(b, view)) return 'Off the map'
  if (overlaps(b, temple.zone)) return 'No teleporting into the temple zone'
  for (const o of others) {
    if (o.key !== key && overlaps(b, boxOf(o.x, o.y))) return `On ${o.name}`
  }
  return null
}

/**
 * Tiles between a shelter and the zone: 0 when it touches the zone's edge.
 * Counted along the nearer axis, the way a line of shelters is stacked.
 */
export function gapToZone(temple, x, y) {
  const b = boxOf(x, y)
  const z = temple.zone
  const dx = Math.max(z.x0 - b.x1 - 1, b.x0 - z.x1 - 1, 0)
  const dy = Math.max(z.y0 - b.y1 - 1, b.y0 - z.y1 - 1, 0)
  return Math.max(dx, dy)
}

/** Which side of the zone a shelter stands on, or null when it is past a corner. */
export function sideOf(temple, x, y) {
  const b = boxOf(x, y)
  const z = temple.zone
  const across = b.x1 >= z.x0 && b.x0 <= z.x1
  const along = b.y1 >= z.y0 && b.y0 <= z.y1
  if (across && b.y0 > z.y1) return 'top'
  if (across && b.y1 < z.y0) return 'bottom'
  if (along && b.x1 < z.x0) return 'left'
  if (along && b.x0 > z.x1) return 'right'
  return null
}

/** Keep only placements that still fit, in order: the first one to claim ground keeps it. */
export function cleanPlacements(temple, view, placed) {
  const kept = []
  for (const p of placed) {
    if (!Number.isInteger(p?.x) || !Number.isInteger(p?.y) || !p.key) continue
    if (kept.some((k) => k.key === p.key)) continue
    if (blocked(temple, view, kept, p.key, p.x, p.y)) continue
    kept.push(p)
  }
  return kept
}
