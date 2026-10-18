/*
 * The Hive Map: where every member's shelter stands around Frankenstein.
 * Members see the formation an admin applied, as the picture it was drawn as.
 * The numbers behind it are not served to them; admins draw and apply it from
 * the Members tab's data on the admin Hive map page.
 */
import { useEffect, useState } from 'react'
import Banner from '../../components/Banner.jsx'
import { useI18n } from '../../i18n/I18n.jsx'
import { api } from '../../lib/api.js'
import { save } from '../../lib/files.js'
import { SHAPE_KEYS } from './layout.js'
import './hive.css'

export default function HiveMap() {
  const { t, locale, number } = useI18n()
  const [map, setMap] = useState({ status: 'loading' })
  const [actual, setActual] = useState(false)

  useEffect(() => {
    let live = true
    let url = null
    Promise.all([api.hiveApplied(), api.hiveAppliedImage()]).then(
      ([info, image]) => {
        if (!live) return
        url = URL.createObjectURL(image.blob)
        setMap({ status: 'ready', info, blob: image.blob, url })
      },
      (error) => live && setMap({ status: 'error', error }),
    )
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [])

  const info = map.info
  const opts = info?.options ?? {}
  const date = info
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(info.applied_at))
    : null
  const shape = SHAPE_KEYS[opts.version] ? t(`hive.shape.${SHAPE_KEYS[opts.version]}`) : null
  const status = info && opts.version && shape
    ? t('hive.status', {
      count: info.shelters,
      v: opts.version,
      shape,
      d: number(opts.farthest ?? 0, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    })
    : null

  return (
    <div className="page hive">
      <div className="hive-head">
        <h2>{t('hive.current.title')}</h2>
        <p className="muted small">{t('hive.current.subtitle')}</p>
      </div>
      {map.status === 'ready' && (
        <div className="hive-note">
          <p><strong>{t('hive.current.applied')}</strong></p>
          <p className="muted small">{t('hive.current.snapshot', { date })}</p>
        </div>
      )}
      {map.status === 'loading' && <p className="muted">{t('hive.current.loading')}</p>}
      {map.status === 'error' && (
        <Banner>{t('hive.current.load_failed', { reason: map.error?.message || String(map.error) })}</Banner>
      )}
      {map.status === 'ready' && (
        <>
          <div className="hive-actions">
            <button type="button" className="btn" onClick={() => setActual((a) => !a)}>
              <span aria-hidden="true">⤢</span> {actual ? t('hive.fit_width') : t('hive.actual_size')}
            </button>
            <button type="button" className="btn primary" onClick={() => save(map.blob, `hive_map_${info.applied_at.slice(0, 10)}.png`)}>
              <span aria-hidden="true">⬇</span> {t('hive.download_png')}
            </button>
          </div>
          {/* Left to right whatever the page: the map is a picture, and at
              actual size it should open at its title, not its far edge. */}
          <div className={actual ? 'hive-frame actual' : 'hive-frame'} dir="ltr">
            <div className="hive-sheet" style={{ width: opts.width }}>
              <img src={map.url} alt={t('hive.current.title')} />
            </div>
          </div>
          {status && <p className="hive-status muted small" role="status">{status}</p>}
        </>
      )}
    </div>
  )
}
