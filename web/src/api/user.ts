import type { RoleCode } from '@/lib/roles'
import type { AdminUser, CurrentUser, Page } from '@/types/api'

import { api } from './client'

export interface ListUsersParams {
  pageNo?: number
  pageSize?: number
  username?: string
  enable?: string
  gender?: string
}

export const getCurrentUser = () => api.get<CurrentUser>('/user/detail')

export const listUsers = (params: ListUsersParams) =>
  api.get<Page<AdminUser>>('/user', { ...params })

export interface AddUserParams {
  username: string
  password: string
  enable: boolean
  /** Which side the account lands on. The backend resolves it to a role row. */
  role: RoleCode
  planId?: number
}

export const addUser = (params: AddUserParams) => api.post<null>('/user', params)

export interface UpdateUserParams {
  id: number
  enable?: boolean
  role?: RoleCode
  username?: string
  password?: string
}

export const updateUser = ({ id, ...rest }: UpdateUserParams) =>
  api.patch<null>(`/user/${id}`, { id, ...rest })

export const resetUserPassword = (id: number, password: string) =>
  api.patch<null>(`/user/password/reset/${id}`, { id, password })

export const deleteUser = (id: number) => api.del<null>(`/user/${id}`)

export interface UpdateProfileParams {
  id: number
  gender: number
  nickName: string
  address: string
  email: string
  avatar: string
}

export const updateProfile = (params: UpdateProfileParams) =>
  api.patch<null>(`/user/profile/${params.id}`, params)
