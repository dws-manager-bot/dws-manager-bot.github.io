import { Ban, CircleHelp, Clock, Flag, Zap } from 'lucide-react'
import type { Season } from '@/content/types'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checklist } from './guide/checklist'
import { Figure } from './guide/figure'
import { MapSchematic, MapSchematicCamps } from './guide/map-schematic'
import { PlaceCard, PlaceText, ZoneExplorer } from './guide/places'
import { RouteMap } from './guide/route-map'
import { QuickCardsNotice } from './guide/playbook'
import { SeasonStartControl } from './guide/season-start'
import { PhaseCard } from './guide/phase-card'
import { ResponsiveTable } from './guide/responsive-table'
import { RuleCard } from './guide/rule-card'
import { Section } from './guide/section'
import { StatusBadge } from './guide/status'
import { ClaimList } from './guide/claims'
import { Timeline } from './guide/timeline'

/** Table of contents. Ids must match the <Section id> values below. */
export const sectionNav = [
  { id: 'overview', label: 'Season in 60 seconds', layer: 'A' },
  { id: 'timeline', label: 'Timeline', layer: 'B' },
  { id: 'map', label: 'Map', layer: 'B' },
  { id: 'buildings', label: 'Buildings and where', layer: 'B' },
  { id: 'route', label: 'Route to the final objective', layer: 'B' },
  { id: 'before', label: 'Before the season', layer: 'B' },
  { id: 'phases', label: 'Phase by phase', layer: 'B' },
  { id: 'objectives', label: 'Key objectives', layer: 'B' },
  { id: 'rules', label: 'Territory rules', layer: 'B' },
  { id: 'resources', label: 'Resources', layer: 'B' },
  { id: 'routine', label: 'Daily and weekly', layer: 'B' },
  { id: 'reference', label: 'Reference', layer: 'C' },
  { id: 'glossary', label: 'All words (A–Z)', layer: 'C' },
  { id: 'open-questions', label: 'Not confirmed', layer: 'C' },
  { id: 'sources', label: 'Sources and changes', layer: 'C' },
] as const

const fortressRewards = [
  { src: '/s5/sands-fortress-reward.webp', alt: 'Sands Fortress participation reward', caption: 'Sands Fortress participation reward.' },
  { src: '/s5/temple-fortress-reward.webp', alt: 'Temple Fortress participation reward', caption: 'Temple Fortress: the camp must have more than 5000 Great Merit points.' },
]

