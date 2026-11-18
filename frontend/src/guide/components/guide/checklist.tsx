import { useEffect, useId, useState } from 'react'
import type { Claim } from '@/content/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { StatusBadge } from './status'

function load(key: string): boolean[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as boolean[]) : []
  } catch {
    return []
  }
}

/**
 * Checklist whose ticks are kept in this browser only (localStorage).
 * It still works if storage is blocked; then ticks are lost on reload.
 */
export function Checklist({ storageKey, items }: { storageKey: string; items: Claim[] }) {
  const baseId = useId()
  const [done, setDone] = useState<boolean[]>(() => load(storageKey))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(done))
    } catch {
      /* storage not available: keep state in memory only */
    }
  }, [storageKey, done])

  const count = items.filter((_, i) => done[i]).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {count} of {items.length} done · saved in this browser
        </span>
        {count > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setDone([])}>
            Clear
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => {
          const id = `${baseId}-${i}`
          return (
            <li key={i} className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
              <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={!!done[i]}
                  onCheckedChange={(v) =>
                    setDone((prev) => {
                      const next = [...prev]
                      next[i] = v === true
                      return next
                    })
                  }
                />
                <span className={done[i] ? 'text-muted-foreground line-through' : ''}>{item.text}</span>
              </label>
              <StatusBadge status={item.status} className="ml-7 sm:ml-0" />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
