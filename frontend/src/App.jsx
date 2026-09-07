import { useEffect, useState } from 'react'
import { api, clearToken, consumeTokenFromUrl, getToken, loginUrl } from './lib/api.js'
import Announcements from './pages/Announcements.jsx'
import Events from './pages/Events.jsx'
import History from './pages/History.jsx'
import PassWar from './pages/PassWar.jsx'
import Setup from './pages/Setup.jsx'

const TABS = [
  { id: 'setup', label: 'Set up', Component: Setup },
  { id: 'announcements', label: 'Announcements', Component: Announcements },
  { id: 'events', label: 'Events', Component: Events },
  { id: 'history', label: 'History', Component: History },
  // Any guild member may open this; the officer-only tabs are hidden from them.
  { id: 'passwar', label: 'Pass War map', Component: PassWar, everyone: true },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')
  const [authError, setAuthError] = useState(null)
  const [tab, setTab] = useState('setup')
  const [health, setHealth] = useState(null)

  useEffect(() => {
    const result = consumeTokenFromUrl()
    if (result?.error === 'not_authorised') {
      setAuthError('That Discord account does not hold an officer role in the alliance.')
      setStatus('anonymous')
      return
    }
    if (!getToken()) {
      setStatus('anonymous')
      return
    }
    api
      .me()
      .then((me) => {
        setUser(me)
        setStatus('ready')
      })
      .catch(() => setStatus('anonymous'))
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    const tick = () => api.health().then(setHealth).catch(() => setHealth(null))
    tick()
    const timer = setInterval(tick, 30000)
    return () => clearInterval(timer)
  }, [status])

  if (status === 'loading') {
    return <div className="centered muted">Loading…</div>
  }

  if (status === 'anonymous') {
    return (
      <div className="centered">
        <div className="login-card">
          <h1>
            <span className="brand-tag">[PoU]</span> Path of Unity
          </h1>
          <p className="brand-sub muted">Alliance Manager</p>
          <p className="muted">
            Sign in with the Discord account that holds your officer role.
          </p>
          {authError && <p className="error">{authError}</p>}
          <a className="btn primary" href={loginUrl()}>
            Sign in with Discord
          </a>
        </div>
      </div>
    )
  }

  // A member who is not an officer can only use the map; showing them four
  // tabs that answer 403 would be worse than not showing them at all.
  const visible = user.is_admin ? TABS : TABS.filter((t) => t.everyone)
  const current = visible.find((t) => t.id === tab) ?? visible[0]
  const Active = current.Component

  return (
    <div className="app">
      <header>
        <div className="header-top">
          <div className="brand">
            {/* The tag reads as part of the title rather than as a separate
                badge, and the name truncates on a narrow phone. */}
            <span className="brand-tag">[PoU]</span>
            <strong>Path of Unity Alliance Manager</strong>
          </div>
          <div className="user">
            {/* The health strip is the first thing to go when space is tight. */}
            {health && (
              <span className="health" title={`${health.scheduled_jobs} scheduled`}>
                <span className={`dot ${health.discord ? 'ok' : 'bad'}`} />
                <span className={`dot ${health.database ? 'ok' : 'bad'}`} />
              </span>
            )}
            <span className="who muted small">{user.username}</span>
            <button
              className="btn ghost small"
              onClick={() => {
                clearToken()
                window.location.reload()
              }}
            >
              Sign out
            </button>
          </div>
        </div>
        {/* Scrolls sideways rather than wrapping, which would double the
            header height on a narrow phone. */}
        <nav className="tabs">
          {visible.map((t) => (
            <button
              key={t.id}
              className={t.id === current.id ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <Active onDone={setTab} user={user} />
      </main>
    </div>
  )
}
