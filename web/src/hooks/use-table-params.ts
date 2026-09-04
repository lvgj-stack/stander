import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Keeps page, page size and the search keyword in the URL.
 *
 * Putting them in the URL rather than component state means a reload or a
 * shared link lands on the same rows, and the browser's back button steps
 * through pages the way people expect.
 *
 * Each table passes a distinct `prefix` so two tables on one screen do not
 * fight over the same parameters.
 */
export interface TableParams {
  pageNo: number
  pageSize: number
  keyword: string
  setPage: (page: number) => void
  setPageSize: (size: number) => void
  setKeyword: (keyword: string) => void
}

export function useTableParams(prefix = '', defaultPageSize = 10): TableParams {
  const [searchParams, setSearchParams] = useSearchParams()

  const key = useCallback((name: string) => (prefix ? `${prefix}_${name}` : name), [prefix])

  const pageNo = Math.max(1, Number(searchParams.get(key('page')) ?? 1) || 1)
  const pageSize = Math.max(1, Number(searchParams.get(key('size')) ?? defaultPageSize) || defaultPageSize)
  const keyword = searchParams.get(key('q')) ?? ''

  const update = useCallback(
    (patch: Record<string, string | number | null>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          for (const [name, value] of Object.entries(patch)) {
            if (value === null || value === '') next.delete(key(name))
            else next.set(key(name), String(value))
          }
          return next
        },
        { replace: true },
      )
    },
    [key, setSearchParams],
  )

  return useMemo(
    () => ({
      pageNo,
      pageSize,
      keyword,
      setPage: (page: number) => update({ page }),
      setPageSize: (size: number) => update({ size, page: 1 }),
      // Changing the filter has to reset the page, or a search that matches
      // fewer rows than the current offset shows an empty table.
      setKeyword: (value: string) => update({ q: value || null, page: 1 }),
    }),
    [pageNo, pageSize, keyword, update],
  )
}
