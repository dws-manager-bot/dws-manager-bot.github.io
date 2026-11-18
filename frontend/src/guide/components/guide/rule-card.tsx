import { CircleCheck, TriangleAlert, Users, Zap } from 'lucide-react'
import type { Rule } from '@/content/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClaimList } from './claims'
import { Figure } from './figure'
import { PlaceText } from './places'

/** Mechanic explainer (Playbook template 8.2). */
export function RuleCard({ rule }: { rule: Rule }) {
  const images = rule.images ?? (rule.image ? [rule.image] : [])
  return (
    <Card id={rule.id} className="scroll-mt-20">
      <CardHeader className="gap-2">
        <CardTitle className="text-xl">{rule.question}</CardTitle>
        <CardDescription className="text-base text-foreground">
          <span className="font-semibold text-primary">Quick answer: </span>
          <PlaceText text={rule.quickAnswer} />
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="flex flex-col gap-5">
          {rule.doThisFirst?.length ? (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <Zap className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-semibold">Do this first: </span>
                <PlaceText text={rule.doThisFirst.join(' ')} />
              </span>
            </div>
          ) : null}
          {rule.whoWhen ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <PlaceText text={rule.whoWhen} />
              </span>
            </p>
          ) : null}
          {rule.steps?.length ? (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Steps</h4>
              <ClaimList claims={rule.steps} ordered />
            </div>
          ) : null}
          {rule.facts?.length ? (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rules</h4>
              <ClaimList claims={rule.facts} />
            </div>
          ) : null}
          {rule.avoid?.length ? (
            <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <TriangleAlert className="size-4" aria-hidden /> Avoid
              </h4>
              <ClaimList claims={rule.avoid} />
            </div>
          ) : null}
          {rule.verify ? (
            <p className="flex items-start gap-2 text-sm">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-fact" aria-hidden />
              <span>
                <span className="font-semibold">How to check: </span>
                <PlaceText text={rule.verify} />
              </span>
            </p>
          ) : null}
        </div>
        {images.length ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            {images.map((img) => (
              <Figure key={img.src} image={img} gallery={images} imgClassName="max-h-96" />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
