import { describe, expect, it } from 'vitest'

import { BYTES_PER_GB, PERIOD_OPTIONS, PLAN_PERIODS, bytesToGb, gbToBytes, periodLabel } from './plan'

/**
 * The reset period is an enum, not a day count.
 *
 * The list used to render it as days — 0 as 「不重置」 and 30 as 「每 30 天」 —
 * while the backend has always stored one of four enum values. A quarterly plan
 * (1) therefore displayed as 「每 1 天」 and a monthly one (0) as 「不重置」, so
 * the screen an operator picks a plan from was telling them the opposite of
 * what the plan does.
 */
describe('periodLabel', () => {
  it('names every period the backend defines', () => {
    expect(periodLabel(PLAN_PERIODS.MONTH)).toBe('每月')
    expect(periodLabel(PLAN_PERIODS.QUARTER)).toBe('每季度')
    expect(periodLabel(PLAN_PERIODS.HALF_YEAR)).toBe('每半年')
    expect(periodLabel(PLAN_PERIODS.YEAR)).toBe('每年')
  })

  // Month is 0, which is also what a dropped field decodes to. Pinned so that
  // nobody "fixes" the falsy case by treating 0 as absent.
  it('treats the month period as a real value, not as absent', () => {
    expect(periodLabel(0)).toBe('每月')
  })

  it('falls back to the empty marker when there is no period', () => {
    expect(periodLabel(null)).toBe('—')
    expect(periodLabel(undefined)).toBe('—')
  })

  // A row written before the column was constrained, or by hand. Better an em
  // dash than an invented sentence about what it means.
  it('falls back to the empty marker for a value outside the enum', () => {
    expect(periodLabel(99)).toBe('—')
    expect(periodLabel(-1)).toBe('—')
  })

  it('offers exactly the four periods for a form, in order', () => {
    expect(PERIOD_OPTIONS.map((option) => option.value)).toEqual([0, 1, 2, 3])
    expect(PERIOD_OPTIONS.map((option) => option.label)).toEqual([
      '每月',
      '每季度',
      '每半年',
      '每年',
    ])
  })
})

/**
 * Quota is stored and sent as a byte count; operators think in GB.
 *
 * 1024-based, because the display formatter is: entering 100 has to come back
 * as「100.00 GB」in the list. With 1000-based conversion it reads as 93.13 GB,
 * and the first person to create a plan concludes they mistyped.
 */
describe('gbToBytes', () => {
  it('converts using the same base the display formatter uses', () => {
    expect(gbToBytes(100)).toBe(100 * 1024 * 1024 * 1024)
    expect(BYTES_PER_GB).toBe(1024 ** 3)
  })

  it('handles a fractional allowance', () => {
    expect(gbToBytes(0.5)).toBe(536870912)
  })

  // The column is a bigint. A fraction that does not land on a whole byte has
  // to be rounded here rather than sent as a decimal the backend will reject
  // or silently truncate.
  it('always yields a whole number of bytes', () => {
    expect(Number.isInteger(gbToBytes(0.1))).toBe(true)
    expect(Number.isInteger(gbToBytes(1.7))).toBe(true)
  })

  it('round-trips back to gigabytes', () => {
    expect(bytesToGb(gbToBytes(100))).toBe(100)
    expect(bytesToGb(gbToBytes(0.5))).toBe(0.5)
  })
})
