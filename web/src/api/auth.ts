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
