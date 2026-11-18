import type { ScoreTable } from '@/content/types'
import { StatusBadge } from '@/components/guide/status'
import { PlaceText } from '@/components/guide/places'

/** Score by source, as small tables (S6: Mithril). One group per source. */
export function MithrilTable({ data }: { data: ScoreTable }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold">
              <PlaceText text={g.label} />
            </p>
            <table className="w-full text-sm">
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.label} className="border-t first:border-t-0">
                    <td className="py-1">
                      <PlaceText text={r.label} />
                    </td>
                    <td className="py-1 text-right font-mono tabular-nums">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge status={data.status} />
        {data.note ? <PlaceText text={data.note} /> : null}
      </p>
    </div>
  )
}
