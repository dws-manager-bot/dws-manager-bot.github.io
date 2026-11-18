import type { TimelineItem } from '@/content/types'
import { Badge } from '@/components/ui/badge'
import { PlaceText } from './places'
import { StatusBadge } from './status'
import { cn } from '@/lib/utils'

const kindLabel: Record<TimelineItem['kind'], string> = {
  starts: 'Starts',
  unlocks: 'Unlocks',
  resets: 'Resets',
  ends: 'Ends',
  expires: 'Expires',
  settles: 'Settles',
}

/**
 * Vertical phase timeline (Playbook §4: "Timeline with phase labels").
 * `kind` keeps "starts", "unlocks", "settles" etc. separate (Playbook §6).
 */
export function Timeline({ items }: { items: TimelineItem[] }) {
  const sorted = [...items].sort((a, b) => a.day - b.day)
  return (
    <ol className="relative flex flex-col gap-4 border-l-2 border-border pl-6">
      {sorted.map((item, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden
            className={cn(
              'absolute top-1.5 -left-[33px] size-4 rounded-full border-2 border-background',
              item.key ? 'bg-primary ring-4 ring-primary/20' : 'bg-muted-foreground/50',
            )}
          />
          <div
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border p-3 sm:p-4',
              item.key ? 'border-primary/40 bg-primary/5' : 'bg-card',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-primary">{item.when}</span>
              <Badge variant="secondary">{kindLabel[item.kind]}</Badge>
              <StatusBadge status={item.status} />
            </div>
            <p className="font-semibold">
              <PlaceText text={item.title} />
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <PlaceText text={item.detail} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
