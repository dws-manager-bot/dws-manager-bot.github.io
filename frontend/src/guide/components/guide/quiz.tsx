import { useState } from 'react'
import { CircleCheck, CircleX } from 'lucide-react'
import type { Scenario } from '@/content/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** "What would you do?" scenario (Playbook §1: retrieval and practice). */
export function Quiz({ scenario }: { scenario: Scenario }) {
  const [picked, setPicked] = useState<number | null>(null)
  const answered = picked !== null
  const correct = picked === scenario.answerIndex

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle>{scenario.title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{scenario.start}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="font-semibold">{scenario.question}</p>
        <div className="flex flex-col gap-2" role="group" aria-label={scenario.question}>
          {scenario.options.map((opt, i) => {
            const isAnswer = i === scenario.answerIndex
            return (
              <Button
                key={i}
                variant="outline"
                className={cn(
                  'h-auto justify-start py-2 text-left whitespace-normal',
                  answered && isAnswer && 'border-fact bg-fact/10',
                  answered && picked === i && !isAnswer && 'border-destructive bg-destructive/10',
                )}
                aria-pressed={picked === i}
                onClick={() => setPicked(i)}
              >
                {answered && isAnswer ? <CircleCheck className="text-fact" aria-hidden /> : null}
                {answered && picked === i && !isAnswer ? <CircleX className="text-destructive" aria-hidden /> : null}
                {opt}
              </Button>
            )
          })}
        </div>
        {answered ? (
          <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed" aria-live="polite">
            <span className="font-semibold">{correct ? 'Correct. ' : 'Not correct. '}</span>
            {scenario.why}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
