import { useEffect, useLayoutEffect, useRef } from 'react'
import GuideApp from './GuideApp.tsx'
import { BASE } from './lib/route.ts'
import { PORTAL_ID } from './lib/portal.ts'
import './guide.css'

/**
 * The season guide, as a member page.
 *
 * Everything under src/guide is the season-guide-site repo (POU-DW), brought
 * over with as few changes as would make it fit; README.md here lists them.
 * This component is the seam: it gives the guide its .sg scope, a place for its
 * popups inside that scope, and the height of the site's own sticky header, so
 * the guide's sticky header and contents sit underneath it rather than behind.
 */
export default function SeasonGuide() {
  const root = useRef(null)

  // The site header's height changes: the tabs scroll, the prefs panel opens.
  useLayoutEffect(() => {
    const shell = document.querySelector('.app > header')
    const el = root.current
    if (!shell || !el) return undefined
    const sync = () => el.style.setProperty('--shell-h', `${shell.offsetHeight}px`)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])

  // The guide's own links are plain <a href>; keep a click on one inside the app
  // instead of reloading the whole site through 404.html.
  useEffect(() => {
    const el = root.current
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target.closest('a[href]')
      if (!link || link.target || !el.contains(link)) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || !url.pathname.startsWith(BASE)) return
      event.preventDefault()
      const samePage = url.pathname === window.location.pathname
      window.history.pushState({}, '', url.pathname + url.search + url.hash)
      window.dispatchEvent(new PopStateEvent('popstate'))
      if (url.hash) {
        // The section may only exist once the new view has rendered.
        requestAnimationFrame(() => document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView())
      } else if (!samePage) {
        window.scrollTo({ top: 0 })
      }
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [])

  return (
    <div className="sg dark" lang="en" dir="ltr" ref={root}>
      <GuideApp />
      <div id={PORTAL_ID} />
    </div>
  )
}
