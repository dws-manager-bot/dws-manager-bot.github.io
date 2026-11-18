import { BadgeCheck, CircleHelp, Info, Lightbulb, MessagesSquare, Waypoints } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Status } from '@/content/types'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Evidence labels (Playbook §2, §10): never rely on color alone, so each label
 * has an icon and a word.
 */
export const statusMeta: Record<Status, { label: string; help: string; icon: typeof BadgeCheck; className: string }> = {
  fact: {
    label: 'Fact',
    help: 'Verified in-game or in an official post.',
    icon: BadgeCheck,
    className: 'border-fact/40 bg-fact/10 text-fact',
  },
  strategy: {
    label: 'Strategy',
    help: 'Our recommendation. It is not a game rule.',
    icon: Lightbulb,
    className: 'border-strategy/40 bg-strategy/10 text-strategy',
  },
  reported: {
    label: 'Reported',
    help: 'A player or community report. It is not official.',
    icon: MessagesSquare,
    className: 'border-reported/40 bg-reported/10 text-reported',
  },
  inferred: {
    label: 'Inferred',
    help: 'Our conclusion from the data. No source states it. Verify it in-game.',
    icon: Waypoints,
    className: 'border-inferred/40 bg-inferred/10 text-inferred',
  },
  unconfirmed: {
    label: 'Unconfirmed',
    help: 'The sources disagree or do not give the data. Verify it in-game.',
    icon: CircleHelp,
    className: 'border-unconfirmed/40 bg-unconfirmed/10 text-unconfirmed',
  },
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn('cursor-help uppercase tracking-wide', meta.className, className)}>
          <Icon data-icon="inline-start" aria-hidden />
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{meta.help}</TooltipContent>
    </Tooltip>
  )
}

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
      {(Object.keys(statusMeta) as Status[]).map((s) => (
        <li key={s} className="flex items-center gap-2">
          <StatusBadge status={s} />
          <span>{statusMeta[s].help}</span>
        </li>
      ))}
    </ul>
  )
}

/** Label meanings behind one info icon. Readers who know the labels never see it. */
export function LabelsInfo({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="What the labels mean" className={className}>
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <p className="mb-2 text-sm font-semibold">Labels</p>
        <ul className="flex flex-col gap-2 text-sm">
          {(Object.keys(statusMeta) as Status[]).map((s) => (
            <li key={s} className="flex flex-col items-start gap-1">
              <StatusBadge status={s} />
              <span className="text-muted-foreground">{statusMeta[s].help}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
