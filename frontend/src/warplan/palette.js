/**
 * Alliance colors.
 *
 * The map says who holds what by color alone, so no two alliances may share
 * one (the API refuses it too). The suggestions split by camp — cool hues for
 * camp 1, warm for camp 2 — so friend and foe read apart at a glance before any
 * name is read. Every swatch is dark enough to stay legible as a fill on the
 * sand-colored map and as a dot on the dark UI.
 */

export const SWATCHES = {
  1: ['#2563eb', '#16a34a', '#0891b2', '#7c3aed', '#0d9488', '#4f46e5', '#65a30d', '#0369a1'],
  2: ['#dc2626', '#ea580c', '#db2777', '#b45309', '#c026d3', '#e11d48', '#a16207', '#9f1239'],
}

/** The first suggestion for this camp that nobody has taken yet. */
export function nextColor(camp, alliances) {
  const taken = new Set(alliances.map((a) => a.color.toLowerCase()))
  return [...SWATCHES[camp], ...SWATCHES[camp === 1 ? 2 : 1]].find((c) => !taken.has(c)) || '#64748b'
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
