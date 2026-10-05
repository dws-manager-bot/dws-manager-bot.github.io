/*
 * The reader's language and time zone, opened from the header. The alliance
 * pages read both; the admin pages stay in English and use their own forms'
 * zones.
 */
import { useMemo } from 'react'
import { useI18n } from '../i18n/I18n.jsx'
import { LANGUAGES, languageOf } from '../i18n/languages.js'
import { SERVER_ZONE, zoneGroups, zoneLabel } from '../lib/zones.js'

export function PrefsButton({ open, onToggle }) {
  const { t, lang } = useI18n()
  return (
    <button
      type="button"
      className={open ? 'btn ghost small prefs-toggle on' : 'btn ghost small prefs-toggle'}
      aria-expanded={open}
      aria-label={t('shell.prefs.open')}
      title={t('shell.prefs.open')}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"
          fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
      <span>{languageOf(lang).short}</span>
    </button>
  )
}

export function PrefsPanel() {
  const { t, lang, zone, setLanguage, setZone } = useI18n()
  const groups = useMemo(() => zoneGroups({ selected: zone }), [zone])
  return (
    <div className="prefs-panel">
      <label>
        {t('shell.prefs.language')}
        <select value={lang} onChange={(e) => setLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
      </label>
      <label>
        {t('shell.prefs.zone')}
        <select value={zone} onChange={(e) => setZone(e.target.value)}>
          {groups.map((g) => (
            <optgroup key={g.key} label={t(`shell.zone_groups.${g.key}`)}>
              {g.zones.map((z) => (
                <option key={z} value={z}>
                  {z === SERVER_ZONE ? t('shell.prefs.server_time') : zoneLabel(z)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  )
}
