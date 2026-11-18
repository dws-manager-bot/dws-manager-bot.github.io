import { Maximize2 } from 'lucide-react'
import type { ImageRef } from '@/content/types'
import { useLightbox } from './lightbox'
import { cn } from '@/lib/utils'

/**
 * Screenshot with caption. Tap to open it in the lightbox (fit to screen, zoom, swipe).
 * Pass `gallery` to let the reader swipe through related images.
 */
export function Figure({
  image,
  gallery,
  className,
  imgClassName,
}: {
  image: ImageRef
  gallery?: ImageRef[]
  className?: string
  imgClassName?: string
}) {
  const { open } = useLightbox()
  const list = gallery?.length ? gallery : [image]
  const start = Math.max(0, list.findIndex((g) => g.src === image.src))

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <button
        type="button"
        onClick={() => open(list, start)}
        className="group relative overflow-hidden rounded-lg border bg-muted/40 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`Open full size: ${image.alt}`}
      >
        <span className="relative mx-auto block w-fit">
          <img
            src={image.src}
            alt={image.alt}
            loading="lazy"
            className={cn('h-auto w-full object-contain', imgClassName)}
          />
          {/* Numbered labels on the image (Playbook §4: label near the thing it explains). */}
          {image.callouts?.map((c, i) => (
            <span
              key={i}
              aria-hidden
              className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white shadow ring-2 ring-white"
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
            >
              {i + 1}
            </span>
          ))}
        </span>
        <span className="absolute top-2 right-2 rounded-md bg-background/85 p-1.5 text-muted-foreground opacity-80 shadow-sm group-hover:opacity-100">
          <Maximize2 className="size-4" aria-hidden />
        </span>
      </button>
      <figcaption className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        <span>{image.caption}</span>
        {image.callouts?.length ? (
          <ol className="flex flex-col gap-1">
            {image.callouts.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-foreground">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span>{c.label}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </figcaption>
    </figure>
  )
}
