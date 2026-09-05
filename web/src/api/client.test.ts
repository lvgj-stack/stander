import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  action,
  api,
  ApiError,
  clearToken,
  fetchCaptcha,
  getToken,
  setToken,
  setUnauthorizedHandler,
} from './client'

/** Builds a Response carrying the backend's JSON envelope. */
function envelope(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Stubs fetch with a factory rather than a fixed Response: a Response body can
 * only be read once, so a test that calls twice would otherwise see an empty
 * stream on the second call.
 */
function mockFetch(make: () => Response) {
  const spy = vi.fn(() => Promise.resolve(make()))
  vi.stubGlobal('fetch', spy)
  return spy
}

/** The options object the client passed to fetch on its first call. */
function callInit(spy: ReturnType<typeof mockFetch>): RequestInit {
  return (spy.mock.calls[0] as unknown as [string, RequestInit])[1]
}

function callUrl(spy: ReturnType<typeof mockFetch>): string {
  return (spy.mock.calls[0] as unknown as [string, RequestInit])[0]
}

beforeEach(() => {
  clearToken()
  setUnauthorizedHandler(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('envelope handling', () => {
  it('unwraps data when code is 0', async () => {
    mockFetch(() => envelope({ code: 0, message: 'OK', data: { id: 7 }, originUrl: '/user/detail' }))
    await expect(api.get('/user/detail')).resolves.toEqual({ id: 7 })
  })

  it('treats a non-zero code as a failure even though HTTP said 200', async () => {
    // This is the whole reason the client cannot read success off the status
    // line: internal/admin/handler/base.go answers business errors with 200.
    mockFetch(() => envelope({ code: 20001, message: '验证码不正确', originUrl: '/auth/login' }))

    await expect(api.post('/auth/login')).rejects.toThrowError(ApiError)
    await expect(api.post('/auth/login')).rejects.toThrow('验证码不正确')
  })

  it('carries the backend code and HTTP status on the error', async () => {
    mockFetch(() => envelope({ code: 20001, message: '节点不存在', originUrl: '/stander/node' }))
    const error = await api.post('/stander/node').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(20001)
    expect((error as ApiError).status).toBe(200)
  })

  it('resolves to undefined when a handler answers Resp.Succ(ctx, nil)', async () => {
    mockFetch(() => envelope({ code: 0, message: 'OK', originUrl: '/user/1' }))
    await expect(api.patch('/user/1', {})).resolves.toBeUndefined()
  })

  it('reports an unparseable body rather than crashing', async () => {
    mockFetch(() => new Response('<html>502</html>', { status: 200 }))
    await expect(api.get('/user')).rejects.toThrow('响应不是合法的 JSON')
  })

  it('reports a transport-level failure with its status', async () => {
    mockFetch(() => new Response('boom', { status: 500 }))
    const error = await api.get('/user').catch((caught: unknown) => caught)
    expect((error as ApiError).status).toBe(500)
    expect((error as ApiError).message).toContain('500')
  })
})

describe('credentials and headers', () => {
  it('attaches the bearer token when one is stored', async () => {
    setToken('jwt-abc')
    const spy = mockFetch(() => envelope({ code: 0, message: 'OK', data: null, originUrl: '/user' }))

    await api.get('/user')

    expect((callInit(spy).headers as Record<string, string>).Authorization).toBe('Bearer jwt-abc')
  })

  it('omits the header entirely when signed out', async () => {
    const spy = mockFetch(() => envelope({ code: 0, message: 'OK', data: null, originUrl: '/user' }))

    await api.get('/user')

    expect(callInit(spy).headers).not.toHaveProperty('Authorization')
  })

  it('always sends credentials, because the captcha lives in a session cookie', async () => {
    const spy = mockFetch(() => envelope({ code: 0, message: 'OK', data: null, originUrl: '/user' }))

    await api.get('/user')

    expect(callInit(spy).credentials).toBe('include')
  })
})

// The request id is what a user quotes and what an operator greps for, so it
// has to reach the ApiError from wherever it is available — including the
// failures that never produce an envelope, which are exactly the ones worth
// looking up.
describe('request id and classification', () => {
  it('carries the id and the kind off the envelope', async () => {
    mockFetch(() =>
      envelope({
        code: 409,
        error: 'conflict',
        message: '用户名已存在',
        requestId: 'env-id',
        originUrl: '/user',
      }),
    )

    const error = await api.post('/user').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('conflict')
    expect((error as ApiError).requestId).toBe('env-id')
    expect((error as ApiError).isServerFault).toBe(false)
  })

  it('falls back to the response header when there is no envelope', async () => {
    // A proxy 502, a truncated body: no envelope to read, but the header
    // survives — and this is precisely when someone needs the id.
    mockFetch(
      () =>
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'X-Request-Id': 'header-id' },
        }),
    )

    const error = await api.get('/user/detail').catch((e: unknown) => e)
    expect((error as ApiError).requestId).toBe('header-id')
    expect((error as ApiError).isServerFault).toBe(true)
  })

  it('falls back to the header when the body is not JSON', async () => {
    mockFetch(
      () =>
        new Response('not json at all', {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'header-id' },
        }),
    )

    const error = await api.get('/user/detail').catch((e: unknown) => e)
    expect((error as ApiError).requestId).toBe('header-id')
  })

  it('defaults to internal when the backend sends no classification', async () => {
    mockFetch(() => envelope({ code: 500, message: '服务器内部错误', originUrl: '/user' }))

    const error = await api.get('/user').catch((e: unknown) => e)
    expect((error as ApiError).kind).toBe('internal')
  })
})

