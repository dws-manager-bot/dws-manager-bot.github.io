/*
 * The reader's language and time zone, for every alliance page: `t` for its
 * words, `number` and `time` for values written the reader's way and in the
 * reader's zone, and `setLanguage` / `setZone` for the picker. Without a
 * provider (as in the probe and in tests) a page is in English, in UTC.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { detectedZone, isZone } from '../lib/zones.js'
import { english, loadMessages, saveLanguage, saveZone, savedLanguage, savedZone } from './catalogs.js'
import { fromTag, pickLanguage } from './detect.js'
import { languageOf } from './languages.js'
import { translator } from './translate.js'

function build(code, messages, zone) {
  const { code: lang, locale, dir = 'ltr' } = languageOf(code)
  const t = translator({ lang, locale, messages, fallback: english })
  return {
    lang,
    locale,
    dir,
    t,
    zone,
    number: (n, options) => new Intl.NumberFormat(locale, options).format(n),
    time: (instant, options) => {
      try {
        return new Intl.DateTimeFormat(locale, { timeZone: zone, ...options }).format(new Date(instant))
      } catch {
        return ''
      }
    },
  }
}

const I18nContext = createContext({
  ...build('en', english, 'UTC'),
  setLanguage: () => {},
  setZone: () => {},
})

/** The language the page opens in; a link that names one is kept like a choice. */
export function startingLanguage({
  search = window.location.search,
  device = navigator.languages ?? [navigator.language],
} = {}) {
  const query = new URLSearchParams(search).get('lang')
  const lang = pickLanguage({ query, saved: savedLanguage(), device })
  if (fromTag(query)) saveLanguage(lang)
  return lang
}

export function startingZone() {
  const saved = savedZone()
  return saved && isZone(saved) ? saved : detectedZone()
}

export function I18nProvider({ children }) {
  const [prefs, setPrefs] = useState(() => ({ code: 'en', messages: english, zone: startingZone() }))
  const latest = useRef('en')

  const setLanguage = useCallback(async (code) => {
    latest.current = code
    const messages = await loadMessages(code)
    // A slow catalog must not overwrite a language picked after it.
    if (latest.current !== code) return
    setPrefs((p) => ({ ...p, code, messages }))
    saveLanguage(code)
  }, [])

  const setZone = useCallback((zone) => {
    if (!isZone(zone)) return
    setPrefs((p) => ({ ...p, zone }))
    saveZone(zone)
  }, [])

  // English shows while the reader's own language is fetched.
  useEffect(() => {
    const first = startingLanguage()
    if (first !== 'en') setLanguage(first)
  }, [setLanguage])

  const value = useMemo(
    () => ({ ...build(prefs.code, prefs.messages, prefs.zone), setLanguage, setZone }),
    [prefs, setLanguage, setZone],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
