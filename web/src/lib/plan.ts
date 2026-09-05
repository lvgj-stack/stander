/**
 * Traffic plans: the reset period's values, and the unit the quota is entered in.
 *
 * Both are things the frontend knows rather than things it is told. The period
 * mirrors `entity.PlanPeriod` in the Go service layer — four fixed values whose
 * meaning the backend owns and whose Chinese wording is UI copy like any other
 * label. Same shape as `roles.ts`, for the same reason.
 *
 * This does not live in `format.ts`: that module renders what the backend sent,
 * and half of this is conversion in the other direction, on the way in.
 */

import { EMPTY } from './format'

/**
 * How often a plan's quota resets, which is also how long it runs for.
 *
 * An enum, not a day count. The plan list used to render it as days, so a
 * quarterly plan (1) read as 「每 1 天」 and a monthly one (0) as 「不重置」.
 */
export const PLAN_PERIODS = {
  MONTH: 0,
  QUARTER: 1,
  HALF_YEAR: 2,
  YEAR: 3,
} as const

export type PlanPeriod = (typeof PLAN_PERIODS)[keyof typeof PLAN_PERIODS]

const PERIOD_LABELS: Record<PlanPeriod, string> = {
  [PLAN_PERIODS.MONTH]: '每月',
  [PLAN_PERIODS.QUARTER]: '每季度',
  [PLAN_PERIODS.HALF_YEAR]: '每半年',
  [PLAN_PERIODS.YEAR]: '每年',
}

/** The four periods a form may offer, in the enum's own order. */
export const PERIOD_OPTIONS: ReadonlyArray<{ value: PlanPeriod; label: string }> = [
  PLAN_PERIODS.MONTH,
  PLAN_PERIODS.QUARTER,
  PLAN_PERIODS.HALF_YEAR,
  PLAN_PERIODS.YEAR,
].map((value) => ({ value, label: PERIOD_LABELS[value] }))

/**
 * How to label a reset period.
 *
 * Null is possible — the column is nullable — and so is a value outside the
 * enum, since nothing constrains the column. Neither gets an invented sentence:
 * a plan whose period we cannot name is one an operator should look at, not one
 * we should describe confidently.
 *
 * Note that 0 is a real period (`MONTH`), not an absent one. Anything here that
 * treats the value as falsy relabels every monthly plan.
 */
export function periodLabel(period: number | null | undefined): string {
  if (period === null || period === undefined) return EMPTY
  return PERIOD_LABELS[period as PlanPeriod] ?? EMPTY
}

/**
 * Bytes in a gigabyte, 1024-based.
 *
 * `formatBytes` scales by 1024, so entering 100 has to come back as
 * 「100.00 GB」. A 1000-based conversion would display as 93.13 GB and the first
 * person to create a plan would conclude they had mistyped it.
 */
export const BYTES_PER_GB = 1024 ** 3

/**
 * Converts an operator's gigabytes into the byte count the column stores.
 *
 * Rounded, because the column is a bigint: a fractional allowance that does not
 * land on a whole byte has to become one here rather than reach the backend as
 * a decimal.
 */
export function gbToBytes(gb: number): number {
  return Math.round(gb * BYTES_PER_GB)
}

/** The inverse, for showing a stored quota back in the unit it was entered in. */
export function bytesToGb(bytes: number): number {
  return bytes / BYTES_PER_GB
}
