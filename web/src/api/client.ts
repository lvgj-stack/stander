import type { ApiEnvelope, ErrorKind } from '@/types/api'

/**
 * The HTTP layer.
 *
 * Two things about this backend shape everything here:
 *
 * 1. A business failure still returns HTTP 200 with a non-zero `code`
 *    (`internal/admin/handler/base.go`). Success can only be read off `code`,
 *    never off the status line. The code is a classification, not a magic
 *    number — see ApiEnvelope — and the envelope also carries a `requestId`
 *    that identifies the request in the server logs.
 * 2. The captcha id lives in a server-side session cookie, so the captcha and
 *    login requests must send credentials. Sending them everywhere keeps that
 *    from being a special case someone forgets.
 */

/** Where the API lives. Empty means same-origin (dev proxy / nginx reverse proxy). */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

const TOKEN_KEY = 'stander.token'

/**
 * A failed request, whether it failed at the HTTP layer or in the envelope.
 *
 * `kind` is the backend's classification and is what code should branch on;
 * `requestId` identifies the request in the server logs and is what a user
 * should be able to quote. Both are carried even when the failure happened
 * before there was an envelope to read them from — a 502 from a proxy, a
 * truncated body — because those are exactly the failures that need looking
 * up, so the id is taken from the response header in that case.
 */
export class ApiError extends Error {
  readonly code: number
  readonly status: number
  readonly kind: ErrorKind
  readonly requestId: string | null

  constructor(
    message: string,
    code: number,
    status: number,
    kind: ErrorKind = 'internal',
    requestId: string | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.kind = kind
    this.requestId = requestId
  }

  /** True when retrying might work: our fault, not the caller's. */
  get isServerFault(): boolean {
    return this.kind === 'internal' || this.kind === 'unavailable'
  }
}

/** The header the request id is echoed in. Mirrors observability.RequestIDHeader. */
const REQUEST_ID_HEADER = 'X-Request-Id'

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

  // Available even when the body is not an envelope, which is when it matters.
  const requestId = response.headers.get(REQUEST_ID_HEADER)

  if (response.status === 401 || response.status === 403) {
    clearToken()
    onUnauthorized()
    throw new ApiError(
      '登录状态已失效，请重新登录',
      response.status,
      response.status,
      'unauthenticated',
      requestId,
    )
  }

  if (!response.ok) {
    throw new ApiError(
      `请求失败（HTTP ${response.status}）`,
      response.status,
      response.status,
      'internal',
      requestId,
    )
  }

  let envelope: ApiEnvelope<T>
  try {
    envelope = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError('响应不是合法的 JSON', -1, response.status, 'internal', requestId)
  }

  if (envelope.code !== 0) {
    // The JWT middleware reports an expired token through the envelope too,
    // so the logged-out path has to be reachable from here as well.
    if (isAuthFailure(envelope.code)) {
      clearToken()
      onUnauthorized()
    }
    throw new ApiError(
      envelope.message || '请求失败',
      envelope.code,
      response.status,
      envelope.error ?? 'internal',
      envelope.requestId ?? requestId,
    )
  }

  // A handler that answers with `Resp.Succ(ctx, nil)` omits `data` entirely.
  return envelope.data as T
}

/**
 * Envelope codes that mean the session is gone and the user must sign in
 * again.
 *
 * Only 401. A 403 is "you may not do this", which is a message to read, not a
 * reason to throw away a perfectly good session — the two sides of the console
 * are separated by exactly that distinction, so confusing them would log a
 * forwarding user out for opening an admin URL. 10002 was a code the previous
 * backend used; nothing emits it now.
 */
function isAuthFailure(code: number): boolean {
  return code === 401
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
    throw new ApiError(
      `验证码获取失败（HTTP ${response.status}）`,
      response.status,
      response.status,
      'internal',
      response.headers.get(REQUEST_ID_HEADER),
    )
  }
  return URL.createObjectURL(await response.blob())
}
