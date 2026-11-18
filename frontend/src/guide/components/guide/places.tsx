import { createContext, Fragment, useContext, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { BookOpen, MapPin as MapPinIcon } from 'lucide-react'
import type { Place, Term } from '@/content/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AnnotatedMap } from './route-map'
import { Figure } from './figure'
import { ZoomableImage } from './lightbox'
import { StatusBadge } from './status'
import { ClaimList } from './claims'
import { cn } from '@/lib/utils'

/*
 * Glossary system. Players do not remember names, so every place (building, map object, zone)
 * and every glossary term in guide text becomes a tap target:
 *   - a place shows its image (or, for a zone, the map with the zone highlighted), where it is,
 *     and "Show on map";
 *   - a term shows its meaning (and an image, if it has one).
 */

type Entry = { kind: 'place'; place: Place } | { kind: 'term'; term: Term }

interface GlossaryCtx {
  /** Path of the full guide (for "Details" links), for example /s5/guide. */
  guidePath: string
  places: Place[]
  terms: Term[]
  mapImage: string
  matcher: RegExp | null
  byName: Map<string, Entry>
}
const Ctx = createContext<GlossaryCtx>({ guidePath: '', places: [], terms: [], mapImage: '', matcher: null, byName: new Map() })

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function PlacesProvider({
  places,
  terms = [],
  mapImage,
  guidePath = '',
  children,
}: {
  places: Place[]
  terms?: Term[]
  mapImage: string
  guidePath?: string
  children: ReactNode
}) {
  const value = useMemo<GlossaryCtx>(() => {
    const byName = new Map<string, Entry>()
    for (const t of terms) for (const n of [t.term, ...(t.aka ?? [])]) byName.set(n, { kind: 'term', term: t })
    // places win over terms with the same name
    for (const p of places) for (const n of [p.name, ...(p.aka ?? [])]) byName.set(n, { kind: 'place', place: p })
    // longest names first, so "Portal Gate" wins over "Gate" and "Camp base" over "Camp"
    const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escape)
    const matcher = names.length ? new RegExp(`(?<![\\w'-])(${names.join('|')})(?![\\w-])`, 'g') : null
    return { guidePath, places, terms, mapImage, matcher, byName }
  }, [places, terms, mapImage, guidePath])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const usePlaces = () => useContext(Ctx)

const isZone = (p: Place) => !p.image

/* ------------------------------------------------------------------ */
/* Picture of a place: its image, or the map with the zone highlighted. */
/* ------------------------------------------------------------------ */
export function PlacePicture({ place, size = 'md' }: { place: Place; size?: 'sm' | 'md' }) {
  const { mapImage } = usePlaces()
  const box = size === 'sm' ? 'size-20' : 'size-24 sm:size-28'
  if (!place.image) {
    return (
      <ShowOnMap place={place}>
        <button type="button" className={cn('shrink-0 overflow-hidden rounded-lg', box)} aria-label={`Show ${place.name} on the map`}>
          <AnnotatedMap image={mapImage} highlight={place} className="rounded-lg border-0" compact />
        </button>
      </ShowOnMap>
    )
  }
  return (
    <ZoomableImage
      image={place.image}
      gallery={place.extraImage ? [place.image, place.extraImage] : undefined}
      className="shrink-0 rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      imgClassName={cn('rounded-lg bg-muted/50 object-contain', box)}
    />
  )
}

/* ------------------------------------------------------------------ */
/* "Show on map" dialog.                                               */
/* ------------------------------------------------------------------ */
export function ShowOnMap({ place, children }: { place: Place; children?: ReactNode }) {
  const { mapImage } = usePlaces()
  if (!place.pins?.length && !place.areas?.length) return null
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant="outline" size="sm">
            <MapPinIcon /> Show on map
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{place.name}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            {place.where} <StatusBadge status={place.whereStatus} />
          </DialogDescription>
        </DialogHeader>
        <AnnotatedMap image={mapImage} highlight={place} />
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Inline mentions.                                                    */
/* ------------------------------------------------------------------ */
const triggerClass =
  'cursor-pointer font-medium underline decoration-primary/60 decoration-dotted underline-offset-4 hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring'

/**
 * Inline trigger. A <span role="button"> (not a <button>), so a long name wraps with the
 * text around it, like a normal word. Enter / Space open it.
 */
function Trigger({ label, ...props }: { label: string } & ComponentProps<'span'>) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={triggerClass}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).click()
        }
      }}
      {...props}
    >
      {label}
    </span>
  )
}

