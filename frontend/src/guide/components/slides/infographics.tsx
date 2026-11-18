import { ArrowDown, ArrowRight, ShieldAlert, Swords, Users } from 'lucide-react'
import type { Briefing, Objective, Place, ResourceRow } from '@/content/types'
import { PlaceText, ShowOnMap, usePlaces } from '@/components/guide/places'
import { StatusBadge } from '@/components/guide/status'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Flow: a left-to-right chain of steps (stacks top-down on phones).   */
/* Playbook §4: "Input → action → output diagram" / numbered steps.    */
/* ------------------------------------------------------------------ */
export function FlowChain({
  steps,
  numbered = false,
  emphasizeLast = true,
}: {
  steps: { label: string; detail: string }[]
  numbered?: boolean
  emphasizeLast?: boolean
}) {
  return (
    <ol className="flex flex-col items-stretch gap-2 md:flex-row md:items-stretch">
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        return (
          <li key={s.label} className="flex flex-col items-center gap-2 md:flex-1 md:flex-row">
            <div
              className={cn(
                'flex w-full flex-1 flex-col gap-1 self-stretch rounded-xl border p-4',
                last && emphasizeLast ? 'border-primary bg-primary/10' : 'bg-card',
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                {numbered ? (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    {i + 1}
                  </span>
                ) : null}
                <span>
                  <PlaceText text={s.label} />
                </span>
              </span>
              <span className="text-sm leading-snug text-muted-foreground">
                <PlaceText text={s.detail} />
              </span>
            </div>
            {!last ? (
              <>
                <ArrowDown className="size-5 shrink-0 text-muted-foreground md:hidden" aria-hidden />
                <ArrowRight className="hidden size-5 shrink-0 text-muted-foreground md:block" aria-hidden />
              </>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------ */
/* Reward paths: condition → reward.                                   */
/* ------------------------------------------------------------------ */
export function RewardPaths({ paths }: { paths: Briefing['rewardPaths'] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {paths.map((p) => (
        <li key={p.condition} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">If</p>
          <p className="font-medium leading-snug">
            <PlaceText text={p.condition} />
          </p>
          <p className="flex items-start gap-2 text-sm">
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <PlaceText text={p.reward} />
            </span>
          </p>
          <StatusBadge status={p.status} />
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Season roadmap: zones (one lane) + Saturday objectives (diamonds).  */
/* Positions are to scale by season day.                               */
/* ------------------------------------------------------------------ */
export function Roadmap({
  roadmap,
  highlight,
  compact = false,
  showNote = true,
}: {
  roadmap: Briefing['roadmap']
  highlight?: { start: number; end: number | null }
  compact?: boolean
  showNote?: boolean
}) {
  const { places } = usePlaces()
  const stageOf = (name: string) => places.find((p) => p.group === 'Stage' && p.name === name)
  const total = roadmap.lastDay > 35 ? roadmap.lastDay : 56
  const x = (day: number) => ((day - 1) / total) * 100
  const weeks = Array.from({ length: Math.ceil(total / 7) }, (_, i) => i + 1)
  const zoneEnd = (i: number) => (i + 1 < roadmap.zones.length ? roadmap.zones[i + 1].startDay : total + 1)
  const hl = highlight ? { left: x(highlight.start), right: x((highlight.end ?? total) + 1) } : null

  return (
    <div className="flex flex-col gap-3">
      {/* Wide screens: to-scale bar */}
      <div className="hidden md:block">
        <div className="relative" style={{ paddingTop: compact ? 0 : 76 }}>
          {/* objective labels, alternating rows so neighbors do not collide */}
          {!compact
            ? roadmap.objectives.map((o, i) => (
                <div
                  key={o.name}
                  className="absolute flex -translate-x-1/2 flex-col items-center text-center"
                  style={{ left: `${x(o.day)}%`, top: i % 2 === 0 ? 0 : 30 }}
                >
                  <span className="text-xs font-semibold whitespace-nowrap"><PlaceText text={o.name} /></span>
                  <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">{o.when}</span>
                </div>
              ))
            : null}
          <div className="relative h-14 overflow-hidden rounded-lg border">
            {roadmap.zones.map((z, i) => {
              const stage = stageOf(z.name)
              const seg = (
                <button
                  type="button"
                  title={stage ? `Show ${z.name} on the map` : z.name}
                  className="absolute inset-y-0 flex flex-col items-start justify-center border-r border-background px-2 text-left hover:brightness-95 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring"
                  style={{
                    left: `${x(z.startDay)}%`,
                    width: `${x(zoneEnd(i)) - x(z.startDay)}%`,
                    background: `color-mix(in oklch, var(--primary) ${18 + i * 14}%, transparent)`,
                  }}
                >
                  <span className="max-w-full truncate text-xs font-semibold underline decoration-dotted underline-offset-4"><PlaceText text={z.name} /></span>
                  {!compact ? <span className="max-w-full truncate text-[11px] text-muted-foreground">{z.levels}</span> : null}
                </button>
              )
              return stage ? (
                <ShowOnMap key={z.name} place={stage}>
                  {seg}
                </ShowOnMap>
              ) : (
                <span key={z.name}>{seg}</span>
              )
            })}
            {hl ? (
              <div
                className="pointer-events-none absolute inset-y-0 rounded-md ring-[3px] ring-foreground ring-inset"
                style={{ left: `${hl.left}%`, width: `${hl.right - hl.left}%` }}
                aria-hidden
              />
            ) : null}
          </div>
          {/* objective diamonds on the bar edge */}
          {roadmap.objectives.map((o) => (
            <span
              key={o.name}
              title={`${o.name} · ${o.when}`}
              className="absolute size-3.5 -translate-x-1/2 rotate-45 rounded-[2px] border-2 border-background bg-foreground"
              style={{ left: `${x(o.day)}%`, top: compact ? -7 : 69 }}
            />
          ))}
        </div>
        {/* week axis */}
        <div className="relative mt-1 h-5">
          {weeks
            .filter((w) => x(1 + (w - 1) * 7) < 90)
            .map((w) => (
            <span
              key={w}
              className="absolute font-mono text-[11px] text-muted-foreground"
              style={{ left: `${x(1 + (w - 1) * 7)}%` }}
            >
              {total > 35 ? `D${1 + (w - 1) * 7}` : `W${w}`}
            </span>
          ))}
          <span className="absolute right-0 text-[11px] text-muted-foreground">Day {total} · season end</span>
        </div>
      </div>

      {/* Phones: vertical list */}
      <ol className="flex flex-col gap-1.5 md:hidden">
        {[
          ...roadmap.zones.map((z) => ({ day: z.startDay, label: z.name, sub: z.levels, kind: 'zone' as const })),
          ...roadmap.objectives.map((o) => ({ day: o.day + 0.5, label: o.name, sub: o.when, kind: 'objective' as const })),
        ]
          .sort((a, b) => a.day - b.day)
          .map((e) => {
            const inHl = highlight && e.day >= highlight.start && (highlight.end === null || e.day <= highlight.end + 0.5)
            return (
              <li
                key={e.label}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2',
                  inHl ? 'border-foreground bg-primary/10' : 'bg-card',
                )}
              >
                {e.kind === 'zone' ? (
                  <span className="h-6 w-1.5 rounded-full bg-primary" aria-hidden />
                ) : (
                  <span className="mx-0.5 size-3 rotate-45 rounded-[2px] bg-foreground" aria-hidden />
                )}
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">
                    <PlaceText text={e.label} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {e.kind === 'zone' ? `Day ${e.day} · ${e.sub}` : e.sub}
                  </span>
                </span>
              </li>
            )
          })}
      </ol>
      {!compact && showNote ? <p className="text-xs text-muted-foreground">{roadmap.note}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Week strip: what happens on each weekday.                           */
/* ------------------------------------------------------------------ */
const toneStyle: Record<Briefing['week'][number]['events'][number]['tone'], { cls: string; icon: typeof Users; label: string }> = {
  all: { cls: 'border-border bg-card', icon: Users, label: 'All members' },
  'own-camp': { cls: 'border-strategy/50 bg-strategy/10', icon: Swords, label: 'Own camp only' },
  enemy: { cls: 'border-destructive/50 bg-destructive/10', icon: ShieldAlert, label: 'Enemy camp can attack' },
}

export function WeekStrip({ week, everyDay }: { week: Briefing['week']; everyDay: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 md:grid-cols-7">
        {week.map((d) => (
          <div
            key={d.day}
            className={cn(
              'flex flex-col gap-2 rounded-xl border p-2 md:min-h-44',
              d.events.some((e) => e.tone === 'enemy') && 'border-destructive/60',
              d.events.length === 0 && 'hidden md:flex',
            )}
          >
            <p className="text-center font-mono text-sm font-semibold">{d.day}</p>
            {d.events.map((e) => {
              const t = toneStyle[e.tone]
              const Icon = t.icon
              return (
                <div key={e.label} className={cn('flex flex-col gap-0.5 rounded-lg border p-2 text-xs', t.cls)}>
                  <span className="font-mono text-[11px] text-muted-foreground">{e.time}</span>
                  <span className="flex items-center gap-1 font-semibold">
                    <Icon className="size-3.5 shrink-0" aria-label={t.label} />
                    <span>
                      <PlaceText text={e.label} />
                    </span>
                  </span>
                  <span className="leading-snug text-muted-foreground">
                    <PlaceText text={e.detail} />
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
        <span className="font-semibold">Every day:</span>
        {everyDay.map((e) => (
          <span key={e} className="rounded-full border bg-card px-2.5 py-0.5">
            <PlaceText text={e} />
          </span>
        ))}
      </div>
      <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {Object.values(toneStyle).map((t) => {
          const Icon = t.icon
          return (
            <li key={t.label} className="flex items-center gap-1.5">
              <span className={cn('flex size-5 items-center justify-center rounded border', t.cls)}>
                <Icon className="size-3" aria-hidden />
              </span>
              {t.label}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Objective chain: each Saturday objective opens the next one.        */
/* ------------------------------------------------------------------ */
export function ObjectiveChain({ objectives, places = [] }: { objectives: Objective[]; places?: Place[] }) {
  return (
    <ol className="grid gap-3 md:grid-cols-4">
      {objectives.map((o, i) => {
        const last = i === objectives.length - 1
        const place = places.find((p) => p.id === o.placeId)
        return (
          <li
            key={o.name}
            className={cn('relative flex flex-col gap-2 rounded-xl border p-4', last ? 'border-primary bg-primary/10' : 'bg-card')}
          >
            {place?.image ? <img src={place.image.src} alt={place.image.alt} className="h-20 w-full object-contain" loading="lazy" /> : null}
            <span className="font-mono text-xs text-primary">{o.opens}</span>
            <span className="flex items-center gap-2 text-lg font-semibold">
              <span className="size-3 rotate-45 rounded-[2px] bg-foreground" aria-hidden />
              {o.name}
            </span>
            <span className="text-sm leading-snug">
              <PlaceText text={o.effect} />
            </span>
            {place ? (
              <span className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">Where: </span>
                  {place.where}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={place.whereStatus} />
                  <ShowOnMap place={place} />
                </span>
              </span>
            ) : null}
            <span className="mt-auto text-xs text-muted-foreground">
              <PlaceText text={o.reward} />
            </span>
            {!last ? (
              <ArrowRight className="absolute top-1/2 -right-3 hidden size-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground md:block" aria-hidden />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------ */
/* Resource lifecycle: earn → spend → expires.                         */
/* ------------------------------------------------------------------ */
export function ResourceFlow({ rows }: { rows: ResourceRow[] }) {
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {rows.map((r) => (
        <li key={r.resource} className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 rounded-xl border bg-card p-3 text-sm sm:grid-cols-[8rem_1fr_1fr_1fr]">
          <span className="row-span-3 font-semibold sm:row-span-1">
            <PlaceText text={r.resource} />
          </span>
          <span>
            <span className="text-xs text-muted-foreground">Earn · </span>
            <PlaceText text={r.earn} />
          </span>
          <span>
            <span className="text-xs text-muted-foreground">Spend · </span>
            <PlaceText text={r.spend} />
          </span>
          <span className="text-destructive">
            <span className="text-xs text-muted-foreground">Ends · </span>
            {r.expires}
          </span>
        </li>
      ))}
    </ul>
  )
}
