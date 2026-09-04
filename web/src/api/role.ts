import type { Page, Permission, Role, RoleWithPermissions } from '@/types/api'

import { api } from './client'

export const listRoles = () => api.get<Role[]>('/role')

export interface ListRolesPageParams {
  pageNo?: number
  pageSize?: number
  name?: string
  enable?: string
}

export const listRolesPage = (params: ListRolesPageParams) =>
  api.get<Page<RoleWithPermissions>>('/role/page', { ...params })

/** The menu tree the signed-in user may see. Drives sidebar visibility. */
export const getPermissionsTree = () => api.get<Permission[]>('/role/permissions/tree')

export interface AddRoleParams {
  code: string
  name: string
  enable: boolean
  permissionIds: number[]
}

export const addRole = (params: AddRoleParams) => api.post<null>('/role', params)

export interface UpdateRoleParams {
  id: number
  code?: string
  name?: string
  enable?: boolean
  permissionIds?: number[]
}

export const updateRole = ({ id, ...rest }: UpdateRoleParams) =>
  api.patch<null>(`/role/${id}`, { id, ...rest })

export const deleteRole = (id: number) => api.del<null>(`/role/${id}`)

export const addRoleUsers = (id: number, userIds: number[]) =>
  api.patch<null>(`/role/users/add/${id}`, { id, userIds })

export const removeRoleUsers = (id: number, userIds: number[]) =>
  api.patch<null>(`/role/users/remove/${id}`, { id, userIds })
