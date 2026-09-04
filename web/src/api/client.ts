import type { ApiEnvelope } from '@/types/api'

/**
 * The HTTP layer.
 *
 * Two things about this backend shape everything here:
 *
 * 1. A business failure still returns HTTP 200 with a non-zero `code`
 *    (`internal/admin/handler/base.go`). Success can only be read off `code`,
 *    never off the status line.
 * 2. The captcha id lives in a server-side session cookie, so the captcha and
 *    login requests must send credentials. Sending them everywhere keeps that
 *    from being a special case someone forgets.
 */

/** Where the API lives. Empty means same-origin (dev proxy / nginx reverse proxy). */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

const TOKEN_KEY = 'stander.token'

/** A failed request, whether it failed at the HTTP layer or in the envelope. */
export class ApiError extends Error {
  readonly code: number
  readonly status: number

  constructor(message: string, code: number, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/** Called when the backend rejects our credentials, so the app can log out. */
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler = () => {}

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Private-mode browsers can throw on access rather than return null.
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* A session that survives only in memory is better than a crash. */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = `${API_BASE_URL}${path}`
  if (!query) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    // An absent filter must not become the string "undefined".
    if (value === undefined || value === null || value === '') continue
    search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>

interface RequestOptions {
  query?: QueryParams
  body?: unknown
  signal?: AbortSignal
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    // Carries the captcha session cookie. Harmless on the other endpoints.
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })

  if (response.status === 401 || response.status === 403) {
    clearToken()
    onUnauthorized()
    throw new ApiError('登录状态已失效，请重新登录', response.status, response.status)
  }

  if (!response.ok) {
    throw new ApiError(`请求失败（HTTP ${response.status}）`, response.status, response.status)
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError('响应不是合法的 JSON', -1, response.status)
  }

  if (envelope.code !== 0) {
    // The JWT middleware reports an expired token through the envelope too,
    // so the logged-out path has to be reachable from here as well.
    if (isAuthFailure(envelope.code)) {
      clearToken()
      onUnauthorized()
    }
    throw new ApiError(envelope.message || '请求失败', envelope.code, response.status)
  }

  // A handler that answers with `Resp.Succ(ctx, nil)` omits `data` entirely.
  return envelope.data as T
}

/** Envelope codes the JWT middleware uses for an unusable login state. */
function isAuthFailure(code: number): boolean {
  return code === 401 || code === 10002
}

export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: QueryParams) =>
    request<T>('POST', path, { body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
}

/**
 * Calls a `/stander/*` endpoint, which dispatches on an `Action` query
 * parameter instead of on the HTTP method or path.
 *
 * Keeping this in one function means the rest of the app never has to know
 * that half the backend speaks a different dialect.
 */
export function action<T>(resource: string, name: string, payload: unknown = {}): Promise<T> {
  return api.post<T>(`/stander/${resource}`, payload, { Action: name })
}

/**
 * Fetches the captcha image as a blob URL.
 *
 * This endpoint answers with image bytes, not the JSON envelope, so it cannot
 * go through `request`. The session cookie it sets is what `/auth/login`
 * later validates the code against, which is why credentials are required.
 */
export async function fetchCaptcha(signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/captcha`, {
    credentials: 'include',
    signal,
  })
  if (!response.ok) {
    throw new ApiError(`验证码获取失败（HTTP ${response.status}）`, response.status, response.status)
  }
  return URL.createObjectURL(await response.blob())
}
