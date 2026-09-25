import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

/**
 * Handing a battle's cards to the alliance, as a Discord thread.
 *
 * One thread per battle: Team A's heading and its fifteen cards, then Team B's.
 * The cards go four to a message, which is the grid Discord's client lays out
 * evenly, with the languages named above them in the order they were attached.
 *
 * A post to a channel everyone reads cannot be taken back, so this asks first,
 * says exactly what it is about to do, and refuses a second thread unless that
 * is plainly what was wanted.
 */

export default function BgbPublish({ event, teams, onPublished, onError }) {
  const [channels, setChannels] = useState(null)
  const [channel, setChannel] = useState('')
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    api.channels()
      .then((list) => {
        setChannels(list)
        // The alliance has a channel for this; default to it rather than making
        // them find it every fortnight.
        const bgb = list.find((c) => c.name === 'bgb') ?? list[0]
        setChannel(String(bgb?.id ?? ''))
      })
      .catch((err) => onError(err.message))
  }, [onError])

  // Per team: a heading, then fifteen cards four to a message.
  const cards = teams.length * 15
  const messages = teams.length * 5

  async function post(again) {
    onError(null)
    setBusy(true)
    try {
      onPublished(await api.publishBgbCards(event.id, { channel_id: channel, again }))
      setAsking(false)
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const where = channels?.find((c) => String(c.id) === channel)

  return (
    <section className="panel">
      <h3>Post to Discord</h3>
      {event.thread_url ? (
        <p className="muted small">
          Already posted.{' '}
          <a href={event.thread_url} target="_blank" rel="noreferrer">Open the thread</a>
          {' — '}posting again makes a second one, which the alliance will see.
        </p>
      ) : (
        <p className="muted small">
          Creates a thread called <b>BGB {event.battle_date}(…) Mini-Team Placement</b> and posts
          all {cards} cards into it — {teams.map((t) => `Team ${t.team}`).join(' then ')}, four
          languages to a message. Members are not mentioned.
        </p>
      )}

      <div className="row wrap">
        <label className="as-of">
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value)} disabled={busy}>
            {channels === null && <option value="">Loading…</option>}
            {channels?.map((c) => (
              <option key={c.id} value={String(c.id)}>#{c.name}</option>
            ))}
          </select>
        </label>
        {!asking ? (
          <button
            className="btn primary"
            disabled={!channel || busy}
            onClick={() => setAsking(true)}
          >
            {event.thread_url ? 'Post again' : 'Post the cards'}
          </button>
        ) : (
          <>
            <button className="btn primary" disabled={busy} onClick={() => post(Boolean(event.thread_url))}>
              {busy ? 'Posting…' : `Yes, post to #${where?.name ?? '…'}`}
            </button>
            <button className="btn" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
          </>
        )}
      </div>

      {asking && !busy && (
        <p className="muted small">
          {messages} messages and {cards} images go to <b>#{where?.name}</b>. Everyone in that
          channel will see them.
        </p>
      )}
      {busy && (
        <p className="muted small">
          Drawing and uploading {cards} cards — this takes half a minute. Don't close the tab.
        </p>
      )}
    </section>
  )
}
