/*
 * Which language to open the alliance pages in, before anyone has to look for
 * a picker: a language named in the link (?lang=ko, for a link shared in one
 * language's chat), the one this device chose before, then the device's own
 * languages in its order of preference. English when nothing points elsewhere.
 */
import { DEFAULT_LANGUAGE, LANGUAGES } from './languages.js'

const CODES = new Set(LANGUAGES.map((l) => l.code))
const TRADITIONAL = new Set(['tw', 'hk', 'mo', 'hant'])

/** The site's language for a BCP 47 tag like "ko-KR" or "zh-Hant-TW", or null. */
export function fromTag(tag) {
  const parts = String(tag ?? '').toLowerCase().split(/[-_]/).filter(Boolean)
  const [base, ...rest] = parts
  if (!base) return null
  if (base === 'zh') return rest.some((p) => TRADITIONAL.has(p)) ? 'zh-Hant' : 'zh-Hans'
  if (base === 'in') return 'id'
  return CODES.has(base) ? base : null
}

export function pickLanguage({ query, saved, device = [] } = {}) {
  return fromTag(query) ?? fromTag(saved) ?? device.map(fromTag).find(Boolean) ?? DEFAULT_LANGUAGE
}
