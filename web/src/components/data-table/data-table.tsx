import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { AlertCircleIcon, InboxIcon } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * The table shell every list page shares.
 *
 * Loading, empty and error are three distinct states with three distinct
 * renderings. Collapsing them (the usual "no rows" catch-all) is what makes a
 * failed request look like an empty database, which is the single most
 * misleading thing an admin console can do.
 */
interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[]
  data: TData[] | undefined
  loading?: boolean
  error?: Error | null
  emptyMessage?: string
  /** Rendered under each row when set; used for expandable detail rows. */
  className?: string
}

export function DataTable<TData>({
  columns,
  data,
  loading,
  error,
  emptyMessage = '暂无数据',
  className,
}: DataTableProps<TData>) {
  // react-hooks/incompatible-library: TanStack Table v8 returns functions the
  // React Compiler cannot memoize. This app does not run the compiler, so the
  // warning has nothing to act on here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })

  const rows = table.getRowModel().rows

  return (
    <div className={cn('rounded-lg border bg-card', className)}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="h-10 text-xs font-medium">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={rowIndex} className="hover:bg-transparent">
                {columns.map((_column, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <Skeleton className="h-4 w-full max-w-32" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : error ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-32">
                <div className="flex flex-col items-center justify-center gap-2 text-destructive">
                  <AlertCircleIcon className="size-5" />
                  <p className="text-sm">{error.message}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-32">
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <InboxIcon className="size-5" />
                  <p className="text-sm">{emptyMessage}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-2.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