export function SeasonPage({ season }: { season: Season }) {
  return (
    <article className="flex flex-col">
      {/* ---------- Hero ---------- */}
      <header className="flex flex-col gap-4 border-b pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Season {season.number}</Badge>
          <Badge variant="outline">v{season.version}</Badge>
          <Badge variant="outline">Last verified {season.lastVerified}</Badge>
        </div>
        <h1 className="font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl">{season.name}</h1>
        <p className="max-w-prose text-lg text-muted-foreground text-pretty">
          <PlaceText text={season.tagline} />
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4 text-primary" aria-hidden /> {season.serverTimeNote}
        </p>
        <SeasonStartControl />
        <QuickCardsNotice season={season} className="self-start" />
      </header>

      {/* ---------- Layer A ---------- */}
      <Section id="overview" layer="A" title={`Season ${season.number} in 60 seconds`} lead={<PlaceText text={season.overview.whatIsIt} />}>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-5 text-primary" aria-hidden /> Do this first
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimList claims={season.overview.doThisFirst} ordered />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="size-5 text-primary" aria-hidden /> How the season is won
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimList claims={[...season.overview.winCondition, season.overview.minimumTarget]} />
            </CardContent>
          </Card>
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <Ban className="size-5" aria-hidden /> Largest mistake
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="leading-relaxed">
                <PlaceText text={season.overview.biggestMistake.text} />
              </p>
              <StatusBadge status={season.overview.biggestMistake.status} />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Separator />

      {/* ---------- Layer B ---------- */}
      <Section
        id="timeline"
        layer="B"
        title="When does each part open?"
        
      >
        <Timeline items={season.timeline} />
      </Section>

      <Separator />

      <Section id="map" layer="B" title="What does the map look like?" lead={<PlaceText text={season.map.summary} />}>
        <Tabs defaultValue="zones">
          <TabsList>
            <TabsTrigger value="zones">Zones</TabsTrigger>
            <TabsTrigger value="schematic">Simple map</TabsTrigger>
            <TabsTrigger value="full">Full map</TabsTrigger>
            <TabsTrigger value="camps">Camps</TabsTrigger>
          </TabsList>
          <TabsContent value="zones" className="pt-4">
            <ZoneExplorer zones={season.map.places.filter((p) => p.group === 'Zone' || p.group === 'Stage')} />
          </TabsContent>
          <TabsContent value="schematic" className="pt-4">
            {new Set(season.map.routes.map((r) => r.camp)).size > 2 ? (
              <MapSchematicCamps routes={season.map.routes} places={season.map.places} />
            ) : (
              <MapSchematic />
            )}
          </TabsContent>
          <TabsContent value="full" className="pt-4">
            <Figure image={season.map.image} gallery={[season.map.image, season.map.campImage]} />
          </TabsContent>
          <TabsContent value="camps" className="pt-4">
            <Figure image={season.map.campImage} gallery={[season.map.image, season.map.campImage]} className="mx-auto max-w-md" />
          </TabsContent>
        </Tabs>
        <ResponsiveTable
          caption="Map zones"
          rows={season.map.zones}
          columns={[
            { key: 'zone', header: 'Zone', cell: (r) => <span className="font-medium"><PlaceText text={r.zone} /></span>, primary: true },
            { key: 'where', header: 'Where', cell: (r) => <PlaceText text={r.where} /> },
            { key: 'levels', header: 'City levels', cell: (r) => <PlaceText text={r.levels} /> },
            { key: 'other', header: 'Other', cell: (r) => <PlaceText text={r.other} /> },
          ]}
        />
      </Section>

      <Separator />

      <Section
        id="buildings"
        layer="B"
        title="What is each building, and where is it?"
        
      >
        {(['Zone', 'Stage', 'Key objective', 'City', 'Map object', 'Your buildings'] as const).map((group) => (
          <div key={group} className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold">{group === 'Zone' ? 'Map zones' : group === 'Stage' ? 'Map stages (open in this order)' : group === 'Key objective' ? 'Key objectives' : group === 'City' ? 'Cities' : group === 'Map object' ? 'Map objects' : 'Your season buildings'}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {season.map.places
                .filter((p) => p.group === group)
                .map((p) => (
                  <PlaceCard key={p.id} place={p} />
                ))}
            </div>
          </div>
        ))}
      </Section>

      <Separator />

      <Section
        id="route"
        layer="B"
        title="Which way do we go to the Royal Court?"
        
      >
        <RouteMap image={season.map.image.src} routes={season.map.routes} places={season.map.places} note={season.map.routeNote} />
      </Section>

      <Separator />

      <Section id="before" layer="B" title="What must we do before the season?" >
        <Checklist storageKey={`${season.slug}-before`} items={season.beforeSeason} />
      </Section>

      <Separator />

      <Section
        id="phases"
        layer="B"
        title="What do we do in each phase?"
        
      >
        <div className="flex flex-col gap-6">
          {season.phases.map((p) => (
            <PhaseCard key={p.id} phase={p} />
          ))}
        </div>
      </Section>

      <Separator />

      <Section
        id="objectives"
        layer="B"
        title="What are the key objectives?"
        
      >
        <ResponsiveTable
          caption="Key objectives"
          rows={season.objectives}
          columns={[
            {
              key: 'name',
              header: 'Objective',
              cell: (r) => {
                const place = season.map.places.find((p) => p.id === r.placeId)
                return (
                  <span className="flex items-center gap-2 font-medium">
                    {place?.image ? <img src={place.image.src} alt="" className="size-9 shrink-0 rounded object-contain" /> : null}
                    <PlaceText text={r.name} />
                  </span>
                )
              },
              primary: true,
            },
            { key: 'opens', header: 'Opens', cell: (r) => <span className="font-mono text-sm">{r.opens}</span> },
            { key: 'effect', header: 'Effect for the holder', cell: (r) => <PlaceText text={r.effect} /> },
            { key: 'reward', header: 'Participation reward', cell: (r) => <PlaceText text={r.reward} /> },
            { key: 'status', header: 'Label', cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {fortressRewards.map((img) => (
            <Figure key={img.src} image={img} gallery={fortressRewards} />
          ))}
        </div>
      </Section>

      <Separator />

      <Section id="rules" layer="B" title="How do territory and movement work?" >
        <div className="flex flex-col gap-6">
          {season.rules.map((r) => (
            <RuleCard key={r.id} rule={r} />
          ))}
        </div>
      </Section>

      <Separator />

      <Section
        id="resources"
        layer="B"
        title="Which resources do we earn, spend and lose?"
        
      >
        <ResponsiveTable
          caption="Season resources"
          rows={season.resources}
          columns={[
            { key: 'resource', header: 'Resource', cell: (r) => <span className="font-medium"><PlaceText text={r.resource} /></span>, primary: true },
            { key: 'earn', header: 'Earn', cell: (r) => <PlaceText text={r.earn} /> },
            { key: 'spend', header: 'Spend', cell: (r) => <PlaceText text={r.spend} /> },
            { key: 'limit', header: 'Limit', cell: (r) => <PlaceText text={r.limit} /> },
            { key: 'expires', header: 'Expires', cell: (r) => <PlaceText text={r.expires} /> },
          ]}
        />
      </Section>

      <Separator />

      <Section id="routine" layer="B" title="What do we do each day and each week?" >
        <ResponsiveTable
          caption="Routine"
          rows={season.routine}
          columns={[
            { key: 'when', header: 'When', cell: (r) => <span className="font-mono text-sm font-semibold">{r.when}</span>, primary: true },
            { key: 'who', header: 'Who', cell: (r) => <PlaceText text={r.who} /> },
            { key: 'action', header: 'Action', cell: (r) => <PlaceText text={r.action} /> },
            { key: 'status', header: 'Label', cell: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </Section>

      <Separator />

      {/* ---------- Layer C ---------- */}
      <Section id="reference" layer="C" title="Where are the full details?" >
        <Accordion type="multiple" className="rounded-lg border px-4">
          {season.reference.flatMap((g) =>
            g.items.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="text-left">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs font-normal uppercase tracking-wider text-muted-foreground">{g.title}</span>
                    <span>{item.title}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="flex flex-col gap-4">
                  <p className="text-muted-foreground">
                    <PlaceText text={item.summary} />
                  </p>
                  <ClaimList claims={item.points} />
                  {item.image ? <Figure image={item.image} className="max-w-sm" imgClassName="max-h-[28rem]" /> : null}
                </AccordionContent>
              </AccordionItem>
            )),
          )}
        </Accordion>
      </Section>

      <Separator />

      <Section id="glossary" layer="C" title="What does each word mean?" >
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...season.terms]
            .sort((a, b) => a.term.localeCompare(b.term))
            .map((t) => (
              <div key={t.term} id={`term-${t.term.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="rounded-lg border bg-card p-3">
                <dt className="font-semibold">{t.term}</dt>
                <dd className="text-sm leading-relaxed text-muted-foreground">
                  <PlaceText text={t.meaning} />
                </dd>
              </div>
            ))}
        </dl>
      </Section>

      <Separator />

      <Section
        id="open-questions"
        layer="C"
        title="What is not confirmed?"
        lead="Verify these in-game."
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {season.openQuestions.map((q) => (
            <li key={q.question} className="flex gap-3 rounded-lg border border-unconfirmed/30 bg-unconfirmed/5 p-3">
              <CircleHelp className="mt-0.5 size-5 shrink-0 text-unconfirmed" aria-hidden />
              <div className="flex flex-col gap-1">
                <p className="font-semibold">{q.question}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <PlaceText text={q.detail} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Separator />

      <Section id="sources" layer="C" title="Where does this information come from?">
        <ResponsiveTable
          caption="Sources"
          rows={season.sources}
          columns={[
            {
              key: 'title',
              header: 'Source',
              cell: (r) =>
                r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                    {r.title}
                  </a>
                ) : (
                  <span className="font-medium">{r.title}</span>
                ),
              primary: true,
            },
            { key: 'kind', header: 'Type', cell: (r) => <Badge variant={r.kind === 'community' ? 'outline' : 'secondary'}>{r.kind}</Badge> },
            { key: 'where', header: 'Where', cell: (r) => r.where },
          ]}
        />
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Change log</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {season.changelog.map((c) => (
              <li key={c.version}>
                <span className="font-mono">{c.date}</span> · v{c.version} · {c.change}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">
          Guide owner: {season.owner} Map image credit: Azrîel (Dark War Survival Discord).
        </p>
      </Section>
    </article>
  )
}
