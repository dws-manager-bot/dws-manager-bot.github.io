/*
 * The Hive Map: where every member's shelter stands around Frankenstein.
 * /hive-map is the formation now applied in game, drawn from the sheet's
 * frozen tab; /hive-map/generator previews a new one from the live roster,
 * in any of the nine layouts. Both read the published Google Sheet directly.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Banner from '../../components/Banner.jsx'
import { useI18n } from '../../i18n/I18n.jsx'
import { save } from '../../lib/files.js'
import { onLinkClick, usePath } from '../../lib/route.js'
import { utcToZoned } from '../../lib/tz.js'
import { drawHive } from './draw.js'
import frankensteinUrl from './frankenstein.jpg'
import { SHAPE_KEYS, VERSIONS } from './layout.js'
import { APPLIED_ROSTER_URL, LIVE_ROSTER_URL, parseCsv, readMembers, snapshotDate } from './sheet.js'
import './hive.css'

const CURRENT = '/hive-map'
const GENERATOR = '/hive-map/generator'
const SHAPE_EMOJI = { 5: '❤️', 6: '🐱', 7: '🖕', 8: '💀', 9: '❄️' }
// What the current map was drawn with when it was applied.
const APPLIED = { version: 1, showGroups: true, spreadTop: true, spreadIndustry: true }

class SheetError extends Error {
  constructor(reason, params) {
    super(reason)
    this.reason = reason
    this.params = params
  }
}

async function fetchRoster(url) {
  let response
  try {
    response = await fetch(url, { cache: 'no-store' })
  } catch {
    throw new SheetError('network')
  }
  if (!response.ok) throw new SheetError('http', { status: response.status })
  const text = await response.text()
  // An unpublished sheet answers with Google's sign-in page, not an error.
  if (/^\s*</.test(text)) throw new SheetError('not_public')
  const members = readMembers(text)
  if (!members.length) throw new SheetError('empty')
  return { members, date: snapshotDate(parseCsv(text)) }
}

/** The roster at `url`, and a way to fetch it again. A failed refetch keeps the last one. */
function useRoster(url) {
  const [roster, setRoster] = useState({ status: 'loading', members: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let current = true
    setRoster((r) => ({ ...r, status: 'loading' }))
    fetchRoster(url).then(
      (got) => current && setRoster({ status: 'ready', ...got }),
      (error) => current && setRoster((r) => ({ ...r, status: 'error', error })),
    )
    return () => {
      current = false
    }
  }, [url, attempt])
  const refresh = useCallback(() => setAttempt((n) => n + 1), [])
  return [roster, refresh]
}

function usePicture(src) {
  const [picture, setPicture] = useState(null)
  useEffect(() => {
    const image = new Image()
    image.onload = () => setPicture(image)
    image.src = src
  }, [src])
  return picture
}

/** "20261005_1423": the reader's wall clock, as the canvas and the file name write it. */
const stamp = (zone) => utcToZoned(new Date().toISOString(), zone).replace(/-|:/g, '').replace('T', '_')

/* The sheet writes the day as 2026/08/22; a calendar day belongs to no zone,
   so it is read as UTC and written the reader's way. */
function sheetDay(raw, locale) {
  const m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(raw || '')
  if (!m) return raw
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  } catch {
    return raw
  }
}

function failure(t, error) {
  if (error instanceof SheetError) return t(`hive.reason.${error.reason}`, error.params)
  return error?.message || String(error)
}

