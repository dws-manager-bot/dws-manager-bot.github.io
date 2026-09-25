import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'

/**
 * Who changed what. Reads the audit log the API has written since the first
 * release, so it covers changes made long before this page existed.
 */

const fmtWhen = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))

/** Plain-language labels: "announcement.occurrence.override" tells nobody much. */
const ACTIONS = {
  'announcement.create': ['created an announcement', 'add'],
  'announcement.update': ['edited an announcement', 'edit'],
  'announcement.delete': ['deleted an announcement', 'del'],
  'announcement.test': ['sent a test', 'test'],
  'event.create': ['created an event', 'add'],
  'event.update': ['edited an event', 'edit'],
  'event.delete': ['deleted an event', 'del'],
  'event.occurrence.override': ['rescheduled a date', 'move'],
  'event.occurrence.restore': ['restored a date', 'undo'],
  'member.sync': ['imported members from Discord', 'sync'],
  'member.update': ['edited a member', 'edit'],
  'lineup.save': ['saved a war line-up', 'edit'],
  'player.create': ['added a member', 'add'],
  'player.update': ['edited a member', 'edit'],
  'player.rename': ['recorded a new nickname', 'edit'],
  'player.correct': ['fixed the spelling of a name', 'edit'],
  'player.left': ['marked a member as left', 'del'],
  'player.returned': ['marked a member as returned', 'add'],
  'player.delete': ['deleted a member', 'del'],
  'player.import': ['imported screenshots', 'sync'],
}

const describe = (action) => ACTIONS[action]?.[0] ?? action
const kindOf = (action) => ACTIONS[action]?.[1] ?? 'edit'

/** The one or two details worth surfacing per action. */
function detailOf(row) {
  const d = row.detail
  if (!d) return null
  if (d.from && d.name) return `${d.from} → ${d.name}`
  if (d.name) return d.name
  if (d.key) return d.key
  if (d.added !== undefined) return `${d.added} added`
  if (d.skipped) return 'skipped that date'
  if (d.moved_to) return 'moved to a new time'
  if (d.original) return 'restored to the usual time'
  return null
}

export default function History() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api
      .listHistory(filter || undefined)
      .then(setRows)
      .catch((e) => setError(e.message))
  }, [filter])

  return (
    <div className="page">
      <div className="page-head">
        <h2>History</h2>
        <div className="row">
          {[
            ['', 'Everything'],
            ['announcement', 'Announcements'],
            ['event', 'Events'],
            ['player', 'Members'],
          ].map(([value, label]) => (
            <button
              key={label}
              className={filter === value ? 'chip on' : 'chip'}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>

      {rows === null && <p className="muted">Loading…</p>}
      {rows?.length === 0 && <p className="muted">Nothing recorded yet.</p>}

      {rows?.length > 0 && (
        <ol className="history">
          {rows.map((row) => (
            <li key={row.id} className="history-row">
              <span className={`hkind ${kindOf(row.action)}`}>{kindOf(row.action)}</span>
              <div className="hbody">
                <div>
                  <strong>{row.actor_name ?? 'someone'}</strong>{' '}
                  <span className="muted">{describe(row.action)}</span>
                </div>
                {detailOf(row) && <div className="hdetail">{detailOf(row)}</div>}
              </div>
              <time className="muted hwhen" dateTime={row.at}>{fmtWhen(row.at)}</time>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
