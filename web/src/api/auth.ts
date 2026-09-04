import { api } from './client'

export interface LoginParams {
  username: string
  password: string
  captcha: string
}

export interface LoginResult {
  accessToken: string
}

export const login = (params: LoginParams) => api.post<LoginResult>('/auth/login', params)

export const logout = () => api.post<boolean>('/auth/logout')

export const changePassword = (oldPassword: string, newPassword: string) =>
  api.post<boolean>('/auth/password', { oldPassword, newPassword })

/** Swaps the active role, which mints a token carrying the new role code. */
export const switchRole = (roleCode: string) =>
  api.post<LoginResult>(`/auth/current-role/switch/${encodeURIComponent(roleCode)}`)
