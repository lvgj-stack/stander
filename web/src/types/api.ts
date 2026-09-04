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
  UsedTraffic: number
}

export interface DailyTraffic {
  Date: string
  Traffic: number
}

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

// ---------------------------------------------------------------------- RBAC

export interface Role {
  id: number
  code: string
  name: string
  enable: boolean
}

export interface RoleWithPermissions extends Role {
  permissionIds: number[] | null
}

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
  roles: Role[] | null
  currentRole: Role | null
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
  roles: Role[] | null
}

export type PermissionType = 'MENU' | 'BUTTON'

/**
 * A permission row. `component` holds a Vue file path left over from the
 * previous frontend; this app routes statically and ignores it, using only
 * `code` to decide what a role may see.
 */
export interface Permission {
  id: number
  name: string
  code: string
  type: PermissionType
  parentId: number | null
  path: string | null
  redirect: string | null
  icon: string | null
  component: string | null
  layout: string | null
  keepAlive: number | null
  method: string | null
  description: string | null
  show: number
  enable: number
  order: number
  children?: Permission[] | null
}
