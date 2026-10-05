/*
 * Every calculator renders its first sheet, and every one carries the note
 * that in-game prices can be lower than config: a Gear-cost buff showed 760
 * in game against config 845, and members compare the two.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import parts from './data/precision-parts.json'
import vehicle from './data/vehicle.json'
import weapons from './data/hero-weapons.json'
import stars from './data/hero-stars.json'
import equipment from './data/hero-equipment.json'
import chips from './data/vehicle-chips.json'
import { SLUGS, calculator } from './engine.js'
import Sheet from './Sheet.jsx'

const DATA = {
  'precision-parts': parts,
  'vehicle-level': vehicle,
  'vehicle-parts': vehicle,
  'hero-weapon': weapons,
  'hero-stars': stars,
  'hero-equipment': equipment,
  'vehicle-chips': chips,
}

describe.each(SLUGS)('%s', (slug) => {
  const html = renderToStaticMarkup(<Sheet spec={calculator(slug)} data={DATA[slug]} />)

  it('renders a row and its total', () => {
    expect(html).toContain('calc-row')
    expect(html).toContain('Total needed')
  })

  it('says config prices are before buffs', () => {
    expect(html).toContain('Config cost before buffs — in-game prices can be lower.')
    expect(html).toContain('Dark War Survival 1.250.661')
  })
})

it('tells vehicle levelling is charged per press', () => {
  expect(calculator('vehicle-level').subtitle).toBe('calc.per_press')
  const html = renderToStaticMarkup(<Sheet spec={calculator('vehicle-level')} data={vehicle} />)
  expect(html).toContain('button presses in total')
})
