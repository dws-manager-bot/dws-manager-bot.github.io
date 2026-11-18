import type { Compare, Season } from './types'
import { s5 } from './seasons/s5.ts'
import { s6 } from './seasons/s6.ts'
import { s6 as s6Compare } from './seasons/s6-compare.ts'

/**
 * All seasons shown on the site, in display order.
 * To add a season: create src/content/seasons/sN.ts that exports a `Season`, then add it here.
 * A season with `ready: false` shows a "not written yet" page.
 */
export const seasons: Season[] = [s5, s6]

/** Placeholder entries for seasons that are planned but not written. */
export const plannedSeasons: { slug: string; number: number; name: string }[] = []

export const defaultSeason = s5.slug

export function findSeason(slug: string): Season | undefined {
  return seasons.find((s) => s.slug === slug)
}

/** Seasons that have a compare-only page (/sN/compare). */
export const compares: Compare[] = [s6Compare]

export function findCompare(slug: string): Compare | undefined {
  return compares.find((c) => c.slug === slug)
}
