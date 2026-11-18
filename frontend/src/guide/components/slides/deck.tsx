import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Ban, BookOpen, ChevronLeft, ChevronRight, Clock, List } from 'lucide-react'
import type { Season } from '@/content/types'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { PlaceText, ShowOnMap, ZoneExplorer } from '@/components/guide/places'
import { RouteMap } from '@/components/guide/route-map'
import { ZoomableImage } from '@/components/guide/lightbox'
import { QuickCardsNotice } from '@/components/guide/playbook'
import { SeasonStartControl } from '@/components/guide/season-start'
import { StatusBadge } from '@/components/guide/status'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ClaimList } from '@/components/guide/claims'
import { InfluenceChart, MeritChart, RebateChart, ShelterChart } from './charts'
import { MithrilTable } from './mithril-table'
import { FlowChain, ObjectiveChain, ResourceFlow, RewardPaths, Roadmap, WeekStrip } from './infographics'

export interface SlideDef {
  id: string
  /** Group name in the slide contents. */
  part: string
  kicker: string
  /** Label in the contents. Default: kicker. */
  toc?: string
  /** The title states the point of the slide, not only its topic. */
  title: string
  body: ReactNode
}

/**
 * Build the slide list from season data. Game text comes only from `season`.
 * Keep it short: one point per slide, no text that a label, title or tap-to-explain already gives.
 */
