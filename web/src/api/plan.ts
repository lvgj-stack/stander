import type { TrafficPlan } from '@/types/api'

import { action } from './client'

export interface ListPlansResult {
  PageSize: number
  PageNumber: number
  TotalCount: number
  Plans: Array<TrafficPlan> | null
}

/** Unlike the other list actions, this one is not wrapped in pageData/total. */
export const listPlans = () => action<ListPlansResult>('plan', 'ListPlans', {})

export const associatePlan = (userId: number, planId: number) =>
  action<null>('plan', 'AssociatePlan', { userId, planId })

export interface CreatePlanBody {
  planName: string
  /** Bytes, like every other traffic figure the API takes. */
  totalTraffic: number
  /** A `PLAN_PERIODS` value. Month is 0, so this must never be omitted. */
  period: number
  /** Optional: associate the new plan with this user in the same transaction. */
  userId?: number
}

export interface CreatePlanResult {
  Plan: TrafficPlan
}

/**
 * Creates a plan, optionally associating it with a user.
 *
 * One request rather than a create followed by an associate: the two-step
 * version leaves an unused plan behind whenever the second step fails, in a
 * catalogue every administrator picks from and which has no delete.
 */
export const createPlan = (body: CreatePlanBody) =>
  action<CreatePlanResult>('plan', 'CreatePlan', body)
