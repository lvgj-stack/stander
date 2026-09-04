import { describe, expect, it } from 'vitest'

import { EMPTY, formatBytes, formatTime, orEmpty, toDateInputValue, usagePercent } from './format'

describe('orEmpty', () => {
  it('renders a value unchanged', () => {
    expect(orEmpty('hk-01')).toBe('hk-01')
    expect(orEmpty(0)).toBe('0')
  })

  it('falls back for the shapes a nullable Go pointer produces', () => {
    expect(orEmpty(null)).toBe(EMPTY)
    expect(orEmpty(undefined)).toBe(EMPTY)
    expect(orEmpty('')).toBe(EMPTY)
  })
})

describe('formatBytes', () => {
  it('leaves raw bytes without a fraction', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('scales through the units', () => {
    expect(formatBytes(1024)).toBe('1.00 KB')
    expect(formatBytes(1024 ** 2)).toBe('1.00 MB')
    expect(formatBytes(1024 ** 3)).toBe('1.00 GB')
    expect(formatBytes(1.5 * 1024 ** 4)).toBe('1.50 TB')
  })

  it('stops at the largest unit rather than inventing one', () => {
    expect(formatBytes(1024 ** 6)).toBe('1024.00 PB')
  })

  it('shows a negative counter instead of hiding it', () => {
    expect(formatBytes(-2048)).toBe('-2.00 KB')
  })

  it('falls back for absent traffic', () => {
    expect(formatBytes(null)).toBe(EMPTY)
    expect(formatBytes(undefined)).toBe(EMPTY)
    expect(formatBytes(Number.NaN)).toBe(EMPTY)
  })
})

describe('formatTime', () => {
  it('formats an RFC 3339 timestamp', () => {
    // Built from a local-time string so the assertion does not depend on TZ.
    const local = new Date(2025, 2, 14, 9, 5, 7)
    expect(formatTime(local.toISOString())).toBe('2025-03-14 09:05:07')
    expect(formatTime(local.toISOString(), false)).toBe('2025-03-14')
  })

  it("treats Go's zero time as no value", () => {
    // A *time.Time that was never set marshals to this, and rendering it as a
    // year-1 date would be worse than admitting there is nothing there.
    expect(formatTime('0001-01-01T00:00:00Z')).toBe(EMPTY)
  })

  it('falls back for null and unparseable input', () => {
    expect(formatTime(null)).toBe(EMPTY)
    expect(formatTime('')).toBe(EMPTY)
    expect(formatTime('not a date')).toBe(EMPTY)
  })
})

describe('toDateInputValue', () => {
  it('produces the YYYY-MM-DD an input[type=date] wants', () => {
    expect(toDateInputValue(new Date(2025, 11, 1))).toBe('2025-12-01')
  })

  it('yields an empty string for absent or zero times', () => {
    expect(toDateInputValue(null)).toBe('')
    expect(toDateInputValue('0001-01-01T00:00:00Z')).toBe('')
  })
})

describe('usagePercent', () => {
  it('computes a share of the quota', () => {
    expect(usagePercent(50, 200)).toBe(25)
  })

  it('clamps overage rather than overflowing the bar', () => {
    expect(usagePercent(300, 200)).toBe(100)
  })

  it('reports zero when there is no quota to divide by', () => {
    expect(usagePercent(10, 0)).toBe(0)
  })
})
