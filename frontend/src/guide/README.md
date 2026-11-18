# Season guide

The Season Guide member page (`/season-guide`). Everything here comes from the
[POU-DW/season-guide-site](https://github.com/POU-DW/season-guide-site) repo,
ported from commit `d612ba4`: `src/components`, `src/content` and `src/lib`
are copied as they are, `App.tsx` became `GuideApp.tsx`, and `index.css` became
`guide.css`. Its images are in `frontend/public/s5` and `frontend/public/s6`,
at the same paths the content uses (`/s6/map.webp`).

It keeps its own stack: React 19, TypeScript (compiled by Vite, not type-checked
here), Tailwind v4 and shadcn/ui (Radix), Recharts and yet-another-react-lightbox.
None of that is downloaded until someone opens the page.

## What changed from the repo

Keep this list current. It is what to redo when the guide is synced again.

- **Addresses** live under `/season-guide` (`lib/route.ts`: `BASE`, `at()`).
  `navigate` also fires `popstate` so the site's router sees the move. Fixed
  where links were built by hand: `GuideApp.tsx` (logo, default redirect,
  `guidePath`), `components/guide/playbook.tsx`, `lib/discord.ts`.
- **Styles stay inside `.sg`** (`guide.css`): Tailwind's reset is
  `preflight.css`, a copy of `tailwindcss/preflight.css` with every selector
  prefixed `.sg`. The colors sit on `.sg`, not `:root` and `.dark`, and are
  moved onto our zinc and gold. Tailwind scans `src/guide` only. `shadcn/tailwind.css`
  is vendored as `shadcn-tailwind.css` rather than installing the shadcn CLI.
  The site's `styles.css` keeps its bare element rules and `.grid` out of `.sg`.
- **Dark only.** The theme switch and `lib/theme.ts` are gone.
- **Font** is the site's (Inter / system) instead of Geist.
- **Popups mount inside `.sg`** (`lib/portal.ts`): `container={portalRoot()}`
  on the Portal in `components/ui/dialog.tsx`, `sheet.tsx`, `popover.tsx` and
  `tooltip.tsx`, and `portal={{ root: portalRoot() }}` in
  `components/guide/lightbox-viewer.tsx`. A new shadcn component with a Portal
  needs the same line.
- **Under the site header.** `SeasonGuide.jsx` measures the site's sticky
  header into `--shell-h`. The guide's sticky header, its contents column, its
  page height and the slide deck's height (`components/slides/deck.tsx`)
  subtract it.

## Syncing a newer guide

Copy `components/`, `content/` and `lib/` over these, put the new images in
`public/s5` / `public/s6`, then redo the list above. `git diff` against this
commit shows each change. After a Tailwind upgrade, regenerate
`preflight.css` from the new `node_modules/tailwindcss/preflight.css`.

Check at 390px and at desktop width: slides, full guide, the compare pages, a
glossary popup, the phone contents menu and an image in the lightbox. Then open
another page in the same tab and check it looks unchanged. The guide's CSS
stays loaded once it has been fetched.
