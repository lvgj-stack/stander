import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2Icon, NetworkIcon, RefreshCwIcon } from 'lucide-react'
import { z } from 'zod'

import { fetchCaptcha } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  captcha: z.string().min(1, '请输入验证码'),
})

type LoginValues = z.infer<typeof schema>

export function LoginPage() {
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)

  /**
   * The captcha image.
   *
   * The image carries no code of its own — the backend keeps the answer in a
   * session cookie keyed to this request. So every refetch invalidates the
   * previous code, and a failed login must refetch before the next attempt.
   *
   * It is never cached: a captcha that came back from cache would be one the
   * server has already forgotten.
   */
  const captchaQuery = useQuery({
    queryKey: ['captcha'],
    queryFn: () => fetchCaptcha(),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const captchaUrl = captchaQuery.data ?? null

  // Each fetch mints a blob URL; release the previous one when it is replaced
  // or the page unmounts, or they accumulate for the whole session.
  useEffect(() => {
    if (!captchaUrl) return
    return () => URL.revokeObjectURL(captchaUrl)
  }, [captchaUrl])

  const refreshCaptcha = () => void captchaQuery.refetch()

  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '', captcha: '' },
  })

  if (token) {
    return <Navigate to={searchParams.get('redirect') ?? '/'} replace />
  }

  const onSubmit = async (values: LoginValues) => {
    setFormError(null)
    try {
      await login(values)
      navigate(searchParams.get('redirect') ?? '/', { replace: true })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '登录失败')
      // The consumed captcha is dead either way; hand over a new one so the
      // next attempt is not guaranteed to fail too.
      form.setValue('captcha', '')
      refreshCaptcha()
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <NetworkIcon className="size-5" />
          </div>
          <CardTitle>Stander 管理后台</CardTitle>
          <CardDescription>端口转发系统控制台</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户名</FormLabel>
                    <FormControl>
                      <Input autoComplete="username" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="captcha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>验证码</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <button
                        type="button"
                        onClick={refreshCaptcha}
                        title="点击刷新验证码"
                        className="flex h-9 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white"
                      >
                        {captchaUrl ? (
                          <img src={captchaUrl} alt="验证码" className="h-full w-full object-contain" />
                        ) : (
                          <RefreshCwIcon className="size-4 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                    {captchaQuery.error && (
                      <p className="text-sm text-destructive">
                        {captchaQuery.error.message}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {formError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2Icon className="animate-spin" />}
                登录
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
