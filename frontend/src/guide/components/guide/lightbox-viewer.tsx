import type { SlideImage } from 'yet-another-react-lightbox'
import Lightbox from 'yet-another-react-lightbox'
import Captions from 'yet-another-react-lightbox/plugins/captions'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen'
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import 'yet-another-react-lightbox/plugins/captions.css'
import 'yet-another-react-lightbox/plugins/counter.css'
import 'yet-another-react-lightbox/plugins/thumbnails.css'
import { portalRoot } from '@/lib/portal'

/** The lightbox itself. Loaded on demand by LightboxProvider (lightbox.tsx). */
export default function Viewer({ slides, index, close }: { slides: SlideImage[]; index: number; close: () => void }) {
  const many = slides.length > 1
  return (
    <Lightbox
      open={index >= 0}
      portal={{ root: portalRoot() }}
      index={index}
      close={close}
      slides={slides}
      plugins={many ? [Captions, Counter, Fullscreen, Thumbnails, Zoom] : [Captions, Fullscreen, Zoom]}
      carousel={{ finite: true, padding: '16px' }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      render={many ? undefined : { buttonPrev: () => null, buttonNext: () => null }}
      zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true, doubleClickMaxStops: 3 }}
      captions={{ descriptionTextAlign: 'center', descriptionMaxLines: 4 }}
      thumbnails={{ width: 72, height: 72, border: 1, borderRadius: 8, padding: 2, gap: 8 }}
      styles={{ container: { backgroundColor: '#0a0806' } }}
    />
  )
}
