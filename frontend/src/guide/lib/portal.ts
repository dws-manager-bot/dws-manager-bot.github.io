/**
 * Where the guide's popups (dialogs, sheets, popovers, tooltips, the lightbox)
 * mount. Radix and the lightbox default to document.body, which is outside .sg:
 * there the guide's colors and reset do not apply. SeasonGuide.jsx renders this
 * element inside .sg; undefined falls back to body, e.g. before it exists.
 */
export const PORTAL_ID = 'sg-portal'

export function portalRoot(): HTMLElement | undefined {
  return document.getElementById(PORTAL_ID) ?? undefined
}
