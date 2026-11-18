import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { BookOpen, GitCompare, List, Menu, Presentation, Pyramid } from 'lucide-react'
import { defaultSeason, findCompare, findSeason, plannedSeasons, seasons } from '@/content'
import { ComparePage } from '@/components/compare-page'
import { SeasonPage, sectionNav } from '@/components/season-page'
import { PlacesProvider } from '@/components/guide/places'
import { LightboxProvider } from '@/components/guide/lightbox'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TooltipProvider } from '@/components/ui/tooltip'
import { at, useRoute } from '@/lib/route'
import { LabelsInfo } from '@/components/guide/status'
import { SeasonStartProvider, useSeasonStart } from '@/components/guide/season-start'
import { localizeSeason } from '@/lib/dates'
import { cn } from '@/lib/utils'

// Slides (and Recharts) load only when the slides view opens.
const Deck = lazy(() => import('@/components/slides/deck').then((m) => ({ default: m.Deck })))
const CompareDeck = lazy(() => import('@/components/slides/compare-deck').then((m) => ({ default: m.CompareDeck })))

function useActiveSection(key: string) {
  const [active, setActive] = useState<string>(sectionNav[0].id)
  useEffect(() => {
    // Keep the visibility of every section, because each callback reports only the changed ones.
    const visible = new Map<string, boolean>()
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting))
        const first = sectionNav.find((s) => visible.get(s.id))
        if (first) setActive(first.id)
      },
      { rootMargin: '-80px 0px -55% 0px' },
    )
    sectionNav.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [key])
  return active
}

function Toc({ active, onPick }: { active: string; onPick?: () => void }) {
  const layers = [
    { layer: 'A', title: 'Quick answer' },
    { layer: 'B', title: 'Practical guide' },
    { layer: 'C', title: 'Reference' },
  ]
  return (
    <nav aria-label="On this page" className="flex flex-col gap-4 text-sm">
      {layers.map((l) => (
        <div key={l.layer} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {l.layer} · {l.title}
          </p>
          {sectionNav
            .filter((s) => s.layer === l.layer)
            .map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={onPick}
                aria-current={active === s.id ? 'location' : undefined}
                className={cn(
                  'rounded-md px-2 py-1.5 transition-colors hover:bg-accent',
                  active === s.id ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {s.label}
              </a>
            ))}
        </div>
      ))}
    </nav>
  )
}

