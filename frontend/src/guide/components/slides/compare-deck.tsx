import { ArrowRight, Ban, CircleHelp, List, Minus, Presentation, Sparkles } from 'lucide-react'
import type { Compare, CompareCard, CompareVisuals, Season } from '@/content/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ZoomableImage } from '@/components/guide/lightbox'
import { MapSchematic, MapSchematicCamps } from '@/components/guide/map-schematic'
import { PlaceText } from '@/components/guide/places'
import { cn } from '@/lib/utils'
import { SlideFrame, type SlideDef } from './deck'

/* ------------------------------------------------------------------ */
/* Compare slides: S5 → S6 in pictures. All text comes from `compare`. */
/* ------------------------------------------------------------------ */

type ChipStatus = NonNullable<CompareCard['status']>
const chip: Record<ChipStatus, { label: string; icon: typeof Sparkles; cls: string }> = {
  same: { label: 'Same', icon: Minus, cls: 'border-fact/40 bg-fact/10 text-fact' },
  changed: { label: 'Changed', icon: Sparkles, cls: 'border-primary/50 bg-primary/10 text-primary' },
  unconfirmed: { label: 'Not confirmed', icon: CircleHelp, cls: 'border-unconfirmed/40 bg-unconfirmed/10 text-unconfirmed' },
  gone: { label: 'Not in S6', icon: Ban, cls: 'border-destructive/40 bg-destructive/10 text-destructive' },
}

function StatusChip({ status }: { status: ChipStatus }) {
  const c = chip[status]
  const Icon = c.icon
  return (
    <Badge variant="outline" className={c.cls}>
      <Icon data-icon="inline-start" aria-hidden />
      {c.label}
    </Badge>
  )
}

/** Column header: which season this side shows. */
function SideLabel({ n, name, accent = false }: { n: number; name: string; accent?: boolean }) {
  return (
    <p className={cn('flex items-center gap-2 text-sm font-semibold', accent ? 'text-primary' : 'text-muted-foreground')}>
      <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-xs', accent ? 'bg-primary text-primary-foreground' : 'bg-muted')}>S{n}</span>
      {name}
    </p>
  )
}

function Card({ card, s6Words = true, dense = false }: { card: CompareCard; s6Words?: boolean; dense?: boolean }) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      {card.image ? (
        <ZoomableImage
          image={{ src: card.image, alt: card.title, caption: card.title }}
          className="w-full"
          imgClassName={cn('w-full object-contain', dense ? 'h-16' : 'h-24')}
        />
      ) : null}
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold leading-tight">{card.title}</span>
        {card.status ? <StatusChip status={card.status} /> : null}
      </span>
      <span className="text-sm leading-snug text-muted-foreground">{s6Words ? <PlaceText text={card.text} /> : card.text}</span>
    </li>
  )
}

