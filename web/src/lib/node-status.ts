/**
 * What a node's status column says.
 *
 * These two strings are a wire contract with the Go service layer, which
 * writes them in `nodeStatusUnregistered` / `nodeStatusRegistered`; the tests
 * on both sides assert the literals so a rename cannot quietly desync them.
 *
 * They answer one question — has this node's agent ever called home? — and
 * deliberately not "is it up right now": nothing writes the column after
 * registration, so a node whose agent has since died still reads registered.
 * That is why the label is 已注册 and not 在线. Telling reachability apart from
 * this needs a heartbeat or a last-seen time, and the deployment has neither.
 *
 * The labels live here rather than coming down the wire, like the role labels
 * next door: two known values, and the Chinese is UI copy.
 */

import { EMPTY } from './format'

export const NODE_UNREGISTERED = 'unregistered'
export const NODE_REGISTERED = 'registered'

type NodeStatus = typeof NODE_UNREGISTERED | typeof NODE_REGISTERED

const LABELS: Record<NodeStatus, string> = {
  [NODE_UNREGISTERED]: '未注册',
  [NODE_REGISTERED]: '已注册',
}

/**
 * How to label a status, including the ones a database can still hold.
 *
 * Anything unrecognised renders as an em dash rather than raw. The column used
 * to default to the string '8123' with nothing ever writing it, so a row can
 * still hold a value that means nothing, and an em dash says what is actually
 * known about such a row: nothing. Printing it raw is how a port number ended
 * up on screen as a node's status in the first place.
 */
export function nodeStatusLabel(status: string | null | undefined): string {
  return LABELS[status as NodeStatus] ?? EMPTY
}

/** Whether the node's agent has registered, which is the only good state. */
export function isRegistered(status: string | null | undefined): boolean {
  return status === NODE_REGISTERED
}
