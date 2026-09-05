import { useNavigate } from 'react-router-dom'
import { CheckIcon, LogOutIcon, UserIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/use-auth'
import { errorDetail, errorTitle } from '@/lib/errors'

/**
 * `home` is the side this menu is rendered on, so 个人资料 goes to that side's
 * copy of the screen rather than to a fixed path that only exists on one.
 */
export function UserMenu({ home }: { home: string }) {
  const { user, logout, switchRole } = useAuth()
  const navigate = useNavigate()

  const roles = user?.roles ?? []
  const initial = user?.username?.slice(0, 1).toUpperCase() ?? '?'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-2">
          <Avatar className="size-6">
            <AvatarImage src={user?.profile?.avatar ?? undefined} alt="" />
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{user?.username ?? '未登录'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{user?.username}</p>
          <p className="text-xs text-muted-foreground">
            当前角色：{user?.currentRole?.name ?? '—'}
          </p>
        </DropdownMenuLabel>

        {roles.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              切换角色
            </DropdownMenuLabel>
            {roles.map((role) => (
              <DropdownMenuItem
                key={role.id}
                onSelect={async () => {
                  try {
                    await switchRole(role.code)
                    toast.success(`已切换到「${role.name}」`)
                  } catch (error) {
                    toast.error(errorTitle(error), {
                      description: errorDetail(error) ?? undefined,
                    })
                  }
                }}
              >
                {role.code === user?.currentRole?.code ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <span className="size-4" />
                )}
                {role.name}
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(`${home}/profile`)}>
          <UserIcon className="size-4" />
          个人资料
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOutIcon className="size-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
