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
