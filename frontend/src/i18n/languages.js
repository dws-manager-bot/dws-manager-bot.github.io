/*
 * The alliance pages' languages: the sixteen the game ships, so a game word on
 * the page can be the game's own. `name` is how the language names itself in
 * the picker, `short` what the closed picker shows, and `locale` how numbers
 * and times are written (Arabic in Western digits, as the game writes CP).
 * The admin pages stay in English.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', short: 'EN', locale: 'en' },
  { code: 'ko', name: '한국어', short: '한국어', locale: 'ko' },
  { code: 'ja', name: '日本語', short: '日本語', locale: 'ja' },
  { code: 'zh-Hans', name: '简体中文', short: '简体', locale: 'zh-Hans' },
  { code: 'zh-Hant', name: '繁體中文', short: '繁體', locale: 'zh-Hant' },
  { code: 'de', name: 'Deutsch', short: 'DE', locale: 'de' },
  { code: 'fr', name: 'Français', short: 'FR', locale: 'fr' },
  { code: 'it', name: 'Italiano', short: 'IT', locale: 'it' },
  { code: 'es', name: 'Español', short: 'ES', locale: 'es' },
  { code: 'pt', name: 'Português', short: 'PT', locale: 'pt' },
  { code: 'ru', name: 'Русский', short: 'RU', locale: 'ru' },
  { code: 'tr', name: 'Türkçe', short: 'TR', locale: 'tr' },
  { code: 'ar', name: 'العربية', short: 'عربي', locale: 'ar-u-nu-latn', dir: 'rtl' },
  { code: 'th', name: 'ไทย', short: 'ไทย', locale: 'th' },
  { code: 'vi', name: 'Tiếng Việt', short: 'VI', locale: 'vi' },
  { code: 'id', name: 'Bahasa Indonesia', short: 'ID', locale: 'id' },
]

export const DEFAULT_LANGUAGE = 'en'

export const languageOf = (code) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]
