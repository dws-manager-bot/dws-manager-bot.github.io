import { ArrowRight, Ban, CalendarClock, Gift, Target } from 'lucide-react'
import type { Phase } from '@/content/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from './status'
import { ClaimList } from './claims'
import { PlaceText } from './places'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  )
}

/** Season phase card (Playbook template 8.3). */
export function PhaseCard({ phase }: { phase: Phase }) {
  return (
    <Card id={phase.id} className="scroll-mt-20">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2 text-sm text-primary">
          <CalendarClock className="size-4" aria-hidden />
          <span className="font-mono font-semibold">{phase.period}</span>
        </div>
        <CardTitle className="text-xl">{phase.name}</CardTitle>
        <CardDescription className="flex items-start gap-2 text-base text-foreground">
          <Target className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-semibold">Your goal: </span>
            <PlaceText text={phase.goal} />
          </span>
        </CardDescription>
        <div className="flex flex-wrap gap-1.5">
          {phase.unlocked.map((u) => (
            <Badge key={u} variant="secondary">
              <PlaceText text={u} />
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Block title="Before it starts">
          <ClaimList claims={phase.before} />
        </Block>
        <Block title="When it starts — in this order">
          <ClaimList claims={phase.whenItStarts} ordered />
        </Block>
        <Block title="Each day">
          <ClaimList claims={phase.daily} />
        </Block>
        <Block title="Rewards">
          <ul className="flex flex-col gap-1">
            {phase.rewards.map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm">
                <Gift className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  <PlaceText text={r} />
                </span>
              </li>
            ))}
          </ul>
        </Block>
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Ban className="size-4 text-destructive" aria-hidden />
            <span className="text-sm font-semibold text-destructive">Do not do this</span>
            <StatusBadge status={phase.dontDoThis.status} />
          </div>
          <p className="text-sm leading-relaxed">
            <PlaceText text={phase.dontDoThis.text} />
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-semibold">Next phase: </span>
            <PlaceText text={phase.handoff} />
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
