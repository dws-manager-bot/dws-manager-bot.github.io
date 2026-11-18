import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Layer = 'A' | 'B' | 'C'

const layerLabel: Record<Layer, string> = {
  A: 'Quick answer',
  B: 'Practical guide',
  C: 'Reference',
}

/**
 * One page section. Headings are questions (Playbook §3).
 * `layer` tells the reader how deep this section goes (Playbook §2).
 */
export function Section({
  id,
  layer,
  title,
  lead,
  children,
  className,
}: {
  id: string
  layer: Layer
  title: string
  lead?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('flex flex-col gap-5 py-10', className)}>
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Layer {layer} · {layerLabel[layer]}
        </p>
        <h2 id={`${id}-title`} className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {title}
        </h2>
        {lead ? <div className="max-w-prose text-base leading-relaxed text-muted-foreground">{lead}</div> : null}
      </header>
      {children}
    </section>
  )
}
