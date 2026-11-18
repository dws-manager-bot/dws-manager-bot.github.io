import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'
import type { Season } from '@/content/types'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDay, seasonDayOf } from '@/lib/dates'

/**
 * The start date (Day 1) that the site uses to turn season days into calendar dates.
 * Default: `season.schedule.start` (our cluster). A reader in another group can change it;
 * the choice is kept in this browser only.
 */
interface StartCtx {
  start: string | null
  label: string
  isDefault: boolean
  lastDay: number
  setStart: (iso: string | null) => void
}

const Ctx = createContext<StartCtx>({ start: null, label: '', isDefault: true, lastDay: 0, setStart: () => {} })

const key = (slug: string) => `season-start-${slug}`
const read = (slug: string) => {
  try {
    return window.localStorage.getItem(key(slug))
  } catch {
    return null
  }
}

/** State for one season: the custom start if set, else the default. */
export function useSeasonStart(season: Season | undefined) {
  const slug = season?.slug ?? ''
  const [custom, setCustom] = useState<string | null>(() => (slug ? read(slug) : null))
  useEffect(() => setCustom(slug ? read(slug) : null), [slug])
  const setStart = (iso: string | null) => {
    try {
      if (iso) window.localStorage.setItem(key(slug), iso)
      else window.localStorage.removeItem(key(slug))
    } catch {
      /* storage blocked: keep the choice for this visit only */
    }
    setCustom(iso)
  }
  const sched = season?.schedule
  const start = sched ? (custom ?? sched.start) : null
  const value: StartCtx = {
    start,
    label: custom ? 'your group' : (sched?.label ?? ''),
    isDefault: !custom,
    lastDay: sched?.lastDay ?? 0,
    setStart,
  }
  return value
}

export function SeasonStartProvider({ value, children }: { value: StartCtx; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** "Dates for States 389–420 · Day 1 = Mon Nov 23, 2026 · in 9 days" + a control to change Day 1. */
export function SeasonStartControl({ className }: { className?: string }) {
  const { start, label, isDefault, lastDay, setStart } = useContext(Ctx)
  const [draft, setDraft] = useState(start ?? '')
  if (!start) return null
  const today = seasonDayOf(start)
  const status =
    today < 1 ? `starts in ${1 - today} day${1 - today === 1 ? '' : 's'}` : today <= lastDay ? `today is Day ${today}` : 'season over'
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <CalendarDays className="size-4 text-primary" aria-hidden />
        <span>
          Dates for <span className="font-semibold">{label}</span>: Day 1 = {formatDay(start, 1, true)} · {status}.
        </span>
        <Popover onOpenChange={(o) => o && setDraft(start)}>
          <PopoverTrigger asChild>
            <Button variant="link" size="sm" className="h-auto p-0">
              Change
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex w-72 flex-col gap-3" align="start">
            <p className="text-sm">Day 1 of your group (the Kickoff date on the in-game season bar):</p>
            <input
              type="date"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
              aria-label="Day 1 date"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={!draft} onClick={() => setStart(draft)}>
                Use this date
              </Button>
              {!isDefault ? (
                <Button size="sm" variant="outline" onClick={() => setStart(null)}>
                  Reset
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
