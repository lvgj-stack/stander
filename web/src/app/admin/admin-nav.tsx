import {
  GaugeIcon,
  KeyRoundIcon,
  LayersIcon,
  RouteIcon,
  ServerIcon,
  ShieldCheckIcon,
  TicketIcon,
  UserCogIcon,
  UsersIcon,
  WaypointsIcon,
} from 'lucide-react'

import type { ConsoleSide } from '@/components/layout/console-shell'

/**
 * The admin side.
 *
 * Every entry here is reachable by every admin: SUPER_ADMIN is the role that
 * puts an account on this side in the first place, and it is also the role the
 * Go service layer treats as unrestricted, so there is nothing left to hide
 * per entry. Entries used to be filtered against a set of permission codes
 * fetched at sign-in, which meant a page could be routable but invisible — or
 * visible and then rejected by the backend — depending on rows in a table.
 */
export const ADMIN_SIDE: ConsoleSide = {
  name: '管理端',
  icon: ShieldCheckIcon,
  home: '/admin',
  nav: [
    {
      title: '概览',
      entries: [{ title: '仪表盘', to: '/admin', icon: GaugeIcon, end: true }],
    },
    {
      title: '转发',
      entries: [
        { title: '节点', to: '/admin/nodes', icon: ServerIcon },
        { title: '链路', to: '/admin/chains', icon: WaypointsIcon },
        { title: '链路组', to: '/admin/chain-groups', icon: LayersIcon },
        { title: '转发规则', to: '/admin/rules', icon: RouteIcon },
      ],
    },
    {
      title: '用量',
      entries: [
        { title: '流量套餐', to: '/admin/plans', icon: TicketIcon },
        { title: '转发用户', to: '/admin/forward-users', icon: UsersIcon },
      ],
    },
    {
      title: '账号',
      entries: [
        { title: '账号管理', to: '/admin/accounts', icon: UserCogIcon },
        { title: '个人资料', to: '/admin/profile', icon: KeyRoundIcon },
      ],
    },
  ],
}
