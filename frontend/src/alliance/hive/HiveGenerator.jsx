/*
 * The hive map generator, for admins. It draws the formation from the member
 * table — who asked for the outside, who sticks with whom, and the CP behind the
 * ranking — and "Apply" turns the drawing into the picture members are shown.
 * Members are never sent the table, only that picture.
 *
 * Admin pages are in English, and so is what is drawn: the picture is shared.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Banner from '../../components/Banner.jsx'
import english from '../../i18n/messages/hive/en.json'
import { api } from '../../lib/api.js'
import { save } from '../../lib/files.js'
import { utcToZoned } from '../../lib/tz.js'
import { useI18n } from '../../i18n/I18n.jsx'
import { ENGLISH_LABELS, drawHive } from './draw.js'
import frankensteinUrl from './frankenstein.jpg'
import { SHAPE_KEYS, VERSIONS } from './layout.js'
import './hive.css'

const SHAPE_EMOJI = { 5: '❤️', 6: '🐱', 7: '🖕', 8: '💀', 9: '❄️' }

/** The member table as the layout reads it: only current members with a total CP. */
export function toHiveMembers(players) {
  return players
    .filter((p) => p.active && p.total_cp > 0)
    .map((p, id) => ({
      id,
      name: p.name,
      level: p.industry_level ?? null,
      bgbCp: p.bgb_cp ?? 0,
      cp: p.total_cp,
      // Total CP less troop CP; unknown until a scan has read their troops.
      growth: p.troop_cp != null ? p.total_cp - p.troop_cp : 0,
      outermost: p.hive_outermost,
      group: p.hive_group || null,
    }))
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

const stamp = (zone) => utcToZoned(new Date().toISOString(), zone).replace(/-|:/g, '').replace('T', '_')

export default function HiveGenerator() {
  const { zone } = useI18n()
  const canvas = useRef(null)
  const picture = usePicture(frankensteinUrl)
  const [players, setPlayers] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actual, setActual] = useState(false)
  const [drawn, setDrawn] = useState(null)
  const [version, setVersion] = useState(1)
  const [showGroups, setShowGroups] = useState(true)
  const [spreadTop, setSpreadTop] = useState(true)
  const [spreadIndustry, setSpreadIndustry] = useState(true)

  const load = useCallback(() => {
    setPlayers(null)
    api.listPlayers().then(setPlayers).catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const members = players ? toHiveMembers(players) : null
  const unscanned = members ? members.filter((m) => !m.growth).length : 0

  useEffect(() => {
    if (!members?.length || !canvas.current) return
    try {
      const layout = drawHive(
        canvas.current,
        members,
        {
          version, showGroups, spreadTop, spreadIndustry, ts: stamp(zone), direction: 'ltr',
          labels: { ...ENGLISH_LABELS, shapeName: english.shape[SHAPE_KEYS[version]] },
        },
        picture,
      )
      setDrawn({ width: layout.W, count: layout.N, farthest: layout.farthest })
    } catch (e) {
      setDrawn({ error: e.message })
    }
    // `members` is rebuilt from `players` on every render; the table itself is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, version, showGroups, spreadTop, spreadIndustry, picture, zone])

  const png = () => new Promise((resolve) => canvas.current.toBlob(resolve, 'image/png'))

  async function apply() {
    if (!window.confirm(
      `Make this the hive map every member sees?\n\n${drawn.count} shelters, layout v${version}.`,
    )) return
    setBusy(true)
    setError(null)
    try {
      const blob = await png()
      await api.applyHive(blob, drawn.count, {
        version, showGroups, spreadTop, spreadIndustry,
        farthest: Math.round(drawn.farthest * 10) / 10, width: drawn.width,
      })
      setNote(`Applied: ${drawn.count} shelters, layout v${version}. Members see it now.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    save(await png(), `hive_map_v${version}_${stamp(zone)}.png`)
  }

  const toggle = (on, set, label) => (
    <button type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => set(!on)}>
      {label}
    </button>
  )
  const ready = Boolean(drawn?.width)

  return (
    <div className="page hive">
      <div className="hive-head">
        <h2>Hive map</h2>
        <p className="muted small">
          Drawn from the Members tab. Outer shelters go to, in order: who asked for the outside, growth (total
          CP less troop CP), BGB CP, industry level, total CP. Members see only the map you apply.
        </p>
      </div>
      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNote(null)}>{note}</Banner>
      <div className="hive-controls">
        <label className="hive-layout">
          Layout
          <select value={version} onChange={(e) => setVersion(Number(e.target.value))}>
            {VERSIONS.map((v) => (
              <option key={v} value={v}>
                {`v${v} · ${english.shape[SHAPE_KEYS[v]]}${SHAPE_EMOJI[v] ? ` ${SHAPE_EMOJI[v]}` : ''}`}
              </option>
            ))}
          </select>
        </label>
        <div className="hive-toggles">
          {toggle(showGroups, setShowGroups, 'Stick groups')}
          {toggle(spreadTop, setSpreadTop, 'Spread Top 10')}
          {toggle(spreadIndustry, setSpreadIndustry, 'Spread Lv8')}
        </div>
      </div>
      <div className="hive-actions">
        <button type="button" className="btn" onClick={load} disabled={!players}>
          <span aria-hidden="true">↻</span> Reload members
        </button>
        <button type="button" className="btn" onClick={() => setActual((a) => !a)} disabled={!ready}>
          <span aria-hidden="true">⤢</span> {actual ? 'Fit width' : 'Actual size'}
        </button>
        <button type="button" className="btn" onClick={download} disabled={!ready}>
          <span aria-hidden="true">⬇</span> Download PNG
        </button>
        <button type="button" className="btn primary" onClick={apply} disabled={!ready || busy}>
          {busy ? 'Applying…' : 'Apply this map'}
        </button>
      </div>
      <div className={actual ? 'hive-frame actual' : 'hive-frame'} dir="ltr" hidden={!ready}>
        <div className="hive-sheet" style={{ width: drawn?.width }}>
          <canvas ref={canvas} width={400} height={300} role="img" aria-label="Hive map preview" />
        </div>
      </div>
      {members === null && !error && <p className="muted">Loading members…</p>}
      {members?.length === 0 && <p className="muted">No current member has a total CP yet.</p>}
      {drawn?.error && <p className="error">Render error: {drawn.error}</p>}
      {ready && (
        <p className="hive-status muted small" role="status">
          {drawn.count} members · farthest ≈ {drawn.farthest.toFixed(1)} tiles
          {unscanned > 0 && ` · ${unscanned} without a troop CP read count as no growth`}
        </p>
      )}
    </div>
  )
}
