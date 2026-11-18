import type { Claim } from '@/content/types'
import { cn } from '@/lib/utils'
import { PlaceText } from './places'
import { StatusBadge } from './status'

/** A list of claims, each with its status label on the right (stacked on phones). */
export function ClaimList({
  claims,
  ordered = false,
  linkPlaces = true,
  className,
}: {
  claims: Claim[]
  ordered?: boolean
  /** Turn building names into tap targets with image and map position. */
  linkPlaces?: boolean
  className?: string
}) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <List className={cn('flex flex-col gap-2', className)}>
      {claims.map((c, i) => (
        <li key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <span className="flex gap-2">
            {ordered ? (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {i + 1}
              </span>
            ) : (
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
            )}
            <span className="leading-relaxed">{linkPlaces ? <PlaceText text={c.text} /> : c.text}</span>
          </span>
          <StatusBadge status={c.status} className="self-start sm:mt-0.5 ml-8 sm:ml-0" />
        </li>
      ))}
    </List>
  )
}