function buildSlides(season: Season, onOpenGuide: () => void): SlideDef[] {
  const b = season.briefing
  if (!b) return []
  const o = season.overview
  const t = (id: string, fallback: string) => b.titles[id] ?? fallback
  const shelterRule = season.rules.find((r) => r.id === 'shelter-value')
  const influenceRef = season.reference.flatMap((g) => g.items).find((i) => i.id === 'influence')

  const slides: SlideDef[] = [
    {
      id: 'title',
      part: 'Start',
      kicker: `Season ${season.number} briefing`,
      toc: 'Overview',
      title: t('title', season.name),
      body: (
        <div className="flex flex-col gap-4">
          <p className="max-w-2xl text-xl text-muted-foreground text-pretty sm:text-2xl">
            <PlaceText text={season.tagline} />
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4 text-primary" aria-hidden /> {season.serverTimeNote}
          </p>
          <SeasonStartControl />
        </div>
      ),
    },
    {
      id: 'win',
      part: 'Start',
      kicker: 'Objective',
      toc: 'How to win',
      title: t('win', 'How the season is won'),
      body: (
        <div className="flex flex-col gap-6">
          <FlowChain steps={b.winFlow} />
          <RewardPaths paths={b.rewardPaths} />
        </div>
      ),
    },
    ...(b.scoreSources
      ? [
          {
            id: 'mithril',
            part: 'Start',
            kicker: b.scoreSources.title,
            toc: 'Mithril sources',
            title: t('influence', b.scoreSources.title),
            body: <MithrilTable data={b.scoreSources} />,
          } satisfies SlideDef,
        ]
      : b.influenceLevels && influenceRef
      ? [
          {
            id: 'influence',
            part: 'Start',
            kicker: 'Influence',
            title: t('influence', 'Influence by city level'),
            body: (
              <div className="grid items-center gap-6 lg:grid-cols-[1.4fr_1fr]">
                <InfluenceChart rows={b.influenceLevels} />
                <ClaimList claims={influenceRef.points.filter((c) => c.status !== 'fact')} />
              </div>
            ),
          } satisfies SlideDef,
        ]
      : []),
    ...(b.scoreExample
      ? [
          {
            id: 'score-example',
            part: 'Start',
            kicker: b.scoreExample.title,
            toc: 'Real example',
            title: t('example', b.scoreExample.title),
            body: <MithrilTable data={b.scoreExample} />,
          } satisfies SlideDef,
        ]
      : []),
    {
      id: 'first',
      part: 'Start',
      kicker: 'Day 1',
      toc: 'First steps',
      title: t('first', 'First steps'),
      body: (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
            <ClaimList claims={o.doThisFirst} ordered className="text-base sm:text-lg" />
          </div>
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
            <p className="mb-2 flex items-center gap-2 font-semibold text-destructive">
              <Ban className="size-5" aria-hidden /> Largest mistake
            </p>
            <p>
              <PlaceText text={o.biggestMistake.text} />
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'roadmap',
      part: 'Map',
      kicker: 'Timeline',
      title: t('roadmap', 'Season timeline'),
      body: <Roadmap roadmap={b.roadmap} />,
    },
    {
      id: 'map',
      part: 'Map',
      kicker: 'Map',
      title: t('map', 'Map zones'),
      body: <ZoneExplorer zones={season.map.places.filter((p) => p.group === 'Zone' || p.group === 'Stage')} />,
    },
    {
      id: 'buildings',
      part: 'Map',
      kicker: 'Buildings',
      title: t('buildings', 'Buildings'),
      body: (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {season.map.places
            .filter((p) => p.image && p.group !== 'Stage')
            .map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5 rounded-xl border bg-card p-3">
                <ZoomableImage
                  image={p.image!}
                  gallery={p.extraImage && p.image ? [p.image, p.extraImage] : undefined}
                  className="w-full"
                  imgClassName="h-20 w-full object-contain"
                />
                <span className="text-sm font-semibold leading-tight">
                  <PlaceText text={p.name} />
                </span>
                <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                  <StatusBadge status={p.whereStatus} />
                  <ShowOnMap place={p} />
                </span>
              </li>
            ))}
        </ul>
      ),
    },
    {
      id: 'objectives',
      part: 'Map',
      kicker: 'Key objectives',
      title: t('objectives', 'Key objectives'),
      body: <ObjectiveChain objectives={season.objectives} places={season.map.places} />,
    },
    {
      id: 'route',
      part: 'Map',
      kicker: 'Route',
      title: t('route', 'Route to the Royal Court'),
      body: <RouteMap image={season.map.image.src} routes={season.map.routes} places={season.map.places} note={season.map.routeNote} />,
    },
    {
      id: 'attack',
      part: 'Rules',
      kicker: 'Territory rule',
      toc: 'Attack a city',
      title: t('attack', 'How to attack a city'),
      body: <FlowChain steps={b.attackFlow} numbered />,
    },
    ...(shelterRule && b.shelter
      ? [
          {
            id: 'shelter',
            part: 'Rules',
            kicker: 'Shelter Value',
            title: t('shelter', shelterRule.question),
            body: (
              <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
                <ShelterChart rule={b.shelter} />
                <div className="flex flex-col gap-3">
                  <ClaimList claims={shelterRule.steps ?? []} ordered />
                  {shelterRule.images?.[1] && <ZoomableImage image={shelterRule.images[1]} className="max-h-56" />}
                </div>
              </div>
            ),
          } satisfies SlideDef,
        ]
      : []),
    {
      id: 'week',
      part: 'Rules',
      kicker: 'Weekly rhythm',
      toc: 'The week',
      title: t('week', 'The week'),
      body: <WeekStrip week={b.week} everyDay={b.everyDay} />,
    },
    ...season.phases.map<SlideDef>((p) => ({
      id: p.id,
      part: 'Phases',
      kicker: p.period,
      toc: p.name.replace(/^Phase (\d) — /, '$1. '),
      title: p.name,
      body: (
        <div className="flex flex-col gap-5">
          <Roadmap roadmap={b.roadmap} highlight={p.days} showNote={false} />
          <p className="text-lg">
            <span className="font-semibold text-primary">Goal: </span>
            <PlaceText text={p.goal} />
          </p>
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="rounded-xl border bg-card p-4">
              <ClaimList claims={p.whenItStarts} ordered />
            </div>
            <div className="h-fit rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="mb-1 flex items-center gap-2 font-semibold text-destructive">
                <Ban className="size-4" aria-hidden /> Do not do this
              </p>
              <PlaceText text={p.dontDoThis.text} />
            </div>
          </div>
        </div>
      ),
    })),
    ...(b.meritLevels.length
      ? [
          {
            id: 'merit',
            part: 'Rewards',
            kicker: 'Great Merit',
            title: t('merit', 'Great Merit levels'),
            body: <MeritChart levels={b.meritLevels} />,
          } satisfies SlideDef,
        ]
      : []),
    {
      id: 'rebate',
      part: 'Rewards',
      kicker: 'Growth Rebate',
      title: t('rebate', 'Season Growth Rebate'),
      body: (
        <div className="grid items-center gap-6 lg:grid-cols-[1fr_1.4fr]">
          <p className="font-mono text-6xl font-bold tabular-nums text-primary">
            {b.growthRebate.reduce((s, r) => s + r.medals, 0).toLocaleString('en-US')}
          </p>
          <RebateChart rows={b.growthRebate} />
        </div>
      ),
    },
    {
      id: 'resources',
      part: 'Rewards',
      kicker: 'Resources',
      title: t('resources', 'Season resources'),
      body: <ResourceFlow rows={season.resources} />,
    },
    {
      id: 'end',
      part: 'End',
      kicker: 'More',
      toc: 'Full guide',
      title: t('end', 'Every detail is in the full guide'),
      body: (
        <div className="flex flex-col items-start gap-4">
          <Button size="lg" onClick={onOpenGuide}>
            <BookOpen /> Open the full guide
          </Button>
          <QuickCardsNotice season={season} />
        </div>
      ),
    },
  ]
  return slides
}

