import { useState } from 'react'
import { api } from '../lib/api.js'
import { save } from '../lib/files.js'
import { short, today } from '../lib/cp.js'

/**
 * Recording who the game says is registered for a battle.
 *
 * The roster is not ours to decide: an admin reads it off the in-game
 * Participants popup once registration locks, and marks it on a sheet that
 * already carries every member's id. So this is a transcription, and what it
 * guards against is a transcription going wrong — more starters than the game
 * allows, somebody on both sides, a file that read as empty.
 */

const TEAM_LABEL = { A: 'Team A', B: 'Team B' }

function Seats({ title, seats }) {
  if (!seats.length) return null
  return (
    <div className="import-group">
      <span className="label">{title} ({seats.length})</span>
      <ul className="import-list">
        {seats.map((s) => (
          <li key={s.player_id}>
            <b>{s.name}</b> <span className="muted">{short(s.bgb_cp)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function BgbRegistration({ onRecorded, onError }) {
  const [file, setFile] = useState(null)
  const [battleDate, setBattleDate] = useState(today())
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  const reset = () => setPreview(null)

  async function download() {
    onError(null)
    try {
      const { blob, name } = await api.bgbTemplate()
      save(blob, name)
    } catch (err) {
      onError(err.message)
    }
  }

  async function check() {
    onError(null)
    setBusy(true)
    try {
      setPreview(await api.previewBgbRoster(file, battleDate))
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    onError(null)
    setBusy(true)
    try {
      const done = await api.applyBgbRoster({
        battle_date: battleDate,
        fingerprint: preview.fingerprint,
        file_name: file?.name,
        rows: preview.rows,
      })
      reset()
      setFile(null)
      onRecorded(done)
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const blocked = preview && preview.problems.length > 0
  const nothing = preview && preview.teams.length === 0

  return (
    <section className="panel import">
      <h3>Record a registration</h3>
      <p className="muted small">
        Download the sheet, mark O against the starters and substitutes on each team, and upload
        it back. Only the marked are recorded. Nothing is written until you confirm.
      </p>

      <div className="row wrap">
        <button className="btn" onClick={download} disabled={busy}>Download sheet</button>
        <label className="file-pick">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset() }}
          />
        </label>
        <label className="as-of">
          Battle date
          <input
            type="date"
            value={battleDate}
            onChange={(e) => { setBattleDate(e.target.value); reset() }}
          />
        </label>
        <button className="btn primary" onClick={check} disabled={!file || busy}>
          {busy ? 'Reading…' : 'Check file'}
        </button>
      </div>

      {preview && (
        <div className="import-result">
          {blocked && (
            <div className="banner error">
              <div className="banner-body">
                <strong>This file cannot be used yet:</strong>
                <ul>{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            </div>
          )}

          <div className="card-meta">
            <span className="pill">{preview.battle_date}</span>
            {preview.teams.map((t) => (
              <span key={t.team}>
                {TEAM_LABEL[t.team]} {t.starters.length} + {t.substitutes.length}
              </span>
            ))}
            {preview.cp_changes.length > 0 && (
              <span>{preview.cp_changes.length} CP updated</span>
            )}
          </div>

          {preview.replaces > 0 && !blocked && (
            <div className="banner note">
              <div className="banner-body">
                A roster of {preview.replaces} is already recorded for {preview.battle_date}.
                Recording this one replaces it.
              </div>
            </div>
          )}

          {preview.teams.map((t) => (
            <div className="bgb-team" key={t.team}>
              <h4>{TEAM_LABEL[t.team]}</h4>
              {t.warnings.map((w) => <p className="warn-line" key={w}>{w}</p>)}
              <Seats title="Starters" seats={t.starters} />
              <Seats title="Substitutes" seats={t.substitutes} />
            </div>
          ))}

          {preview.cp_changes.length > 0 && (
            <div className="import-group">
              <span className="label">
                BGB CP corrected on the sheet — these update the member too
              </span>
              <ul className="import-list">
                {preview.cp_changes.map((c) => (
                  <li key={c.player_id}>
                    <b>{c.name}</b>{' '}
                    <span className="muted">{short(c.before)} → {short(c.after)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card-actions">
            <button className="btn primary" onClick={apply} disabled={busy || blocked || nothing}>
              {busy ? 'Saving…' : 'Record this roster'}
            </button>
            <button className="btn" onClick={reset} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
