import type { Permission, PermissionType } from '@/types/api'

import { api } from './client'

export const listPermissionTree = () => api.get<Permission[]>('/permission/tree')

export interface AddPermissionParams {
  type: PermissionType
  parentId: number | null
  name: string
  code: string
  path?: string
  icon?: string
  layout?: string
  component?: string
  show: boolean
  enable: boolean
  keepAlive: boolean
  order: number
}

export const addPermission = (params: AddPermissionParams) => api.post<null>('/permission', params)

/**
 * The PATCH endpoint takes the boolean-ish columns as 0/1 integers while the
 * POST endpoint takes real booleans (`inout.PatchPermissionReq` vs
 * `inout.AddPermissionReq`). The conversion is done here so callers can work
 * in booleans throughout.
 */
export interface UpdatePermissionParams extends AddPermissionParams {
  id: number
}

export const updatePermission = (params: UpdatePermissionParams) =>
  api.patch<null>(`/permission/${params.id}`, {
    ...params,
    show: params.show ? 1 : 0,
    enable: params.enable ? 1 : 0,
    keepAlive: params.keepAlive ? 1 : 0,
  })

export const deletePermission = (id: number) => api.del<null>(`/permission/${id}`)
