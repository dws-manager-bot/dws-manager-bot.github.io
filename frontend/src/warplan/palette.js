/**
 * Alliance colors.
 *
 * The map says who holds what by color alone, so no two alliances may share
 * one (the API refuses it too). Suggestions come in one fixed order, whatever
 * the camp: the dataviz reference palette, stepped for a dark surface. That
 * order was run through the palette validator against both surfaces these
 * colors live on — the dark cards (#27272a) and the sand map (#efe7d6) — and
 * passes the lightness band, chroma, colorblind separation (worst adjacent
 * pair ΔE 8.4) and the normal-vision floor (19.3). On the sand map a few sit
 * under 3:1 contrast, which is why markers carry a dark outline and labels.
 *
 * An earlier set split the camps into cool and warm hues. It failed: the
 * green that ended one camp and the orange that began the other are the same
 * color to a red-green colorblind eye, and red and orange were close even for
 * everyone else. Camp is shown by grouping instead.
 */

export const SWATCHES = [
  '#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767',
]

/** The first suggestion nobody has taken yet. */
export function nextColor(alliances) {
  const taken = new Set(alliances.map((a) => a.color.toLowerCase()))
  return SWATCHES.find((c) => !taken.has(c)) || '#64748b'
}

/** Black or white, whichever reads on this color. */
export function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16)
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 150 ? '#18181b' : '#ffffff'
}

export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

/** A darker shade of the same color, for outlines. */
export function darker(hex, f = 0.62) {
  const [r, g, b] = rgb(hex)
  const h = (v) => Math.round(v * f).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Colors for drawings not tied to an alliance. */
export const INKS = ['#fbbf24', '#18181b', '#ffffff', '#f43f5e', '#22c55e', '#3b82f6', '#a855f7']
