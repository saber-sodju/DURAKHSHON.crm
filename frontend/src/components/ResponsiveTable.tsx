import type { ReactNode } from 'react'
import { TableShell, Th, Td, EmptyState, MobileCardRow } from './ui'

export interface Column<T> {
  /** stable key */
  key: string
  /** column header (already translated) */
  header: string
  /** cell renderer */
  cell: (row: T) => ReactNode
  /** hide this column's label row on the mobile card (e.g. row number) */
  hideLabelOnMobile?: boolean
  /** render big at the top of the mobile card instead of as a label:value line */
  primary?: boolean
  /** right-aligned actions column; on mobile shown as a footer row of buttons */
  actions?: boolean
  className?: string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  emptyTitle: string
  emptyHint?: string
}

/**
 * One data set, two layouts: a normal table on >=sm screens and a stack of
 * cards on phones. Pages declare their columns once and get both for free,
 * so mobile never shows a squished or horizontally-scrolling table.
 */
export function ResponsiveTable<T>({ columns, rows, rowKey, emptyTitle, emptyHint }: Props<T>) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />

  const primary = columns.find((c) => c.primary)
  const actions = columns.find((c) => c.actions)
  const details = columns.filter((c) => !c.primary && !c.actions && !c.hideLabelOnMobile)

  return (
    <>
      {/* desktop / tablet */}
      <div className="hidden sm:block">
        <TableShell>
          <thead className="bg-slate-50">
            <tr>
              {columns.map((c) => (
                <Th key={c.key} className={c.actions ? 'text-right' : c.className}>{c.header}</Th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-slate-50">
                {columns.map((c) => (
                  <Td key={c.key} className={c.actions ? 'text-right' : c.className}>{c.cell(row)}</Td>
                ))}
              </tr>
            ))}
          </tbody>
        </TableShell>
      </div>

      {/* mobile cards */}
      <div className="space-y-2.5 bg-[color:var(--color-mobile-bg)]/50 p-2.5 sm:hidden">
        {rows.map((row) => (
          <MobileCardRow key={rowKey(row)}>
            {primary && <div className="mb-2 text-base font-bold text-slate-800">{primary.cell(row)}</div>}
            <dl className="space-y-1.5">
              {details.map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                  <dt className="shrink-0 font-semibold text-slate-500">{c.header}</dt>
                  <dd className="min-w-0 text-right text-slate-700">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {actions && <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-3">{actions.cell(row)}</div>}
          </MobileCardRow>
        ))}
      </div>
    </>
  )
}
