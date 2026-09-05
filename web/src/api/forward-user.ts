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

/**
 * The nodes and chains one user may build rules on.
 *
 * These grants are what make the user portal usable: every read and write on
 * that side is scoped to them. They are not the permission tree that was
 * removed — that decided which menu entries a role saw; this decides which
 * rows of real infrastructure one account may touch.
 */
export interface UserResources {
  NodeIds: number[] | null
  ChainIds: number[] | null
}

export const getUserResources = (userId: number) =>
  action<UserResources>('user', 'GetUserResources', { UserId: userId })

/** Replaces the whole grant set; an empty list revokes. */
export const setUserResources = (userId: number, nodeIds: number[], chainIds: number[]) =>
  action<null>('user', 'SetUserResources', { UserId: userId, NodeIds: nodeIds, ChainIds: chainIds })