function Bars({ data }: { data: CompareVisuals['score']['s5'] }) {
  const max = Math.max(...data.rows.map((r) => r.value))
  return (
    <figure className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <figcaption className="text-sm font-semibold">{data.title}</figcaption>
      <ul className="flex flex-col gap-1.5">
        {data.rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm">
            <span className="truncate text-muted-foreground">{r.label}</span>
            <span className="h-3 rounded-r-sm bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} aria-hidden />
            <span className="text-right font-mono tabular-nums">{r.value.toLocaleString('en-US')}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/** One season on a day scale. Both rows share the same scale so the stages line up. */
function DayLine({ events, last, max, accent }: { events: { day: number; label: string }[]; last: number; max: number; accent?: boolean }) {
  const x = (d: number) => ((d - 1) / (max - 1)) * 100
  return (
    <div className="relative mx-10 h-16 sm:mx-14">
      <div className="absolute top-7 h-2 rounded-full bg-muted" style={{ left: 0, width: `${x(last)}%` }} />
      {events.map((e, i) => (
        <div key={e.label} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${x(e.day)}%`, top: i % 2 ? 34 : 0 }}>
          {i % 2 ? (
            <>
              <span className={cn('size-3 rotate-45 rounded-[2px]', accent ? 'bg-primary' : 'bg-foreground/70')} />
              <span className="mt-0.5 text-[11px] whitespace-nowrap">
                <span className="font-mono text-muted-foreground">D{e.day}</span> {e.label}
              </span>
            </>
          ) : (
            <>
              <span className="mb-0.5 text-[11px] whitespace-nowrap">
                <span className="font-mono text-muted-foreground">D{e.day}</span> {e.label}
              </span>
              <span className={cn('size-3 rotate-45 rounded-[2px]', accent ? 'bg-primary' : 'bg-foreground/70')} />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function WeekRow({ w }: { w: CompareVisuals['week']['s5'] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((d) => {
          const war = w.warDays.includes(d)
          const enemy = w.enemyDays.includes(d)
          return (
            <div
              key={d}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center rounded-lg border p-1 text-center',
                enemy ? 'border-destructive/60 bg-destructive/15' : war ? 'border-primary/50 bg-primary/10' : 'bg-card opacity-60',
              )}
            >
              <span className="font-mono text-xs font-semibold">{d}</span>
              {war ? <span className="text-[10px] leading-tight text-muted-foreground">{w.time}</span> : null}
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        <PlaceText text={w.note} />
      </p>
    </div>
  )
}

function buildCompareSlides(c: Compare, s6: Season | undefined, nav: { list: () => void; open: (slug: string) => void }): SlideDef[] {
  const v = c.visuals
  if (!v) return []
  const a = c.against
  const both = (left: React.ReactNode, right: React.ReactNode) => (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <SideLabel n={a.number} name={a.name} />
        {left}
      </div>
      <div className="flex flex-col gap-2">
        <SideLabel n={c.number} name={c.name} accent />
        {right}
      </div>
    </div>
  )
  const maxDay = Math.max(v.calendar.s5Last, v.calendar.s6Last)

  return [
    {
      id: 'glance',
      part: 'Overview',
      kicker: `S${a.number} → S${c.number}`,
      toc: 'At a glance',
      title: `${c.name} vs ${a.name}: what changed`,
      body: (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {v.glance.map((g) => (
            <li key={g.label} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-lg text-muted-foreground line-through decoration-1">{g.s5}</span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                <span className="text-xl font-bold text-primary">{g.s6}</span>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'maps',
      part: 'Overview',
      kicker: 'Map',
      toc: 'Map',
      title: 'Two camps face to face → eight camps around one throne',
      body: both(
        <div className="[&_figcaption]:hidden [&_svg]:mx-auto [&_svg]:max-h-[44svh] [&_svg]:w-auto">
          <MapSchematic />
        </div>,
        s6 ? (
          <div className="[&_figcaption]:text-xs [&_svg]:mx-auto [&_svg]:max-h-[40svh] [&_svg]:w-auto">
            <MapSchematicCamps routes={s6.map.routes} places={s6.map.places} />
          </div>
        ) : null,
      ),
    },
    {
      id: 'territories',
      part: 'Overview',
      kicker: 'Territories',
      toc: 'Territories',
      title: 'Cities that give points → territories that pay each week',
      body: both(
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {v.territories.s5.map((t) => (
            <Card key={t.title} card={t} s6Words={false} dense />
          ))}
        </ul>,
        <ul className="grid grid-cols-2 gap-2">
          {v.territories.s6.map((t) => (
            <Card key={t.title} card={t} dense />
          ))}
        </ul>,
      ),
    },
    {
      id: 'score',
      part: 'Rules',
      kicker: 'How you score',
      toc: 'Score',
      title: 'Hold high cities → win Temple Contests',
      body: both(<Bars data={v.score.s5} />, <Bars data={v.score.s6} />),
    },
    {
      id: 'calendar',
      part: 'Rules',
      kicker: 'Calendar',
      toc: 'Calendar',
      title: 'The first fights come 3 days later. The end comes 1 day later.',
      body: (
        <div className="flex flex-col gap-5 rounded-xl border bg-card p-4">
          <div className="hidden flex-col gap-1 sm:flex">
            <SideLabel n={a.number} name={a.name} />
            <DayLine events={v.calendar.s5} last={v.calendar.s5Last} max={maxDay} />
          </div>
          <div className="hidden flex-col gap-1 sm:flex">
            <SideLabel n={c.number} name={c.name} accent />
            <DayLine events={v.calendar.s6} last={v.calendar.s6Last} max={maxDay} accent />
          </div>
          {/* Phones: two lists instead of the timeline. */}
          <div className="grid grid-cols-2 gap-3 sm:hidden">
            {[
              { n: a.number, name: a.name, ev: v.calendar.s5, accent: false },
              { n: c.number, name: c.name, ev: v.calendar.s6, accent: true },
            ].map((col) => (
              <div key={col.n} className="flex flex-col gap-1.5">
                <SideLabel n={col.n} name={col.name} accent={col.accent} />
                <ul className="flex flex-col gap-1 text-sm">
                  {col.ev.map((e) => (
                    <li key={e.label} className="flex gap-1.5">
                      <span className={cn('w-8 shrink-0 font-mono text-xs leading-5', col.accent ? 'text-primary' : 'text-muted-foreground')}>D{e.day}</span>
                      <span className="leading-5">{e.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Season days. Each group has its own Day 1.</p>
        </div>
      ),
    },
    {
      id: 'week',
      part: 'Rules',
      kicker: 'The week',
      toc: 'War days',
      title: 'Two long war days → one short war hour every day',
      body: (
        <div className="flex flex-col gap-4">
          {both(<WeekRow w={v.week.s5} />, <WeekRow w={v.week.s6} />)}
          <p className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-primary/50 bg-primary/10" /> War window</span>
            <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-destructive/60 bg-destructive/15" /> Enemy camps can attack</span>
          </p>
        </div>
      ),
    },
    {
      id: 'base',
      part: 'Your base',
      kicker: 'Built in your shelter',
      toc: 'Your buildings',
      title: 'Your season buildings mostly stay the same',
      body: (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {v.base.map((b) => (
            <Card key={b.title} card={b} />
          ))}
        </ul>
      ),
    },
    {
      id: 'same',
      part: 'Same / new',
      kicker: 'Same as S5',
      toc: 'Same as S5',
      title: 'Do these the same way as in S5',
      body: (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {v.same.map((b) => (
            <Card key={b.title} card={b} dense />
          ))}
        </ul>
      ),
    },
    {
      id: 'new',
      part: 'Same / new',
      kicker: 'New in S6',
      toc: 'New in S6',
      title: 'Learn these before Day 1',
      body: (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {v.added.map((b) => (
            <Card key={b.title} card={b} dense />
          ))}
        </ul>
      ),
    },
    {
      id: 'gone',
      part: 'Same / new',
      kicker: 'Not in S6',
      toc: 'Not in S6',
      title: 'Forget these S5 habits',
      body: (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {v.gone.map((b) => (
            <Card key={b.title} card={b} s6Words={false} dense />
          ))}
        </ul>
      ),
    },
    {
      id: 'end',
      part: 'End',
      kicker: 'More',
      toc: 'Next',
      title: 'Every difference is in the full list',
      body: (
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={nav.list}>
            <List /> Full list of differences
          </Button>
          <Button size="lg" variant="outline" onClick={() => nav.open(c.slug)}>
            <Presentation /> S{c.number} briefing
          </Button>
          <Button size="lg" variant="outline" onClick={() => nav.open(a.slug)}>
            <Presentation /> S{a.number} briefing
          </Button>
        </div>
      ),
    },
  ]
}

export function CompareDeck({
  compare,
  season,
  onList,
  onOpen,
}: {
  compare: Compare
  /** The newer season (for its map data). */
  season: Season | undefined
  onList: () => void
  onOpen: (slug: string) => void
}) {
  const slides = buildCompareSlides(compare, season, { list: onList, open: onOpen })
  return <SlideFrame slides={slides} endLabel="Full list of differences" onEnd={onList} />
}
