import { useEffect, useState } from 'react'

export type View = 'guide' | 'slides' | 'compare' | 'compare-list'
export interface Route {
  slug: string | null
  view: View
}

/** Where the guide lives on this site. Every guide path starts here. */
export const BASE = '/season-guide'

/** A guide path as a site path: at('/s6/guide') is '/season-guide/s6/guide'. */
export const at = (path: string) => `${BASE}${path}`

/**
 * Minimal path routing, no router library. Slides are the primary view:
 *   /season-guide/s5         -> { slug: 's5', view: 'slides' }  (slide number is in the hash: #3)
 *   /season-guide/s5/guide   -> { slug: 's5', view: 'guide' }   (full guide; section ids in the hash)
 *   /season-guide/s5/slides  -> slides (old links keep working)
 *   /season-guide/s6/compare      -> compare slides (Season 6 against Season 5)
 *   /season-guide/s6/compare/list -> compare as a full list
 * GitHub Pages serves 404.html (the app) for these, as for every page of the site.
 */
function parse(): Route {
  const rest = window.location.pathname.startsWith(BASE) ? window.location.pathname.slice(BASE.length) : ''
  const [slug, view, sub] = rest.replace(/^\/+|\/+$/g, '').split('/')
  const v: View = view === 'guide' ? 'guide' : view === 'compare' ? (sub === 'list' ? 'compare-list' : 'compare') : 'slides'
  return { slug: slug || null, view: v }
}

export function useRoute(): [Route, (slug: string, view?: View) => void] {
  const [route, setRoute] = useState<Route>(parse)

  useEffect(() => {
    const onPop = () => setRoute(parse())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (slug: string, view: View = 'slides') => {
    const path =
      view === 'guide' ? `/${slug}/guide` : view === 'compare' ? `/${slug}/compare` : view === 'compare-list' ? `/${slug}/compare/list` : `/${slug}`
    window.history.pushState({}, '', at(path))
    // The site's own router listens for popstate; tell it the address moved.
    window.dispatchEvent(new PopStateEvent('popstate'))
    setRoute({ slug, view })
    window.scrollTo({ top: 0 })
  }

  return [route, navigate]
}
