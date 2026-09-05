/**
 * TypeScript mirrors of the backend's wire types.
 *
 * Two naming conventions coexist and are modelled separately on purpose:
 *
 * - Response entities are gorm-gen structs, serialised camelCase, with almost
 *   every field nullable because the Go struct fields are pointers.
 * - Action-style request bodies (`/stander/*`) are PascalCase, because the
 *   service layer's request structs use Go field names verbatim.
 *
 * Request parameter types live next to the API functions that send them; this
 * file holds only what comes back.
 */

// The two role codes are UI constants, not a wire shape — see lib/roles.
import type { RoleCode } from '@/lib/roles'

export type { RoleCode }

/** The envelope every JSON endpoint wraps its payload in. */
export interface ApiEnvelope<T> {
  code: number
  message: string
  data?: T
  error?: string
  originUrl: string
}

/** A page of rows, as the admin list endpoints return them. */
export interface Page<T> {
  pageData: T[]
  total: number
}

// ---------------------------------------------------------------- forwarding

export interface Node {
  id: number
  createdAt: string | null
  updatedAt: string | null
  nodeName: string | null
  ip: string | null
  managerIp: string
  port: number | null
  key: string | null
  status: string | null
  nodeType: string | null
  ipv4: string | null
  ipv6: string | null
  rate: number
  /** 0 = TLS, 1 = TCP. */
  protocol: number
  iepl: number
}

/**
 * What the console needs, besides the node key, to render the command that
 * installs an agent. `controllerAddr` is the backend's best guess when the
 * deployment has not configured `Server.ControllerAddr`, so the dialog lets an
 * operator correct it.
 */
export interface AgentInstallInfo {
  controllerAddr: string
  scriptUrl: string
}

export interface Chain {
  id: number
  createdAt: string | null
  updatedAt: string | null
  chainName: string | null
  ip: string | null
  port: number | null
  protocol: string | null
  key: string | null
  nodeId: number
  node?: Node
}

export interface Rule {
  id: number
  createdAt: string | null
  updatedAt: string | null
  ruleName: string | null
  nodeId: number | null
  chainId: number | null
  listenPort: number | null
  remoteAddr: string | null
  protocol: string | null
  /** Consumed traffic, in bytes. */
  traffic: number
  userId: number | null
  node?: Node
  chain?: Chain
}

/** A chain's membership in a group, as `ListChainGroups` returns it. */
export interface ChainGroupMember {
  ID: number
  Backup: boolean
  MaxFails: number
  Timeout: number
  Weight: number
  ChainName: string
}

export interface ChainGroup {
  ChainGroupID: string
  ChainGroupName: string
  Chains: ChainGroupMember[] | null
}

export interface TrafficPlan {
  id: number
  createdAt: string | null
  updatedAt: string | null
  /** Quota per period, in bytes. */
  totalTraffic: number
  period: number | null
  planName: string | null
}

/** A forwarding user: the `user` row plus its computed traffic usage. */
export interface ForwardUser {
  id: number | null
  username: string | null
  enable: number | null
  createTime: string | null
  updateTime: string | null
  planId: number
  expirationTime: string | null
  resetTrafficTime: string | null
  traffic_plan?: TrafficPlan
  /** Consumed this period, in bytes — the same unit as `traffic_plan.totalTraffic`. */
  UsedTraffic: number
}

export interface DailyTraffic {
  Date: string
  /** Bytes consumed that day. */
  Traffic: number
}

/**
 * One user's plan and consumption.
 *
 * Every traffic figure is a byte count. They used to arrive pre-divided into
 * whole gigabytes while every neighbouring field stayed in bytes, so anything
 * under 1 GB read as zero and `formatBytes` turned 5 GB into "5 B".
 */
export interface UserPlanInfo {
  Username: string
  ExpirationTime: string
  ResetTrafficTime: string
  PlanTraffic: number
  UsedTraffic: number
  PlanName: string
  DailyTraffics: DailyTraffic[] | null
}

export interface RuleTestResult {
  inboundName?: string
  inboundTo?: string
  inboundPing?: number
  outboundName?: string
  outboundTo?: string
  outboundPing?: number
  ping?: number
}

// ------------------------------------------------------------- accounts

export interface Profile {
  id: number
  gender: number
  avatar: string
  address: string
  email: string
  // camelCase to match the backend's json tags (internal/admin/model/profile.go).
  userId: number
  nickName: string
}

export interface CurrentUser {
  id: number
  username: string
  password: string
  enable: boolean
  createTime: string
  updateTime: string
  profile: Profile | null
  /**
   * The role the *token* carries, which is the one the backend authorizes on.
   * Not the one stored against the account: an account demoted while signed in
   * keeps an admin token until it expires, and the console has to follow what
   * the API will actually allow.
   */
  role: RoleCode
}

export interface AdminUser {
  id: number
  username: string
  enable: boolean
  createTime: string
  updateTime: string
  gender: number
  avatar: string
  address: string
  email: string
  role: RoleCode
}
