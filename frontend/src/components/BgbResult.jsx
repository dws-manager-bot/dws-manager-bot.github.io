import { useState } from 'react'
import { api } from '../lib/api.js'
import { save } from '../lib/files.js'
import { short } from '../lib/cp.js'

/**
 * What happened in a battle, read off the game's result mail.
 *
 * The mail ranks every participant from both alliances together, so the only
 * rows that matter are the ones already registered — which is why the sheet
 * handed out is the battle's own roster, and why nothing can be added to it.
 *
 * Two ways of not fighting, told apart by what was typed: a score of zero means
 * the game listed them and they never fought; an empty one means they are not
 * in the ranking at all, and were dropped before the whistle. A starter in
 * either case is a no-show, which is the whole reason for doing this.
 */

const TEAM_LABEL = { A: 'Team A', B: 'Team B' }

/** A recorded roster in the shape the preview returns, so one view draws both. */
export function fromRoster(teams) {
  const out = []
  for (const team of teams) {
    const seats = [...team.starters, ...team.substitutes]
      .filter((s) => s.participated !== null && s.participated !== undefined)
      .map((s) => ({ ...s, listed: s.score !== null, no_show: s.role === 'starter' && !s.participated }))
    if (!seats.length) continue
    seats.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name))
    out.push({
      team: team.team,
      outcomes: seats,
      fought: seats.filter((s) => s.participated).length,
      listed_zero: seats.filter((s) => s.listed && !s.participated).length,
      absent: seats.filter((s) => !s.listed).length,
      total_score: seats.reduce((n, s) => n + (s.score ?? 0), 0),
    })
  }
  return { teams: out, no_shows: out.flatMap((t) => t.outcomes.filter((o) => o.no_show)) }
}

function Why({ outcome }) {
  if (outcome.participated) return <span className="muted">{short(outcome.score)}</span>
  return (
    <span className="muted">
      {outcome.listed ? 'scored nothing' : 'not in the ranking'}
    </span>
  )
}

export function Outcomes({ result }) {
  if (!result?.teams.length) return null
  return (
    <>
      {result.no_shows.length > 0 && (
        <div className="import-group bgb-noshow">
          <span className="label">
            Starters who did not fight ({result.no_shows.length}) — the ones to follow up
          </span>
          <ul className="import-list">
            {result.no_shows.map((o) => (
              <li key={o.registration_id}>
                <b>{o.name}</b> <span className="muted">{TEAM_LABEL[o.team]} ·</span>{' '}
                <Why outcome={o} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.teams.map((t) => (
        <div className="bgb-team" key={t.team}>
          <h4>{TEAM_LABEL[t.team]}</h4>
          <div className="card-meta">
            <span>{t.fought} fought</span>
            {t.listed_zero > 0 && <span>{t.listed_zero} scored nothing</span>}
            {t.absent > 0 && <span>{t.absent} not in the ranking</span>}
            <span>{short(t.total_score)} between them</span>
          </div>
          <ul className="import-list bgb-scores">
            {t.outcomes.map((o) => (
              <li key={o.registration_id} className={o.participated ? '' : 'out'}>
                <b>{o.name}</b>
                {o.role === 'substitute' && <span className="tag">sub</span>}
                <Why outcome={o} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

export default function BgbResult({ event, onRecorded, onError }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  const reset = () => setPreview(null)

  async function download() {
    onError(null)
    try {
      const { blob, name } = await api.bgbResultTemplate(event.id)
      save(blob, name)
    } catch (err) {
      onError(err.message)
    }
  }

  async function check() {
    onError(null)
    setBusy(true)
    try {
      setPreview(await api.previewBgbResult(event.id, file))
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
      const done = await api.applyBgbResult(event.id, {
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

  return (
    <section className="panel import">
      <h3>Record the result</h3>
      <p className="muted small">
        Download the sheet — it is this battle's own roster, so there is nothing to add — and
        type each player's score the way the game prints it: 2M, 993.7K, or a plain number. A
        score of 0 means the ranking listed them and they never fought; leave it empty if they
        are not in the ranking at all.
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

          <Outcomes result={preview} />

          <div className="card-actions">
            <button className="btn primary" onClick={apply} disabled={busy || blocked}>
              {busy ? 'Saving…' : 'Record this result'}
            </button>
            <button className="btn" onClick={reset} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
