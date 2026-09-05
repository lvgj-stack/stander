import { ApiError } from '@/api/client'

/**
 * One place that decides how a failure is shown.
 *
 * Every screen used to print `error.message` and nothing else, which was all
 * there was: the backend answered every failure with the same code and the
 * same useless `"error": "error some"`. Now a failure carries a
 * classification and a request id, and the point of putting the presentation
 * here is that the two never drift apart between a toast, a table's empty
 * state and the session error screen.
 */

/** The headline: what went wrong, in the words the backend chose. */
export function errorTitle(error: unknown): string {
  if (error instanceof ApiError) return error.message || fallbackFor(error)
  if (error instanceof Error && error.message) return error.message
  return '操作失败'
}

/**
 * The second line, or null when there is nothing worth adding.
 *
 * The request id is shown only for failures the user cannot act on. Attaching
 * it to "用户名已存在" would be noise — they fix that by typing something else
 * — but for an internal error it is the only actionable thing on screen: it is
 * what an operator greps the server log for.
 */
export function errorDetail(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  if (!error.requestId) return null
  if (!error.isServerFault) return null
  return `日志 ID：${error.requestId}`
}

/** The request id, whenever there is one — for places that always show it. */
export function errorRequestId(error: unknown): string | null {
  return error instanceof ApiError ? error.requestId : null
}

/**
 * A message for a failure that arrived without one.
 *
 * Only reachable when the backend sends an empty message, which it should not;
 * the classification is still enough to say something true.
 */
function fallbackFor(error: ApiError): string {
  switch (error.kind) {
    case 'invalid_argument':
      return '请求参数有误'
    case 'unauthenticated':
      return '登录状态已失效'
    case 'permission_denied':
      return '没有权限执行该操作'
    case 'not_found':
      return '记录不存在'
    case 'conflict':
      return '与已有数据冲突'
    case 'failed_precondition':
      return '当前状态下无法执行该操作'
    case 'unavailable':
      return '依赖的服务暂时不可用'
    default:
      return '服务器内部错误'
  }
}