/** The canvas, its zoom toggle and download, and the line under it. */
function HiveCanvas({ members, options, fileName, loading, actions }) {
  const { t, number, zone, dir } = useI18n()
  const canvas = useRef(null)
  const picture = usePicture(frankensteinUrl)
  const [actual, setActual] = useState(false)
  const [drawn, setDrawn] = useState(null)
  const { version, showGroups, spreadTop, spreadIndustry } = options

  useEffect(() => {
    if (!members?.length || !canvas.current) return
    const shape = t(`hive.shape.${SHAPE_KEYS[version]}`)
    const labels = {
      title: t('hive.canvas.title'),
      shelters: t('hive.canvas.shelters', { count: members.length }),
      frankenstein: t('hive.canvas.frankenstein'),
      industryLv: t('hive.canvas.industry_lv'),
      lv: t('hive.canvas.lv'),
      oneTile: t('hive.canvas.one_tile'),
      shelter3x3: t('hive.canvas.shelter_3x3'),
      lane: t('hive.canvas.lane'),
      tiles: t('hive.canvas.tiles'),
      gapEvery2: t('hive.canvas.gap_every_2'),
      frank1: t('hive.canvas.frank1'),
      frank2: t('hive.canvas.frank2'),
      shapeName: shape,
    }
    try {
      const layout = drawHive(
        canvas.current,
        members,
        { version, showGroups, spreadTop, spreadIndustry, ts: stamp(zone), labels, direction: dir },
        picture,
      )
      setDrawn({ width: layout.W, count: layout.N, farthest: layout.farthest, version, shape })
    } catch (error) {
      setDrawn((d) => ({ ...d, error: error.message }))
    }
  }, [members, version, showGroups, spreadTop, spreadIndustry, picture, t, zone, dir])

  const download = () => {
    canvas.current?.toBlob((blob) => blob && save(blob, `${fileName}_${stamp(zone)}.png`), 'image/png')
  }

  let status = null
  if (loading) status = loading
  else if (drawn?.error) status = t('hive.render_error', { reason: drawn.error })
  else if (drawn) {
    status = t('hive.status', {
      count: drawn.count,
      v: drawn.version,
      shape: drawn.shape,
      d: number(drawn.farthest, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    })
  }

  return (
    <>
      <div className="hive-actions">
        {actions}
        <button type="button" className="btn" onClick={() => setActual((a) => !a)} disabled={!drawn?.width}>
          <span aria-hidden="true">⤢</span> {actual ? t('hive.fit_width') : t('hive.actual_size')}
        </button>
        <button type="button" className="btn primary" onClick={download} disabled={!drawn?.width}>
          <span aria-hidden="true">⬇</span> {t('hive.download_png')}
        </button>
      </div>
      {/* Left to right whatever the page: the map is a picture, and at
          actual size it should open at its title, not its far edge. */}
      <div className={actual ? 'hive-frame actual' : 'hive-frame'} dir="ltr" hidden={!drawn?.width}>
        <div className="hive-sheet" style={{ width: drawn?.width }}>
          <canvas ref={canvas} width={400} height={300} role="img" aria-label={status || undefined} />
        </div>
      </div>
      {status && <p className="hive-status muted small" role="status">{status}</p>}
    </>
  )
}

function ViewLinks({ generator }) {
  const { t } = useI18n()
  const link = (path, on, label) => (
    <a
      href={path}
      className={on ? 'tab active' : 'tab'}
      aria-current={on ? 'page' : undefined}
      onClick={(e) => onLinkClick(e, path)}
    >
      {label}
    </a>
  )
  return (
    <nav className="hive-views" aria-label={t('hive.views.label')}>
      {link(CURRENT, !generator, t('hive.views.current'))}
      {link(GENERATOR, generator, t('hive.views.generator'))}
    </nav>
  )
}

function CurrentMap() {
  const { t, locale } = useI18n()
  const [roster] = useRoster(APPLIED_ROSTER_URL)
  const date = roster.date ? sheetDay(roster.date, locale) : null
  return (
    <>
      <div className="hive-head">
        <h2>{t('hive.current.title')}</h2>
        <p className="muted small">{t('hive.current.subtitle')}</p>
      </div>
      <div className="hive-note">
        <p><strong>{t('hive.current.applied')}</strong></p>
        <p className="muted small">
          {date ? t('hive.current.snapshot', { date }) : t('hive.current.snapshot_unknown')}{' '}
          <a href={GENERATOR} onClick={(e) => onLinkClick(e, GENERATOR)}>{t('hive.current.to_generator')}</a>
        </p>
      </div>
      {roster.status === 'error' && <Banner>{t('hive.current.load_failed', { reason: failure(t, roster.error) })}</Banner>}
      <HiveCanvas
        members={roster.members}
        options={APPLIED}
        fileName="hive_map_current"
        loading={roster.status === 'loading' ? t('hive.current.loading') : null}
      />
    </>
  )
}

function Generator() {
  const { t } = useI18n()
  const [roster, refresh] = useRoster(LIVE_ROSTER_URL)
  const [version, setVersion] = useState(1)
  const [showGroups, setShowGroups] = useState(true)
  const [spreadTop, setSpreadTop] = useState(true)
  const [spreadIndustry, setSpreadIndustry] = useState(true)
  const loading = roster.status === 'loading'

  const toggle = (on, set, label) => (
    <button type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => set(!on)}>
      {label}
    </button>
  )

  return (
    <>
      <div className="hive-head">
        <h2>{t('hive.generator.title')}</h2>
        <p className="muted small">
          {t('hive.generator.subtitle')}{' '}
          <a href={CURRENT} onClick={(e) => onLinkClick(e, CURRENT)}>{t('hive.generator.to_current')}</a>
        </p>
      </div>
      <div className="hive-controls">
        <label className="hive-layout">
          {t('hive.generator.layout')}
          <select value={version} onChange={(e) => setVersion(Number(e.target.value))}>
            {VERSIONS.map((v) => (
              <option key={v} value={v}>
                {`v${v} · ${t(`hive.shape.${SHAPE_KEYS[v]}`)}${SHAPE_EMOJI[v] ? ` ${SHAPE_EMOJI[v]}` : ''}`}
              </option>
            ))}
          </select>
        </label>
        <div className="hive-toggles">
          {toggle(showGroups, setShowGroups, t('hive.generator.stick_groups'))}
          {toggle(spreadTop, setSpreadTop, t('hive.generator.spread_top10'))}
          {toggle(spreadIndustry, setSpreadIndustry, t('hive.generator.spread_lv8'))}
        </div>
      </div>
      {roster.status === 'error' && <Banner>{t('hive.generator.load_failed', { reason: failure(t, roster.error) })}</Banner>}
      <HiveCanvas
        members={roster.members}
        options={{ version, showGroups, spreadTop, spreadIndustry }}
        fileName={`hive_map_v${version}`}
        loading={loading ? t('hive.generator.fetching') : null}
        actions={
          <button type="button" className="btn" onClick={refresh} disabled={loading}>
            <span aria-hidden="true">↻</span> {t('hive.generator.refresh')}
          </button>
        }
      />
      <p className="hive-hint muted">{t('hive.generator.hint')}</p>
    </>
  )
}

export default function HiveMap() {
  // pou-rocks wrote its addresses with a trailing slash.
  const path = usePath().replace(/(.)\/+$/, '$1')
  const generator = path === GENERATOR
  return (
    <div className="page hive">
      <ViewLinks generator={generator} />
      {generator ? <Generator /> : <CurrentMap />}
    </div>
  )
}
