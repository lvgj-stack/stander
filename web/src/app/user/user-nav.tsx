import { GaugeIcon, RouteIcon, ServerIcon, UserIcon } from 'lucide-react'

import type { ConsoleSide } from '@/components/layout/console-shell'

/**
 * The user side.
 *
 * Four fixed screens, all of them about the signed-in user's own account. They
 * live under `/portal`, not `/user`: that prefix is the account API's. The
 * backend already scopes every one of these reads to the caller — rules to
 * their own `user_id`, nodes to their `user_role_node_mappings` rows, plan
 * info to their own id — so this side is the same API with a narrower view,
 * not a second, weaker copy of the admin screens.
 */
export const USER_SIDE: ConsoleSide = {
  name: '用户端',
  icon: UserIcon,
  home: '/portal',
  nav: [
    {
      title: '概览',
      entries: [{ title: '流量与套餐', to: '/portal', icon: GaugeIcon, end: true }],
    },
    {
      title: '转发',
      entries: [
        { title: '我的转发规则', to: '/portal/rules', icon: RouteIcon },
        { title: '可用节点', to: '/portal/nodes', icon: ServerIcon },
      ],
    },
    {
      title: '账号',
      entries: [{ title: '个人资料', to: '/portal/profile', icon: UserIcon }],
    },
  ],
}
