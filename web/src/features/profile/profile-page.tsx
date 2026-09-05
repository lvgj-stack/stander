import { useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { changePassword } from '@/api/auth'
import { updateProfile } from '@/api/user'
import { PageHeader } from '@/components/page-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { useAuth } from '@/hooks/use-auth'
import { formatTime } from '@/lib/format'
import type { CurrentUser } from '@/types/api'

export function ProfilePage() {
  const { user, isAdmin } = useAuth()

  return (
    <>
      <PageHeader title="个人资料" description="你的账号信息与密码。" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">账号</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarImage src={user?.profile?.avatar ?? undefined} alt="" />
                <AvatarFallback>{user?.username?.slice(0, 1).toUpperCase() ?? '?'}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{user?.username}</p>
                <p className="text-sm text-muted-foreground">
                  注册于 {formatTime(user?.createTime, false)}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">所属端</p>
              <Badge variant={isAdmin ? 'default' : 'secondary'}>
                {isAdmin ? '管理端' : '用户端'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <ProfileForm />
        <PasswordForm />
      </div>
    </>
  )
}

function ProfileForm() {
  const { user } = useAuth()
  const profile = user?.profile

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">资料</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!profile ? (
          <p className="text-sm text-muted-foreground">这个账号还没有资料记录。</p>
        ) : (
          // Mounted with the loaded profile and keyed on it, so the fields
          // start populated instead of rendering empty and being corrected.
          <ProfileFields key={profile.id} profile={profile} />
        )}
      </CardContent>
    </Card>
  )
}

function ProfileFields({ profile }: { profile: NonNullable<CurrentUser['profile']> }) {
  const [nickName, setNickName] = useState(profile.nickName ?? '')
  const [email, setEmail] = useState(profile.email ?? '')
  const [address, setAddress] = useState(profile.address ?? '')
  const [avatar, setAvatar] = useState(profile.avatar ?? '')

  const mutation = useActionMutation({
    mutationFn: () =>
      updateProfile({
        id: profile.id,
        gender: profile.gender ?? 0,
        nickName,
        email,
        address,
        avatar,
      }),
    successMessage: '资料已保存',
    invalidate: [['auth', 'me']],
  })

  return (
    <>
      <Field label="昵称" value={nickName} onChange={setNickName} />
      <Field label="邮箱" value={email} onChange={setEmail} type="email" />
      <Field label="地址" value={address} onChange={setAddress} />
      <Field label="头像地址" value={avatar} onChange={setAvatar} />
      <Button disabled={mutation.isPending} onClick={() => mutation.mutate(undefined)}>
        {mutation.isPending && <Loader2Icon className="animate-spin" />}
        保存
      </Button>
    </>
  )
}

function PasswordForm() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (newPassword.length < 6) return setError('新密码至少 6 位')
    if (newPassword !== confirm) return setError('两次输入的新密码不一致')
    setError(null)
    setPending(true)
    try {
      await changePassword(oldPassword, newPassword)
      toast.success('密码已修改')
      setOldPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '修改失败')
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">修改密码</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="当前密码" value={oldPassword} onChange={setOldPassword} type="password" />
        <Field label="新密码" value={newPassword} onChange={setNewPassword} type="password" />
        <Field label="确认新密码" value={confirm} onChange={setConfirm} type="password" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button disabled={pending} onClick={submit}>
          {pending && <Loader2Icon className="animate-spin" />}
          修改密码
        </Button>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  const id = `field-${label}`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete={type === 'password' ? 'off' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
