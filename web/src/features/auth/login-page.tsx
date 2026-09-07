import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Loader2Icon, NetworkIcon } from 'lucide-react'
import { z } from 'zod'

import { errorDetail, errorTitle } from '@/lib/errors'
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
})

type LoginValues = z.infer<typeof schema>

export function LoginPage() {
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  // The log id, shown only when the failure is not something the user typed.
  const [formErrorId, setFormErrorId] = useState<string | null>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  })

  if (token) {
    return <Navigate to={searchParams.get('redirect') ?? '/'} replace />
  }

  const onSubmit = async (values: LoginValues) => {
    setFormError(null)
    setFormErrorId(null)
    try {
      await login(values)
      navigate(searchParams.get('redirect') ?? '/', { replace: true })
    } catch (error) {
      setFormError(errorTitle(error))
      setFormErrorId(errorDetail(error))
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <NetworkIcon className="size-5" />
          </div>
          <CardTitle>Stander</CardTitle>
          {/* One sign-in for both sides; the role decides which one you land on. */}
          <CardDescription>端口转发系统</CardDescription>
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

              {formError && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <p>{formError}</p>
                  {formErrorId && <p className="tabular mt-0.5 text-xs opacity-80">{formErrorId}</p>}
                </div>
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
