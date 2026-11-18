import type { QuickCard, Season } from '@/content/types'
import { at } from '@/lib/route'

/**
 * Discord text (Playbook §10, §12 output 3): the main action and deadline in the first lines,
 * short, plain, with a link to the full guide. Built from the season data, so it never
 * disagrees with the site. Discord limit: 2000 characters per message.
 */

export const DISCORD_LIMIT = 2000

export function guideUrl(season: Season, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origin}${at(`/${season.slug}/guide`)}`
}

export function seasonDiscordPost(season: Season, origin?: string): string {
  const o = season.overview
  const keyDates = season.timeline
    .filter((t) => t.key)
    .sort((a, b) => a.day - b.day)
    .map((t) => `• **${t.when}** — ${t.title}`)
  const lines = [
    `## Season ${season.number}: ${season.name} — quick guide`,
    `${season.tagline}`,
    `*All times are server time.*`,
    '',
    `**Do this first**`,
    ...o.doThisFirst.map((c, i) => `${i + 1}. ${c.text}`),
    '',
    `**Target:** ${o.minimumTarget.text}`,
    `**Largest mistake:** ${o.biggestMistake.text}`,
    '',
    `**Key dates**`,
    ...keyDates,
    '',
    `Full guide (map, rules, phase plans): ${guideUrl(season, origin)}`,
    `Slides: ${guideUrl(season, origin)}/slides`,
  ]
  return lines.join('\n')
}

export function quickCardDiscord(card: QuickCard, season: Season, origin?: string): string {
  return [
    `### ${card.title}`,
    `**When:** ${card.trigger}`,
    ...card.steps.map((s, i) => `${i + 1}. ${s}`),
    `⚠️ ${card.warning}`,
    `More: ${guideUrl(season, origin)}#${card.link}`,
  ].join('\n')
}
