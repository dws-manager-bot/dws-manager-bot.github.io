import { useEffect, useState } from 'react'

/**
 * Pages have real addresses, so a member can share one and land on it.
 *
 * GitHub Pages serves 404.html (a copy of index.html) for any path it has no
 * file for, which is what lets /admin/events load the app on a reload.
 */

const RETURN_KEY = 'dws.return'

export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname) return
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  return path
}

/* Discord sends everyone back to the site's root, so the page someone opened
   before signing in is kept for the moment they return. */
export function rememberReturn() {
  try {
    sessionStorage.setItem(RETURN_KEY, window.location.pathname)
  } catch {
    // Private windows can refuse storage; the root is a fine place to land.
  }
}

export function takeReturn() {
  try {
    const path = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return path
  } catch {
    return null
  }
}

/** A plain left click stays in the app; a middle click or ⌘-click opens a tab. */
export function onLinkClick(event, path) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(path)
}
