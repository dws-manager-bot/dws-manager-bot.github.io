import { useState } from 'react'
import { ArrowRight, CircleHelp, Minus, TriangleAlert, Sparkles } from 'lucide-react'
import type { Compare, CompareRow, CompareStatus } from '@/content/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Section } from '@/components/guide/section'

const statusMeta: Record<CompareStatus, { label: string; icon: typeof Sparkles; className: string }> = {
  changed: { label: 'Changed', icon: Sparkles, className: 'border-primary/50 bg-primary/10 text-primary' },
  same: { label: 'Same', icon: Minus, className: 'border-border bg-muted text-muted-foreground' },
  unconfirmed: { label: 'Not confirmed', icon: CircleHelp, className: 'border-unconfirmed/40 bg-unconfirmed/10 text-unconfirmed' },
}

export function CompareBadge({ status }: { status: CompareStatus }) {
  const m = statusMeta[status]
  const Icon = m.icon
  return (
    <Badge variant="outline" className={m.className}>
      <Icon data-icon="inline-start" aria-hidden />
      {m.label}
    </Badge>
  )
}

/** One row: what it is, then S5 → S6. */
function CompareItem({ row, against }: { row: CompareRow; against: Compare['against'] }) {
  return (
    <li className="flex flex-col gap-1.5 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{row.what}</span>
        <CompareBadge status={row.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          S{against.number}: {row.s5}
        </span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="font-medium">S6: {row.s6}</span>
      </div>
    </li>
  )
}

export function ComparePage({ compare, onOpenSeason }: { compare: Compare; onOpenSeason: () => void }) {
  const [tab, setTab] = useState<'all' | 'changed' | 'same'>('changed')
  const filtered = (rows: CompareRow[]) => (tab === 'all' ? rows : rows.filter((r) => (tab === 'same' ? r.status !== 'changed' : r.status === 'changed')))
  const changed = compare.sections.flatMap((s) => s.rows).filter((r) => r.status === 'changed').length
  const same = compare.sections.flatMap((s) => s.rows).filter((r) => r.status === 'same').length

  return (
    <article className="flex flex-col">
      <header className="flex flex-col gap-4 border-b pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            S{compare.against.number} → S{compare.number}
          </Badge>
          <Badge variant="outline">v{compare.version}</Badge>
          <Badge variant="outline">Last verified {compare.lastVerified}</Badge>
        </div>
        <h1 className="font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          {compare.name} vs {compare.against.name}
        </h1>
        <p className="max-w-prose text-lg text-muted-foreground text-pretty">{compare.tagline}</p>
        <p className="max-w-prose text-lg font-medium text-pretty">{compare.headline}</p>
        <p className="text-sm text-muted-foreground">
          {changed} changes · {same} the same. Only the differences and what carries over.
        </p>
      </header>

      <Section id="changes" layer="A" title="What changed most">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {compare.keyChanges.map((k) => (
            <Card key={k.title} className="border-primary/30">
              <CardHeader className="gap-1">
                <CardTitle className="text-base">{k.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
                <span>{k.text}</span>
                <CompareBadge status={k.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {compare.visuals ? (
        <>
          <Separator />
          <Section id="same" layer="A" title="What stays the same">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[...compare.visuals.base.filter((b) => b.status === 'same'), ...compare.visuals.same].map((c) => (
                <li key={c.title} className="flex gap-3 rounded-lg border bg-card p-3">
                  {c.image ? <img src={c.image} alt="" className="size-12 shrink-0 rounded-md object-contain" loading="lazy" /> : null}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-semibold leading-tight">{c.title}</span>
                    <span className="text-sm leading-snug text-muted-foreground">{c.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : null}

      <Separator />

      <Section id="table" layer="B" title={compare.number === 6 ? 'S5 and S6, side by side' : 'Side by side'}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="changed">Changed ({changed})</TabsTrigger>
            <TabsTrigger value="same">Same ({same})</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="flex flex-col gap-6 pt-4">
            {compare.sections.map((s) => {
              const rows = filtered(s.rows)
              if (!rows.length) return null
              return (
                <div key={s.id} className="flex flex-col gap-1">
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <ul>
                    {rows.map((r) => (
                      <CompareItem key={`${s.id}-${r.what}`} row={r} against={compare.against} />
                    ))}
                  </ul>
                </div>
              )
            })}
          </TabsContent>
        </Tabs>
      </Section>

      <Separator />

      <Section id="open-questions" layer="C" title="Not confirmed">
        <ul className="grid gap-3 md:grid-cols-2">
          {compare.openQuestions.map((q) => (
            <li key={q.question} className="flex gap-3 rounded-lg border border-unconfirmed/30 bg-unconfirmed/5 p-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-unconfirmed" aria-hidden />
              <div className="flex flex-col gap-1">
                <p className="font-semibold">{q.question}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{q.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <Button className="self-start" onClick={onOpenSeason}>
          Open the S5 guide
        </Button>
      </Section>

      <Separator />

      <Section id="sources" layer="C" title="Sources">
        <ul className="flex flex-col gap-1.5 text-sm">
          {compare.sources.map((src) => (
            <li key={src.id}>
              {src.url ? (
                <a href={src.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                  {src.title}
                </a>
              ) : (
                <span className="font-medium">{src.title}</span>
              )}
              <span className="text-muted-foreground"> · {src.kind} · {src.where}</span>
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {compare.changelog.map((c) => (
            <li key={c.version}>
              <span className="font-mono">{c.date}</span> · v{c.version} · {c.change}
            </li>
          ))}
        </ul>
      </Section>
    </article>
  )
}
