import type { ReactNode } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  /** The first "primary" column is the card title on phones. */
  primary?: boolean
  className?: string
}

/**
 * A table on wide screens, a stack of cards on phones (Playbook §10:
 * "on phones, convert wide tables into stacked cards").
 */
export function ResponsiveTable<T>({ columns, rows, caption }: { columns: Column<T>[]; rows: T[]; caption?: string }) {
  const primary = columns.find((c) => c.primary) ?? columns[0]
  const rest = columns.filter((c) => c !== primary)
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={`align-top whitespace-normal ${c.className ?? ''}`}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((row, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
            <div className="font-semibold">{primary.cell(row)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted-foreground">{c.header}</dt>
                  <dd>{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
