/**
 * Display helpers for the shapes the Go backend actually sends.
 *
 * Every gorm-gen entity field is a pointer, so any of them can arrive as
 * `null`. Nothing in the UI may assume a value is present; these helpers are
 * the single place that decision is made.
 */

/** What an absent value looks like in a table cell. */
export const EMPTY = '—'

/** Renders a possibly-null scalar, falling back to an em dash. */
export function orEmpty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY
  return String(value)
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/**
 * Formats a byte count. Traffic columns are int64 byte counts on the wire
 * (`entity.Rule.Traffic`), which are unreadable raw.
 *
 * Negative input is rendered with its sign rather than clamped: a negative
 * counter means the backend sent something wrong, and hiding that in the UI
 * makes it harder to notice.
 */
export function formatBytes(bytes: number | null | undefined, fractionDigits = 2): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return EMPTY
  if (bytes === 0) return '0 B'

  const sign = bytes < 0 ? '-' : ''
  let value = Math.abs(bytes)
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  // Bytes have no meaningful fraction, so only scaled units get decimals.
  const digits = unit === 0 ? 0 : fractionDigits
  return `${sign}${value.toFixed(digits)} ${BYTE_UNITS[unit]}`
}

/**
 * Formats a Go time.Time as sent over JSON (RFC 3339).
 *
 * The zero time ("0001-01-01T00:00:00Z") is what Go marshals for a field that
 * was never set. Rendering it as "0001/01/01" would be worse than admitting
 * there is no value, so it maps to the empty marker.
 */
export function formatTime(value: string | null | undefined, withTime = true): string {
  if (!value) return EMPTY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return EMPTY
  if (date.getUTCFullYear() <= 1) return EMPTY

  const pad = (n: number) => String(n).padStart(2, '0')
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (!withTime) return ymd
  return `${ymd} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Formats a `Date` as the `YYYY-MM-DD` an `<input type="date">` expects. */
export function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Percentage of a quota used, clamped to [0, 100]; 0 when the quota is 0. */
export function usagePercent(used: number, total: number): number {
  if (!total || total <= 0) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}
