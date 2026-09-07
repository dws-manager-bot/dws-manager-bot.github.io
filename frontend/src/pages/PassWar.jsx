import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import Banner from '../components/Banner.jsx'
import markup from '../passwar/markup.js'
import { init } from '../passwar/app.js'
import '../passwar/passwar.css'

/**
 * The Pass Occupation War map, moved in from pou-rocks/pou-pass-war.
 *
 * It is a self-contained app that drives its own DOM by id — drag-to-reorder
 * lineup, canvas render, PNG export — so React hands it a host element and
 * stays out of it. Rewriting all of that as components would have risked
 * behaviour that already worked; only its sign-in gate and its private copy of
 * token handling were replaced, since the backoffice already provides both.
 */
export default function PassWar({ user }) {
  const host = useRef(null)
  const started = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // StrictMode mounts twice in development; the app is not re-entrant.
    if (started.current || !host.current || !user) return
    started.current = true
    host.current.innerHTML = markup
    try {
      init({ root: host.current, api: api.raw, user })
    } catch (err) {
      setError(`The map failed to start: ${err.message}`)
    }
  }, [user])

  return (
    <div className="page">
      <Banner tone="error" onDismiss={() => setError(null)}>{error}</Banner>
      <div className="passwar" ref={host} />
    </div>
  )
}