function PlaceMention({ place, label }: { place: Place; label: string }) {
  const { guidePath } = usePlaces()
  const { mapImage } = usePlaces()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Trigger label={label} />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        {isZone(place) ? (
          <div className="flex flex-col gap-2">
            <p className="font-semibold">{place.name}</p>
            <AnnotatedMap image={mapImage} highlight={place} compact />
            <p className="text-xs leading-snug text-muted-foreground">{place.what}</p>
          </div>
        ) : (
          <div className="flex gap-3">
            <PlacePicture place={place} size="sm" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-semibold">{place.name}</p>
              <p className="text-xs leading-snug text-muted-foreground">{place.what}</p>
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-col gap-2 border-t pt-2 text-xs">
          <p className="leading-snug">
            <span className="font-semibold">Where: </span>
            {place.where}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={place.whereStatus} />
            <ShowOnMap place={place} />
            <a href={`${guidePath}#place-${place.id}`} className="text-primary underline-offset-2 hover:underline">
              Details
            </a>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TermMention({ term, label }: { term: Term; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Trigger label={label} />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <BookOpen className="size-4 text-primary" aria-hidden /> {term.term}
          </p>
          <p className="text-sm leading-snug">{term.meaning}</p>
          {term.image ? (
            <ZoomableImage image={term.image} className="self-start" imgClassName="max-h-40 rounded-md border object-contain" />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Renders text and turns the first mention of each place or term into a tap target.
 * Use it for ALL player-facing game text (claims, table cells, slide text).
 */
export function PlaceText({ text }: { text: string }) {
  const { matcher, byName } = usePlaces()
  if (!matcher) return <>{text}</>
  const out: ReactNode[] = []
  const seen = new Set<string>()
  let last = 0
  for (const m of text.matchAll(matcher)) {
    const entry = byName.get(m[1])
    if (!entry || m.index === undefined) continue
    const id = entry.kind === 'place' ? `p:${entry.place.id}` : `t:${entry.term.term}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push(text.slice(last, m.index))
    out.push(
      entry.kind === 'place' ? (
        <PlaceMention key={m.index} place={entry.place} label={m[1]} />
      ) : (
        <TermMention key={m.index} term={entry.term} label={m[1]} />
      ),
    )
    last = m.index + m[1].length
  }
  out.push(text.slice(last))
  return (
    <>
      {out.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Place card: picture, what, where, map, facts.                       */
/* ------------------------------------------------------------------ */
export function PlaceCard({ place }: { place: Place }) {
  return (
    <Card id={`place-${place.id}`} className="scroll-mt-20">
      <CardHeader className="flex flex-row items-start gap-4">
        <PlacePicture place={place} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle className="text-lg">{place.name}</CardTitle>
          {place.aka?.length ? (
            <div className="flex flex-wrap gap-1">
              {place.aka
                .filter((a) => a.toLowerCase() !== place.name.toLowerCase() && !a.endsWith('s') && a[0] === a[0].toUpperCase())
                .slice(0, 3)
                .map((a) => (
                  <Badge key={a} variant="secondary" className="font-normal">
                    {a}
                  </Badge>
                ))}
            </div>
          ) : null}
          <p className="text-sm leading-snug text-muted-foreground">
            <PlaceText text={place.what} />
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <p className="flex items-start gap-2">
            <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-semibold">Where: </span>
              {place.where}
              {place.coords ? <span className="ml-1 font-mono text-xs">({place.coords})</span> : null}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={place.whereStatus} />
            <ShowOnMap place={place} />
          </div>
        </div>
        <ClaimList claims={place.facts} />
        {place.extraImage && place.image ? (
          <Figure image={place.extraImage} gallery={[place.image, place.extraImage]} className="max-w-xs" imgClassName="max-h-64" />
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Zone explorer: pick a zone, see it on the real map.                 */
/* ------------------------------------------------------------------ */
export function ZoneExplorer({ zones }: { zones: Place[] }) {
  const { mapImage } = usePlaces()
  const [selected, setSelected] = useState(zones[0]?.id)
  const zone = zones.find((z) => z.id === selected) ?? zones[0]
  if (!zone) return null
  const groups = [
    { title: 'Map zones', items: zones.filter((z) => z.group === 'Zone') },
    { title: 'Map stages (open in this order)', items: zones.filter((z) => z.group === 'Stage') },
  ].filter((g) => g.items.length)
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
        <AnnotatedMap image={mapImage} highlight={zone} />
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 p-3 text-sm">
          <span className="flex flex-wrap items-center gap-2 font-semibold">
            {zone.name} <StatusBadge status={zone.whereStatus} />
          </span>
          <span>
            <PlaceText text={zone.what} />
          </span>
          {zone.whereStatus !== 'fact' ? <span className="text-xs text-muted-foreground">{zone.where}</span> : null}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
            <ul className="flex flex-col gap-1.5" aria-label={g.title}>
              {g.items.map((z) => {
                const on = z.id === zone.id
                return (
                  <li key={z.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelected(z.id)}
                      className={cn(
                        'flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors',
                        on ? 'border-primary bg-primary/10' : 'bg-card hover:bg-accent',
                      )}
                    >
                      <span className="text-sm font-semibold">{z.name}</span>
                      <span className="text-xs leading-snug text-muted-foreground">{z.where}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
