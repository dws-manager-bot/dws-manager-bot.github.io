import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import BgbCards from '../components/BgbCards.jsx'
import BgbRegistration from '../components/BgbRegistration.jsx'
import BgbResult, { Outcomes, fromRoster } from '../components/BgbResult.jsx'

/**
 * Black Gold Battlefield, the fortnightly two-team event.
 *
 * The week runs: registration closes, the roster screenshots arrive, the
 * roster is recorded here, the cards go out to the alliance, the battle is
 * fought, and the results come back. This tab follows that — the roster
 * recorder first, the result recorder after the battle.
 */

const MENUS = [
  ['roster', 'Roster recorder'],
  ['result', 'Result recorder'],
]

const fmtDay = (d) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${d}T00:00:00Z`))

const sizes = (event) =>
  ['A', 'B']
    .filter((t) => event.starters[t] || event.substitutes[t])
    .map((t) => `Team ${t} ${event.starters[t] ?? 0} + ${event.substitutes[t] ?? 0}`)
    .join('  ·  ')

function RosterRecorder() {
  const [events, setEvents] = useState(null)
  const [chosen, setChosen] = useState(null)      // the battle whose cards are open
  const [teams, setTeams] = useState([])
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  const load = useCallback(
    () => api.bgbEvents().then(setEvents).catch((e) => setError(e.message)),
    [],
  )
  useEffect(() => { load() }, [load])

  const open = useCallback(async (event) => {
    setError(null)
    try {
      setTeams(await api.bgbRoster(event.id))
      setChosen(event)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const recorded = async (done) => {
    const counts = done.teams
      .map((t) => `Team ${t.team} ${t.starters.length} + ${t.substitutes.length}`)
      .join(', ')
    setNote(`Recorded for ${done.battle_date}: ${counts}.`)
    setTeams(done.teams)
    setChosen({ id: done.event_id, battle_date: done.battle_date })
    load()
  }

  return (
    <>
      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNote(null)}>{note}</Banner>

      <BgbRegistration onRecorded={recorded} onError={setError} />

      {chosen && teams.length > 0 && (
        <>
          <h3 className="bgb-chosen">Cards for {fmtDay(chosen.battle_date)}</h3>
          <BgbCards event={chosen} teams={teams} onError={setError} />
        </>
      )}

      <Battles
        events={events}
        error={error}
        chosen={chosen}
        onPick={open}
        empty="None yet. Record one above and the cards appear here."
      />
    </>
  )
}

function Battles({ events, error, chosen, onPick, empty }) {
  return (
    <section className="panel">
      <h3>Battles recorded</h3>
      {events === null && !error && <p className="muted">Loading…</p>}
      {events?.length === 0 && <p className="muted">{empty}</p>}
      <div className="rows">
        {events?.map((event) => (
          <button
            type="button"
            key={event.id}
            className={chosen?.id === event.id ? 'bgb-event on' : 'bgb-event'}
            onClick={() => onPick(event)}
          >
            <span className="bgb-event-date">
              {fmtDay(event.battle_date)}
              {event.results_at && <span className="tag">result in</span>}
            </span>
            <span className="muted small">{sizes(event) || 'nobody registered'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function ResultRecorder() {
  const [events, setEvents] = useState(null)
  const [chosen, setChosen] = useState(null)
  const [recorded, setRecorded] = useState(null)   // what is already on file
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  const load = useCallback(
    () => api.bgbEvents().then(setEvents).catch((e) => setError(e.message)),
    [],
  )
  useEffect(() => { load() }, [load])

  const open = useCallback(async (event) => {
    setError(null)
    setNote(null)
    try {
      // The roster carries whatever result is already recorded against it, so
      // picking a battle shows what is known before anything is uploaded.
      const teams = await api.bgbRoster(event.id)
      const already = fromRoster(teams)
      setRecorded(already.teams.length ? already : null)
      setChosen(event)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const done = (result) => {
    const fought = result.teams.reduce((n, t) => n + t.fought, 0)
    const seats = result.teams.reduce((n, t) => n + t.outcomes.length, 0)
    setNote(`Recorded for ${result.battle_date}: ${fought} of ${seats} fought`
      + `${result.no_shows.length ? `, ${result.no_shows.length} starter no-show(s)` : ''}.`)
    setRecorded(result)
    load()
  }

  return (
    <>
      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <Banner tone="ok" onDismiss={() => setNote(null)}>{note}</Banner>

      {!chosen && (
        <p className="muted">
          Pick the battle whose result you have. The sheet is built from its roster, so the
          roster has to be recorded first.
        </p>
      )}

      {chosen && (
        <>
          <h3 className="bgb-chosen">Result for {fmtDay(chosen.battle_date)}</h3>
          <BgbResult event={chosen} onRecorded={done} onError={setError} />
          {recorded && (
            <section className="panel">
              <h3>On file</h3>
              <div className="import-result"><Outcomes result={recorded} /></div>
            </section>
          )}
        </>
      )}

      <Battles
        events={events}
        error={error}
        chosen={chosen}
        onPick={open}
        empty="No battles recorded yet. Record a roster first, on the roster recorder."
      />
    </>
  )
}

export default function Bgb() {
  const [menu, setMenu] = useState('roster')

  return (
    <div className="page">
      <div className="page-head">
        <h2>Black Gold Battlefield</h2>
      </div>

      <div className="row wrap subtabs">
        {MENUS.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={menu === id ? 'chip on' : 'chip'}
            onClick={() => setMenu(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {menu === 'roster' ? <RosterRecorder /> : <ResultRecorder />}
    </div>
  )
}
