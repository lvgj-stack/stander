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
    mockFetch(() => envelope({ code: 10002, message: '授权已过期', originUrl: '/user/detail' }))

    await expect(api.get('/user/detail')).rejects.toThrow('授权已过期')

    expect(getToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledOnce()
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
