/*
 * Every page's messages exist in every language, with the same keys and the
 * same placeholders as English. A missing key would fall back to English
 * quietly; a renamed placeholder would show "{name}" to the reader.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LANGUAGES } from './languages.js'

const ROOT = join(__dirname, 'messages')
const pages = readdirSync(ROOT)

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    // A plural is one message whose forms differ by language.
    const plural = value && typeof value === 'object' && 'other' in value
    if (value && typeof value === 'object' && !Array.isArray(value) && !plural) flatten(value, path, out)
    else out[path] = value
  }
  return out
}

const placeholders = (value) =>
  [...new Set(JSON.stringify(value).match(/\{\w+(?::\w+)?\}/g) ?? [])].sort()

const load = (page, code) => flatten(JSON.parse(readFileSync(join(ROOT, page, `${code}.json`), 'utf8')))

describe.each(pages)('messages/%s', (page) => {
  const en = load(page, 'en')

  it('has a file for every language and no other', () => {
    const files = readdirSync(join(ROOT, page)).map((f) => f.replace(/\.json$/, '')).sort()
    expect(files).toEqual(LANGUAGES.map((l) => l.code).sort())
  })

  it.each(LANGUAGES.map((l) => l.code))('%s has the keys and placeholders English has', (code) => {
    const other = load(page, code)
    expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort())
    const drift = Object.keys(en).filter(
      (key) => typeof en[key] === 'string' && placeholders(en[key]).join() !== placeholders(other[key]).join(),
    )
    expect(drift).toEqual([])
  })
})
