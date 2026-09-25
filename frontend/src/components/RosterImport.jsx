import { useState } from 'react'
import { api } from '../lib/api.js'
import { short, today } from '../lib/cp.js'

/**
 * The roster as a spreadsheet: download it, edit it, upload it back.
 *
 * The file carries each player's id, which is what makes a rename a rename
 * rather than a guess: same id, different name. A row with no id is somebody
 * new, and a member whose row is gone has left — that last one being the
 * reason nothing is written until the changes have been read and confirmed.
 */

const LABELS = {
  rank: 'rank',
  industry_level: 'level',
  bgb_cp: 'BGB CP',
  total_cp: 'total CP',
}

const asNumber = (field, value) =>
  value == null ? '—' : field.endsWith('_cp') ? short(value) : String(value)

function Fields({ fields }) {
  const entries = Object.entries(fields || {})
  if (!entries.length) return null
  return (
    <span className="muted">
      {entries
        .map(([field, [before, after]]) =>
          `${LABELS[field] ?? field} ${asNumber(field, before)} → ${asNumber(field, after)}`)
        .join(' · ')}
    </span>
  )
}

export default function RosterImport({ onApplied, onError }) {
  const [file, setFile] = useState(null)
  const [asOf, setAsOf] = useState(today())
  const [preview, setPreview] = useState(null)
  const [keep, setKeep] = useState([])       // ids not to mark as having left
  const [busy, setBusy] = useState(false)

  const reset = () => { setPreview(null); setKeep([]) }

  async function download() {
    onError(null)
    try {
      const { blob, name } = await api.rosterTemplate()
      const url = URL.createObjectURL(blob)
      const link = Object.assign(document.createElement('a'), { href: url, download: name })
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      onError(err.message)
    }
  }

  async function check() {
    onError(null)
    setBusy(true)
    try {
      setPreview(await api.previewRosterImport(file, asOf))
      setKeep([])
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
      const done = await api.applyRosterImport({
        as_of: asOf,
        fingerprint: preview.fingerprint,
        file_name: file?.name,
        rows: preview.rows,
        keep,
      })
      reset()
      setFile(null)
      onApplied(done)
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const counts = preview && [
    [preview.updated.length, 'updated'],
    [preview.renamed.length, 'renamed'],
    [preview.added.length, 'new'],
    [preview.left.length - keep.length, 'left'],
    [preview.returning.length, 'back'],
    [preview.unchanged, 'unchanged'],
  ].filter(([n]) => n > 0)
  const nothingToDo = preview && !counts.some(([n, label]) => n > 0 && label !== 'unchanged')

  return (
    <section className="panel import">
      <h3>Import from a spreadsheet</h3>
      <p className="muted small">
        Download the template, update it, and upload it back. It carries each player's id, so a
        changed name is read as a rename, a row with no id as a new member, and a row you delete
        as someone who left. Nothing is written until you confirm.
      </p>

      <div className="row wrap">
        <button className="btn" onClick={download} disabled={busy}>Download template</button>
        <label className="file-pick">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset() }}
          />
        </label>
        <label className="as-of">
          Data as of
          <input type="date" value={asOf} onChange={(e) => { setAsOf(e.target.value); reset() }} />
        </label>
        <button className="btn primary" onClick={check} disabled={!file || busy}>
          {busy ? 'Reading…' : 'Check file'}
        </button>
      </div>

      {preview && (
        <div className="import-result">
          {preview.problems.length > 0 && (
            <div className="banner error">
              <div className="banner-body">
                <strong>This file cannot be used yet:</strong>
                <ul>{preview.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            </div>
          )}

          <div className="card-meta">
            <span className="pill">as of {preview.as_of}</span>
            {counts.map(([n, label]) => <span key={label}>{n} {label}</span>)}
          </div>

          {preview.left.length > 0 && (
            <div className="import-group">
              <span className="label">
                Not in the file, so read as having left — untick anyone who has not
              </span>
              {preview.left.map((c) => (
                <label className="inline" key={c.player_id}>
                  <input
                    type="checkbox"
                    checked={!keep.includes(c.player_id)}
                    onChange={(e) => setKeep((k) => e.target.checked
                      ? k.filter((id) => id !== c.player_id)
                      : [...k, c.player_id])}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}

          {[
            ['Renamed', preview.renamed, (c) => <><b>{c.was}</b> → {c.name} <Fields fields={c.fields} /></>],
            ['New members', preview.added, (c) => <><b>{c.name}</b> <Fields fields={c.fields} /></>],
            ['Back in the alliance', preview.returning, (c) => <><b>{c.name}</b> <Fields fields={c.fields} /></>],
            ['Updated', preview.updated, (c) => <><b>{c.name}</b> <Fields fields={c.fields} /></>],
          ].map(([title, list, render]) => list.length > 0 && (
            <div className="import-group" key={title}>
              <span className="label">{title} ({list.length})</span>
              <ul className="import-list">
                {list.map((c) => <li key={c.player_id ?? `${title}-${c.line}`}>{render(c)}</li>)}
              </ul>
            </div>
          ))}

          <div className="card-actions">
            <button
              className="btn primary"
              onClick={apply}
              disabled={busy || preview.problems.length > 0 || nothingToDo}
            >
              {busy ? 'Saving…' : nothingToDo ? 'Nothing to change' : 'Apply these changes'}
            </button>
            <button className="btn" onClick={reset} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
