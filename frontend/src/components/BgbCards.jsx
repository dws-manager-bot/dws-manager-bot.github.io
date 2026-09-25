import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { save } from '../lib/files.js'

/**
 * The briefing cards for a recorded battle, one language at a time.
 *
 * The game ships fifteen languages and the alliance speaks most of them, so a
 * card is drawn in each. A button carries the language's own name first and
 * ours in brackets — 한국어 (Korean) — because the member looking for their own
 * language reads it in that language, while the admin handing the cards out
 * needs to know which button they just pressed.
 */

const TEAM_LABEL = { A: 'Team A', B: 'Team B' }

/* The list never changes while the page is open, and every card screen wants
   it, so it is fetched once and shared. */
let languagesOnce = null
const languages = () => (languagesOnce ??= api.bgbLanguages())

export default function BgbCards({ event, teams, onError }) {
  const [langs, setLangs] = useState([])
  const [team, setTeam] = useState(teams[0]?.team ?? 'A')
  const [lang, setLang] = useState('en')
  const [card, setCard] = useState(null)      // { blob, name, url }
  const [busy, setBusy] = useState(false)
  const [zipping, setZipping] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    languages().then(setLangs).catch((e) => onError(e.message))
  }, [onError])

  useEffect(() => {
    if (!teams.some((t) => t.team === team)) setTeam(teams[0]?.team ?? 'A')
  }, [teams, team])

  useEffect(() => {
    // A slow request for a language already clicked past must not replace the
    // card now on screen, so only the newest request is allowed to land.
    const mine = (latest.current += 1)
    setBusy(true)
    api.bgbCard(event.id, team, lang)
      .then(({ blob, name }) => {
        if (mine !== latest.current) return
        setCard({ blob, name, url: URL.createObjectURL(blob) })
      })
      .catch((err) => { if (mine === latest.current) onError(err.message) })
      .finally(() => { if (mine === latest.current) setBusy(false) })
  }, [event.id, team, lang, onError])

  // Each card's object URL is released when the next one replaces it, and the
  // last when the panel closes. Without this every language clicked leaks a
  // third of a megabyte for as long as the tab is open.
  useEffect(() => () => { if (card) URL.revokeObjectURL(card.url) }, [card])

  async function downloadAll() {
    onError(null)
    setZipping(true)
    try {
      const { blob, name } = await api.bgbCards(event.id)
      save(blob, name)
    } catch (err) {
      onError(err.message)
    } finally {
      setZipping(false)
    }
  }

  return (
    <section className="panel bgb-cards">
      <h3>Briefing cards</h3>
      <p className="muted small">
        One card per team, in every language the game carries BGB text for. Hand a member the
        one they read.
      </p>

      {teams.length > 1 && (
        <div className="row wrap bgb-teams">
          {teams.map((t) => (
            <button
              type="button"
              key={t.team}
              className={t.team === team ? 'chip on' : 'chip'}
              onClick={() => setTeam(t.team)}
            >
              {TEAM_LABEL[t.team]}
            </button>
          ))}
        </div>
      )}

      <div className="row wrap bgb-langs">
        {langs.map((l) => (
          <button
            type="button"
            key={l.code}
            className={l.code === lang ? 'chip on' : 'chip'}
            onClick={() => setLang(l.code)}
            lang={l.code.replace('_', '-')}
          >
            {l.native === l.english ? l.native : `${l.native} (${l.english})`}
          </button>
        ))}
      </div>

      <div className={busy ? 'bgb-card loading' : 'bgb-card'}>
        {card && (
          <a href={card.url} target="_blank" rel="noreferrer" title="Open at full size">
            <img src={card.url} alt={`${TEAM_LABEL[team]} briefing card`} />
          </a>
        )}
        {busy && <span className="muted small">Drawing…</span>}
      </div>

      <div className="card-actions">
        <button
          className="btn primary"
          disabled={!card || busy}
          onClick={() => save(card.blob, card.name)}
        >
          Download this card
        </button>
        <button className="btn" onClick={downloadAll} disabled={zipping}>
          {zipping ? 'Zipping…' : 'Download all (zip)'}
        </button>
      </div>
    </section>
  )
}