/** Slide contents, grouped by part. */
function SlideToc({ slides, index, go }: { slides: SlideDef[]; index: number; go: (i: number) => void }) {
  const [open, setOpen] = useState(false)
  const parts = [...new Set(slides.map((s) => s.part))]
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Slide contents">
          <List />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 overflow-y-auto p-4">
        <SheetHeader className="px-0">
          <SheetTitle>Contents</SheetTitle>
        </SheetHeader>
        <nav aria-label="Slides" className="flex flex-col gap-4 text-sm">
          {parts.map((part) => (
            <div key={part} className="flex flex-col gap-1">
              <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{part}</p>
              {slides.map((s, i) =>
                s.part === part ? (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      go(i)
                      setOpen(false)
                    }}
                    aria-current={i === index ? 'page' : undefined}
                    className={cn(
                      'flex gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent',
                      i === index ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <span className="w-5 shrink-0 font-mono text-xs tabular-nums leading-5">{i + 1}</span>
                    <span>{s.toc ?? s.kicker}</span>
                  </button>
                ) : null,
              )}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  )
}

function readHash(max: number) {
  const n = Number.parseInt(window.location.hash.slice(1), 10)
  return Number.isFinite(n) ? Math.min(Math.max(n - 1, 0), max - 1) : 0
}

/** Full-screen slide deck. Slide number is in the URL hash (#1, #2, ...), so a slide can be linked. */
export function Deck({ season, onOpenGuide }: { season: Season; onOpenGuide: () => void }) {
  return <SlideFrame slides={buildSlides(season, onOpenGuide)} endLabel="Open the full guide" onEnd={onOpenGuide} />
}

/** Slide shell: one slide at a time, keyboard / swipe / contents, slide number in the URL hash. */
export function SlideFrame({ slides, endLabel, onEnd }: { slides: SlideDef[]; endLabel: string; onEnd: () => void }) {
  const [index, setIndex] = useState(() => readHash(slides.length || 1))
  const scroller = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const go = useCallback(
    (next: number) => {
      const i = Math.min(Math.max(next, 0), slides.length - 1)
      setIndex(i)
      window.history.replaceState({}, '', `#${i + 1}`)
      scroller.current?.scrollTo({ top: 0 })
    },
    [slides.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [role="dialog"]')) return
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault()
        go(index + 1)
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        go(index - 1)
      } else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(slides.length - 1)
    }
    const onHash = () => setIndex(readHash(slides.length))
    window.addEventListener('keydown', onKey)
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('hashchange', onHash)
    }
  }, [go, index, slides.length])

  if (!slides.length) {
    return <p className="py-16 text-muted-foreground">No slides yet.</p>
  }
  const slide = slides[index]

  return (
    <div
      className="flex h-[calc(100svh-3.5rem-1px-var(--shell-h,0px))] flex-col"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current
        touch.current = null
        if (!t) return
        const dx = e.changedTouches[0].clientX - t.x
        const dy = e.changedTouches[0].clientY - t.y
        if (Math.abs(dx) > 60 && Math.abs(dy) < 50) go(index + (dx < 0 ? 1 : -1))
      }}
    >
      <div ref={scroller} className="flex-1 overflow-y-auto">
        <section
          key={slide.id}
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${slides.length}: ${slide.title}`}
          className="mx-auto flex min-h-full max-w-6xl animate-in flex-col justify-center gap-6 px-4 py-8 duration-300 fade-in sm:px-8"
        >
          <header className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{slide.kicker}</p>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">{slide.title}</h1>
          </header>
          {slide.body}
        </section>
      </div>
      <footer className="flex items-center gap-3 border-t bg-background/90 px-4 py-2 backdrop-blur">
        <SlideToc slides={slides} index={index} go={go} />
        <Button variant="outline" size="icon" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide">
          <ChevronLeft />
        </Button>
        <div className="flex flex-1 flex-col gap-1">
          <Progress value={((index + 1) / slides.length) * 100} aria-label="Slide progress" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {index + 1} / {slides.length}
            </span>
            <button type="button" className="underline-offset-2 hover:underline" onClick={onEnd}>
              {endLabel}
            </button>
          </div>
        </div>
        <Button size="icon" onClick={() => go(index + 1)} disabled={index === slides.length - 1} aria-label="Next slide">
          <ChevronRight />
        </Button>
      </footer>
    </div>
  )
}
