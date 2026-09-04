import type { ForwardUser, Page, UserPlanInfo } from '@/types/api'

import { action } from './client'

export interface ListForwardUsersParams {
  PageNo?: number
  PageSize?: number
  Username?: string
  OrderBy?: string
  Asc?: boolean
}

export const listForwardUsers = (params: ListForwardUsersParams) =>
  action<Page<ForwardUser>>('user', 'ListUsers', params)

/** Plan, quota and per-day traffic for one forwarding user. */
export const getUserPlanInfo = (userId: number) =>
  action<UserPlanInfo>('user', 'GetUserPlanInfo', { UserId: userId })

export const editForwardUser = (id: number, expirationTime: string | null) =>
  action<null>('user', 'EditUser', { ID: id, ExpirationTime: expirationTime })