describe('signed-out handling', () => {
  it('clears the token and notifies on HTTP 401', async () => {
    setToken('jwt-abc')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    mockFetch(() => new Response('', { status: 401 }))

    await expect(api.get('/user/detail')).rejects.toThrow(ApiError)

    expect(getToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('also reacts to the expired-token code inside a 200 envelope', async () => {
    // The JWT middleware reports an expired login through the envelope, so
    // watching only the status line would leave the app stuck signed in.
    setToken('jwt-abc')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    mockFetch(() =>
      envelope({
        code: 401,
        error: 'unauthenticated',
        message: '授权已过期',
        originUrl: '/user/detail',
      }),
    )

    await expect(api.get('/user/detail')).rejects.toThrow('授权已过期')

    expect(getToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  // 403 is "you may not do this", not "sign in again". Signing the user out
  // here would eject a forwarding user for opening an admin URL — the two
  // sides of the console are separated by exactly this distinction.
  it('keeps the session on a permission_denied envelope', async () => {
    setToken('jwt-abc')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    mockFetch(() =>
      envelope({
        code: 403,
        error: 'permission_denied',
        message: '需要管理员权限',
        originUrl: '/user',
      }),
    )

    await expect(api.get('/user')).rejects.toThrow('需要管理员权限')

    expect(getToken()).toBe('jwt-abc')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('leaves the session alone for an ordinary business error', async () => {
    setToken('jwt-abc')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    mockFetch(() => envelope({ code: 20001, message: '端口已被占用', originUrl: '/stander/rule' }))

    await expect(api.post('/stander/rule')).rejects.toThrow('端口已被占用')

    expect(getToken()).toBe('jwt-abc')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('query building', () => {
  it('appends the parameters it was given', async () => {
    const spy = mockFetch(() => envelope({ code: 0, message: 'OK', data: null, originUrl: '/user' }))

    await api.get('/user', { pageNo: 2, pageSize: 10 })

    expect(callUrl(spy)).toBe('/user?pageNo=2&pageSize=10')
  })

  it('drops absent filters instead of sending the string "undefined"', async () => {
    const spy = mockFetch(() => envelope({ code: 0, message: 'OK', data: null, originUrl: '/user' }))

    await api.get('/user', { pageNo: 1, username: undefined, enable: null, gender: '' })

    expect(callUrl(spy)).toBe('/user?pageNo=1')
  })
})

describe('action dispatch', () => {
  it('posts to the resource with the Action in the query string', async () => {
    const spy = mockFetch(() =>
      envelope({
        code: 0,
        message: 'OK',
        data: { pageData: [], total: 0 },
        originUrl: '/stander/node',
      }),
    )

    await action('node', 'ListNodes', { PageNo: 1, PageSize: 10 })

    expect(callUrl(spy)).toBe('/stander/node?Action=ListNodes')
    const init = callInit(spy)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ PageNo: 1, PageSize: 10 })
  })

  it('sends an empty body rather than none when no payload is given', async () => {
    const spy = mockFetch(() => envelope({ code: 0, message: 'OK', data: [], originUrl: '/stander/node' }))

    await action('node', 'GetNodePermissions')

    expect(JSON.parse(callInit(spy).body as string)).toEqual({})
  })

  it('propagates a failed action as an ApiError', async () => {
    mockFetch(() => envelope({ code: 20001, message: 'unknown action: Nope', originUrl: '/stander/node' }))
    await expect(action('node', 'Nope')).rejects.toThrow('unknown action: Nope')
  })
})

describe('fetchCaptcha', () => {
  it('sends credentials so the session cookie that holds the answer is set', async () => {
    const spy = mockFetch(() => new Response(new Blob(['<svg/>']), { status: 200 }))
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:captcha' })

    await expect(fetchCaptcha()).resolves.toBe('blob:captcha')

    expect(callUrl(spy)).toBe('/auth/captcha')
    expect(callInit(spy).credentials).toBe('include')
  })

  it('does not try to parse an error response as an image', async () => {
    mockFetch(() => new Response('', { status: 500 }))
    await expect(fetchCaptcha()).rejects.toThrow('验证码获取失败')
  })
})
