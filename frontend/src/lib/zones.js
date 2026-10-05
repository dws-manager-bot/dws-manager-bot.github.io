/*
 * The time zones a member can read the alliance pages in, grouped the way the
 * picker shows them: game server time and the familiar zones first, then every
 * zone the browser knows, by region.
 *
 * Three rules from pou-rocks hold it together:
 *  - The detected and chosen zones are always offered. A <select> whose value
 *    matches no option renders blank, which is what most of the world saw
 *    while only twelve zones were listed.
 *  - ICU still prefers the legacy IANA names (Asia/Calcutta, Europe/Kiev) and
 *    canonicalizes the modern ones to them, so those are relabeled for display
 *    only; the value stays the ICU id.
 *  - A label is the city alone, the last path segment, plus its live offset.
 *    City names are unique within a region, which keeps the widest label short
 *    enough for a phone.
 */

export const SERVER_ZONE = 'Etc/GMT+2'

export const PINNED = [
  'UTC', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Manila', 'Asia/Jakarta',
  'Asia/Dubai', 'America/New_York', 'America/Los_Angeles', 'Europe/London',
  'Europe/Paris', 'Australia/Sydney',
]

export const REGIONS = [
  'Africa', 'America', 'Antarctica', 'Arctic', 'Asia', 'Atlantic', 'Australia',
  'Europe', 'Indian', 'Pacific',
]

export const RENAMED = {
  'Africa/Asmera': 'Asmara',
  'America/Coral_Harbour': 'Atikokan',
  'America/Godthab': 'Nuuk',
  'Asia/Calcutta': 'Kolkata',
  'Asia/Katmandu': 'Kathmandu',
  'Asia/Rangoon': 'Yangon',
  'Asia/Saigon': 'Ho Chi Minh City',
  'Atlantic/Faeroe': 'Faroe',
  'Europe/Kiev': 'Kyiv',
  'Pacific/Enderbury': 'Kanton',
  'Pacific/Ponape': 'Pohnpei',
  'Pacific/Truk': 'Chuuk',
}

export function detectedZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function isZone(zone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return Boolean(zone)
  } catch {
    return false
  }
}

export function cityName(zone) {
  if (RENAMED[zone]) return RENAMED[zone]
  return zone.slice(zone.lastIndexOf('/') + 1).replace(/_/g, ' ')
}

/** "GMT+9", "GMT-3:30", or "" where the engine cannot say. */
export function offsetName(zone, at = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')
    return part ? part.value : ''
  } catch {
    return ''
  }
}

export function zoneLabel(zone, at = new Date()) {
  if (zone === 'UTC') return 'UTC'
  const offset = offsetName(zone, at)
  return offset ? `${cityName(zone)} (${offset})` : cityName(zone)
}

function supportedZones() {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return PINNED
  }
}

/**
 * [{ key: 'common', zones: [...] }, { key: 'asia', zones: [...] }, ...]. The
 * server zone leads the common group; the caller labels it in its language.
 */
export function zoneGroups({ all = supportedZones(), detected = detectedZone(), selected, at = new Date() } = {}) {
  const common = [...new Set([SERVER_ZONE, selected, detected, ...PINNED].filter(isZone))]
  const taken = new Set(common)
  const byLabel = (a, b) => zoneLabel(a, at).localeCompare(zoneLabel(b, at), 'en')
  const regions = REGIONS.map((region) => ({
    key: region.toLowerCase(),
    zones: all.filter((z) => z.startsWith(`${region}/`) && !taken.has(z)).sort(byLabel),
  })).filter((g) => g.zones.length)
  return [{ key: 'common', zones: common }, ...regions]
}
