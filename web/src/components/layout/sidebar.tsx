import { NavLink } from 'react-router-dom'
import { NetworkIcon } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import { NAV } from '@/routes/nav'

/**
 * The left rail.
 *
 * Entries are hidden when the signed-in user lacks their permission code. A
 * group whose entries are all hidden disappears with them, so a restricted
 * user never sees an empty section header.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { codes } = useAuth()

  const groups = NAV.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => !entry.code || codes.has(entry.code)),
  })).filter((group) => group.entries.length > 0)

  return (
    <div className="flex h-full flex-col gap-4 bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <NetworkIcon className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Stander</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">{group.title}</p>
            {group.entries.map((entry) => (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                  )
                }
              >
                <entry.icon className="size-4 shrink-0" />
                {entry.title}
              </NavLink>
            ))}
          </div>
        ))}
        {groups.length === 0 && (
          <p className="px-2 text-sm text-muted-foreground">当前角色没有任何菜单权限</p>
        )}
      </nav>
    </div>
  )
}
