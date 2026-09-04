import {
  GaugeIcon,
  KeyRoundIcon,
  LayersIcon,
  ListTreeIcon,
  RouteIcon,
  ServerIcon,
  ShieldCheckIcon,
  TicketIcon,
  UserCogIcon,
  UsersIcon,
  WaypointsIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The navigation tree.
 *
 * Routes are static (see the frontend design doc); the permission tree from
 * the backend contributes only `code`, which decides whether an entry is
 * shown. Codes match the rows seeded in `sql/init.sql` plus the ones added by
 * `sql/web_menu.sql` for the pages that had no permission row before.
 *
 * An entry with no `code` is always visible.
 */
export interface NavEntry {
  title: string
  to: string
  icon: LucideIcon
  code?: string
}

export interface NavGroup {
  title: string
  entries: NavEntry[]
}

export const NAV: NavGroup[] = [
  {
    title: '概览',
    entries: [{ title: '仪表盘', to: '/', icon: GaugeIcon }],
  },
  {
    title: '转发',
    entries: [
      { title: '节点', to: '/nodes', icon: ServerIcon, code: 'Server' },
      { title: '链路', to: '/chains', icon: WaypointsIcon, code: 'Chain' },
      { title: '链路组', to: '/chain-groups', icon: LayersIcon, code: 'ChainGroup' },
      { title: '转发规则', to: '/rules', icon: RouteIcon, code: 'Rule' },
    ],
  },
  {
    title: '用量',
    entries: [
      { title: '流量套餐', to: '/plans', icon: TicketIcon, code: 'TrafficPlan' },
      { title: '转发用户', to: '/forward-users', icon: UsersIcon, code: 'ForwardUser' },
    ],
  },
  {
    title: '系统',
    entries: [
      { title: '用户管理', to: '/pms/user', icon: UserCogIcon, code: 'UserMgt' },
      { title: '角色管理', to: '/pms/role', icon: ShieldCheckIcon, code: 'RoleMgt' },
      { title: '权限管理', to: '/pms/permission', icon: ListTreeIcon, code: 'Resource_Mgt' },
      { title: '个人资料', to: '/profile', icon: KeyRoundIcon },
    ],
  },
]
