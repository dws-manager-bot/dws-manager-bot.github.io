import { useState } from 'react'
import { ArrowRight, Check, CircleCheck, ClipboardCopy, RotateCcw, TriangleAlert, Zap } from 'lucide-react'
import type { AudiencePlan, DecisionTree, QuickCard, Season, WorkedExample } from '@/content/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DISCORD_LIMIT, quickCardDiscord, seasonDiscordPost } from '@/lib/discord'
import { PlaceText } from './places'
import { StatusBadge } from './status'
import { cn } from '@/lib/utils'
import { at } from '@/lib/route'

/* ------------------------------------------------------------------ */
/* Copy button                                                         */
/* ------------------------------------------------------------------ */
export function CopyButton({ text, label = 'Copy for Discord' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        } catch {
          /* clipboard blocked: the text is visible, the user can select it */
        }
      }}
    >
      {done ? <Check /> : <ClipboardCopy />} {done ? 'Copied' : label}
    </Button>
  )
}

/* ------------------------------------------------------------------ */
/* Quick-reference card (Playbook §5.4)                                */
/* ------------------------------------------------------------------ */
export function QuickCardView({ card, season, compact = false }: { card: QuickCard; season: Season; compact?: boolean }) {
  return (
    <Card id={card.id} className="scroll-mt-20 gap-3">
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="size-4 text-primary" aria-hidden /> {card.title}
        </CardTitle>
        <CardDescription className="text-foreground">
          <span className="font-semibold">When: </span>
          <PlaceText text={card.trigger} />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ol className="flex flex-col gap-1.5 text-sm">
          {card.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <span>
                <PlaceText text={s} />
              </span>
            </li>
          ))}
        </ol>
        <p className="flex items-start gap-2 rounded-md bg-destructive/5 p-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <PlaceText text={card.warning} />
          </span>
        </p>
        {!compact ? (
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={quickCardDiscord(card, season)} />
            <a href={at(`/${season.slug}/guide#${card.link}`)} className="text-sm text-primary underline-offset-2 hover:underline">
              Full rule
            </a>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Quick cards, hidden behind a small notice (they are useful, but not  */
/* part of the first read).                                            */
/* ------------------------------------------------------------------ */
export function QuickCardsNotice({ season, className }: { season: Season; className?: string }) {
  if (!season.quickCards.length) return null
  return (
    <Dialog>
      <div className={cn('flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground', className)}>
        <Zap className="size-4 text-primary" aria-hidden />
        <span>{season.quickCards.length} quick cards for repeated tasks.</span>
        <DialogTrigger asChild>
          <Button variant="link" size="sm" className="h-auto p-0">
            Open
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Quick cards</DialogTitle>
          <DialogDescription>One card for each repeated task. Copy one into Discord.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          {season.quickCards.map((c) => (
            <QuickCardView key={c.id} card={c} season={season} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Discord summary (Playbook §10, §12)                                 */
/* ------------------------------------------------------------------ */
export function DiscordSummary({ season }: { season: Season }) {
  const text = seasonDiscordPost(season)
  const over = text.length > DISCORD_LIMIT
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={text} label="Copy the post" />
        <span className={cn('text-xs', over ? 'text-destructive' : 'text-muted-foreground')}>
          {text.length} / {DISCORD_LIMIT} characters {over ? '(too long for one message)' : ''}
        </span>
      </div>
      <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">{text}</pre>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Decision tree (Playbook §4, §5.3): one question at a time.          */
/* ------------------------------------------------------------------ */
export function DecisionTreeView({ tree }: { tree: DecisionTree }) {
  const [path, setPath] = useState<{ node: string; choice: number }[]>([])
  const byId = (id: string) => tree.nodes.find((n) => n.id === id)
  const lastChoice = path.at(-1)
  const lastOption = lastChoice ? byId(lastChoice.node)?.options[lastChoice.choice] : undefined
  const currentId = path.length === 0 ? tree.start : lastOption?.next
  const current = currentId ? byId(currentId) : undefined
  const answer = lastOption && !lastOption.next ? lastOption : undefined

  return (
    <Card className="gap-3">
      <CardHeader className="gap-1">
        <CardTitle className="text-lg">{tree.title}</CardTitle>
        <CardDescription>For: {tree.who}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {path.map((p, i) => {
          const n = byId(p.node)
          if (!n) return null
          return (
            <div key={i} className="flex flex-col gap-0.5 border-l-2 border-primary/40 pl-3 text-sm">
              <span className="text-muted-foreground">
                <PlaceText text={n.question} />
              </span>
              <span className="font-semibold">→ {n.options[p.choice].label}</span>
            </div>
          )
        })}
        {current ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
            <p className="font-semibold">
              <PlaceText text={current.question} />
            </p>
            <div className="flex flex-wrap gap-2">
              {current.options.map((o, i) => (
                <Button key={o.label} variant="outline" size="sm" onClick={() => setPath([...path, { node: current.id, choice: i }])}>
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {answer ? (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="flex items-start gap-2">
              <ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <PlaceText text={answer.answer ?? ''} />
              </span>
            </p>
            {answer.status ? <StatusBadge status={answer.status} /> : null}
          </div>
        ) : null}
        {path.length ? (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setPath([])}>
            <RotateCcw /> Start again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Worked example (Playbook 8.2 EXAMPLE)                               */
/* ------------------------------------------------------------------ */
export function WorkedExampleView({ example }: { example: WorkedExample }) {
  return (
    <Card className="gap-3">
      <CardHeader className="gap-1.5">
        <Badge variant="secondary" className="w-fit">
          {example.who}
        </Badge>
        <CardTitle className="text-lg">{example.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="rounded-md bg-muted/50 p-2">
          <span className="font-semibold">Start: </span>
          <PlaceText text={example.start} />
        </p>
        <ol className="flex flex-col gap-1.5">
          {example.steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <span>
                <PlaceText text={s} />
              </span>
            </li>
          ))}
        </ol>
        <p className="rounded-md border border-fact/30 bg-fact/5 p-2">
          <span className="font-semibold">Result: </span>
          <PlaceText text={example.outcome} />
        </p>
        <p className="flex items-start gap-2 text-muted-foreground">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-fact" aria-hidden />
          <span>
            <span className="font-semibold text-foreground">How to check: </span>
            <PlaceText text={example.check} />
          </span>
        </p>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Plans by kind of player (Playbook §6 "Who this affects")            */
/* ------------------------------------------------------------------ */
export function AudienceTabs({ audiences }: { audiences: AudiencePlan[] }) {
  return (
    <Tabs defaultValue={audiences[0]?.id} className="gap-4">
      <TabsList className="h-auto flex-wrap">
        {audiences.map((a) => (
          <TabsTrigger key={a.id} value={a.id}>
            {a.who.split(' (')[0]}
          </TabsTrigger>
        ))}
      </TabsList>
      {audiences.map((a) => (
        <TabsContent key={a.id} value={a.id}>
          <Card className="gap-3">
            <CardHeader className="gap-1">
              <CardTitle>{a.who}</CardTitle>
              <CardDescription>{a.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Do these, in this order</p>
                <ol className="flex flex-col gap-1.5 text-sm">
                  {a.priorities.map((p, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span>
                        <PlaceText text={p} />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              {a.skip.length ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">You can skip</p>
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
                    {a.skip.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  )
}
