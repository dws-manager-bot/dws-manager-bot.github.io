/*
 * The alliance pages' words. Each page keeps its own folder of messages, one
 * file per language (messages/<page>/<code>.json), so pages can be worked on
 * side by side. English is part of the bundle, since it fills any gap; every
 * other language is fetched only when someone reads the site in it.
 */
const pageOf = (path) => path.split('/')[2]

const englishFiles = import.meta.glob('./messages/*/en.json', { eager: true, import: 'default' })
const otherFiles = import.meta.glob(['./messages/*/*.json', '!./messages/*/en.json'], { import: 'default' })

export const english = Object.fromEntries(
  Object.entries(englishFiles).map(([path, words]) => [pageOf(path), words]),
)

export async function loadMessages(code) {
  if (code === 'en') return english
  const files = Object.entries(otherFiles).filter(([path]) => path.endsWith(`/${code}.json`))
  try {
    const loaded = await Promise.all(files.map(async ([path, load]) => [pageOf(path), await load()]))
    return Object.fromEntries(loaded)
  } catch {
    return english // A failed fetch leaves the page in English rather than blank.
  }
}

const read = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage off: the choice holds until the page closes.
  }
}

export const savedLanguage = () => read('pou.lang')
export const saveLanguage = (code) => write('pou.lang', code)
export const savedZone = () => read('pou.zone')
export const saveZone = (zone) => write('pou.zone', zone)
