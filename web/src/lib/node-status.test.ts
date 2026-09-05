import { describe, expect, it } from 'vitest'

import { EMPTY } from './format'
import { isRegistered, nodeStatusLabel, NODE_REGISTERED, NODE_UNREGISTERED } from './node-status'

// The two strings are a contract with the Go service layer, which writes them
// from constants of its own. Asserting the literals — not the constants — is
// what makes a rename on either side fail here instead of silently rendering
// every node as an em dash.
describe('the wire values', () => {
  it('are the strings the backend writes', () => {
    expect(NODE_UNREGISTERED).toBe('unregistered')
    expect(NODE_REGISTERED).toBe('registered')
  })

  it('label the rows the backend actually sends', () => {
    expect(nodeStatusLabel('unregistered')).toBe('未注册')
    expect(nodeStatusLabel('registered')).toBe('已注册')
  })
})

describe('nodeStatusLabel', () => {
  it('labels the two values the backend writes', () => {
    expect(nodeStatusLabel(NODE_UNREGISTERED)).toBe('未注册')
    expect(nodeStatusLabel(NODE_REGISTERED)).toBe('已注册')
  })

  // The column's old database default. A deployment that has not run the
  // migration still holds these rows, and "8123" must not reach the screen.
  it('does not render the port that used to sit in this column', () => {
    expect(nodeStatusLabel('8123')).toBe(EMPTY)
  })

  it('renders an absent or unknown status as an em dash', () => {
    expect(nodeStatusLabel(null)).toBe(EMPTY)
    expect(nodeStatusLabel(undefined)).toBe(EMPTY)
    expect(nodeStatusLabel('')).toBe(EMPTY)
    expect(nodeStatusLabel('online')).toBe(EMPTY)
  })

  // 已注册 says the agent called home once. It is not a claim about now, which
  // is why the label is not 在线 — nothing writes this column after
  // registration, so a dead agent still reads registered.
  it('does not claim the node is reachable', () => {
    expect(nodeStatusLabel(NODE_REGISTERED)).not.toContain('在线')
  })
})

describe('isRegistered', () => {
  it('is true only for a node whose agent has registered', () => {
    expect(isRegistered(NODE_REGISTERED)).toBe(true)
    expect(isRegistered(NODE_UNREGISTERED)).toBe(false)
    expect(isRegistered('8123')).toBe(false)
    expect(isRegistered(null)).toBe(false)
  })
})
