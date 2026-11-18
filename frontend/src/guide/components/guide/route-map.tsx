import { useState, type CSSProperties } from 'react'
import type { MapPin, Place, Route } from '@/content/types'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { StatusBadge } from './status'
import { cn } from '@/lib/utils'

/** Size of /sN/map-community.webp. Pins are percent, so only the aspect ratio matters. */
const W = 1740
const H = 1800
const px = (p: MapPin) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H })

/**
 * The community map with an SVG layer on top (Playbook §4: "Labeled map with arrows; add legend").
 * - `highlight`: red areas (zones) and red rings (pins) of one place (used by "Show on map").
 * - `compact`: small version for popups and thumbnails (no pulse, no border).
 * - `route`: numbered steps joined by arrows, from a camp base to the Royal Court.
 */
export function AnnotatedMap({
  image,
  route,
  highlight,
  compact = false,
  className,
}: {
  image: string
  route?: Route
  highlight?: Place
  compact?: boolean
  className?: string
}) {
  // many pins (example: 12 Border Gates) get smaller rings
  const n = highlight?.pins?.length ?? 0
  const ring = n > 20 ? 0.35 : n > 4 ? 0.6 : 1
  // Fixed colours, not theme tokens: the route sits on a fixed-colour map image.
  const color = route?.color ?? (route?.camp === 'Horus' ? 'var(--horus)' : 'var(--anubis)')
  const ink = route?.ink ?? 'white'
  const pts = route?.steps.map((s) => px(s.pin)) ?? []

  return (
    <div className={cn('relative overflow-hidden bg-muted/40', compact ? 'rounded-md' : 'rounded-lg border', className)}>
      <img src={image} alt="Origin Lands map" className="block h-auto w-full" loading="lazy" />
      {/* preserveAspectRatio="none": the overlay fills the image box, so percent pins are exact for any map aspect. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <marker id="route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={color} />
          </marker>
        </defs>

        {/* Route: a white halo under a colored line, so it shows on the sand color. */}
        {pts.length > 1 ? (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {pts.slice(1).map((p, i) => {
              const a = pts[i]
              // stop the line before the next pin, so the arrow tip is visible
              const dx = p.x - a.x
              const dy = p.y - a.y
              const len = Math.hypot(dx, dy) || 1
              const end = { x: p.x - (dx / len) * 46, y: p.y - (dy / len) * 46 }
              const start = { x: a.x + (dx / len) * 40, y: a.y + (dy / len) * 40 }
              return (
                <g key={i}>
                  <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="white" strokeOpacity="0.85" strokeWidth="22" />
                  <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth="12" strokeDasharray="34 18" markerEnd="url(#route-arrow)" />
                </g>
              )
            })}
          </g>
        ) : null}
        {route?.steps.map((s, i) => {
          const p = px(s.pin)
          const last = i === route.steps.length - 1
          return (
            <g key={s.label}>
              <circle cx={p.x} cy={p.y} r={last ? 46 : 38} fill={color} stroke="white" strokeWidth="8" />
              <text x={p.x} y={p.y + 15} textAnchor="middle" fontSize="44" fontWeight="700" fill={ink}>
                {i + 1}
              </text>
            </g>
          )
        })}

        {/* Highlight: pulsing rings on every position of one place.
            Fixed colors on purpose: they sit on a fixed-color map image, not on the page theme. */}
        {highlight?.areas?.map((a, i) => (
          <g key={`a${i}`}>
            <rect x={(a.x / 100) * W} y={(a.y / 100) * H} width={(a.w / 100) * W} height={(a.h / 100) * H} rx="18" fill="none" stroke="white" strokeWidth="22" />
            <rect x={(a.x / 100) * W} y={(a.y / 100) * H} width={(a.w / 100) * W} height={(a.h / 100) * H} rx="18" fill="#e11d48" fillOpacity="0.28" stroke="#e11d48" strokeWidth="12" />
          </g>
        ))}
        {highlight?.pins?.map((pin, i) => {
          const p = px(pin)
          return (
            <g key={i}>
              {!compact ? (
                <circle cx={p.x} cy={p.y} r={80 * ring} fill="none" stroke="#e11d48" strokeWidth="10" className="animate-ping origin-center [transform-box:fill-box]" />
              ) : null}
              <circle cx={p.x} cy={p.y} r={60 * ring} fill="none" stroke="white" strokeWidth="26" />
              <circle cx={p.x} cy={p.y} r={60 * ring} fill="#e11d48" fillOpacity="0.25" stroke="#e11d48" strokeWidth="14" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** S6 camp picker in the in-game Season Map layout. */
const CAMP_GRID: Record<string, string> = {
  // Pinwheel: each camp holds one corner, like the in-game Season Map (and MapSchematicCamps).
  'No.1': '1 / 1 / 2 / 3', 'No.2': '1 / 3 / 2 / 4', 'No.3': '1 / 4 / 3 / 5', 'No.4': '3 / 4 / 4 / 5',
  'No.5': '4 / 3 / 5 / 5', 'No.6': '4 / 2 / 5 / 3', 'No.7': '3 / 1 / 5 / 2', 'No.8': '2 / 1 / 3 / 2',
}

function CampPicker({ routes, value, onChange }: { routes: Route[]; value: string; onChange: (camp: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-semibold">Your camp</p>
      <div role="radiogroup" aria-label="Your camp" className="grid w-56 grid-cols-4 grid-rows-4 gap-1 lg:w-44">
        {routes.map((r) => {
          const on = r.camp === value
          return (
            <button
              key={r.camp}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(r.camp)}
              style={{ gridArea: CAMP_GRID[r.camp], background: r.color, color: r.ink }}
              className={cn(
                'min-h-8 rounded-md text-xs font-bold transition-[opacity,box-shadow]',
                on ? 'opacity-100 ring-[3px] ring-foreground ring-offset-2 ring-offset-background' : 'opacity-55 hover:opacity-90',
              )}
            >
              {r.camp}
            </button>
          )
        })}
        <span className="col-start-2 col-end-4 row-start-2 row-end-4 flex items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">
          Temple Throne
        </span>
      </div>
    </div>
  )
}

/**
 * Route map with a camp selector and the step list beside it.
 * S5: two camps × West/East toggles. S6: 8 camps, one route each, picked on a mini Season Map.
 */
export function RouteMap({ image, routes, places, note }: { image: string; routes: Route[]; places: Place[]; note: string }) {
  const [camp, setCamp] = useState<Route['camp']>(routes[0]?.camp ?? 'Anubis')
  const [side, setSide] = useState<Route['side']>('West')
  const route = routes.find((r) => r.camp === camp && r.side === side) ?? routes.find((r) => r.camp === camp) ?? routes[0]
  const placeById = (id: string) => places.find((p) => p.id === id)
  const camps = [...new Set(routes.map((r) => r.camp))]
  const eightCamps = camps.length > 2
  const badge = route.color
    ? { style: { background: route.color, color: route.ink ?? 'white' }, cls: '' }
    : { style: undefined, cls: cn('text-white', camp === 'Horus' ? 'bg-horus' : 'bg-anubis') }

  if (eightCamps) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid items-start gap-4 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.9fr)]">
          <CampPicker routes={routes} value={route.camp} onChange={setCamp} />
          <AnnotatedMap image={image} route={route} className="mx-auto w-full max-w-[min(100%,62svh)]" />
          <RouteSteps route={route} placeById={placeById} badge={badge} compact />
        </div>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {camps.length > 1 ? (
      <div className="flex flex-wrap items-center gap-3">
        {camps.length === 2 ? (
        <ToggleGroup type="single" variant="outline" size="sm" value={camp} onValueChange={(v) => v && setCamp(v as Route['camp'])} aria-label="Camp">
          <ToggleGroupItem value="Anubis" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Anubis (North)</ToggleGroupItem>
          <ToggleGroupItem value="Horus" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Horus (South)</ToggleGroupItem>
        </ToggleGroup>
        ) : null}
        <ToggleGroup type="single" variant="outline" size="sm" value={side} onValueChange={(v) => v && setSide(v as Route['side'])} aria-label="Side">
          <ToggleGroupItem value="West" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">West route</ToggleGroupItem>
          <ToggleGroupItem value="East" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">East route</ToggleGroupItem>
        </ToggleGroup>
      </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <AnnotatedMap image={image} route={route} />
        <RouteSteps route={route} placeById={placeById} badge={badge} />
      </div>
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  )
}

function RouteSteps({
  route,
  placeById,
  badge,
  compact = false,
}: {
  route: Route
  placeById: (id: string) => Place | undefined
  badge: { style?: CSSProperties; cls: string }
  /** Smaller rows, no thumbnails (S6 slide: 7 steps beside the map). */
  compact?: boolean
}) {
  return (
    <ol className={cn('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
      {route.steps.map((s, i) => {
        const place = placeById(s.placeId)
        return (
          <li key={s.label} className={cn('flex items-center rounded-lg border bg-card', compact ? 'gap-2.5 px-2 py-1.5' : 'gap-3 p-2')}>
            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', badge.cls)} style={badge.style}>
              {i + 1}
            </span>
            {place?.image && !compact ? <img src={place.image.src} alt="" className="size-12 shrink-0 rounded-md object-contain" loading="lazy" /> : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('font-semibold', compact && 'text-sm leading-tight')}>{s.label}</span>
              <span className="font-mono text-xs text-muted-foreground">{s.when}</span>
            </span>
            {place && i > 0 ? <StatusBadge status={place.whereStatus} /> : null}
          </li>
        )
      })}
    </ol>
  )
}