export default function App() {
  const [{ slug, view }, navigate] = useRoute()
  const rawSeason = findSeason(slug ?? defaultSeason)
  // Season days → calendar dates for the chosen Day 1 (see lib/dates.ts).
  const startState = useSeasonStart(rawSeason)
  const season = useMemo(
    () => (rawSeason && startState.start ? localizeSeason(rawSeason, startState.start) : rawSeason),
    [rawSeason, startState.start],
  )
  const compareView = view === 'compare' || view === 'compare-list'
  const compare = compareView ? findCompare(slug ?? defaultSeason) : undefined
  const compareSlides = !!compare && view === 'compare' && !!compare.visuals
  const slides = !compare && view === 'slides' && !!season?.briefing
  const planned = plannedSeasons.find((p) => p.slug === slug)
  const active = useActiveSection(season?.slug ?? 'none')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!slug) window.history.replaceState({}, '', at(`/${defaultSeason}`))
  }, [slug])

  useEffect(() => {
    document.title = compare
      ? `S${compare.number} ${compare.name} vs ${compare.against.name} · Dark War Guide`
      : season
        ? `S${season.number} ${season.name}${slides ? ' · Briefing' : ''} · Dark War Guide`
        : 'Dark War Season Guide'
  }, [season, slides, compare])

  const seasonLinks = [
    ...seasons.map((s) => ({ slug: s.slug, label: `S${s.number}`, title: s.name, ready: true })),
    ...plannedSeasons.map((p) => ({ slug: p.slug, label: `S${p.number}`, title: p.name, ready: false })),
  ]

  return (
    <SeasonStartProvider value={startState}>
    <TooltipProvider delayDuration={200}>
      <LightboxProvider>
      <PlacesProvider places={season?.map.places ?? []} terms={season?.terms ?? []} mapImage={season?.map.image.src ?? ''} guidePath={season ? at(`/${season.slug}/guide`) : ''}>
      <div className="min-h-[calc(100svh-var(--shell-h,0px))] bg-background">
        <header className="sticky top-[var(--shell-h,0px)] z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
            {!slides && !compare ? (
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open contents">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto p-4">
                <SheetHeader className="px-0">
                  <SheetTitle>Contents</SheetTitle>
                </SheetHeader>
                <Toc active={active} onPick={() => setMenuOpen(false)} />
              </SheetContent>
            </Sheet>
            ) : null}
            <a href={at(`/${defaultSeason}`)} className="flex items-center gap-2 font-semibold">
              <Pyramid className="size-5 text-primary" aria-hidden />
              <span className="hidden sm:inline">Dark War Season Guide</span>
            </a>
            <nav aria-label="Seasons" className="ml-2 flex gap-1">
              {seasonLinks.map((s) => (
                <Button
                  key={s.slug}
                  size="sm"
                  variant={s.slug === (slug ?? defaultSeason) ? 'default' : 'ghost'}
                  onClick={() => navigate(s.slug, view)}
                  title={s.title}
                >
                  {s.label}
                  {!s.ready ? <span className="text-xs opacity-70">soon</span> : null}
                </Button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              {compare ? (
                <>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={compareSlides ? 'compare' : 'compare-list'}
                    onValueChange={(v) => v && navigate(compare.slug, v as 'compare' | 'compare-list')}
                    aria-label="Compare view"
                  >
                    <ToggleGroupItem value="compare" aria-label="Compare slides">
                      <Presentation />
                      <span className="hidden md:inline">Slides</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem value="compare-list" aria-label="Full list">
                      <List />
                      <span className="hidden md:inline">Full list</span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <Button variant="outline" size="sm" onClick={() => navigate(compare.slug)}>
                    S{compare.number} guide
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => navigate('s6', 'compare')} title="What changed from S5">
                  <GitCompare aria-hidden />
                  <span className="hidden md:inline">S5 → S6</span>
                </Button>
              )}
              {!compare && season?.briefing ? (
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={slides ? 'slides' : 'guide'}
                  onValueChange={(v) => v && navigate(season.slug, v as 'guide' | 'slides')}
                  aria-label="View"
                >
                  <ToggleGroupItem value="slides" aria-label="Slides">
                    <Presentation />
                    <span className="hidden md:inline">Slides</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="guide" aria-label="Full guide">
                    <BookOpen />
                    <span className="hidden md:inline">Full guide</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
              <LabelsInfo />
            </div>
          </div>
        </header>

        {compareSlides && compare ? (
          <Suspense fallback={<p className="p-8 text-muted-foreground">Loading slides…</p>}>
            <CompareDeck
              compare={compare}
              season={season}
              onList={() => navigate(compare.slug, 'compare-list')}
              onOpen={(s) => navigate(s)}
            />
          </Suspense>
        ) : slides && season ? (
          <Suspense fallback={<p className="p-8 text-muted-foreground">Loading slides…</p>}>
            <Deck season={season} onOpenGuide={() => navigate(season.slug, 'guide')} />
          </Suspense>
        ) : (
        <>
        <div className={compare ? 'mx-auto max-w-4xl px-4' : 'mx-auto grid max-w-7xl gap-8 px-4 lg:grid-cols-[14rem_minmax(0,1fr)]'}>
          <aside className={compare ? 'hidden' : 'hidden lg:block'}>
            <div className="sticky top-[calc(var(--shell-h,0px)+3.5rem)] max-h-[calc(100svh-3.5rem-var(--shell-h,0px))] overflow-y-auto py-8">
              {season ? <Toc active={active} /> : null}
            </div>
          </aside>
          <main className="min-w-0 py-8">
            {compare ? (
              <ComparePage compare={compare} onOpenSeason={() => navigate(compare.against.slug)} />
            ) : season ? (
              <SeasonPage season={season} />
            ) : (
              <div className="flex flex-col gap-3 py-16">
                <h1 className="text-3xl font-bold">
                  {planned ? `Season ${planned.number}: ${planned.name}` : 'Page not found'}
                </h1>
                <p className="text-muted-foreground">
                  {planned
                    ? 'This guide is not written yet. The data is captured. The comparison with Season 5 comes next.'
                    : 'This season does not exist.'}
                </p>
                <Button className="self-start" onClick={() => navigate(defaultSeason)}>
                  Open the Season 5 briefing
                </Button>
              </div>
            )}
          </main>
        </div>

        <footer className="border-t py-6 text-center text-sm text-muted-foreground">
          Fan-made alliance guide. Not affiliated with the game publisher. Data from the official Dark War Survival Discord.
        </footer>
        </>
        )}
      </div>
      </PlacesProvider>
      </LightboxProvider>
    </TooltipProvider>
    </SeasonStartProvider>
  )
}
