/** CP the way the alliance says it out loud: 54.5M, 1.6B. */
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const exact = new Intl.NumberFormat('en')

export const short = (v) => (v == null ? '—' : compact.format(v))
export const full = (v) => (v == null ? '—' : exact.format(v))

/** Today where this browser is, which is what "data as of" means to the person. */
export function today() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
