import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SlideImage } from 'yet-another-react-lightbox'
import type { ImageRef } from '@/content/types'

/**
 * One app-wide image viewer (yet-another-react-lightbox).
 * - Images fit the screen (tall phone screenshots show in full, no scroll).
 * - Pinch / wheel / double-tap zoom, swipe or arrow keys between images, Esc to close.
 * - Gallery: pass several images to `open()`; thumbnails and a counter then show.
 *
 * Usage: const { open } = useLightbox(); open([img1, img2], 1)
 */
interface LightboxCtx {
  open: (images: ImageRef[], index?: number) => void
}
const Viewer = lazy(() => import('./lightbox-viewer'))

const Ctx = createContext<LightboxCtx>({ open: () => {} })

export const useLightbox = () => useContext(Ctx)

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [slides, setSlides] = useState<SlideImage[]>([])
  const [index, setIndex] = useState(-1)
  const [loaded, setLoaded] = useState(false)

  const open = useCallback((images: ImageRef[], i = 0) => {
    setSlides(
      images.map((img) => ({
        src: img.src,
        alt: img.alt,
        // the numbered labels are listed under the caption
        description: img.callouts?.length ? `${img.caption}\n${img.callouts.map((c, n) => `${n + 1}. ${c.label}`).join('   ')}` : img.caption,
      })),
    )
    setIndex(i)
    setLoaded(true)
  }, [])

  const value = useMemo(() => ({ open }), [open])

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* The viewer loads on first use, so the guide page stays small. */}
      {loaded ? (
        <Suspense fallback={null}>
          <Viewer slides={slides} index={index} close={() => setIndex(-1)} />
        </Suspense>
      ) : null}
    </Ctx.Provider>
  )
}

/** A button that shows an image and opens it (or its gallery) in the lightbox. */
export function ZoomableImage({
  image,
  gallery,
  className,
  imgClassName,
}: {
  image: ImageRef
  /** All images of the group. The lightbox opens at `image` and can swipe through the rest. */
  gallery?: ImageRef[]
  className?: string
  imgClassName?: string
}) {
  const { open } = useLightbox()
  const list = gallery?.length ? gallery : [image]
  const start = Math.max(0, list.findIndex((g) => g.src === image.src))
  return (
    <button
      type="button"
      onClick={() => open(list, start)}
      className={className}
      aria-label={`Open full size: ${image.alt}`}
    >
      <img src={image.src} alt={image.alt} loading="lazy" className={imgClassName} />
    </button>
  )
}
