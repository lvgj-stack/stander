import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MenuIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { ThemeToggle } from '@/components/layout/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/** One entry in a side's navigation. */
export interface NavEntry {
  title: string
  /** Absolute path, so the two sides never collide on a relative one. */
  to: string
  icon: LucideIcon
  /** Matches only the exact path. Used for a side's index route. */
  end?: boolean
}

export interface NavGroup {
  title: string
  entries: NavEntry[]
}

export interface ConsoleSide {
  /** Shown next to the mark in the rail, e.g. "管理端". */
  name: string
  icon: LucideIcon
  /** Where this side's index lives, e.g. "/admin". */
  home: string
  nav: NavGroup[]
}

/**
 * The frame both sides of the console share.
 *
 * The navigation is a plain constant handed in by whichever side mounted this
 * — `app/admin/admin-nav.ts` or `app/user/user-nav.ts`. It used to be built at
 * runtime from a tree of permission rows the backend returned, each carrying a
 * path and a Vue component file, which meant the menu a user saw depended on
 * rows in a table rather than on the routes that actually exist. Now the route
 * table and the menu are the same two constants, and which side you are on is
 * decided once, at sign-in, by your role.
 */
export function ConsoleShell({ side }: { side: ConsoleSide }) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-56 shrink-0 border-r lg:block">
        <div className="sticky top-0 h-svh">
          <Rail side={side} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 lg:hidden" aria-label="打开菜单">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-56 p-0">
              <SheetTitle className="sr-only">导航菜单</SheetTitle>
              <Rail side={side} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <span className="text-sm font-medium">{currentTitle(side, location.pathname)}</span>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu home={side.home} />
          </div>
        </header>

        <main className="flex-1 space-y-5 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** The title bar's label: the entry whose path the current URL is under. */
function currentTitle(side: ConsoleSide, pathname: string): string {
  let best: NavEntry | undefined
  for (const group of side.nav) {
    for (const entry of group.entries) {
      const hit = entry.end ? pathname === entry.to : pathname.startsWith(entry.to)
      // Longest match wins, so "/admin/chain-groups" does not report itself as
      // "/admin/chains" when one path is a prefix of another.
      if (hit && (!best || entry.to.length > best.to.length)) best = entry
    }
  }
  return best?.title ?? side.name
}

function Rail({ side, onNavigate }: { side: ConsoleSide; onNavigate?: () => void }) {
  const SideIcon = side.icon

  return (
    <div className="flex h-full flex-col gap-4 bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <SideIcon className="size-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold tracking-tight">Stander</p>
          <p className="truncate text-xs text-muted-foreground">{side.name}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {side.nav.map((group) => (
          <div key={group.title} className="space-y-1">
            <p className="px-2 text-xs font-medium text-muted-foreground">{group.title}</p>
            {group.entries.map((entry) => (
              <NavLink
                key={entry.to}
                to={entry.to}
                end={entry.end}
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
      </nav>
    </div>
  )
}
