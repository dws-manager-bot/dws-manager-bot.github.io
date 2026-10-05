import { describe, it, expect } from 'vitest'
import { PINNED, SERVER_ZONE, cityName, zoneGroups, zoneLabel } from './zones.js'

const AT = new Date('2026-01-15T00:00:00Z')

describe('zoneGroups', () => {
  it('leads with server time and the familiar zones', () => {
    const [common] = zoneGroups({ all: ['Asia/Seoul'], detected: 'UTC', at: AT })
    expect(common.key).toBe('common')
    expect(common.zones[0]).toBe(SERVER_ZONE)
    for (const zone of PINNED) expect(common.zones).toContain(zone)
  })

  it('always offers the detected and the chosen zone, even outside the familiar twelve', () => {
    const [common] = zoneGroups({ all: [], detected: 'Asia/Calcutta', selected: 'America/Lima', at: AT })
    expect(common.zones).toContain('Asia/Calcutta')
    expect(common.zones).toContain('America/Lima')
  })

  it('lists every other zone once, under its region, in label order', () => {
    const groups = zoneGroups({
      all: ['Asia/Seoul', 'Asia/Calcutta', 'Asia/Bangkok', 'Europe/Kiev', 'Etc/GMT+5'],
      detected: 'UTC',
      at: AT,
    })
    const asia = groups.find((g) => g.key === 'asia').zones
    expect(asia).toEqual(['Asia/Bangkok', 'Asia/Calcutta'])
    expect(groups.find((g) => g.key === 'europe').zones).toEqual(['Europe/Kiev'])
    expect(groups.flatMap((g) => g.zones).filter((z) => z === 'Asia/Seoul')).toHaveLength(1)
    expect(groups.flatMap((g) => g.zones)).not.toContain('Etc/GMT+5')
  })

  it('drops a stored zone the browser does not recognize', () => {
    const [common] = zoneGroups({ all: [], detected: 'UTC', selected: 'Mars/Olympus', at: AT })
    expect(common.zones).not.toContain('Mars/Olympus')
  })
})

describe('labels', () => {
  it('relabels the cities ICU still calls by their old names', () => {
    expect(cityName('Asia/Calcutta')).toBe('Kolkata')
    expect(cityName('Europe/Kiev')).toBe('Kyiv')
    expect(cityName('Asia/Saigon')).toBe('Ho Chi Minh City')
  })

  it('names a zone by its city and live offset', () => {
    expect(zoneLabel('Asia/Seoul', AT)).toBe('Seoul (GMT+9)')
    expect(zoneLabel('America/Argentina/Buenos_Aires', AT)).toBe('Buenos Aires (GMT-3)')
    expect(zoneLabel('UTC', AT)).toBe('UTC')
  })

  it('follows daylight saving', () => {
    expect(zoneLabel('Europe/London', new Date('2026-07-01T00:00:00Z'))).toBe('London (GMT+1)')
  })
})
