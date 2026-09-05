import { describe, expect, it } from 'vitest'

import { ApiError } from '@/api/client'
import { errorDetail, errorRequestId, errorTitle } from './errors'

/**
 * The rule these encode: a log id is shown when it is the only thing the
 * reader can act on, and withheld when it is noise.
 *
 * Someone who typed a duplicate username fixes it by typing something else;
 * putting a uuid under that message trains people to ignore uuids. Someone
 * who hit an internal error can do nothing except quote the id, so it has to
 * be there.
 */
describe('errorTitle', () => {
  it('uses the backend message, which is already written for end users', () => {
    const error = new ApiError('用户名「lvlv」已存在', 409, 200, 'conflict', 'req-1')
    expect(errorTitle(error)).toBe('用户名「lvlv」已存在')
  })

  it('falls back to the classification when the message is empty', () => {
    expect(errorTitle(new ApiError('', 403, 200, 'permission_denied', null))).toBe(
      '没有权限执行该操作',
    )
    expect(errorTitle(new ApiError('', 503, 200, 'unavailable', null))).toBe('依赖的服务暂时不可用')
  })

  it('handles a plain Error and a non-error alike', () => {
    expect(errorTitle(new Error('boom'))).toBe('boom')
    expect(errorTitle('not an error')).toBe('操作失败')
    expect(errorTitle(undefined)).toBe('操作失败')
  })
})

describe('errorDetail', () => {
  it('shows the log id for a failure the user cannot act on', () => {
    const error = new ApiError('服务器内部错误', 500, 200, 'internal', 'abc-123')
    expect(errorDetail(error)).toBe('日志 ID：abc-123')
  })

  it('shows it for an unavailable dependency too', () => {
    const error = new ApiError('依赖的服务暂时不可用', 503, 200, 'unavailable', 'abc-123')
    expect(errorDetail(error)).toBe('日志 ID：abc-123')
  })

  it('withholds it when the user is the one who has to fix the input', () => {
    for (const kind of ['invalid_argument', 'conflict', 'not_found', 'permission_denied'] as const) {
      const error = new ApiError('…', 400, 200, kind, 'abc-123')
      expect(errorDetail(error)).toBeNull()
    }
  })

  it('returns null when there is no id to show', () => {
    expect(errorDetail(new ApiError('服务器内部错误', 500, 200, 'internal', null))).toBeNull()
    expect(errorDetail(new Error('boom'))).toBeNull()
  })
})

describe('errorRequestId', () => {
  // Panels show the id whenever there is one; the reader has stopped to look.
  it('returns the id regardless of classification', () => {
    expect(errorRequestId(new ApiError('…', 409, 200, 'conflict', 'abc-123'))).toBe('abc-123')
    expect(errorRequestId(new ApiError('…', 500, 200, 'internal', 'abc-123'))).toBe('abc-123')
  })

  it('returns null for anything that is not an ApiError', () => {
    expect(errorRequestId(new Error('boom'))).toBeNull()
    expect(errorRequestId('nope')).toBeNull()
  })
})

describe('ApiError.isServerFault', () => {
  it('is true only for our own failures', () => {
    expect(new ApiError('…', 500, 200, 'internal', null).isServerFault).toBe(true)
    expect(new ApiError('…', 503, 200, 'unavailable', null).isServerFault).toBe(true)
    expect(new ApiError('…', 409, 200, 'conflict', null).isServerFault).toBe(false)
    expect(new ApiError('…', 403, 200, 'permission_denied', null).isServerFault).toBe(false)
  })
})
