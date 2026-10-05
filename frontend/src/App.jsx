import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { api, clearToken, consumeTokenFromUrl, getToken, loginUrl } from './lib/api.js'
import { navigate, onLinkClick, rememberReturn, takeReturn, usePath } from './lib/route.js'

/* Each page is its own download, so a member never fetches the admin pages and
   nobody fetches the War planner until they open it. */
const Announcements = lazy(() => import('./pages/Announcements.jsx'))
const Bgb = lazy(() => import('./pages/Bgb.jsx'))
const Events = lazy(() => import('./pages/Events.jsx'))
const History = lazy(() => import('./pages/History.jsx'))
const Members = lazy(() => import('./pages/Members.jsx'))
const PassWar = lazy(() => import('./pages/PassWar.jsx'))
const Season = lazy(() => import('./pages/Season.jsx'))
const Setup = lazy(() => import('./pages/Setup.jsx'))
const WarPlanner = lazy(() => import('./pages/WarPlanner.jsx'))

/* Alliance pages are for everyone who can sign in: the Members role, an admin
   role, or the server owner. Admin pages are hidden from members, and the API
   refuses them anyway. */
const PAGES = [
  { id: 'passwar', path: '/pass-war', label: 'Pass War map', Component: PassWar },
  { id: 'setup', path: '/admin/setup', label: 'Set up', Component: Setup, admin: true },
  { id: 'announcements', path: '/admin/announcements', label: 'Announcements', Component: Announcements, admin: true },
  { id: 'events', path: '/admin/events', label: 'Events', Component: Events, admin: true },
  { id: 'members', path: '/admin/members', label: 'Members', Component: Members, admin: true },
  { id: 'bgb', path: '/admin/bgb', label: 'BGB', Component: Bgb, admin: true },
  { id: 'season', path: '/admin/season', label: 'Season', Component: Season, admin: true },
  { id: 'history', path: '/admin/history', label: 'History', Component: History, admin: true },
  // Admin-only, reading included: it is the alliance's strategy.
  { id: 'warplan', path: '/admin/war-planner', label: 'War planner', Component: WarPlanner, admin: true },
]

const GROUPS = [
  { name: 'Alliance', pages: PAGES.filter((p) => !p.admin) },
  { name: 'Admin', pages: PAGES.filter((p) => p.admin), admin: true },
]

export default function App() {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')
  const [authError, setAuthError] = useState(null)
  const [health, setHealth] = useState(null)
  const path = usePath()
  const nav = useRef(null)

  useEffect(() => {
    const result = consumeTokenFromUrl()
    if (result?.error === 'not_authorised') {
      setAuthError(
        'That Discord account does not have the Members role in the PoU server. Ask an admin for it.',
      )
      setStatus('anonymous')
      return
    }
    if (result?.token) {
      const back = takeReturn()
      if (back && back !== '/') navigate(back, { replace: true })
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

  const groups = user ? GROUPS.filter((g) => !g.admin || user.is_admin) : []
  const visible = groups.flatMap((g) => g.pages)
  const current = visible.find((p) => p.path === path)
  // The root, an old link, or an admin page opened by a member: land on the
  // first page this person can see.
  const landing = user?.is_admin ? PAGES.find((p) => p.admin) : visible[0]
  useEffect(() => {
    if (user && !current) navigate(landing.path, { replace: true })
  }, [user, current, landing])

  // On a phone the admin tabs start off-screen; bring the open one into view.
  useEffect(() => {
    const strip = nav.current
    const tab = strip?.querySelector('.tab.active')
    if (!tab) return
    const box = strip.getBoundingClientRect()
    const at = tab.getBoundingClientRect()
    if (at.left < box.left || at.right > box.right) strip.scrollLeft += at.left - box.left - 16
  }, [current])

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
            Sign in with the Discord account you use in the PoU server.
          </p>
          {authError && <p className="error">{authError}</p>}
          <a className="btn primary" href={loginUrl()} onClick={rememberReturn}>
            Sign in with Discord
          </a>
        </div>
      </div>
    )
  }

  if (!current) return null
  const Active = current.Component
  const goTo = (id) => navigate(PAGES.find((p) => p.id === id).path)

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
        <nav className="tabs" ref={nav}>
          {groups.map((group) => (
            <div className="tab-group" key={group.name}>
              {groups.length > 1 && <span className="tab-group-name">{group.name}</span>}
              {group.pages.map((p) => (
                <a
                  key={p.id}
                  href={p.path}
                  className={p.id === current.id ? 'tab active' : 'tab'}
                  aria-current={p.id === current.id ? 'page' : undefined}
                  onClick={(e) => onLinkClick(e, p.path)}
                >
                  {p.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </header>
      <main>
        <Suspense fallback={<div className="muted">Loading…</div>}>
          <Active onDone={goTo} user={user} />
        </Suspense>
      </main>
    </div>
  )
}
